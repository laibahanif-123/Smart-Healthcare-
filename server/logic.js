// Pure scheduling + EVM logic (no DB) so it can be unit-tested.
const DAY = 86400000;
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY);
const round2 = n => Math.round(n * 100) / 100;

// Forward pass: start = max(earliestStart/project start, end of all dependencies); end = start + duration (+ delay in 'cur' mode)
function computeSchedule(project, activities) {
  const byId = new Map(activities.map(a => [String(a._id), a]));
  const cache = { base: new Map(), cur: new Map() }, stack = new Set();
  const resolve = (a, mode) => {
    const id = String(a._id), key = mode + id;
    if (cache[mode].has(id)) return cache[mode].get(id);
    if (stack.has(key)) throw Object.assign(new Error(`Circular dependency involving "${a.name}"`), { status: 400 });
    stack.add(key);
    let start = new Date(a.earliestStart || project.startDate);
    for (const dep of a.dependencies || []) {
      const d = byId.get(String(dep));
      if (d) { const e = resolve(d, mode).end; if (e > start) start = e; }
    }
    const dur = Number(a.durationDays) + (mode === 'cur' ? Number(a.delayDays) || 0 : 0);
    const out = { start, end: addDays(start, dur) };
    stack.delete(key); cache[mode].set(id, out); return out;
  };
  const rows = activities.map(a => {
    const b = resolve(a, 'base'), c = resolve(a, 'cur');
    return { id: String(a._id), name: a.name, assignee: a.assignee, dependencies: (a.dependencies || []).map(String),
      baseStart: b.start, baseEnd: b.end, start: c.start, end: c.end,
      shiftDays: Math.round((c.end - b.end) / DAY), percentComplete: a.percentComplete || 0, ownDelay: Number(a.delayDays) || 0 };
  });
  const children = new Map(rows.map(r => [r.id, []]));
  rows.forEach(r => r.dependencies.forEach(d => children.get(d) && children.get(d).push(r.id)));
  const byRow = new Map(rows.map(r => [r.id, r]));
  for (const r of rows) {           // delay impact on dependents (transitive)
    r.isDelayed = r.shiftDays > 0;
    const seen = new Set(), q = [...children.get(r.id)];
    while (q.length) { const x = q.pop(); if (seen.has(x)) continue; seen.add(x); q.push(...children.get(x)); }
    r.impacts = r.isDelayed ? [...seen].filter(x => byRow.get(x).shiftDays > 0).map(x => byRow.get(x).name) : [];
  }
  const projectEnd = rows.length ? new Date(Math.max(...rows.map(r => +r.end))) : null;
  const baselineEnd = rows.length ? new Date(Math.max(...rows.map(r => +r.baseEnd))) : null;
  return { rows, projectEnd, baselineEnd, deadline: project.deadline, milestones: project.milestones || [],
    projectShiftDays: rows.length ? Math.round((projectEnd - baselineEnd) / DAY) : 0,
    daysLate: rows.length ? Math.max(0, Math.ceil((projectEnd - new Date(project.deadline)) / DAY)) : 0 };
}

// EVM: PV = planned % (by baseline dates) x cost, EV = %complete x cost, AC = actual cost
function computeEVM(project, rows, activities, asOf = new Date()) {
  const t = new Date(asOf).getTime(), byId = new Map(rows.map(r => [r.id, r]));
  let PV = 0, EV = 0, AC = 0, BAC = 0;
  for (const a of activities) {
    const r = byId.get(String(a._id)), cost = Number(a.plannedCost) || 0;
    const planned = Math.min(1, Math.max(0, (t - r.baseStart) / ((r.baseEnd - r.baseStart) || 1)));
    BAC += cost; PV += cost * planned; EV += cost * (Number(a.percentComplete) || 0) / 100; AC += Number(a.actualCost) || 0;
  }
  const CPI = AC > 0 ? EV / AC : null, SPI = PV > 0 ? EV / PV : null;
  const cT = project.cpiThreshold ?? 0.9, sT = project.spiThreshold ?? 0.9, warnings = [];
  if (CPI !== null && CPI < cT) warnings.push(`COST OVERRUN: CPI ${round2(CPI)} is below threshold ${cT}`);
  if (SPI !== null && SPI < sT) warnings.push(`SCHEDULE DEVIATION: SPI ${round2(SPI)} is below threshold ${sT}`);
  if (BAC > project.approvedBudget) warnings.push(`Planned cost ${BAC} exceeds approved budget ${project.approvedBudget}`);
  const EAC = CPI ? BAC / CPI : BAC;
  return { BAC: round2(BAC), PV: round2(PV), EV: round2(EV), AC: round2(AC), CPI: CPI && round2(CPI), SPI: SPI && round2(SPI),
    CV: round2(EV - AC), SV: round2(EV - PV), EAC: round2(EAC), VAC: round2(BAC - EAC), warnings, asOf: new Date(t) };
}
module.exports = { computeSchedule, computeEVM, addDays };

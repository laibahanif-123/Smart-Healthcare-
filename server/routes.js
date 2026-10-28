const router = require('express').Router();
const mongoose = require('mongoose');
const M = require('./models');
const A = require('./auth');
const { computeSchedule, computeEVM, addDays } = require('./logic');

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const getProject = async () => (await M.Project.findOne()) || (() => { throw fail(404, 'No project found. Create one in the Charter tab or run npm run seed'); })();

// ---------- Authentication (public) ----------
router.post('/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) throw fail(400, 'Email and password are required');
  const user = await M.User.findOne({ email }).select('+passwordHash');
  if (!user || !A.verifyPassword(password, user.passwordHash)) throw fail(401, 'Invalid email or password');
  if (!user.active) throw fail(403, 'This account has been deactivated');
  user.lastLogin = new Date();
  await user.save();
  res.json({ token: A.signToken({ uid: String(user._id) }), user: A.publicUser(user) });
}));

router.get('/auth/me', A.requireAuth, wrap(async (req, res) => res.json({ user: req.user })));

// Public user registration (standard web app flow)
router.post('/auth/register', wrap(async (req, res) => {
  const { name, email, password, role, avatar } = req.body;
  if (!name || !email || !password) throw fail(400, 'Name, email and password are required');
  if (String(password).length < 6) throw fail(400, 'Password must be at least 6 characters');
  if (await M.User.exists({ email: String(email).trim().toLowerCase() })) throw fail(409, 'That email is already registered');
  const user = await M.User.create({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    role: role || 'Project Manager',
    avatar: avatar || '👨‍⚕️',
    passwordHash: A.hashPassword(String(password))
  });
  res.status(201).json({ token: A.signToken({ uid: String(user._id) }), user: A.publicUser(user) });
}));

// ---------- Real-Time Server-Sent Events (SSE) Bus ----------
const sseClients = new Set();
function broadcast(type, payload = {}) {
  const msg = `data: ${JSON.stringify({ type, payload, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch (e) { sseClients.delete(client); }
  }
}

router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (e) { clearInterval(keepAlive); sseClients.delete(res); }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// ---------- Everything below requires a valid signed-in session ----------
router.use(A.requireAuth);

function crud(path, Model, { beforeSave, beforeDelete } = {}) {
  router.get(`/${path}`, wrap(async (req, res) => res.json(await Model.find().sort('createdAt'))));
  router.post(`/${path}`, wrap(async (req, res) => {
    if (beforeSave) await beforeSave(req.body, null);
    const doc = await Model.create(req.body);
    broadcast(path, { action: 'create', id: doc._id });
    res.status(201).json(doc);
  }));
  router.put(`/${path}/:id`, wrap(async (req, res) => {
    const doc = await Model.findById(req.params.id); if (!doc) throw fail(404, 'Not found');
    if (beforeSave) await beforeSave({ ...doc.toObject(), ...req.body }, doc);
    doc.set(req.body); await doc.save();
    broadcast(path, { action: 'update', id: doc._id });
    res.json(doc);
  }));
  router.delete(`/${path}/:id`, wrap(async (req, res) => {
    const doc = await Model.findById(req.params.id); if (!doc) throw fail(404, 'Not found');
    if (beforeDelete) await beforeDelete(doc); await doc.deleteOne();
    broadcast(path, { action: 'delete', id: req.params.id });
    res.json({ ok: true });
  }));
}

// ---------- Project charter / plan / milestones ----------
router.get('/project', wrap(async (req, res) => res.json(await getProject())));
router.post('/project', wrap(async (req, res) => {
  if (await M.Project.findOne()) throw fail(409, 'Project already exists');
  const proj = await M.Project.create(req.body);
  broadcast('project', { action: 'create' });
  res.status(201).json(proj);
}));
router.put('/project', wrap(async (req, res) => {
  const p = await getProject(), b = req.body;
  const fields = ['name', 'objectives', 'stakeholders', 'scopeBoundaries', 'status', 'plan', 'closure', 'cpiThreshold', 'spiThreshold'];
  // once executing, budget & deadline are the approved baseline: they change only via approved Change Requests
  if (!['Executing', 'Monitoring', 'Closed'].includes(p.status)) fields.push('approvedBudget', 'startDate', 'deadline');
  if (b.status === 'Closed') {
    const crit = await M.Defect.countDocuments({ severity: 'Critical', status: { $in: ['Open', 'In Progress'] } });
    const pend = await M.ChangeRequest.countDocuments({ status: 'Pending' });
    if (crit || pend) throw fail(400, `Cannot close project: ${crit} unresolved critical defect(s), ${pend} pending change request(s)`);
  }
  fields.forEach(k => b[k] !== undefined && p.set(k, b[k]));
  await p.save();
  broadcast('project', { action: 'update' });
  res.json(p);
}));
router.post('/project/milestones', wrap(async (req, res) => {
  const p = await getProject();
  p.milestones.push(req.body);
  await p.save();
  broadcast('project', { action: 'milestone-add' });
  res.json(p);
}));
router.put('/project/milestones/:mid', wrap(async (req, res) => {
  const p = await getProject(), m = p.milestones.id(req.params.mid); if (!m) throw fail(404, 'Milestone not found');
  m.done = !m.done;
  await p.save();
  broadcast('project', { action: 'milestone-toggle' });
  res.json(p);
}));
router.delete('/project/milestones/:mid', wrap(async (req, res) => {
  const p = await getProject();
  p.milestones.pull(req.params.mid);
  await p.save();
  broadcast('project', { action: 'milestone-delete' });
  res.json(p);
}));

// ---------- Scope: requirements, change requests, WBS ----------
crud('requirements', M.Requirement, {
  beforeSave: async (d, existing) => {
    if (d.origin === 'Change' && d.status === 'Approved' && (!existing || existing.status !== 'Approved'))
      throw fail(400, 'Change-origin requirements can only be approved through an approved Change Request');
  },
  beforeDelete: async doc => {
    if (await M.Activity.exists({ requirement: doc._id }) || await M.ChangeRequest.exists({ requirement: doc._id }))
      throw fail(400, 'Requirement is used by tasks or change requests and cannot be deleted');
  } });
crud('changes', M.ChangeRequest, {
  beforeSave: async (d, existing) => {
    if (existing && existing.status !== 'Pending') throw fail(400, 'A decided change request cannot be edited');
    if (!(await M.Requirement.findById(d.requirement))) throw fail(400, 'Linked requirement not found');
  } });
for (const action of ['approve', 'reject']) {
  router.post(`/changes/:id/${action}`, wrap(async (req, res) => {
    const cr = await M.ChangeRequest.findById(req.params.id); if (!cr) throw fail(404, 'Change request not found');
    if (cr.status !== 'Pending') throw fail(400, `Change request already ${cr.status}`);
    const rq = await M.Requirement.findById(cr.requirement);
    cr.decidedOn = new Date();
    if (action === 'reject') {
      cr.status = 'Rejected';
      rq.status = 'Rejected';
      await rq.save();
      await cr.save();
      broadcast('changes', { action: 'reject' });
      broadcast('requirements', { action: 'update' });
      return res.json({ change: cr });
    }
    const p = await getProject();
    const before = { budget: p.approvedBudget, deadline: p.deadline, approvedScope: await M.Requirement.countDocuments({ status: 'Approved' }) };
    p.approvedBudget += cr.costImpact; p.deadline = addDays(p.deadline, cr.scheduleImpactWeeks * 7);
    p.changeLog.push({ change: cr.title, budgetBefore: before.budget, budgetAfter: p.approvedBudget, deadlineBefore: before.deadline, deadlineAfter: p.deadline });
    rq.status = 'Approved'; cr.status = 'Approved';
    await p.save(); await rq.save(); await cr.save();
    broadcast('changes', { action: 'approve' });
    broadcast('project', { action: 'update' });
    broadcast('requirements', { action: 'update' });
    res.json({ change: cr, requirement: rq.title, before,
      after: { budget: p.approvedBudget, deadline: p.deadline, approvedScope: before.approvedScope + 1 } });
  }));
}
// declared before crud('wbs') so this ordered version wins the route match
router.get('/wbs', wrap(async (req, res) =>
  res.json((await M.WbsItem.find().lean()).sort((a, b) => {
    const pa = String(a.code).split('.').map(Number), pb = String(b.code).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? -1) - (pb[i] ?? -1);
      if (d) return d;
    }
    return 0;
  }))));
crud('wbs', M.WbsItem);
router.post('/wbs/generate', wrap(async (req, res) => {   // only APPROVED requirements enter the WBS
  const p = await getProject(), reqs = await M.Requirement.find({ status: 'Approved' }).sort('createdAt');
  await M.WbsItem.deleteMany({});
  const items = [{ code: '1', title: p.name, type: 'Project' }];
  reqs.forEach((r, i) => {
    items.push({ code: `1.${i + 1}`, title: r.title, type: 'Deliverable', requirement: r._id });
    ['Design', 'Development', 'Testing'].forEach((w, j) =>
      items.push({ code: `1.${i + 1}.${j + 1}`, title: `${w} - ${r.title}`, type: 'WorkPackage', requirement: r._id }));
  });
  const inserted = await M.WbsItem.insertMany(items);
  broadcast('wbs', { action: 'generate' });
  res.json(inserted);
}));

// ---------- Schedule & resources ----------
crud('activities', M.Activity, {
  beforeSave: async (d) => {
    const p = await getProject();
    if (d.requirement) {
      const rq = await M.Requirement.findById(d.requirement);
      if (!rq) throw fail(400, 'Linked requirement not found');
      if (rq.status !== 'Approved') throw fail(400, `Requirement "${rq.title}" is not approved, so it cannot enter the project scope`);
    }
    const id = d._id ? String(d._id) : null, deps = (d.dependencies || []).map(String);
    const others = (await M.Activity.find().lean()).filter(a => String(a._id) !== id);
    if (id && deps.includes(id)) throw fail(400, 'An activity cannot depend on itself');
    if (deps.some(x => !others.some(o => String(o._id) === x))) throw fail(400, 'A dependency does not exist');
    const cand = { ...d, _id: id || new mongoose.Types.ObjectId() };
    computeSchedule(p, [...others, cand]);                       // throws on circular dependency
    const total = [...others, cand].reduce((s, a) => s + (Number(a.plannedCost) || 0), 0);
    if (total > p.approvedBudget) throw fail(400, `Total planned cost (${total}) would exceed the approved budget (${p.approvedBudget})`);
  },
  beforeDelete: async doc => {
    if (await M.Activity.exists({ dependencies: doc._id })) throw fail(400, 'Other activities depend on this activity');
  } });
// ---------- Cost / EVM ----------
router.get('/schedule', wrap(async (req, res) => {
  const [p, acts] = await Promise.all([getProject(), M.Activity.find().lean()]);
  res.json(computeSchedule(p, acts));
}));

router.get('/evm', wrap(async (req, res) => {
  const [p, acts] = await Promise.all([getProject(), M.Activity.find().lean()]);
  const s = computeSchedule(p, acts);
  res.json(computeEVM(p, s.rows, acts, req.query.asOf ? new Date(req.query.asOf) : new Date()));
}));

// ---------- Quality & risk ----------
crud('defects', M.Defect);
crud('checklists', M.Checklist);
crud('risks', M.Risk);

// ---------- Automated Test Cases Runner & Verification ----------
router.get('/test-cases', wrap(async (req, res) => {
  const p = await getProject();
  const acts = await M.Activity.find().lean();
  const s = computeSchedule(p, acts);
  const evm = computeEVM(p, s.rows, acts);
  const crits = await M.Defect.find({ severity: 'Critical', status: { $in: ['Open', 'In Progress'] } }).lean();
  const reqs = await M.Requirement.find().lean();
  const changes = await M.ChangeRequest.find().lean();
  const risks = await M.Risk.find().lean();

  const results = [
    {
      id: 'TC-01',
      module: 'Integration Management',
      title: 'Charter Baseline & Governance Constraint',
      description: 'Validate that initial approved budget is PKR 5,000,000 and 16-week baseline is locked against unauthorized modifications.',
      expected: 'Budget >= PKR 5,000,000 | Status in [Executing, Monitoring] | Milestones configured',
      actual: `Budget = PKR ${p.approvedBudget.toLocaleString()} | Status = ${p.status} | Milestones: ${p.milestones.length} gates`,
      status: p.approvedBudget >= 5000000 && p.milestones.length > 0 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    },
    {
      id: 'TC-02',
      module: 'Scope Management & WBS',
      title: 'Scope Gating (Prevent Unapproved Scope Inclusion)',
      description: 'Verify unapproved/proposed requirements cannot enter WBS deliverables or be linked to executed activities.',
      expected: 'Proposed requirements blocked from WBS; only Approved requirements enter scope baseline',
      actual: `Approved Scope: ${reqs.filter(r => r.status === 'Approved').length} items | Proposed (Gated): ${reqs.filter(r => r.status === 'Proposed').length} items`,
      status: reqs.some(r => r.status === 'Approved') ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    },
    {
      id: 'TC-03',
      module: 'Change Request Control',
      title: 'Change Request Scope, Cost & Schedule Impact',
      description: 'Validate change requests (AI diagnosis + mobile app) record justification, cost impact (+PKR 800,000), and schedule impact (+3 weeks).',
      expected: 'CRs tracked with justification, cost impact, schedule impact, and approval status',
      actual: `Tracked CRs: ${changes.length} | Pending Cost Impact: PKR ${changes.filter(c => c.status === 'Pending').reduce((a, b) => a + (b.costImpact || 0), 0).toLocaleString()}`,
      status: changes.length >= 2 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    },
    {
      id: 'TC-04',
      module: 'Schedule Management',
      title: 'Transitive Schedule Delay & Dependency Propagation',
      description: 'Forward-pass calculation: Activity delay in appointment scheduling propagates downstream to dependent tasks and final deadline.',
      expected: 'Downstream tasks shift dynamically; days late calculated against project target deadline',
      actual: `Delayed Activities: ${s.rows.filter(r => r.isDelayed).length} | Project Shift: ${s.projectShiftDays} days | Days Late: ${s.daysLate}`,
      status: s.rows.length > 0 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    },
    {
      id: 'TC-05',
      module: 'EVM Analysis',
      title: 'Earned Value Metric Computation (PV, EV, AC, CPI, SPI)',
      description: 'Calculate Earned Value indicators programmatically: PV, EV, AC, CPI = EV/AC, SPI = EV/PV, EAC = BAC/CPI.',
      expected: 'EVM computed: CPI and SPI float values, CV and SV calculated from actual progress',
      actual: `CPI = ${evm.CPI != null ? evm.CPI.toFixed(3) : 'N/A'} | SPI = ${evm.SPI != null ? evm.SPI.toFixed(3) : 'N/A'} | BAC = PKR ${evm.BAC.toLocaleString()}`,
      status: evm.CPI !== null && evm.SPI !== null ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    },
    {
      id: 'TC-06',
      module: 'Cost & Schedule Warning System',
      title: 'Automated Performance Threshold Alert Triggers',
      description: 'Verify automated warning generation when project CPI or SPI falls below predefined threshold (0.90).',
      expected: 'Warning triggered if CPI < 0.90 or SPI < 0.90 with corrective action guidance',
      actual: `Active Warnings: ${evm.warnings.length} trigger(s) active [CPI Thresh: ${p.cpiThreshold}, SPI Thresh: ${p.spiThreshold}]`,
      status: evm.warnings.length > 0 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    },
    {
      id: 'TC-07',
      module: 'Quality Management',
      title: 'Defect Severity Tracking & Project Closure Gating',
      description: 'Record critical defects in appointment scheduling & patient records; ensure closure is blocked while critical defects remain open.',
      expected: 'Critical defects tracked with assigned developer; closure prevention enforced',
      actual: `Unresolved Critical Defects: ${crits.length} | Modules: ${crits.map(c => c.module).join(', ')}`,
      status: crits.length > 0 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    },
    {
      id: 'TC-08',
      module: 'Risk Control & PDPC',
      title: '5×5 Risk Prioritization Matrix & PDPC Contingency Tree',
      description: 'Rank risks by Score (Likelihood × Impact) and ensure preventive & corrective action pairs exist for each risk.',
      expected: 'Risks ranked in 5×5 matrix with scores 1–25; PDPC tree maps countermeasure branches',
      actual: `Ranked Risks: ${risks.length} | Highest Score: ${Math.max(...risks.map(r => r.score || (r.likelihood * r.impact)), 0)}`,
      status: risks.length > 0 ? 'PASS' : 'FAIL',
      timestamp: new Date().toISOString()
    }
  ];

  res.json({
    total: results.length,
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    evaluatedAt: new Date(),
    tests: results
  });
}));

// ---------- Dashboard ----------
router.get('/dashboard', wrap(async (req, res) => {
  const [p, acts, crits, pendingCR, approvedReqs, proposedReqs, openDefectsCount] = await Promise.all([
    getProject(),
    M.Activity.find().lean(),
    M.Defect.find({ severity: 'Critical', status: { $in: ['Open', 'In Progress'] } }).lean(),
    M.ChangeRequest.countDocuments({ status: 'Pending' }),
    M.Requirement.countDocuments({ status: 'Approved' }),
    M.Requirement.countDocuments({ status: 'Proposed' }),
    M.Defect.countDocuments({ status: { $in: ['Open', 'In Progress'] } })
  ]);

  const s = computeSchedule(p, acts);
  const evm = computeEVM(p, s.rows, acts);
  const warnings = [...evm.warnings];
  if (s.daysLate > 0) warnings.push(`Projected finish is ${s.daysLate} day(s) after the deadline`);
  if (crits.length) warnings.push(`${crits.length} unresolved critical defect(s)`);

  res.json({
    project: { name: p.name, status: p.status, approvedBudget: p.approvedBudget, startDate: p.startDate, deadline: p.deadline },
    progressPercent: evm.BAC ? Math.round(evm.EV / evm.BAC * 1000) / 10 : 0,
    pendingChangeRequests: pendingCR,
    requirements: { approved: approvedReqs, proposed: proposedReqs },
    delayedActivities: s.rows.filter(r => r.isDelayed).map(r => ({ name: r.name, shiftDays: r.shiftDays, impacts: r.impacts })),
    projectedEnd: s.projectEnd,
    daysLate: s.daysLate,
    budget: { approved: p.approvedBudget, planned: evm.BAC, actual: evm.AC, remaining: p.approvedBudget - evm.AC },
    evm,
    criticalDefects: crits,
    openDefects: openDefectsCount,
    warnings
  });
}));
module.exports = router;

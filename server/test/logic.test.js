const test = require('node:test'), assert = require('node:assert');
const { computeSchedule, computeEVM } = require('../logic');
const project = { startDate: '2026-01-01', deadline: '2026-03-01', approvedBudget: 5000 };
const day = d => d.toISOString().slice(0, 10);
const acts = [
  { _id: 'A', name: 'A', durationDays: 10, dependencies: [], delayDays: 0 },
  { _id: 'B', name: 'B', durationDays: 5, dependencies: ['A'], delayDays: 3 },
  { _id: 'C', name: 'C', durationDays: 5, dependencies: ['B'], delayDays: 0 }];

test('TC1 dependency scheduling: B starts when A ends', () => {
  const r = computeSchedule(project, acts).rows;
  assert.equal(day(r[1].start), '2026-01-11'); assert.equal(day(r[1].end), '2026-01-19');
});
test('TC2 delay propagates to dependent C and to project end', () => {
  const s = computeSchedule(project, acts), c = s.rows[2];
  assert.equal(c.shiftDays, 3); assert.equal(c.isDelayed, true);
  assert.deepEqual(s.rows[1].impacts, ['C']); assert.equal(day(s.projectEnd), '2026-01-24'); assert.equal(s.projectShiftDays, 3);
});
test('TC3 circular dependency is rejected', () => {
  const bad = [{ _id: 'X', name: 'X', durationDays: 1, dependencies: ['Y'] }, { _id: 'Y', name: 'Y', durationDays: 1, dependencies: ['X'] }];
  assert.throws(() => computeSchedule(project, bad), /Circular/);
});
test('TC4 EVM: PV=500 EV=400 AC=500 -> CPI=0.8 SPI=0.8 with 2 warnings', () => {
  const a = [{ _id: 'A', name: 'A', durationDays: 10, dependencies: [], plannedCost: 1000, percentComplete: 40, actualCost: 500 }];
  const e = computeEVM(project, computeSchedule(project, a).rows, a, new Date('2026-01-06'));
  assert.equal(e.PV, 500); assert.equal(e.EV, 400); assert.equal(e.AC, 500);
  assert.equal(e.CPI, 0.8); assert.equal(e.SPI, 0.8); assert.equal(e.warnings.length, 2);
});
test('TC5 healthy project gives no warnings', () => {
  const a = [{ _id: 'A', name: 'A', durationDays: 10, dependencies: [], plannedCost: 1000, percentComplete: 60, actualCost: 500 }];
  assert.equal(computeEVM(project, computeSchedule(project, a).rows, a, new Date('2026-01-06')).warnings.length, 0);
});

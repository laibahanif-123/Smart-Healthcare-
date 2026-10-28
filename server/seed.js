const mongoose = require('mongoose'), M = require('./models');
const URI = process.env.MONGO_URI || 'mongodb+srv://laibahanif0909_db_user:laiba20055@cluster0.1p9e2u1.mongodb.net/spm_healthcare';
(async () => {
  await mongoose.connect(URI);
  // user accounts are kept across reseeds so the team can still sign in
  await Promise.all(Object.values(M).filter(m => m.modelName !== 'User').map(m => m.deleteMany({})));
  await M.Project.create({
    name: 'Smart Healthcare Project Management and Monitoring System',
    objectives: 'Deliver appointments, lab reports, doctor schedules, online consultations and billing for a network of 5 hospitals within 16 weeks and PKR 5,000,000.',
    stakeholders: ['Hospital Management', 'Doctors', 'Patients', 'Lab Staff', 'Billing Dept', 'Project Manager'],
    scopeBoundaries: 'In scope: web system for 5 hospitals. Out of scope until approved by CR: AI diagnosis, mobile app.',
    approvedBudget: 5000000, startDate: '2026-08-31', deadline: '2026-12-21', status: 'Executing',
    plan: { scope: 'Five approved core modules', schedule: '16 weeks, 10 activities, finish 21 Dec 2026', cost: 'Budget PKR 5,000,000 with EVM monitoring (thresholds 0.9)', quality: 'Checklist inspection + defect tracking, no critical defects at go-live' },
    milestones: [{ name: 'Design complete', date: '2026-09-22', done: true }, { name: 'Backend complete', date: '2026-11-09' }, { name: 'Go-live', date: '2026-12-21' }] });
  const R = await M.Requirement.create([
    { title: 'Patient Appointments', priority: 'High', status: 'Approved' }, { title: 'Laboratory Reports', priority: 'High', status: 'Approved' },
    { title: 'Doctor Schedules', priority: 'Medium', status: 'Approved' }, { title: 'Online Consultations', priority: 'Medium', status: 'Approved' },
    { title: 'Hospital Billing', priority: 'High', status: 'Approved' },
    { title: 'AI Preliminary Diagnosis Module', priority: 'Medium', status: 'Proposed', origin: 'Change' },
    { title: 'Mobile Application', priority: 'Medium', status: 'Proposed', origin: 'Change' }]);
  await M.ChangeRequest.create([
    { title: 'Add AI preliminary diagnosis', justification: 'Hospital management wants AI-assisted triage', requirement: R[5]._id, costImpact: 500000, scheduleImpactWeeks: 2 },
    { title: 'Add mobile application', justification: 'Patients need mobile booking', requirement: R[6]._id, costImpact: 300000, scheduleImpactWeeks: 1 }]);
  const A = {}, defs = [   // name, assignee, days, deps, plannedCost, %done, actualCost, delay, requirementIdx
    ['Requirements & Planning', 'Project Manager', 10, [], 300000, 100, 320000, 0, null],
    ['Database Design', 'Database Developer', 10, [0], 350000, 100, 340000, 0, null],
    ['UI/UX Design', 'Frontend Dev 1', 12, [0], 300000, 100, 310000, 0, null],
    ['Appointment Module', 'Backend Dev 1', 25, [1], 600000, 80, 700000, 5, 0],
    ['Patient Records & Lab Reports', 'Backend Dev 2', 25, [1], 600000, 70, 650000, 0, 1],
    ['Doctor Schedule & Billing', 'Backend Dev 1', 20, [3], 500000, 30, 200000, 0, 2],
    ['Frontend Integration', 'Frontend Dev 2', 25, [2, 3], 600000, 40, 300000, 0, null],
    ['Online Consultation', 'Frontend Dev 1', 20, [4], 500000, 10, 80000, 0, 3],
    ['System Testing', 'QA Engineer', 15, [5, 6, 7], 400000, 0, 0, 0, null],
    ['Deployment & Training', 'Project Manager', 10, [8], 300000, 0, 0, 0, 4]];
  for (let i = 0; i < defs.length; i++) {
    const [name, assignee, durationDays, deps, plannedCost, percentComplete, actualCost, delayDays, rq] = defs[i];
    A[i] = await M.Activity.create({ name, assignee, durationDays, dependencies: deps.map(d => A[d]._id), plannedCost, percentComplete, actualCost, delayDays, requirement: rq == null ? undefined : R[rq]._id });
  }
  await M.Defect.create([
    { title: 'Double booking in appointment slots', module: 'Appointments', severity: 'Critical', assignedTo: 'Backend Dev 1', status: 'Open' },
    { title: 'Patient record overwritten on concurrent edit', module: 'Patient Records', severity: 'Critical', assignedTo: 'Backend Dev 2', status: 'In Progress' },
    { title: 'Billing total rounding error', module: 'Billing', severity: 'Medium', assignedTo: 'Backend Dev 1', status: 'Resolved' },
    { title: 'Calendar misaligned on small screens', module: 'UI', severity: 'Low', assignedTo: 'Frontend Dev 1', status: 'Open' }]);
  await M.Checklist.create([
    { deliverable: 'Appointment Module', item: 'No overlapping slots for one doctor', result: 'Fail', inspector: 'QA Engineer', notes: 'Fails under concurrent requests' },
    { deliverable: 'Appointment Module', item: 'Cancel & reschedule works', result: 'Pass', inspector: 'QA Engineer' },
    { deliverable: 'Patient Records', item: 'Role-based access enforced', result: 'Pass', inspector: 'QA Engineer' },
    { deliverable: 'Patient Records', item: 'Edit history preserved', result: 'Pending', inspector: 'QA Engineer' }]);
  await M.Risk.create([
    { description: 'Scope creep from new hospital requirements', likelihood: 5, impact: 4, preventiveAction: 'Strict change request process', correctiveAction: 'Re-baseline budget and schedule' },
    { description: 'Critical defects delay go-live', likelihood: 4, impact: 5, preventiveAction: 'Early integration testing', correctiveAction: 'Add QA/dev hours, fix critical defects first' },
    { description: 'Key developer unavailable', likelihood: 2, impact: 4, preventiveAction: 'Cross-train backend developers', correctiveAction: 'Reassign tasks' },
    { description: 'AI module accuracy not acceptable', likelihood: 3, impact: 3, preventiveAction: 'Prototype with sample data first', correctiveAction: 'Ship as optional/beta' }]);
  await require('./auth').ensureDefaultUsers();
  console.log('Seeded.'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const T = { timestamps: true };
const ref = n => ({ type: Schema.Types.ObjectId, ref: n });
const S = (enumList, def) => ({ type: String, enum: enumList, default: def });

const projectSchema = new Schema({
  name: { type: String, required: true }, objectives: { type: String, required: true },
  stakeholders: [String], scopeBoundaries: String,
  approvedBudget: { type: Number, required: true, min: [1, 'Budget must be positive'] },
  startDate: { type: Date, required: true }, deadline: { type: Date, required: true },
  status: S(['Initiated', 'Planning', 'Executing', 'Monitoring', 'Closed'], 'Planning'),
  plan: { scope: String, schedule: String, cost: String, quality: String },
  milestones: [{ name: { type: String, required: true }, date: { type: Date, required: true }, done: { type: Boolean, default: false } }],
  closure: { notes: String, closedOn: Date },
  cpiThreshold: { type: Number, default: 0.9 }, spiThreshold: { type: Number, default: 0.9 },
  changeLog: [{ change: String, budgetBefore: Number, budgetAfter: Number, deadlineBefore: Date, deadlineAfter: Date, at: { type: Date, default: Date.now } }]
}, T);
projectSchema.pre('validate', function () { if (this.deadline <= this.startDate) this.invalidate('deadline', 'Deadline must be after start date'); });

const Requirement = model('Requirement', new Schema({
  title: { type: String, required: true }, description: String,
  priority: S(['High', 'Medium', 'Low'], 'Medium'), status: S(['Proposed', 'Approved', 'Rejected'], 'Proposed'),
  origin: S(['Baseline', 'Change'], 'Baseline') }, T));
const ChangeRequest = model('ChangeRequest', new Schema({
  title: { type: String, required: true }, justification: { type: String, required: [true, 'Justification is required'] },
  requirement: { ...ref('Requirement'), required: [true, 'Link a requirement'] },
  costImpact: { type: Number, min: 0, default: 0 }, scheduleImpactWeeks: { type: Number, min: 0, default: 0 },
  status: S(['Pending', 'Approved', 'Rejected'], 'Pending'), decidedOn: Date }, T));
const Activity = model('Activity', new Schema({
  name: { type: String, required: true }, assignee: { type: String, required: true },
  durationDays: { type: Number, required: true, min: [1, 'Duration must be at least 1 day'] },
  earliestStart: Date, dependencies: [ref('Activity')], delayDays: { type: Number, min: 0, default: 0 },
  percentComplete: { type: Number, min: 0, max: 100, default: 0 },
  plannedCost: { type: Number, min: 0, default: 0 }, actualCost: { type: Number, min: 0, default: 0 },
  requirement: ref('Requirement') }, T));
const Defect = model('Defect', new Schema({
  title: { type: String, required: true }, module: String, severity: S(['Critical', 'High', 'Medium', 'Low'], 'Medium'),
  assignedTo: String, status: S(['Open', 'In Progress', 'Resolved', 'Closed'], 'Open') }, T));
const Checklist = model('Checklist', new Schema({
  deliverable: { type: String, required: true }, item: { type: String, required: true },
  result: S(['Pending', 'Pass', 'Fail'], 'Pending'), inspector: String, notes: String }, T));
const riskSchema = new Schema({
  description: { type: String, required: true },
  likelihood: { type: Number, min: 1, max: 5, required: true }, impact: { type: Number, min: 1, max: 5, required: true },
  score: Number, preventiveAction: String, correctiveAction: String, status: S(['Open', 'Mitigated', 'Occurred'], 'Open') }, T);
riskSchema.pre('validate', function () { this.score = this.likelihood * this.impact; });
const Risk = model('Risk', riskSchema);
const WbsItem = model('WbsItem', new Schema({
  code: String, title: String, type: S(['Project', 'Deliverable', 'WorkPackage']), requirement: ref('Requirement') }, T));
const User = model('User', new Schema({
  name: { type: String, required: [true, 'Name is required'] },
  email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'] },
  role: { type: String, required: true, default: 'Project Manager' },
  avatar: { type: String, default: '👤' },
  passwordHash: { type: String, required: true, select: false },
  lastLogin: Date,
  active: { type: Boolean, default: true } }, T));
module.exports = { Project: model('Project', projectSchema), Requirement, ChangeRequest, Activity, Defect, Checklist, Risk, WbsItem, User };

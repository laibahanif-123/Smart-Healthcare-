const express = require('express'), cors = require('cors'), mongoose = require('mongoose');
const app = express();
app.use(cors(), express.json());
app.use('/api', require('./routes'));
app.use((err, req, res, next) => {            // central exception handling
  const validation = err.name === 'ValidationError', status = err.status || (validation || err.name === 'CastError' ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: validation ? Object.values(err.errors).map(e => e.message).join('; ') : err.message });
});
const URI = process.env.MONGO_URI || 'mongodb+srv://laibahanif0909_db_user:laiba20055@cluster0.1p9e2u1.mongodb.net/spm_healthcare';
mongoose.connect(URI)
  .then(() => require('./auth').ensureDefaultUsers())
  .then(() => app.listen(5000, () => console.log('API running on http://localhost:5000')))
  .catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });

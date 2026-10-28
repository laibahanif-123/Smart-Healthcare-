import { useState } from 'react';
import { api, saveSession } from './api.js';

const ROLE_OPTIONS = ['Project Manager', 'QA Engineer', 'Backend Developer', 'Hospital Admin', 'Analyst'];

export default function Login({ onLogin }) {
  // tab: 'login' | 'register'
  const [tab, setTab] = useState('login');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState('Project Manager');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  // Handle Login submission
  const handleLoginSubmit = async e => {
    e.preventDefault();
    clearMessages();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await api('/auth/login', 'POST', { email, password });
      saveSession(token, user, remember);
      onLogin(user);
    } catch (ex) {
      setError(ex.message || 'Invalid login credentials.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  // Handle Registration submission
  const handleRegisterSubmit = async e => {
    e.preventDefault();
    clearMessages();

    if (!regName.trim() || !regEmail.trim() || !regPassword) {
      setError('Please fill in all required fields.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (regPassword !== regConfirmPass) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await api('/auth/register', 'POST', {
        name: regName.trim(),
        email: regEmail.trim().toLowerCase(),
        password: regPassword,
        role: regRole,
        avatar: '👨‍⚕️'
      });
      saveSession(token, user, true);
      onLogin(user);
    } catch (ex) {
      setError(ex.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      {/* Ambient background glowing orbs */}
      <div className="glow-shape glow-1" />
      <div className="glow-shape glow-2" />
      <div className="glow-shape glow-3" />

      <div className="login-card-panel dark-card">
        {/* Brand Header */}
        <div className="login-card-brand">
          <div className="hero-logo-icon">🩺</div>
          <div>
            <h2 className="brand-title">Smart Healthcare PMS</h2>
            <span className="badge-pill">Hospital Management Portal</span>
          </div>
        </div>

        {/* ECG pulse accent animation */}
        <div className="ecg-pulse-container">
          <svg viewBox="0 0 400 24" className="ecg-svg" preserveAspectRatio="none">
            <path
              d="M0,12 L140,12 L150,4 L160,20 L170,2 L180,18 L190,9 L200,12 L400,12"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              className="ecg-path"
            />
          </svg>
        </div>

        {/* Auth Tab Switcher: Login / Register */}
        <div className="auth-tab-row">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); clearMessages(); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); clearMessages(); }}
          >
            Register
          </button>
        </div>

        {/* Alerts */}
        {error && <div className="login-error-alert">⚠️ {error}</div>}
        {success && <div className="login-success-alert">✅ {success}</div>}

        {/* ===================== SIGN IN TAB ===================== */}
        {tab === 'login' && (
          <>
            <div className="login-card-header">
              <h3 className="login-title">Welcome Back</h3>
              <p className="login-subtitle">Enter your credentials to access your dashboard.</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="login-form" autoComplete="on">
              <div className="login-input-group">
                <label className="login-label">Email Address</label>
                <div className="input-with-icon">
                  <span className="input-icon">✉️</span>
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    className="login-input"
                    placeholder="doctor@healthcare.org"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="login-input-group">
                <label className="login-label">Password</label>
                <div className="input-with-icon">
                  <span className="input-icon">🔑</span>
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    className="login-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-toggle-pass"
                    onClick={() => setShowPass(!showPass)}
                    title={showPass ? 'Hide password' : 'Show password'}
                  >
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="login-options-row">
                <button
                  type="button"
                  className="btn-quick-fill"
                  onClick={() => {
                    setEmail('pm@healthcare-alliance.org');
                    setPassword('password123');
                  }}
                  title="Click to fill default Project Manager credentials"
                >
                  ⚡ Auto-fill PM Demo Account
                </button>
              </div>

              <button type="submit" className="btn-login-submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Sign In →'}
              </button>
            </form>

            <div className="auth-switch-footer">
              <span>Don't have an account?</span>{' '}
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => { setTab('register'); clearMessages(); }}
              >
                Create one now
              </button>
            </div>
          </>
        )}

        {/* ===================== REGISTER TAB ===================== */}
        {tab === 'register' && (
          <>
            <div className="login-card-header">
              <h3 className="login-title">Create Account</h3>
              <p className="login-subtitle">Join the healthcare management portal.</p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="login-form" autoComplete="off">
              <div className="login-input-group">
                <label className="login-label">Full Name</label>
                <div className="input-with-icon">
                  <span className="input-icon">👤</span>
                  <input
                    type="text"
                    required
                    className="login-input"
                    placeholder="Dr. Ahmad Khan"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                  />
                </div>
              </div>

              <div className="login-input-group">
                <label className="login-label">Email Address</label>
                <div className="input-with-icon">
                  <span className="input-icon">✉️</span>
                  <input
                    type="email"
                    required
                    className="login-input"
                    placeholder="ahmad@healthcare.org"
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="login-input-group">
                <label className="login-label">Role</label>
                <div className="input-with-icon">
                  <span className="input-icon">🩺</span>
                  <select
                    className="login-input login-select"
                    value={regRole}
                    onChange={e => setRegRole(e.target.value)}
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="login-input-group">
                <label className="login-label">Password</label>
                <div className="input-with-icon">
                  <span className="input-icon">🔑</span>
                  <input
                    type={showRegPass ? 'text' : 'password'}
                    required
                    className="login-input"
                    placeholder="At least 6 characters"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-toggle-pass"
                    onClick={() => setShowRegPass(!showRegPass)}
                    title={showRegPass ? 'Hide password' : 'Show password'}
                  >
                    {showRegPass ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <div className="login-input-group">
                <label className="login-label">Confirm Password</label>
                <div className="input-with-icon">
                  <span className="input-icon">🔒</span>
                  <input
                    type={showRegPass ? 'text' : 'password'}
                    required
                    className="login-input"
                    placeholder="Re-enter password"
                    value={regConfirmPass}
                    onChange={e => setRegConfirmPass(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="btn-login-submit" disabled={loading}>
                {loading ? 'Creating account...' : 'Complete Registration →'}
              </button>
            </form>

            <div className="auth-switch-footer">
              <span>Already have an account?</span>{' '}
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => { setTab('login'); clearMessages(); }}
              >
                Sign in here
              </button>
            </div>
          </>
        )}

        <div className="login-footer-security">
          <span>🔒 256-bit Encrypted</span>
          <span>•</span>
          <span>Scrypt Security</span>
          <span>•</span>
          <span>Secure Session</span>
        </div>
      </div>
    </div>
  );
}

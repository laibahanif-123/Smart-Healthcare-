import { useEffect, useState } from 'react';

const TOKEN_KEY = 'spm_auth_token';
const USER_KEY = 'spm_auth_user';

// Purge any persistent localStorage so every fresh browser start requires login
try {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
} catch {}

// Use sessionStorage so the Login page is ALWAYS displayed when opening the project
const read = k => {
  try { return sessionStorage.getItem(k) || ''; } catch { return ''; }
};
export const getToken = () => read(TOKEN_KEY);
export const getStoredUser = () => {
  try { const raw = read(USER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
export const saveSession = (token, user) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {}
};
export const clearSession = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  } catch {}
};

export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  const isAuthCall = path.startsWith('/auth/login') || path.startsWith('/auth/register');
  if (r.status === 401 && !isAuthCall) {
    clearSession();
    window.dispatchEvent(new Event('spm:signed-out'));
  }
  if (!r.ok) throw new Error(j.error || 'Request failed');

  // Trigger local instant optimistic re-render across views on mutations
  if (method !== 'GET') {
    window.dispatchEvent(new CustomEvent('spm:realtime-update', { detail: { path, method, local: true } }));
  }

  return j;
}

// Global SSE connection for multi-tab / multi-user real-time sync
let eventSource = null;
export function initRealtime() {
  if (typeof window === 'undefined' || eventSource) return;
  try {
    eventSource = new EventSource('/api/events');
    eventSource.onopen = () => {
      window.dispatchEvent(new CustomEvent('spm:realtime-status', { detail: { connected: true } }));
    };
    eventSource.onmessage = e => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type !== 'connected') {
          window.dispatchEvent(new CustomEvent('spm:realtime-update', { detail: payload }));
        }
      } catch (err) {}
    };
    eventSource.onerror = () => {
      window.dispatchEvent(new CustomEvent('spm:realtime-status', { detail: { connected: false } }));
    };
  } catch (ex) {
    console.warn('Realtime SSE unavailable:', ex);
  }
}

export function useRealtimeStatus() {
  const [status, setStatus] = useState({ connected: false, lastSync: new Date() });
  useEffect(() => {
    initRealtime();
    const onStatus = e => setStatus(s => ({ ...s, connected: e.detail.connected }));
    const onUpdate = () => setStatus(s => ({ ...s, connected: true, lastSync: new Date() }));
    window.addEventListener('spm:realtime-status', onStatus);
    window.addEventListener('spm:realtime-update', onUpdate);
    return () => {
      window.removeEventListener('spm:realtime-status', onStatus);
      window.removeEventListener('spm:realtime-update', onUpdate);
    };
  }, []);
  return status;
}

export function useLoad(path, dep) {
  const [data, setData] = useState(null), [err, setErr] = useState('');
  const reload = () => api(path).then(d => { setData(d); setErr(''); }).catch(e => setErr(e.message));

  useEffect(() => {
    reload();
  }, [path, dep]);

  useEffect(() => {
    initRealtime();
    let debounceTimer;
    const onRealtime = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        reload();
      }, 80);
    };
    window.addEventListener('spm:realtime-update', onRealtime);
    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('spm:realtime-update', onRealtime);
    };
  }, [path]);

  return [data, reload, err];
}

export const d10 = v => (v ? String(v).slice(0, 10) : '');
export const pkr = n => 'PKR ' + Number(n || 0).toLocaleString();
export const fmt = v => v == null ? '' : typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? v.slice(0, 10) : typeof v === 'number' ? v.toLocaleString() : Array.isArray(v) ? v.length : String(v);

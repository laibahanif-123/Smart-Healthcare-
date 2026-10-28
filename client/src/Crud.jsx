import { useEffect, useState } from 'react';
import { api, d10, fmt, pkr } from './api';

export default function Crud({ resource, title, fields, columns, noCreate, actions, onChange, refs = {}, empty = {} }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return api('/' + resource)
      .then(data => { setRows(data); setErr(''); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const onRealtime = e => {
      // Avoid overwriting row state while user is actively filling out a form
      if (!editing && !showForm) {
        load();
      }
    };
    window.addEventListener('spm:realtime-update', onRealtime);
    return () => window.removeEventListener('spm:realtime-update', onRealtime);
  }, [resource, editing, showForm]);

  const done = async () => {
    await load();
    onChange && onChange();
  };

  const opts = f => f.ref ? (refs[f.ref] || []) : (f.options || []).map(o => ({ value: o, label: o }));

  const submit = async e => {
    e.preventDefault();
    setErr('');
    try {
      const body = {};
      fields.forEach(f => {
        let v = form[f.name];
        if (f.type === 'number') v = v === '' || v == null ? undefined : Number(v);
        else if (v === '') v = editing ? null : undefined;
        body[f.name] = v;
      });
      editing ? await api(`/${resource}/${editing}`, 'PUT', body) : await api('/' + resource, 'POST', body);
      setForm(empty);
      setEditing(null);
      setShowForm(false);
      await done();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const edit = r => {
    setErr('');
    setEditing(r._id);
    setShowForm(true);
    setForm(Object.fromEntries(fields.map(f => [
      f.name,
      f.type === 'date' ? d10(r[f.name]) : f.type === 'multi' ? (r[f.name] || []).map(String) : r[f.name] ?? ''
    ])));
  };

  const del = async r => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await api(`/${resource}/${r._id}`, 'DELETE');
      await done();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const input = f => {
    const v = form[f.name] ?? (f.type === 'multi' ? [] : '');
    const set = x => setForm({ ...form, [f.name]: x });
    const O = opts(f).map(o => <option key={o.value} value={o.value}>{o.label}</option>);

    if (f.type === 'select') {
      return (
        <select className="form-control" value={v} required={f.required} onChange={e => set(e.target.value)}>
          <option value="">-- Choose {f.label} --</option>
          {O}
        </select>
      );
    }
    if (f.type === 'multi') {
      return (
        <select className="form-control multi-select" multiple value={v} onChange={e => set([...e.target.selectedOptions].map(o => o.value))}>
          {O}
        </select>
      );
    }
    if (f.type === 'textarea') {
      return <textarea className="form-control" rows={3} value={v} onChange={e => set(e.target.value)} placeholder={`Enter ${f.label.toLowerCase()}...`} />;
    }
    return (
      <input
        className="form-control"
        type={f.type || 'text'}
        step="any"
        value={v}
        required={f.required}
        onChange={e => set(e.target.value)}
        placeholder={`Enter ${f.label.toLowerCase()}...`}
      />
    );
  };

  const filteredRows = rows.filter(r => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return Object.values(r).some(val =>
      val && String(val).toLowerCase().includes(term)
    );
  });

  return (
    <div className="card pro-table-card">
      {/* ── Table Top Bar ── */}
      <div className="pro-table-header">
        <div className="pro-table-title-area">
          <h3 className="pro-table-title">{title}</h3>
          <span className="record-count-badge">{rows.length} records</span>
        </div>

        <div className="pro-table-controls">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search in table..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
            />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>

          {!noCreate && (
            <button
              className={`btn-action ${showForm && !editing ? 'btn-action-cancel' : 'btn-action-add'}`}
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  setEditing(null);
                  setForm(empty);
                } else {
                  setEditing(null);
                  setForm(empty);
                  setShowForm(true);
                }
              }}
            >
              {showForm && !editing ? '✕ Cancel' : '+ Add New'}
            </button>
          )}
        </div>
      </div>

      {/* ── Collapsible Add / Edit Form ── */}
      {showForm && (
        <div className="form-drawer">
          <div className="form-drawer-header">
            <h4>{editing ? '✏️ Edit Record' : '➕ Create New Record'}</h4>
            <button className="btn-icon-close" onClick={() => { setShowForm(false); setEditing(null); setForm(empty); }}>✕</button>
          </div>
          <form onSubmit={submit} className="form-grid">
            {fields.map(f => (
              <div key={f.name} className={`form-group ${f.type === 'textarea' || f.type === 'multi' ? 'col-span-full' : ''}`}>
                <label className="form-label">
                  {f.label} {f.required && <span className="req">*</span>}
                </label>
                {input(f)}
              </div>
            ))}
            <div className="form-actions col-span-full">
              <button type="submit" className="btn-save">
                {editing ? 'Save Changes' : 'Create Record'}
              </button>
              <button type="button" className="btn-cancel" onClick={() => { setShowForm(false); setEditing(null); setForm(empty); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {err && <div className="err" style={{ margin: '14px 0' }}>⚠️ {err}</div>}

      {/* ── Table ── */}
      <div className="table-responsive">
        <table className="pro-table">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.label}>{c.label}</th>
              ))}
              <th style={{ width: 150, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(r => (
              <tr key={r._id} className="pro-row">
                {columns.map(c => (
                  <td key={c.label}>
                    {c.render ? c.render(r) : fmt(r[c.key])}
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <div className="action-buttons-group">
                    {actions && actions(r, done)}
                    <button className="btn-row-edit" title="Edit" onClick={() => edit(r)}>
                      Edit
                    </button>
                    {!noCreate && (
                      <button className="btn-row-del" title="Delete" onClick={() => del(r)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="empty-table-state">
                  <div className="empty-content">
                    <span className="empty-icon">📂</span>
                    <p>No records found matching your view.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

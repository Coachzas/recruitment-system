import { useState, useEffect } from 'react';
import { fetchCriteria, createCriteria, deleteCriteria } from '../api/criteria';
import { demoCriteria } from '../data/demoData';

// ── Tag input ────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('');

  function add(raw) {
    const val = raw.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(input);
    } else if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-gray-300 rounded focus-within:ring-2 focus-within:ring-toyota-red bg-white min-h-[42px]">
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 bg-toyota-red/10 text-toyota-red text-xs font-semibold px-2 py-0.5 rounded-full">
          {t}
          <button type="button" onClick={() => onChange(tags.filter((_, j) => j !== i))}
                  className="opacity-60 hover:opacity-100 leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input.trim() && add(input)}
        placeholder={tags.length === 0 ? placeholder : '+ add…'}
        className="text-sm outline-none flex-1 min-w-[140px] bg-transparent"
      />
    </div>
  );
}

// ── Criteria card ────────────────────────────────────────────────────────────
function CriteriaCard({ row, onDelete, readOnly }) {
  const [deleting, setDeleting] = useState(false);
  const skills  = Array.isArray(row.required_skills) ? row.required_skills : [];
  const bonuses = Array.isArray(row.bonus_criteria)  ? row.bonus_criteria  : [];

  async function handleDelete() {
    if (readOnly) return;
    if (!confirm(`Delete criteria for "${row.job_title}"?`)) return;
    setDeleting(true);
    try { await deleteCriteria(row.id); onDelete(row.id); }
    catch { alert('Delete failed'); setDeleting(false); }
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-toyota-dark text-base">{row.job_title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Min {row.min_experience_years ?? '—'} yr(s) experience</p>
        </div>
        <button onClick={handleDelete} disabled={readOnly || deleting}
                className="text-xs text-red-400 hover:text-toyota-red font-semibold shrink-0">
          {deleting ? '…' : 'Delete'}
        </button>
      </div>

      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
          Required Skills ({skills.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {skills.length
            ? skills.map((s, i) => (
              <span key={i} className="bg-toyota-red text-white text-xs font-semibold px-2 py-0.5 rounded-full">{s}</span>
            ))
            : <span className="text-gray-300 text-xs">none</span>
          }
        </div>
      </div>

      {bonuses.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Bonus</p>
          <div className="flex flex-wrap gap-1.5">
            {bonuses.map((b, i) => (
              <span key={i} className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">{b}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
const BLANK = { job_title: '', required_skills: [], min_experience_years: '', bonus_criteria: [] };

export default function Criteria({ demo = false }) {
  const [list,    setList]    = useState(demo ? demoCriteria : []);
  const [loading, setLoading] = useState(!demo);
  const [form,    setForm]    = useState(BLANK);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (demo) return;
    fetchCriteria()
      .then((res) => setList(res.criteria))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [demo]);

  function setField(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (demo) return;
    setError('');
    if (!form.job_title.trim())       { setError('Job title is required.'); return; }
    if (!form.required_skills.length) { setError('Add at least one required skill.'); return; }
    setSaving(true);
    try {
      const res = await createCriteria({
        ...form,
        min_experience_years: form.min_experience_years ? Number(form.min_experience_years) : null,
      });
      setList((l) => {
        const idx = l.findIndex((r) => r.id === res.criteria.id);
        return idx >= 0 ? l.map((r) => r.id === res.criteria.id ? res.criteria : r) : [res.criteria, ...l];
      });
      setForm(BLANK);
    } catch (err) {
      setError(err?.error ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-toyota-dark tracking-tight">Job Criteria</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Define scoring rubrics per role — the AI matches each applicant against the relevant criteria.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── Add form ── */}
        <div className="card">
          <div className="bg-toyota-red px-4 py-3 rounded-t-lg">
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Add / Update Position</h2>
          </div>
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <fieldset disabled={demo} className="space-y-4 disabled:opacity-70">
            <div>
              <label className="label">Job Title *</label>
              <input className="input" placeholder="e.g. Frontend Developer"
                value={form.job_title} onChange={(e) => setField('job_title', e.target.value)} />
            </div>
            <div>
              <label className="label">
                Required Skills * <span className="normal-case font-normal text-gray-400">(Enter to add)</span>
              </label>
              <TagInput tags={form.required_skills} onChange={(v) => setField('required_skills', v)}
                        placeholder="e.g. React, TypeScript…" />
            </div>
            <div>
              <label className="label">Min Experience (years)</label>
              <input className="input" type="number" min="0" max="30" placeholder="0"
                value={form.min_experience_years}
                onChange={(e) => setField('min_experience_years', e.target.value)} />
            </div>
            <div>
              <label className="label">
                Bonus Criteria <span className="normal-case font-normal text-gray-400">(optional)</span>
              </label>
              <TagInput tags={form.bonus_criteria} onChange={(v) => setField('bonus_criteria', v)}
                        placeholder="e.g. Docker, Open Source…" />
            </div>
            {error && <p className="text-sm text-toyota-red font-medium">{error}</p>}
            <div className="flex justify-end pt-1">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save Criteria'}
              </button>
            </div>
            </fieldset>
          </form>
        </div>

        {/* ── Criteria list ── */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Active Criteria ({list.length})
          </h2>
          {loading ? (
            <div className="card p-6 text-sm text-gray-400">Loading…</div>
          ) : list.length === 0 ? (
            <div className="card p-6 text-sm text-gray-400">No criteria yet. Add your first role on the left.</div>
          ) : (
            list.map((row) => (
              <CriteriaCard key={row.id} row={row} readOnly={demo}
                            onDelete={(id) => setList((l) => l.filter((r) => r.id !== id))} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

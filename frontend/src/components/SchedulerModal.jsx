import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchSchedulerProfiles,
  fetchSchedulerStatus,
  createSchedulerProfile,
  updateSchedulerProfile,
  toggleSchedulerProfile,
  deleteSchedulerProfile,
} from '../api/scheduler';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatCountdown(isoTarget, nowMs) {
  const diff = new Date(isoTarget).getTime() - nowMs;
  if (diff <= 0) return '< 1s';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function formatLastRun(isoTimestamp, nowMs) {
  if (!isoTimestamp) return 'Never';
  const diff = nowMs - new Date(isoTimestamp).getTime();
  if (diff < 0)         return 'Just now';
  if (diff < 60_000)    return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(isoTimestamp).toLocaleDateString();
}

function getEarliestNextRun(profiles) {
  const runs = profiles
    .filter((p) => p.is_active && p.next_run)
    .map((p) => new Date(p.next_run).getTime())
    .filter((t) => !isNaN(t));
  if (!runs.length) return null;
  return new Date(Math.min(...runs)).toISOString();
}

// Normalise a DB date value (Date obj, ISO string, or "YYYY-MM-DD") to "YYYY-MM-DD" for <input type="date">
function toDateInputValue(val) {
  if (!val) return '';
  return String(val).slice(0, 10);
}

// ─── Countdown Banner ─────────────────────────────────────────────────────────

function CountdownBanner({ profiles, now, firingIds }) {
  const earliest    = getEarliestNextRun(profiles);
  const activeCount = profiles.filter((p) => p.is_active).length;
  const firingCount = firingIds.size;

  if (firingCount > 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border-b border-red-200">
        <span className="relative flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-toyota-red animate-ping absolute inset-0" />
          <span className="w-2 h-2 rounded-full bg-toyota-red block" />
        </span>
        <span className="text-xs text-toyota-red font-semibold">
          {firingCount} profile{firingCount > 1 ? 's' : ''} processing…
        </span>
      </div>
    );
  }

  if (!activeCount) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-400">
        No active schedules — toggle a profile ON to enable auto-ingestion.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50 border-b border-green-200">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      <span className="text-xs text-green-700 font-medium">
        {activeCount} profile{activeCount > 1 ? 's' : ''} active
      </span>
      {earliest && (
        <>
          <span className="text-green-300">·</span>
          <span className="text-xs text-green-700">Next auto-run in:</span>
          <span className="font-mono text-sm font-bold text-toyota-red tracking-tight">
            ⏱ {formatCountdown(earliest, now)}
          </span>
        </>
      )}
    </div>
  );
}

// ─── Shared Profile Form (create + edit) ─────────────────────────────────────

function ProfileForm({ initialValues, onSave, onCancel, submitLabel = 'Save Profile' }) {
  const isEdit = Boolean(initialValues?.id);

  const [form, setForm] = useState({
    profile_name:         initialValues?.profile_name         ?? '',
    days_to_run:          initialValues?.days_to_run          ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    max_emails_per_batch: initialValues?.max_emails_per_batch ?? 20,
    active_from:          toDateInputValue(initialValues?.active_from),
    active_to:            toDateInputValue(initialValues?.active_to),
    is_active:            initialValues?.is_active            ?? false,
  });
  const [times, setTimes]         = useState(initialValues?.run_times ?? ['09:00']);
  const [pendingTime, setPending] = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      days_to_run: f.days_to_run.includes(day)
        ? f.days_to_run.filter((d) => d !== day)
        : [...f.days_to_run, day],
    }));
  }

  function addTime() {
    const t = pendingTime.trim();
    if (!t) return;
    if (!times.includes(t)) setTimes((prev) => [...prev, t].sort());
    setPending('');
  }

  function removeTime(t) {
    setTimes((prev) => prev.filter((x) => x !== t));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.profile_name.trim()) { setError('Profile name is required.'); return; }
    if (!form.days_to_run.length)  { setError('Select at least one day.'); return; }
    if (!times.length)             { setError('Add at least one run time.'); return; }

    setSaving(true);
    try {
      await onSave({
        profile_name:         form.profile_name.trim(),
        days_to_run:          form.days_to_run,
        run_times:            times,
        max_emails_per_batch: Number(form.max_emails_per_batch) || 20,
        active_from: form.active_from || null,
        active_to:   form.active_to   || null,
        is_active:   form.is_active,
      });
    } catch (err) {
      setError(err?.error ?? 'Failed to save profile.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-toyota-red/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-toyota-red flex items-center">
        <span className="text-white text-sm font-bold uppercase tracking-wide">
          {isEdit ? `Edit: ${initialValues.profile_name}` : 'New Scheduler Profile'}
        </span>
        <button type="button" onClick={onCancel} className="ml-auto text-white/70 hover:text-white text-sm">
          Cancel
        </button>
      </div>

      <div className="p-4 space-y-4 bg-white">

        {/* Name */}
        <div>
          <label className="label">Profile Name *</label>
          <input
            className="input mt-1"
            placeholder='e.g. "Morning Recruitment Sweep"'
            value={form.profile_name}
            onChange={(e) => set('profile_name', e.target.value)}
          />
        </div>

        {/* Days */}
        <div>
          <label className="label mb-2 block">Days to Run *</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => {
              const checked = form.days_to_run.includes(day);
              return (
                <label key={day} className={`flex items-center gap-1.5 px-3 py-1.5 rounded border cursor-pointer select-none text-xs font-bold transition-colors ${
                  checked
                    ? 'bg-toyota-red text-white border-toyota-red'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}>
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleDay(day)} />
                  {day}
                </label>
              );
            })}
          </div>
        </div>

        {/* Run times */}
        <div>
          <label className="label mb-2 block">
            Run Times * <span className="text-gray-400 font-normal">(one cron job per time)</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {times.map((t) => (
              <span key={t} className="flex items-center gap-1 bg-toyota-red/10 text-toyota-red border border-toyota-red/30 text-xs font-mono font-semibold px-2.5 py-1 rounded-full">
                {t}
                <button type="button" onClick={() => removeTime(t)} className="hover:text-red-700 text-base leading-none ml-0.5">×</button>
              </span>
            ))}
            {!times.length && <span className="text-xs text-gray-400 italic">No times added yet.</span>}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="time"
              className="input w-32 py-1.5 font-mono text-sm"
              value={pendingTime}
              onChange={(e) => setPending(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTime(); } }}
            />
            <button
              type="button"
              onClick={addTime}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-toyota-red text-toyota-red hover:bg-toyota-red hover:text-white transition-colors"
            >
              + Add Time
            </button>
          </div>
        </div>

        {/* Batch size */}
        <div>
          <label className="label">Emails per Batch *</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number" min="1" max="500"
              className="input w-20 text-center"
              value={form.max_emails_per_batch}
              onChange={(e) => set('max_emails_per_batch', e.target.value)}
            />
            <span className="text-xs text-gray-400">max/run</span>
          </div>
        </div>

        {/* Active date range */}
        <div>
          <label className="label mb-1 block">
            Email Fetch Window <span className="text-gray-400 font-normal text-xs">(optional — blank = last 24 hrs)</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400 uppercase">From</span>
              <input type="date" className="input py-1.5" value={form.active_from}
                max={form.active_to || undefined}
                onChange={(e) => set('active_from', e.target.value)} />
            </div>
            <span className="text-gray-300 self-end pb-1">→</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400 uppercase">To</span>
              <input type="date" className="input py-1.5" value={form.active_to}
                min={form.active_from || undefined}
                onChange={(e) => set('active_to', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Status toggle (edit only) */}
        {isEdit && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm text-gray-600 font-medium">Status</span>
            <button
              type="button"
              onClick={() => set('is_active', !form.is_active)}
              aria-pressed={form.is_active}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
                form.is_active ? 'bg-toyota-red' : 'bg-gray-300'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                form.is_active ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
            <span className={`text-xs font-bold ${form.is_active ? 'text-toyota-red' : 'text-gray-400'}`}>
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        )}

        {/* Error + actions */}
        {error && <p className="text-sm text-toyota-red font-medium">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary min-w-[140px] text-sm">
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

function ProfileCard({ profile, now, onToggle, onDelete, onUpdated }) {
  const [editing,  setEditing]  = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try { await onToggle(profile.id, !profile.is_active); }
    finally { setToggling(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete profile "${profile.profile_name}"?`)) return;
    setDeleting(true);
    try { await onDelete(profile.id); }
    catch { alert('Delete failed.'); setDeleting(false); }
  }

  async function handleSaveEdit(data) {
    const res = await updateSchedulerProfile(profile.id, data);
    onUpdated(res.profile);
    setEditing(false);
  }

  // When editing, replace the card with the form
  if (editing) {
    return (
      <div className="rounded-lg border-2 border-toyota-red/40 overflow-hidden">
        <ProfileForm
          initialValues={profile}
          onSave={handleSaveEdit}
          onCancel={() => setEditing(false)}
          submitLabel="Update Profile"
        />
      </div>
    );
  }

  const times = Array.isArray(profile.run_times) ? profile.run_times : [];

  return (
    <div className={`rounded-lg border transition-colors ${
      profile.is_active ? 'border-toyota-red/40 bg-red-50/30' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">

          {/* Name + firing indicator */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{profile.profile_name}</span>
            {profile.is_firing && (
              <span className="text-[10px] font-bold text-toyota-red flex items-center gap-1">
                <span className="relative flex-shrink-0 w-2 h-2">
                  <span className="absolute inset-0 w-2 h-2 rounded-full bg-toyota-red animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-toyota-red block" />
                </span>
                processing
              </span>
            )}
            {profile.is_active && !profile.is_firing && (
              <span className="text-[10px] font-bold text-green-600 flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
                live
              </span>
            )}
          </div>

          {/* Days + batch */}
          <p className="text-xs text-gray-500 mt-0.5">
            {DAYS.filter((d) => profile.days_to_run?.includes(d)).join(' · ')}
            <span className="mx-1 text-gray-300">|</span>
            {profile.max_emails_per_batch ?? 20} emails/run
          </p>

          {/* Run time chips */}
          {times.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {times.map((t) => (
                <span key={t} className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                  profile.is_active ? 'bg-toyota-red/10 text-toyota-red' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Email fetch window */}
          {(profile.active_from || profile.active_to) && (
            <p className="text-[10px] text-gray-400 mt-1">
              Fetch window:{' '}
              {profile.active_from ? new Date(profile.active_from).toLocaleDateString() : '—'}
              {' → '}
              {profile.active_to ? new Date(profile.active_to).toLocaleDateString() : 'ongoing'}
            </p>
          )}

          {/* Countdown */}
          {profile.is_active && profile.next_run && !profile.is_firing && (
            <p className="text-xs font-mono font-semibold text-toyota-red mt-1">
              ⏱ {formatCountdown(profile.next_run, now)}
            </p>
          )}
          {profile.is_active && !profile.next_run && !profile.is_firing && (
            <p className="text-[10px] text-amber-500 mt-1">
              No upcoming run — check days/times config.
            </p>
          )}

          {/* Last run */}
          <p className="text-[10px] text-gray-400 mt-1">
            Last run: <span className="font-medium">{formatLastRun(profile.last_run_at, now)}</span>
          </p>
          {profile.last_run_summary && (
            <p className={`text-[10px] mt-0.5 italic ${
              profile.last_run_summary.startsWith('Error:') ? 'text-red-400' : 'text-gray-400'
            }`}>
              {profile.last_run_summary}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
          {/* Edit button */}
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] font-semibold text-gray-400 hover:text-toyota-red border border-gray-200 hover:border-toyota-red/40 rounded px-2 py-1 transition-colors"
            title="Edit profile"
          >
            Edit
          </button>

          {/* Toggle switch */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            aria-pressed={profile.is_active}
            title={profile.is_active ? 'Turn off' : 'Turn on'}
            className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
              toggling ? 'opacity-50 cursor-wait' : ''
            } ${profile.is_active ? 'bg-toyota-red' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              profile.is_active ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
          <span className={`text-[10px] font-bold w-5 ${profile.is_active ? 'text-toyota-red' : 'text-gray-400'}`}>
            {profile.is_active ? 'ON' : 'OFF'}
          </span>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none pb-0.5"
            title="Delete"
          >
            {deleting ? '…' : '×'}
          </button>
        </div>
      </div>

      {/* Day chips row */}
      <div className="px-4 pb-3 flex gap-1 flex-wrap">
        {DAYS.map((d) => {
          const on = profile.days_to_run?.includes(d);
          return (
            <span key={d} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              on
                ? profile.is_active ? 'bg-toyota-red text-white' : 'bg-gray-200 text-gray-600'
                : 'bg-gray-100 text-gray-300'
            }`}>
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Scheduler Manager ────────────────────────────────────────────────────────

function SchedulerManager({ onChanged }) {
  const now = useNow();
  const [profiles,  setProfiles]  = useState([]);
  const [firingIds, setFiringIds] = useState(new Set());
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);

  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; });

  // ── Initial full load ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await fetchSchedulerProfiles();
      const loaded = res.profiles ?? [];
      setProfiles(loaded);
      onChangedRef.current?.(loaded);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Live status polling (5 s) — updates firing state without hitting the DB ──
  useEffect(() => {
    let id;
    async function pollStatus() {
      try {
        const st        = await fetchSchedulerStatus();
        const newFiring = new Set(st.firing ?? []);
        setFiringIds(newFiring);
        // Merge next_run + is_firing into profile list
        if (st.profiles.length > 0) {
          setProfiles((prev) => prev.map((p) => {
            const live = st.profiles.find((sp) => sp.id === p.id);
            return { ...p, is_firing: newFiring.has(p.id), next_run: live?.next_run ?? p.next_run };
          }));
        } else {
          setProfiles((prev) => prev.map((p) => ({ ...p, is_firing: false })));
        }
      } catch {}
    }
    pollStatus();
    id = setInterval(pollStatus, 5_000);
    return () => clearInterval(id);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleSaved(profile) {
    const updated = [{ ...profile, next_run: null, is_running: false, is_firing: false }, ...profiles];
    setProfiles(updated);
    setShowForm(false);
    onChangedRef.current?.(updated);
  }

  function handleUpdated(profile) {
    const updated = profiles.map((p) => p.id === profile.id ? { ...p, ...profile } : p);
    setProfiles(updated);
    onChangedRef.current?.(updated);
  }

  async function handleToggle(id, is_active) {
    try {
      const res = await toggleSchedulerProfile(id, { is_active });
      const updated = profiles.map((p) => p.id === id ? { ...p, ...res.profile } : p);
      setProfiles(updated);
      onChangedRef.current?.(updated);
    } catch { alert('Toggle failed.'); }
  }

  async function handleDelete(id) {
    try {
      await deleteSchedulerProfile(id);
      const updated = profiles.filter((p) => p.id !== id);
      setProfiles(updated);
      onChangedRef.current?.(updated);
    } catch { alert('Delete failed.'); }
  }

  async function handleCreate(data) {
    const res = await createSchedulerProfile(data);
    handleSaved(res.profile);
  }

  return (
    <div>
      {/* Live countdown / status banner */}
      <CountdownBanner profiles={profiles} now={now} firingIds={firingIds} />

      {/* Content */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-toyota-dark">Scheduler Profiles</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Each profile runs its own independent cron jobs.
            </p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-1.5">
              + New Profile
            </button>
          )}
        </div>

        {/* Create form */}
        {showForm && (
          <ProfileForm
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
            submitLabel="Save Profile"
          />
        )}

        {/* Profile list */}
        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading profiles…</p>
        ) : profiles.length === 0 && !showForm ? (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-500 font-medium">No scheduler profiles yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Click <strong>+ New Profile</strong> to schedule automatic ingestion.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                now={now}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onUpdated={handleUpdated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal Overlay ────────────────────────────────────────────────────────────

export default function SchedulerModal({ open, onClose, onChanged }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-full flex items-start justify-center p-4 sm:p-8">
        <div
          className="w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal header */}
          <div className="flex items-center px-5 py-4 bg-toyota-red">
            <div>
              <h2 className="text-white font-black text-lg tracking-tight">Automation Schedulers</h2>
              <p className="text-white/70 text-xs mt-0.5">Manage all automated email ingestion profiles</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto text-white/70 hover:text-white text-2xl leading-none font-light"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <SchedulerManager onChanged={onChanged} />
        </div>
      </div>
    </div>
  );
}

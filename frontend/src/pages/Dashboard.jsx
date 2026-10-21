import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useStore      from '../store';
import usePolling    from '../hooks/usePolling';
import { fetchEmails, fetchStats, bulkDeleteEmails } from '../api/emails';
import { fetchSchedulerProfiles, fetchSchedulerStatus } from '../api/scheduler';
import ModeToggle      from '../components/ModeToggle';
import EmailTable      from '../components/EmailTable';
import ManualFetchBar  from '../components/ManualFetchBar';
import SchedulerModal  from '../components/SchedulerModal';
import DemoSchedulerModal from '../components/DemoSchedulerModal';
import FilterBar       from '../components/FilterBar';
import { demoApplicants } from '../data/demoData';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent }) {
  return (
    <div className="card px-5 py-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</span>
      <span className={`text-3xl font-black ${accent ?? 'text-gray-800'}`}>{value ?? '—'}</span>
    </div>
  );
}

// ─── Scheduler countdown strip ────────────────────────────────────────────────

function useSchedulerSummary(profiles) {
  const nextRuns = profiles
    .filter((p) => p.is_active && p.next_run)
    .map((p) => new Date(p.next_run).getTime())
    .filter((t) => !isNaN(t));

  const earliestMs  = nextRuns.length ? Math.min(...nextRuns) : null;
  const activeCount = profiles.filter((p) => p.is_active).length;

  return { earliestMs, activeCount };
}

function CountdownStrip({ earliestMs, activeCount, firingCount, onOpenModal }) {
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = earliestMs ? earliestMs - nowMs : null;
  let countdownText = null;
  if (diff !== null && diff > 0) {
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    countdownText = `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '00')}s`;
  }

  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 px-4 py-2.5 border rounded-lg transition-colors ${
      firingCount > 0
        ? 'bg-red-50 border-red-200'
        : activeCount > 0
          ? 'bg-white border-gray-200'
          : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center gap-3">
        {firingCount > 0 ? (
          <>
            <span className="relative flex-shrink-0 w-2 h-2">
              <span className="absolute inset-0 w-2 h-2 rounded-full bg-toyota-red animate-ping" />
              <span className="w-2 h-2 rounded-full bg-toyota-red block" />
            </span>
            <span className="text-xs text-toyota-red font-semibold">
              Scheduler: {firingCount} profile{firingCount > 1 ? 's' : ''} processing…
            </span>
          </>
        ) : activeCount > 0 ? (
          <>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-gray-600 font-medium">
              {t('dashboard.scheduler.schedulersActive', { count: activeCount })}
            </span>
            {countdownText && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500">{t('dashboard.scheduler.nextRunIn')}</span>
                <span className="font-mono text-sm font-black text-toyota-red">
                  ⏱ {countdownText}
                </span>
              </>
            )}
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="text-xs text-gray-400">{t('dashboard.scheduler.noActive')}</span>
          </>
        )}
      </div>
      <button
        onClick={onOpenModal}
        className="btn-primary text-sm flex items-center gap-2"
      >
        {t('dashboard.scheduler.manageBtn')}
      </button>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const BLANK_FILTERS = { startDate: '', endDate: '', subject: '', sender: '' };

export default function Dashboard({ demo = false }) {
  const { t } = useTranslation();
  const {
    emails, emailsTotal, emailsPage, emailsMode, stats,
    emailsLoading, emailsError,
    setEmails, setEmailsPage, setEmailsMode, setEmailsLoading, setEmailsError, setStats,
  } = useStore();

  const [modalOpen,    setModalOpen]   = useState(false);
  const [profiles,     setProfiles]    = useState([]);
  const [firingCount,  setFiringCount] = useState(0);
  const [selectedIds,  setSelectedIds] = useState(new Set());
  const [deleting,     setDeleting]    = useState(false);
  const [filters,      setFilters]     = useState(BLANK_FILTERS);

  const filtersRef  = useRef(BLANK_FILTERS);
  const debounceRef = useRef(null);

  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // Scheduler profiles — full load every 60 s
  useEffect(() => {
    if (demo) return undefined;
    async function loadProfiles() {
      try {
        const res = await fetchSchedulerProfiles();
        setProfiles(res.profiles ?? []);
      } catch {}
    }
    loadProfiles();
    const id = setInterval(loadProfiles, 60_000);
    return () => clearInterval(id);
  }, [demo]);

  // Scheduler status — lightweight poll every 5 s to detect firing profiles
  useEffect(() => {
    if (demo) return undefined;
    let id;
    async function pollStatus() {
      try {
        const st = await fetchSchedulerStatus();
        setFiringCount((st.firing ?? []).length);
        // Merge live firing state into profile list
        const firingSet = new Set(st.firing ?? []);
        setProfiles((prev) => prev.map((p) => ({
          ...p,
          is_firing: firingSet.has(p.id),
          next_run:  st.profiles.find((sp) => sp.id === p.id)?.next_run ?? p.next_run,
        })));
      } catch {}
    }
    pollStatus();
    id = setInterval(pollStatus, 5_000);
    return () => clearInterval(id);
  }, [demo]);

  const { earliestMs, activeCount } = useSchedulerSummary(profiles);

  const handleSchedulerChanged = useCallback((updatedProfiles) => {
    if (Array.isArray(updatedProfiles)) setProfiles(updatedProfiles);
  }, []);

  // ─── Core loader ─────────────────────────────────────────────────────────────

  const loadEmails = useCallback(async () => {
    if (demo) {
      const sampleEmails = demoApplicants.map((candidate) => ({
        id: candidate.id,
        subject: candidate.subject,
        sender: candidate.email,
        received_at: candidate.received_at,
        status: 'success',
        mode: 'application',
        match_score: candidate.match_score,
        ai_summary: candidate.summary,
        attachment_count: candidate.attachments.length,
      }));
      setEmails(sampleEmails, sampleEmails.length);
      setStats({ total: sampleEmails.length, success: sampleEmails.length, failed: 0, ignored: 0 });
      setEmailsLoading(false);
      setEmailsError(null);
      return;
    }

    setEmailsLoading(true);
    setEmailsError(null);
    setSelectedIds(new Set());
    const f = filtersRef.current;
    try {
      const [emailRes, statsRes] = await Promise.all([
        fetchEmails({
          mode:  emailsMode,
          page:  emailsPage,
          limit: 50,
          ...(f.startDate && { startDate: f.startDate }),
          ...(f.endDate   && { endDate:   f.endDate   }),
          ...(f.subject   && { subject:   f.subject   }),
          ...(f.sender    && { sender:    f.sender    }),
        }),
        fetchStats(),
      ]);
      setEmails(emailRes.emails, emailRes.total);
      setStats(statsRes);
    } catch (e) {
      setEmailsError(e?.error ?? 'Failed to load emails');
    } finally {
      setEmailsLoading(false);
    }
  }, [demo, emailsMode, emailsPage, setEmails, setEmailsError, setEmailsLoading, setStats]);

  usePolling(loadEmails, 30_000, [emailsMode, emailsPage], !demo);

  // Debounce filter changes — reset to page 1, then reload
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (emailsPage !== 1) {
        setEmailsPage(1);
      } else {
        loadEmails();
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // ─── Selection / deletion ─────────────────────────────────────────────────────

  const handleSelectOne = useCallback((id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked) => {
    setSelectedIds(checked ? new Set(emails.map((e) => e.id)) : new Set());
  }, [emails]);

  const handleBulkDelete = useCallback(async () => {
    if (demo) return;
    if (selectedIds.size === 0) return;
    if (!confirm(t('dashboard.toolbar.deleteConfirm', { count: selectedIds.size }))) return;
    setDeleting(true);
    try {
      await bulkDeleteEmails([...selectedIds]);
      setSelectedIds(new Set());
      await loadEmails();
    } catch {
      alert(t('dashboard.toolbar.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }, [demo, selectedIds, loadEmails, t]);

  const displayedStats = demo
    ? { total: demoApplicants.length, success: demoApplicants.length, failed: 0, ignored: 0 }
    : stats;
  const displayedEmails = demo
    ? demoApplicants.map((candidate) => ({
      id: candidate.id,
      subject: candidate.subject,
      sender: candidate.email,
      received_at: candidate.received_at,
      status: 'success',
      mode: 'application',
      match_score: candidate.match_score,
      ai_summary: candidate.summary,
      attachment_count: candidate.attachments.length,
    }))
    : emails;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-toyota-dark tracking-tight">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t(demo ? 'dashboard.demoSubtitle' : 'dashboard.subtitle')}
          </p>
        </div>
        {/* Scheduler status widget */}
        <div className="flex items-center gap-2">
          {demo ? (
            <span className="text-xs font-semibold text-gray-500">{t('demo.sampleData')}</span>
          ) : firingCount > 0 ? (
            <>
              <span className="relative w-3 h-3">
                <span className="absolute inset-0 w-3 h-3 rounded-full bg-toyota-red animate-ping opacity-75" />
                <span className="w-3 h-3 rounded-full bg-toyota-red block" />
              </span>
              <span className="text-xs font-semibold text-toyota-red">Scheduler: Processing</span>
            </>
          ) : (
            <span className="w-3 h-3 rounded-full bg-green-400 animate-pulse" title="Live" />
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label={t('dashboard.stats.total24h')}  value={displayedStats?.total}   />
        <StatCard label={t('dashboard.stats.success')}   value={displayedStats?.success} accent="text-green-600" />
        <StatCard label={t('dashboard.stats.failed')}    value={displayedStats?.failed}  accent="text-toyota-red" />
        <StatCard label={t('dashboard.stats.ignored')}   value={displayedStats?.ignored} accent="text-gray-400" />
      </div>

      {/* Scheduler countdown strip */}
      <CountdownStrip
        earliestMs={earliestMs}
        activeCount={activeCount}
        firingCount={firingCount}
        onOpenModal={() => setModalOpen(true)}
      />

      {/* Manual fetch */}
      <ManualFetchBar onComplete={loadEmails} readOnly={demo} />

      {/* Mode toggle + bulk-delete toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {demo ? (
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
            {[t('demo.allEmails'), t('demo.applications'), t('demo.general')].map((label, index) => (
              <button key={label} type="button" disabled className={`px-4 py-2 text-sm opacity-70 cursor-not-allowed ${index === 0 ? 'bg-toyota-red text-white' : 'text-gray-500'}`}>
                {label}
              </button>
            ))}
          </div>
        ) : <ModeToggle />}
        <div className="flex items-center gap-3">
          {emailsError && (
            <span className="text-sm text-toyota-red font-medium">{emailsError}</span>
          )}
          {!demo && selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {deleting ? '…' : t('dashboard.toolbar.deleteSelected', { count: selectedIds.size })}
            </button>
          )}
          <button
            onClick={loadEmails}
            disabled={demo || emailsLoading}
            className="text-xs text-gray-500 hover:text-toyota-red transition-colors flex items-center gap-1"
          >
            {t('dashboard.toolbar.refresh')}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} onChange={setFilters} disabled={demo} />

      {/* Email table */}
      <EmailTable
        emails={displayedEmails}
        loading={demo ? false : emailsLoading}
        total={demo ? displayedEmails.length : emailsTotal}
        page={emailsPage}
        limit={50}
        onPageChange={setEmailsPage}
        selectedIds={selectedIds}
        onSelectOne={handleSelectOne}
        onSelectAll={handleSelectAll}
        readOnly={demo}
      />

      {/* Scheduler modal */}
      {demo
        ? modalOpen && <DemoSchedulerModal onClose={() => setModalOpen(false)} />
        : <SchedulerModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onChanged={handleSchedulerChanged}
        />
      }
    </div>
  );
}

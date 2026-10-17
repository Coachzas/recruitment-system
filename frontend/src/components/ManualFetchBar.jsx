import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { triggerManualFetch, fetchRunningStatus } from '../api/fetch';

const todayStr   = () => new Date().toISOString().slice(0, 10);
const weekAgoStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

export default function ManualFetchBar({ onComplete }) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(weekAgoStr);
  const [endDate,   setEndDate]   = useState(todayStr);
  const [loading,   setLoading]   = useState(false);
  const [running,        setRunning]        = useState(false);
  const [result,         setResult]         = useState(null);
  const [error,          setError]          = useState('');

  // Poll /api/fetch/status while a background fetch is running.
  // Stops polling and calls onComplete when the server reports not running.
  const pollRef = useRef(null);

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchRunningStatus();
        if (!res.running) {
          setRunning(false);
          if (res.error) setError(res.error);
          if (res.summary) setResult((current) => ({ ...current, summary: res.summary }));
          stopPolling();
          onComplete?.();   // refresh the email table
        }
      } catch {
        // network blip — keep polling
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Clean up interval on unmount
  useEffect(() => () => stopPolling(), []);

  async function handleFetch() {
    if (!startDate || !endDate) { setError(t('manualFetch.errorBothDates')); return; }
    if (startDate > endDate)    { setError(t('manualFetch.errorDateOrder')); return; }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await triggerManualFetch({ startDate, endDate });
      setResult(res);
      setRunning(true);
      onComplete?.();     // initial refresh so the table shows any fast-processed emails
      startPolling();     // keep refreshing until the server is done
    } catch (err) {
      // 409 = already running; surface it clearly
      setError(err?.error ?? t('manualFetch.errorFailed'));
      if (err?.status === 409) setRunning(true);
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || running;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 bg-toyota-red rounded-t-lg flex items-center gap-2">
        <span className="text-white text-xs font-bold uppercase tracking-widest">
          {t('manualFetch.title')}
        </span>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-white/80 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            {t('manualFetch.running')}
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="label">{t('manualFetch.startDate')}</label>
          <input
            type="date"
            className="input"
            value={startDate}
            max={endDate}
            disabled={busy}
            onChange={(e) => { setStartDate(e.target.value); setError(''); setResult(null); }}
          />
        </div>

        <span className="text-gray-400 text-sm self-end pb-1">→</span>

        <div className="flex flex-col gap-1">
          <label className="label">{t('manualFetch.endDate')}</label>
          <input
            type="date"
            className="input"
            value={endDate}
            min={startDate}
            max={todayStr()}
            disabled={busy}
            onChange={(e) => { setEndDate(e.target.value); setError(''); setResult(null); }}
          />
        </div>

        <button
          onClick={handleFetch}
          disabled={busy}
          className="btn-primary self-end flex items-center gap-2 h-[38px] whitespace-nowrap disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t('manualFetch.connecting')}
            </>
          ) : running ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t('manualFetch.processing')}
            </>
          ) : (
            t('manualFetch.fetchNow')
          )}
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-3 px-3 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-toyota-red font-medium">
          {error}
        </div>
      )}

      {result?.started && (
        <div className="mx-4 mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 space-y-0.5">
          <div className="font-semibold">
            {running ? t('manualFetch.statusRunning') : t('manualFetch.statusDone')}
          </div>
          <div className="text-blue-500">
            {new Date(result.since).toLocaleDateString()}
            {' → '}
            {new Date(result.before).toLocaleDateString()}
            {' · '}
            {result.batchCap === 'unlimited'
              ? t('manualFetch.batchUnlimited')
              : t('manualFetch.batchCap', { n: result.batchCap })}
          </div>
          {result.summary && (
            <div className="text-blue-700">
              {t('manualFetch.resultSummary', {
                processed: result.summary.processed,
                found: result.summary.found,
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

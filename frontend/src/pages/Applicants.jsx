import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchApplicants } from '../api/applicants';
import { demoApplicants } from '../data/demoData';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function ScoreChip({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-gray-300 text-xs font-medium">—</span>;
  }
  const cls =
    score >= 70 ? 'bg-green-100 text-green-700' :
    score >= 40 ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      {score}%
    </span>
  );
}

function Skeleton() {
  return (
    <tr>
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

const BLANK = { search: '', position: '', minScore: '' };

export default function Applicants({ demo = false }) {
  const { t }    = useTranslation();
  const navigate = useNavigate();

  const [applicants, setApplicants] = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [filters,    setFilters]    = useState(BLANK);
  const [draft,      setDraft]      = useState(BLANK);

  const LIMIT = 50;

  const load = useCallback(async (p = 1, f = filters) => {
    if (demo) {
      const query = f.search.trim().toLowerCase();
      const position = f.position.trim().toLowerCase();
      const minScore = Number(f.minScore);
      const filtered = demoApplicants.filter((candidate) => {
        const matchesQuery = !query || [candidate.full_name, candidate.email, candidate.position_applied]
          .some((value) => value.toLowerCase().includes(query));
        const matchesPosition = !position || candidate.position_applied.toLowerCase().includes(position);
        const matchesScore = !f.minScore || candidate.match_score >= minScore;
        return matchesQuery && matchesPosition && matchesScore;
      });
      setApplicants(filtered);
      setTotal(filtered.length);
      setPage(1);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = { page: p, limit: LIMIT };
      if (f.search)   params.search   = f.search;
      if (f.position) params.position = f.position;
      if (f.minScore) params.minScore = f.minScore;
      const res = await fetchApplicants(params);
      setApplicants(res.applicants);
      setTotal(res.total);
      setPage(p);
    } catch {
      setError(t('applicants.error'));
    } finally {
      setLoading(false);
    }
  }, [demo, filters, t]);

  useEffect(() => { load(1, BLANK); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e) {
    e.preventDefault();
    const next = { ...draft };
    setFilters(next);
    load(1, next);
  }

  function handleClear() {
    setDraft(BLANK);
    setFilters(BLANK);
    load(1, BLANK);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-toyota-dark tracking-tight">
          {t('applicants.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('applicants.subtitle')}</p>
      </div>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="card px-4 py-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="label">{t('applicants.search')}</label>
            <input
              className="input text-sm"
              placeholder={t('applicants.searchPlaceholder')}
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="label">{t('applicants.position')}</label>
            <input
              className="input text-sm"
              placeholder={t('applicants.positionPlaceholder')}
              value={draft.position}
              onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1 w-[110px]">
            <label className="label">{t('applicants.minScore')}</label>
            <input
              type="number" min="0" max="100"
              className="input text-sm"
              placeholder="0–100"
              value={draft.minScore}
              onChange={(e) => setDraft((d) => ({ ...d, minScore: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 self-end">
            <button type="submit" className="btn-primary text-sm px-4 py-2">
              {t('applicants.searchBtn')}
            </button>
            {(filters.search || filters.position || filters.minScore) && (
              <button type="button" onClick={handleClear} className="btn-ghost text-sm px-3 py-2">
                {t('applicants.clear')}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-toyota-dark text-white text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left w-10">#</th>
                <th className="px-4 py-3 text-left">{t('applicants.colName')}</th>
                <th className="px-4 py-3 text-left">{t('applicants.colPosition')}</th>
                <th className="px-4 py-3 text-center w-24">{t('applicants.colScore')}</th>
                <th className="px-4 py-3 text-left">{t('applicants.colExperience')}</th>
                <th className="px-4 py-3 text-left">{t('applicants.colDate')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading
                ? [...Array(8)].map((_, i) => <Skeleton key={i} />)
                : error
                  ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-toyota-red text-sm">
                        {error}
                      </td>
                    </tr>
                  )
                  : applicants.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                          {t('applicants.noApplicants')}
                        </td>
                      </tr>
                    )
                    : applicants.map((a, idx) => (
                      <tr
                        key={a.id}
                        onClick={() => navigate(`${demo ? '/demo' : ''}/applicants/${a.id}`)}
                        className="hover:bg-red-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {(page - 1) * LIMIT + idx + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-800">
                            {a.full_name || '—'}
                          </div>
                          <div className="text-xs text-gray-400">{a.email || ''}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                          {a.position_applied || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ScoreChip score={a.match_score} />
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {a.experience_years != null
                            ? `${a.experience_years} ${t('applicants.yrs')}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {fmt(a.received_at || a.created_at)}
                        </td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              {t('applicants.pagination', { total, page, totalPages })}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => load(page - 1)}
                className="btn-ghost text-xs px-3 py-1 disabled:opacity-40"
              >
                ← {t('applicants.prev')}
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => load(page + 1)}
                className="btn-ghost text-xs px-3 py-1 disabled:opacity-40"
              >
                {t('applicants.next')} →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

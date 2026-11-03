import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import StatusBadge from './StatusBadge';
import ModeBadge   from './ModeBadge';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ScoreCell({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  const color =
    score >= 70 ? 'text-green-600' :
    score >= 40 ? 'text-yellow-600' :
                  'text-gray-400';
  return (
    <span className={`font-bold text-sm ${color}`}>{score}<span className="text-xs font-normal">%</span></span>
  );
}

function emailSummary(t, email) {
  if (
    email.ai_summary === 'Not Scored' ||
    email.ai_summary === 'Not scored because no matching job criteria were found for this position.'
  ) {
    return t('emailTable.noCriteriaReason');
  }
  return email.ai_summary || email.error_message || '—';
}

function Skeleton({ cols }) {
  return (
    <tr>
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export default function EmailTable({
  emails, loading, total, page, limit = 50, onPageChange,
  selectedIds, onSelectOne, onSelectAll, readOnly = false,
}) {
  const { t } = useTranslation();
  const totalPages = Math.ceil(total / limit);
  const masterRef  = useRef(null);

  const allChecked  = emails.length > 0 && emails.every((e) => selectedIds?.has(e.id));
  const someChecked = emails.some((e) => selectedIds?.has(e.id));

  useEffect(() => {
    if (!masterRef.current) return;
    masterRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-toyota-dark text-white text-xs uppercase tracking-wider">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  ref={masterRef}
                  checked={allChecked}
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                  disabled={readOnly}
                  className="accent-toyota-red cursor-pointer disabled:cursor-not-allowed"
                  aria-label={t('emailTable.selectAll')}
                />
              </th>
              <th className="px-4 py-3 text-left w-10">{t('emailTable.colNum')}</th>
              <th className="px-4 py-3 text-left">{t('emailTable.colSubject')}</th>
              <th className="px-4 py-3 text-left">{t('emailTable.colSender')}</th>
              <th className="px-4 py-3 text-left">{t('emailTable.colReceived')}</th>
              <th className="px-4 py-3 text-left">{t('emailTable.colStatus')}</th>
              <th className="px-4 py-3 text-left">{t('emailTable.colMode')}</th>
              <th className="px-4 py-3 text-center w-20">{t('emailTable.colScore')}</th>
              <th className="px-4 py-3 text-left">{t('emailTable.colAiSummary')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? [...Array(8)].map((_, i) => <Skeleton key={i} cols={9} />)
              : emails.length === 0
                ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                      {t('emailTable.noEmails')}
                    </td>
                  </tr>
                )
                : emails.map((email, idx) => (
                  <tr
                    key={email.id}
                    className={`transition-colors ${selectedIds?.has(email.id) ? 'bg-red-50' : 'hover:bg-red-50'}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(email.id) ?? false}
                        onChange={(e) => onSelectOne?.(email.id, e.target.checked)}
                        disabled={readOnly}
                        className="accent-toyota-red cursor-pointer disabled:cursor-not-allowed"
                        aria-label={t('emailTable.selectEmail', { id: email.id })}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {(page - 1) * limit + idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{email.subject || '(no subject)'}</span>
                        {Number(email.attachment_count) > 0 && (
                          <span
                            className="flex-shrink-0 text-gray-400 text-sm select-none"
                            title={`${email.attachment_count} attachment(s)`}
                          >
                            📎
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                      {email.sender || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {fmt(email.received_at || email.processed_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={email.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ModeBadge mode={email.mode} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScoreCell score={email.match_score} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate text-xs">
                      {emailSummary(t, email)}
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
            {t('emailTable.pagination.summary', { total, page, totalPages })}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="btn-ghost text-xs px-3 py-1 disabled:opacity-40"
            >
              {t('emailTable.pagination.prev')}
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="btn-ghost text-xs px-3 py-1 disabled:opacity-40"
            >
              {t('emailTable.pagination.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

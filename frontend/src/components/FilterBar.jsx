import { useTranslation } from 'react-i18next';

const BLANK = { startDate: '', endDate: '', subject: '', sender: '' };

function hasActiveFilters(f) {
  return f.startDate || f.endDate || f.subject || f.sender;
}

export default function FilterBar({ filters, onChange, disabled = false }) {
  const { t } = useTranslation();

  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="card px-4 py-3">
      <div className="flex flex-wrap gap-3 items-end">

        {/* Date range */}
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="label">{t('filterBar.receivedFrom')}</label>
            <input
              type="date"
              className="input text-sm w-[150px]"
              value={filters.startDate}
              max={filters.endDate || undefined}
              disabled={disabled}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </div>
          <span className="text-gray-400 text-sm pb-2">–</span>
          <div className="flex flex-col gap-1">
            <label className="label">{t('filterBar.to')}</label>
            <input
              type="date"
              className="input text-sm w-[150px]"
              value={filters.endDate}
              min={filters.startDate || undefined}
              disabled={disabled}
              onChange={(e) => set('endDate', e.target.value)}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-8 bg-gray-200 self-end mb-0.5" />

        {/* Subject search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="label">{t('filterBar.subject')}</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              className="input text-sm pl-7"
              placeholder={t('filterBar.subjectPlaceholder')}
              value={filters.subject}
              disabled={disabled}
              onChange={(e) => set('subject', e.target.value)}
            />
          </div>
        </div>

        {/* Sender search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="label">{t('filterBar.sender')}</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
              @
            </span>
            <input
              type="text"
              className="input text-sm pl-6"
              placeholder={t('filterBar.senderPlaceholder')}
              value={filters.sender}
              disabled={disabled}
              onChange={(e) => set('sender', e.target.value)}
            />
          </div>
        </div>

        {/* Clear */}
        {hasActiveFilters(filters) && (
          <button
            onClick={() => onChange(BLANK)}
            className="btn-ghost text-xs px-3 py-2 self-end whitespace-nowrap"
          >
            {t('filterBar.clear')}
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {hasActiveFilters(filters) && (
        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
          {filters.startDate && (
            <Chip
              label={t('filterBar.chipFrom', { date: filters.startDate })}
              onRemove={() => set('startDate', '')}
            />
          )}
          {filters.endDate && (
            <Chip
              label={t('filterBar.chipTo', { date: filters.endDate })}
              onRemove={() => set('endDate', '')}
            />
          )}
          {filters.subject && (
            <Chip
              label={t('filterBar.chipSubject', { value: filters.subject })}
              onRemove={() => set('subject', '')}
            />
          )}
          {filters.sender && (
            <Chip
              label={t('filterBar.chipSender', { value: filters.sender })}
              onRemove={() => set('sender', '')}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-toyota-red border border-red-200 rounded-full px-2.5 py-0.5 font-medium">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 hover:text-red-800 leading-none"
        aria-label="Remove filter"
      >
        ×
      </button>
    </span>
  );
}

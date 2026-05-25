import { useTranslation } from 'react-i18next';

const STYLES = {
  success: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500' },
  failed:  { bg: 'bg-red-100',   text: 'text-red-800',   dot: 'bg-red-500'   },
  ignored:    { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  irrelevant: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
  pending:    { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
};

export default function StatusBadge({ status }) {
  const { t } = useTranslation();
  const s = STYLES[status] ?? STYLES.pending;
  const key = status && STYLES[status] ? status : 'pending';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {t(`status.${key}`)}
    </span>
  );
}

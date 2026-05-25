import { useTranslation } from 'react-i18next';

export default function ModeBadge({ mode }) {
  const { t } = useTranslation();
  const isApp = mode === 'application' || mode === 'recruitment';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
      isApp ? 'bg-toyota-red text-white' : 'bg-gray-200 text-gray-600'
    }`}>
      {isApp ? t('mode.application') : t('mode.general')}
    </span>
  );
}

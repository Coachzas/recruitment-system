import { useTranslation } from 'react-i18next';
import useStore from '../store';

export default function ModeToggle() {
  const { t } = useTranslation();
  const { emailsMode, setEmailsMode } = useStore();

  const MODES = [
    { value: 'all',         key: 'mode.all'         },
    { value: 'application', key: 'mode.application' },
    { value: 'general',     key: 'mode.general'      },
  ];

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      {MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => setEmailsMode(m.value)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            emailsMode === m.value
              ? 'bg-toyota-red text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {t(m.key)}
        </button>
      ))}
    </div>
  );
}

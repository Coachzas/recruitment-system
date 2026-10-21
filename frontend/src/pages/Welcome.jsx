import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Welcome() {
  const { t, i18n } = useTranslation();

  function toggleLanguage() {
    const next = i18n.language === 'en' ? 'th' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('i18n_lng', next);
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-5">
      <div className="w-full max-w-2xl">
        <div className="flex justify-end mb-4">
          <button onClick={toggleLanguage} className="btn-ghost text-xs px-3 py-1.5">
            {t(`lang.${i18n.language === 'en' ? 'th' : 'en'}`)}
          </button>
        </div>
        <div className="card p-8 sm:p-10">
          <div className="flex items-center gap-2.5 mb-6">
            <span className="text-toyota-dark font-black text-3xl tracking-tight leading-none">RECRUIT</span>
            <span className="bg-toyota-red text-white font-black text-sm px-2 py-0.5 rounded">AI</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-toyota-dark tracking-tight">
            {t('entry.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-2 mb-8">{t('entry.subtitle')}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link to="/login" className="border border-gray-200 rounded-lg p-5 hover:border-toyota-red hover:shadow-sm transition-all group">
              <span className="text-2xl" aria-hidden="true">🔐</span>
              <h2 className="font-bold text-toyota-dark mt-3 group-hover:text-toyota-red">
                {t('entry.normalTitle')}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{t('entry.normalDescription')}</p>
              <span className="inline-block text-sm font-semibold text-toyota-red mt-4">
                {t('entry.normalAction')} →
              </span>
            </Link>

            <Link to="/demo" className="border border-gray-200 rounded-lg p-5 hover:border-toyota-red hover:shadow-sm transition-all group">
              <span className="text-2xl" aria-hidden="true">👀</span>
              <h2 className="font-bold text-toyota-dark mt-3 group-hover:text-toyota-red">
                {t('entry.demoTitle')}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{t('entry.demoDescription')}</p>
              <span className="inline-block text-sm font-semibold text-toyota-red mt-4">
                {t('entry.demoAction')} →
              </span>
            </Link>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-5">{t('entry.footer')}</p>
      </div>
    </div>
  );
}

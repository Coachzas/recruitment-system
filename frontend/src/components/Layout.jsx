import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useStore    from '../store';
import { logoutApi } from '../api/auth';

export default function Layout({ children, demo = false }) {
  const { t, i18n } = useTranslation();
  const navigate    = useNavigate();
  const user        = useStore((s) => s.user);
  const clearAuth   = useStore((s) => s.clearAuth);

  function toggleLang() {
    const next = i18n.language === 'en' ? 'th' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('i18n_lng', next);
  }

  async function handleLogout() {
    logoutApi().catch(() => {}); // fire-and-forget; server just returns 200
    clearAuth();
    navigate('/login', { replace: true });
  }

  const prefix = demo ? '/demo' : '';
  const nav = [
    { to: `${prefix}/`,            label: t('nav.dashboard'),   icon: '◈' },
    { to: `${prefix}/applicants`,  label: t('nav.applicants'),  icon: '◎' },
    { to: `${prefix}/criteria`,    label: t('nav.jobCriteria'), icon: '◉' },
    { to: `${prefix}/${demo ? 'connections' : 'settings'}`, label: t('nav.connections'), icon: '⚙' },
    { to: `${prefix}/ai-settings`, label: t('nav.aiSettings'),  icon: '✦' },
  ];

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 bg-toyota-sidebar flex flex-col">
        {/* Brand */}
        <div className="bg-toyota-red px-5 py-4 flex items-center gap-2.5">
          <span className="text-white font-black text-xl tracking-tight leading-none">RECRUIT</span>
          <span className="bg-white text-toyota-red font-black text-xs px-1.5 py-0.5 rounded">AI</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === `${prefix}/`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-toyota-red text-white'
                    : 'text-gray-400 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        {!demo && user && (
          <div className="px-4 py-3 border-t border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-full bg-toyota-red flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                {user.email?.[0]?.toUpperCase() ?? 'A'}
              </span>
              <span className="text-[11px] text-gray-400 truncate flex-1">{user.email}</span>
              <button
                onClick={handleLogout}
                title={t('nav.logout')}
                className="text-gray-500 hover:text-toyota-red transition-colors flex-shrink-0 text-sm"
              >
                ⏏
              </button>
            </div>
          </div>
        )}

        {/* Footer: version + language toggle */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-2">
          {demo
            ? <Link to="/" className="text-[10px] text-gray-500 truncate hover:text-white">{t('demo.exitDemo')}</Link>
            : <span className="text-[10px] text-gray-500 truncate">{t('nav.footer')}</span>
          }
          <div className="flex gap-1 flex-shrink-0">
            {['en', 'th'].map((lng) => (
              <button
                key={lng}
                onClick={toggleLang}
                className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                  i18n.language === lng
                    ? 'bg-toyota-red text-white'
                    : 'text-gray-500 hover:text-white hover:bg-white/10'
                }`}
              >
                {t(`lang.${lng}`)}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto bg-gray-100">
        {demo && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 text-xs text-amber-800">
            <span className="font-bold">{t('demo.readOnly')}:</span> {t('demo.notice')}
          </div>
        )}
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

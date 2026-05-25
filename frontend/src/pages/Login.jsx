import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginApi } from '../api/auth';
import useStore from '../store';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) { setError(t('login.errorRequired')); return; }
    setError('');
    setLoading(true);
    try {
      const res = await loginApi({ email: email.trim().toLowerCase(), password });
      setAuth(res.token, res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.error ?? t('login.errorInvalid'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <span className="text-toyota-dark font-black text-3xl tracking-tight leading-none">RECRUIT</span>
          <span className="bg-toyota-red text-white font-black text-sm px-2 py-0.5 rounded">AI</span>
        </div>

        {/* Card */}
        <div className="card p-8 space-y-5">
          <div>
            <h1 className="text-xl font-black text-toyota-dark">{t('login.title')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{t('login.email')}</label>
              <input
                type="email"
                className="input mt-1 w-full"
                placeholder="admin@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                disabled={loading}
              />
            </div>

            <div>
              <label className="label">{t('login.password')}</label>
              <input
                type="password"
                className="input mt-1 w-full"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm text-toyota-red font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('login.loading')}
                </>
              ) : t('login.submit')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">{t('login.footer')}</p>
      </div>
    </div>
  );
}

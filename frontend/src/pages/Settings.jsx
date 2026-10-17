import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchConnections, createConnection, testConnection, deleteConnection } from '../api/connections';

// ─── Connection Row ───────────────────────────────────────────────────────────

function ConnectionRow({ conn, onDelete }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(t('settings.deleteConfirm', { label: conn.label }))) return;
    setDeleting(true);
    try { await deleteConnection(conn.id); onDelete(conn.id); }
    catch { alert(t('settings.deleteFailed')); }
    finally { setDeleting(false); }
  }

  const statusClass = conn.last_check_status === 'verified'
    ? 'bg-green-100 text-green-700'
    : conn.last_check_status === 'failed'
      ? 'bg-red-100 text-red-700'
      : 'bg-gray-100 text-gray-500';

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{conn.label}</p>
        <p className="text-xs text-gray-500">{conn.username} · {conn.host}:{conn.port} · {conn.mailbox}</p>
        {conn.last_check_error && (
          <p className="text-xs text-red-600 mt-1">{conn.last_check_error}</p>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          conn.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {conn.is_active ? t('common.active') : t('common.inactive')}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusClass}`}>
          {t(`settings.connectionStatus.${conn.last_check_status || 'unchecked'}`)}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
        >
          {deleting ? '…' : t('common.delete')}
        </button>
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

const BLANK = {
  label: '', host: 'imap.gmail.com', port: '993',
  secure: true, username: '', password: '', mailbox: 'INBOX',
};

export default function Settings() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [form, setForm]               = useState(BLANK);
  const [saving, setSaving]           = useState(false);
  const [testing, setTesting]         = useState(false);
  const [formError, setFormError]     = useState('');
  const [testResult, setTestResult]   = useState(null);
  const [loadError, setLoadError]     = useState('');

  useEffect(() => {
    fetchConnections()
      .then((res) => setConnections(res.connections))
      .catch((err) => setLoadError(err?.error ?? t('settings.errorLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  function field(key) {
    return {
      value: form[key],
      onChange: (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm((f) => ({ ...f, [key]: val }));
        setTestResult(null);
        setFormError('');
      },
    };
  }

  function formPayload() {
    return {
      ...form,
      label: form.label.trim(),
      host: form.host.trim(),
      username: form.username.trim(),
      mailbox: form.mailbox.trim() || 'INBOX',
      port: Number(form.port),
    };
  }

  async function handleTest() {
    setFormError('');
    setTestResult(null);
    if (!form.label.trim() || !form.host.trim() || !form.username.trim() || !form.password) {
      setFormError(t('settings.errorRequired'));
      return;
    }
    setTesting(true);
    try {
      const result = await testConnection(formPayload());
      setTestResult({ ok: true, message: result.message });
    } catch (err) {
      const phase = err?.phase ? `${err.phase}: ` : '';
      setTestResult({ ok: false, message: `${phase}${err?.error ?? t('settings.errorTest')}` });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.label || !form.host || !form.username || !form.password) {
      setFormError(t('settings.errorRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await createConnection(formPayload());
      setConnections((c) => [res.connection, ...c]);
      setForm(BLANK);
      setTestResult(null);
    } catch (err) {
      setFormError(err?.error ?? t('settings.errorSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-toyota-dark tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('settings.subtitle')}</p>
      </div>

      {/* Saved connections */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
            {t('settings.savedAccounts')}
          </h2>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-gray-400">{t('common.loading')}</p>
        ) : loadError ? (
          <p className="px-4 py-6 text-sm text-red-600">{loadError}</p>
        ) : connections.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">{t('settings.noAccounts')}</p>
        ) : (
          connections.map((c) => (
            <ConnectionRow
              key={c.id}
              conn={c}
              onDelete={(id) => setConnections((prev) => prev.filter((x) => x.id !== id))}
            />
          ))
        )}
      </div>

      {/* Add connection form */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-100 bg-toyota-red rounded-t-lg">
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">
            {t('settings.addAccount')}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('settings.labelField')}</label>
            <input className="input" placeholder="e.g. Main Gmail" {...field('label')} />
          </div>
          <div>
            <label className="label">{t('settings.hostField')}</label>
            <input className="input" placeholder="imap.gmail.com" {...field('host')} />
          </div>
          <div>
            <label className="label">{t('settings.portField')}</label>
            <input className="input" type="number" min="1" max="65535" {...field('port')} />
          </div>
          <div>
            <label className="label">{t('settings.mailboxField')}</label>
            <input className="input" placeholder="INBOX" {...field('mailbox')} />
          </div>
          <div>
            <label className="label">{t('settings.usernameField')}</label>
            <input className="input" type="email" placeholder="you@gmail.com" {...field('username')} />
          </div>
          <div>
            <label className="label">{t('settings.passwordField')}</label>
            <input className="input" type="password" placeholder="xxxx xxxx xxxx xxxx" {...field('password')} />
            <p className="text-xs text-gray-400 mt-1">{t('settings.passwordHint')}</p>
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input id="secure" type="checkbox" className="accent-toyota-red" {...field('secure')} />
            <label htmlFor="secure" className="text-sm text-gray-600 select-none">
              {t('settings.tlsField')}
            </label>
          </div>
          {formError && (
            <p className="sm:col-span-2 text-sm text-toyota-red font-medium">{formError}</p>
          )}
          {testResult && (
            <p className={`sm:col-span-2 text-sm font-medium ${testResult.ok ? 'text-green-700' : 'text-red-600'}`}>
              {testResult.message}
            </p>
          )}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={saving || testing}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {testing ? t('settings.testingConnection') : t('settings.testConnection')}
            </button>
            <button type="submit" disabled={saving || testing} className="btn-primary">
              {saving ? t('common.saving') : t('settings.addBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

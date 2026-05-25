import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchConnections, createConnection, deleteConnection } from '../api/connections';

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

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{conn.label}</p>
        <p className="text-xs text-gray-500">{conn.username} · {conn.host}:{conn.port} · {conn.mailbox}</p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          conn.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {conn.is_active ? t('common.active') : t('common.inactive')}
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
  const [formError, setFormError]     = useState('');

  useEffect(() => {
    fetchConnections()
      .then((res) => setConnections(res.connections))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function field(key) {
    return {
      value: form[key],
      onChange: (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm((f) => ({ ...f, [key]: val }));
      },
    };
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
      const res = await createConnection({ ...form, port: Number(form.port) });
      setConnections((c) => [res.connection, ...c]);
      setForm(BLANK);
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
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? t('common.saving') : t('settings.addBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

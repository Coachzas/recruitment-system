import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAiSettings, saveAiSettings, testAiSettings } from '../api/aiSettings';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'claude', label: 'Anthropic Claude' },
  { value: 'gemini', label: 'Google Gemini' },
];

const DEFAULT_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-1.5-flash',
};

const BLANK = {
  provider:    'claude',
  api_key:     '',
  model_name:  DEFAULT_MODELS.claude,
  temperature: 0.0,
};

const DEMO_FORM = {
  provider: 'gemini',
  api_key: '',
  model_name: DEFAULT_MODELS.gemini,
  temperature: 0.2,
};

// ─── AiSettings Page ──────────────────────────────────────────────────────────

export default function AiSettings({ demo = false }) {
  const { t } = useTranslation();

  const [form, setForm]           = useState(demo ? DEMO_FORM : BLANK);
  const [loading, setLoading]     = useState(!demo);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState(null); // { ok, text }
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message|error }
  const [prevProvider, setPrevProvider] = useState('claude');

  // Load current settings on mount
  useEffect(() => {
    if (demo) return;
    getAiSettings()
      .then((data) => {
        setForm({
          provider:    data.provider    || 'claude',
          api_key:     data.api_key     || '',          // will be "****XXXX" if set
          model_name:  data.model_name  || DEFAULT_MODELS[data.provider] || '',
          temperature: data.temperature ?? 0.0,
        });
        setPrevProvider(data.provider || 'claude');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [demo]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Auto-fill default model when provider changes
  function handleProviderChange(newProvider) {
    setForm((f) => {
      const modelIsDefault = f.model_name === DEFAULT_MODELS[prevProvider] || !f.model_name;
      return {
        ...f,
        provider:   newProvider,
        model_name: modelIsDefault ? DEFAULT_MODELS[newProvider] : f.model_name,
      };
    });
    setPrevProvider(newProvider);
    setTestResult(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (demo) return;
    setSaveMsg(null);
    setSaving(true);
    try {
      const res = await saveAiSettings(form);
      // Update API key display to the newly masked value
      setForm((f) => ({ ...f, api_key: res.api_key }));
      setSaveMsg({ ok: true, text: t('aiSettings.saved') });
    } catch (err) {
      setSaveMsg({ ok: false, text: err?.error || t('aiSettings.saveError') });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (demo) return;
    setTestResult(null);
    setTesting(true);
    try {
      const res = await testAiSettings({
        provider:   form.provider,
        api_key:    form.api_key,
        model_name: form.model_name,
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, error: err?.error || t('aiSettings.testError') });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  const tempPct = Math.round(form.temperature * 100);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-black text-toyota-dark tracking-tight">
          {t('aiSettings.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('aiSettings.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left: Settings Form ─────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">

          <form onSubmit={handleSave} className="card">
            {/* Card header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-toyota-red rounded-t-lg">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                {t('aiSettings.formTitle')}
              </h2>
            </div>

            <fieldset disabled={demo} className="p-4 space-y-4 disabled:opacity-70">

              {/* Provider */}
              <div>
                <label className="label">{t('aiSettings.providerLabel')}</label>
                <select
                  className="input"
                  value={form.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* API Key */}
              <div>
                <label className="label">{t('aiSettings.apiKeyLabel')}</label>
                <input
                  className="input font-mono"
                  type="password"
                  placeholder={t('aiSettings.apiKeyPlaceholder')}
                  value={form.api_key}
                  onChange={(e) => setField('api_key', e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-400 mt-1">{t('aiSettings.apiKeyHint')}</p>
              </div>

              {/* Model Name */}
              <div>
                <label className="label">{t('aiSettings.modelLabel')}</label>
                <input
                  className="input"
                  type="text"
                  placeholder={t('aiSettings.modelPlaceholder')}
                  value={form.model_name}
                  onChange={(e) => setField('model_name', e.target.value)}
                />
              </div>

              {/* Temperature */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">{t('aiSettings.temperatureLabel')}</label>
                  <span className="text-sm font-mono font-semibold text-toyota-dark w-10 text-right">
                    {form.temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0" max="1" step="0.01"
                  value={form.temperature}
                  onChange={(e) => setField('temperature', parseFloat(e.target.value))}
                  className="w-full accent-toyota-red cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>{t('aiSettings.tempDeterministic')}</span>
                  <span className={`font-medium ${tempPct < 30 ? 'text-green-600' : tempPct < 70 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {tempPct}%
                  </span>
                  <span>{t('aiSettings.tempCreative')}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t('aiSettings.temperatureHint')}</p>
              </div>

              {/* Save feedback */}
              {saveMsg && (
                <div className={`text-sm font-medium px-3 py-2 rounded ${
                  saveMsg.ok
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-toyota-red border border-red-200'
                }`}>
                  {saveMsg.text}
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={demo || saving} className="btn-primary">
                  {saving ? t('common.saving') : t('aiSettings.saveBtn')}
                </button>
              </div>
            </fieldset>
          </form>
        </div>

        {/* ── Right: Test Connection ───────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Test card */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                {t('aiSettings.testTitle')}
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-xs text-gray-500">{t('aiSettings.testHint')}</p>

              <button
                type="button"
                onClick={handleTest}
                disabled={demo || testing}
                title={demo ? t('demo.readOnlyNotice') : undefined}
                className="btn-primary w-full justify-center disabled:opacity-50"
              >
                {testing ? t('aiSettings.testing') : t('aiSettings.testBtn')}
              </button>

              {testResult && (
                <div className={`rounded-lg p-3 text-sm ${
                  testResult.ok
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">
                      {testResult.ok ? '✓' : '✗'}
                    </span>
                    <span className="break-words">
                      {testResult.ok ? testResult.message : testResult.error}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Current config summary */}
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                {t('aiSettings.currentConfig')}
              </h2>
            </div>
            <dl className="p-4 space-y-2.5 text-sm">
              <ConfigRow label={t('aiSettings.providerBadge')} value={
                PROVIDERS.find((p) => p.value === form.provider)?.label || form.provider
              } />
              <ConfigRow label={t('aiSettings.modelBadge')} value={form.model_name || '—'} />
              <ConfigRow label={t('aiSettings.keyBadge')} value={
                form.api_key
                  ? <span className="font-mono text-xs">{form.api_key}</span>
                  : <span className="text-gray-400 italic">{t('aiSettings.noKey')}</span>
              } />
              <ConfigRow label={t('aiSettings.temperatureLabel')} value={`${form.temperature.toFixed(2)}`} />
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-gray-500 flex-shrink-0">{label}</dt>
      <dd className="font-semibold text-gray-800 text-right">{value}</dd>
    </div>
  );
}

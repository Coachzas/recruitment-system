import { useTranslation } from 'react-i18next';

export default function DemoSchedulerModal({ onClose }) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-scheduler-title"
        className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-3xl max-h-[92vh] flex flex-col"
      >
        <header className="px-5 py-4 bg-toyota-red text-white flex items-start gap-4">
          <div className="flex-1">
            <h2 id="demo-scheduler-title" className="font-bold text-lg">{t('demo.schedulerPreview')}</h2>
            <p className="text-xs text-white/80 mt-1">{t('demo.schedulerPreviewNotice')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('demo.close')} className="text-white/80 hover:text-white text-2xl leading-none">
            ×
          </button>
        </header>
        <div className="overflow-y-auto">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-400">
            {t('demo.noActiveSchedules')}
          </div>
          <div className="p-4 sm:p-5 space-y-5">
            <div>
              <h3 className="font-bold text-toyota-dark">{t('demo.schedulerProfiles')}</h3>
              <p className="text-xs text-gray-400 mt-1">{t('demo.schedulerProfilesDescription')}</p>
            </div>
            <div className="rounded-xl border border-toyota-red/30 overflow-hidden">
              <div className="px-4 py-3 bg-toyota-red flex items-center justify-between">
                <span className="text-white text-sm font-bold uppercase tracking-wide">{t('demo.newSchedulerProfile')}</span>
                <button type="button" disabled className="text-white/70 text-sm cursor-not-allowed">{t('common.cancel')}</button>
              </div>
              <div className="p-4 space-y-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t('demo.profileName')}
                  <input type="text" disabled placeholder={t('demo.profileNamePlaceholder')} className="input mt-1 disabled:bg-gray-50" />
                </label>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('demo.daysToRun')}</p>
                  <div className="flex flex-wrap gap-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <button key={day} type="button" disabled className={`px-3 py-1.5 rounded text-xs font-semibold cursor-not-allowed opacity-70 ${day === 'Sun' || day === 'Sat' ? 'border border-gray-200 text-gray-500' : 'bg-toyota-red text-white'}`}>
                        {t(`demo.days.${day.toLowerCase()}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('demo.runTimes')}</p>
                  <span className="inline-flex px-3 py-1 rounded-full bg-red-50 border border-red-200 text-xs text-toyota-red">09:00 ×</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <input type="time" disabled className="input w-auto disabled:bg-gray-50" />
                    <button type="button" disabled className="btn-ghost text-xs text-toyota-red border-toyota-red/50 opacity-50 cursor-not-allowed">+ {t('demo.addTime')}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t('demo.emailsPerBatch')}
                    <div className="flex items-center gap-2 mt-1">
                      <input type="number" defaultValue="20" disabled className="input w-24 disabled:bg-gray-50" />
                      <span className="text-xs text-gray-400">{t('demo.maxPerRun')}</span>
                    </div>
                  </label>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {t('demo.emailFetchWindow')}
                    <div className="flex gap-2 mt-1">
                      <input type="date" disabled className="input disabled:bg-gray-50" />
                      <input type="date" disabled className="input disabled:bg-gray-50" />
                    </div>
                  </label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" disabled className="btn-ghost opacity-50 cursor-not-allowed">{t('common.cancel')}</button>
                  <button type="button" disabled className="btn-primary opacity-50 cursor-not-allowed">{t('demo.saveProfile')}</button>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 opacity-70">
              <div>
                <p className="text-sm font-semibold text-toyota-dark">Scheduler Work2</p>
                <p className="text-xs text-gray-400 mt-1">Sun · Sat · 100 {t('demo.emailsPerRun')}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" disabled className="btn-ghost text-xs px-3 py-1.5 cursor-not-allowed">{t('demo.edit')}</button>
                <button type="button" disabled aria-label={t('demo.toggleSchedule')} className="w-11 h-6 rounded-full bg-gray-300 relative cursor-not-allowed">
                  <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white" />
                </button>
                <span className="text-[10px] text-gray-400 font-bold">{t('demo.off')}</span>
                <button type="button" disabled aria-label={t('demo.deleteSchedule')} className="text-gray-400 cursor-not-allowed">×</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

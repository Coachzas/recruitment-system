import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchApplicant, rescoreApplicant } from '../api/applicants';
import { attachmentDownloadUrl } from '../api/attachments';
import ResumePreviewModal from '../components/ResumePreviewModal';

// ─── Score ring (SVG) ─────────────────────────────────────────────────────────

const SCORE_COLOR = (s) =>
  s >= 70 ? '#16a34a' : s >= 40 ? '#ca8a04' : '#9ca3af';

const SCORE_TEXT_CLASS = (s) =>
  s >= 70 ? 'text-green-600' : s >= 40 ? 'text-yellow-600' : 'text-gray-400';

function scoreLabel(t, score) {
  if (score === null || score === undefined) return t('applicantDetail.scoreNone');
  if (score >= 80) return t('applicantDetail.scoreHigh');
  if (score >= 60) return t('applicantDetail.scoreGood');
  if (score >= 40) return t('applicantDetail.scoreMid');
  return t('applicantDetail.scoreLow');
}

function ScoreRing({ score }) {
  const SIZE   = 140;
  const STROKE = 12;
  const R      = (SIZE - STROKE) / 2;
  const CIRC   = 2 * Math.PI * R;
  const pct    = score !== null && score !== undefined ? Math.max(0, Math.min(100, score)) : 0;
  const offset = CIRC - (pct / 100) * CIRC;
  const color  = score !== null && score !== undefined ? SCORE_COLOR(score) : '#e5e7eb';

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
        {/* track */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="#e5e7eb" strokeWidth={STROKE}
        />
        {/* progress */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke={color} strokeWidth={STROKE}
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.7s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        {score !== null && score !== undefined ? (
          <>
            <span className={`text-3xl font-black leading-none ${SCORE_TEXT_CLASS(score)}`}>
              {score}
            </span>
            <span className="text-xs text-gray-400 mt-0.5">/ 100</span>
          </>
        ) : (
          <span className="text-sm text-gray-300 font-medium">N/A</span>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
      {children}
    </h3>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className="text-gray-700 break-all">{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ApplicantDetail() {
  const { t }      = useTranslation();
  const { id }     = useParams();
  const navigate   = useNavigate();

  const [applicant,   setApplicant]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [rescoring,   setRescoring]   = useState(false);
  const [rescoreMsg,  setRescoreMsg]  = useState(null);
  const [previewAtt,  setPreviewAtt]  = useState(null); // attachment being previewed

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchApplicant(id)
      .then((res) => { if (!cancelled) setApplicant(res.applicant); })
      .catch(() => { if (!cancelled) setError(t('applicantDetail.error')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, t]);

  async function handleRescore() {
    setRescoring(true);
    setRescoreMsg(null);
    try {
      const res = await rescoreApplicant(id);
      setApplicant((prev) => ({
        ...prev,
        match_score:          res.match_score,
        evaluation_rationale: res.rationale ?? prev.evaluation_rationale,
      }));
      setRescoreMsg({ ok: true, text: t('applicantDetail.rescoreSuccess') });
    } catch {
      setRescoreMsg({ ok: false, text: t('applicantDetail.rescoreError') });
    } finally {
      setRescoring(false);
      setTimeout(() => setRescoreMsg(null), 4000);
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64 text-gray-400 text-sm">
        {t('applicantDetail.loading')}
      </div>
    );
  }
  if (error || !applicant) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/applicants')} className="btn-ghost text-sm mb-4">
          {t('applicantDetail.backToList')}
        </button>
        <p className="text-toyota-red text-sm">{error || t('applicantDetail.notFound')}</p>
      </div>
    );
  }

  const a           = applicant;
  const skills      = Array.isArray(a.skills) ? a.skills.filter(Boolean) : [];
  const attachments = Array.isArray(a.attachments) ? a.attachments.filter((x) => x?.id) : [];

  function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="p-6 space-y-5">
      {/* Back link */}
      <button
        onClick={() => navigate('/applicants')}
        className="text-sm text-gray-500 hover:text-toyota-red transition-colors flex items-center gap-1"
      >
        ← {t('applicantDetail.backToList')}
      </button>

      {/* Applicant header */}
      <div className="card px-6 py-5 flex items-start gap-5">
        {/* Avatar initials */}
        <div className="w-14 h-14 rounded-full bg-toyota-red flex-shrink-0 flex items-center justify-center text-white font-black text-xl select-none">
          {(a.full_name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-toyota-dark tracking-tight truncate">
            {a.full_name || t('applicantDetail.unknown')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {a.position_applied || '—'}
          </p>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
            {a.email && <span>✉ {a.email}</span>}
            {a.phone && <span>☎ {a.phone}</span>}
            {a.experience_years != null && (
              <span>⏱ {a.experience_years} {t('applicantDetail.years')}</span>
            )}
          </div>
        </div>
        {/* Inline score badge in header */}
        <div className="flex-shrink-0 text-right">
          <div className={`text-3xl font-black ${
            a.match_score !== null && a.match_score !== undefined
              ? SCORE_TEXT_CLASS(a.match_score)
              : 'text-gray-300'
          }`}>
            {a.match_score !== null && a.match_score !== undefined ? `${a.match_score}%` : '—'}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">AI Score</div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── LEFT: Details ───────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Contact */}
          <div className="card px-5 py-4 space-y-2">
            <SectionTitle>{t('applicantDetail.contact')}</SectionTitle>
            <InfoRow label={t('applicantDetail.email')}    value={a.email} />
            <InfoRow label={t('applicantDetail.phone')}    value={a.phone} />
            <InfoRow label={t('applicantDetail.position')} value={a.position_applied} />
            <InfoRow label={t('applicantDetail.education')} value={a.education} />
          </div>

          {/* Skills */}
          <div className="card px-5 py-4">
            <SectionTitle>{t('applicantDetail.skills')}</SectionTitle>
            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((sk) => (
                  <span
                    key={sk}
                    className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                  >
                    {sk}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{t('applicantDetail.noSkills')}</p>
            )}
          </div>

          {/* AI Summary (from applicant row) */}
          {a.summary && (
            <div className="card px-5 py-4">
              <SectionTitle>{t('applicantDetail.summary')}</SectionTitle>
              <p className="text-sm text-gray-600 leading-relaxed">{a.summary}</p>
            </div>
          )}

          {/* Email context */}
          <div className="card px-5 py-4 space-y-2">
            <SectionTitle>{t('applicantDetail.emailContext')}</SectionTitle>
            <InfoRow label={t('applicantDetail.subject')}  value={a.subject} />
            <InfoRow label={t('applicantDetail.from')}     value={a.sender} />
            <InfoRow label={t('applicantDetail.received')} value={fmtDate(a.received_at)} />
          </div>
        </div>

        {/* ── RIGHT: Insights ─────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Score card */}
          <div className="card px-5 py-6 flex flex-col items-center gap-3">
            <SectionTitle>{t('applicantDetail.scoreLabel')}</SectionTitle>
            <ScoreRing score={a.match_score} />
            <p className={`text-sm font-semibold ${
              a.match_score !== null && a.match_score !== undefined
                ? SCORE_TEXT_CLASS(a.match_score)
                : 'text-gray-400'
            }`}>
              {scoreLabel(t, a.match_score)}
            </p>

            {/* Score breakdown hint */}
            {a.match_score !== null && a.match_score !== undefined && (
              <div className="w-full mt-1 space-y-1.5">
                {[
                  { label: t('applicantDetail.scoreBreakSkills'),     max: 50 },
                  { label: t('applicantDetail.scoreBreakExperience'), max: 30 },
                  { label: t('applicantDetail.scoreBreakBonus'),      max: 20 },
                ].map(({ label, max }) => (
                  <div key={label} className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-36 flex-shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-300 rounded-full"
                        style={{ width: `${max}%` }}
                      />
                    </div>
                    <span className="w-8 text-right">/{max}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Justification */}
          <div className="card px-5 py-4">
            <SectionTitle>{t('applicantDetail.justification')}</SectionTitle>
            {a.evaluation_rationale || a.ai_summary ? (
              <p className="text-sm text-gray-600 leading-relaxed">
                {a.evaluation_rationale || a.ai_summary}
              </p>
            ) : (
              <p className="text-sm text-gray-400">{t('applicantDetail.noJustification')}</p>
            )}
          </div>

          {/* Attachments */}
          <div className="card px-5 py-4">
            <SectionTitle>{t('applicantDetail.resume')}</SectionTitle>
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => {
                  const isPdf = att.mime_type === 'application/pdf';
                  return (
                    <div key={att.id} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded bg-red-50 flex items-center justify-center flex-shrink-0 select-none">
                        <span className="text-toyota-red text-base">{isPdf ? '📄' : '📎'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">
                          {att.original_name || 'Unnamed file'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {att.mime_type || 'document'}
                          {att.size_bytes ? ` · ${fmtSize(att.size_bytes)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isPdf && (
                          <button
                            onClick={() => setPreviewAtt(att)}
                            className="text-xs font-semibold px-3 py-1.5 rounded border border-toyota-red text-toyota-red hover:bg-toyota-red hover:text-white transition-colors"
                          >
                            View
                          </button>
                        )}
                        <a
                          href={attachmentDownloadUrl(att.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
                        >
                          ⬇ Download
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{t('applicantDetail.noResume')}</p>
            )}
          </div>

          {/* Re-score */}
          <div className="card px-5 py-4">
            <SectionTitle>{t('applicantDetail.rescoreTitle')}</SectionTitle>
            <p className="text-xs text-gray-400 mb-3">{t('applicantDetail.rescoreHint')}</p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleRescore}
                disabled={rescoring}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50"
              >
                {rescoring ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('applicantDetail.rescoring')}
                  </>
                ) : (
                  t('applicantDetail.rescore')
                )}
              </button>
              {rescoreMsg && (
                <span className={`text-xs font-medium ${rescoreMsg.ok ? 'text-green-600' : 'text-toyota-red'}`}>
                  {rescoreMsg.text}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resume preview modal */}
      <ResumePreviewModal
        attachment={previewAtt}
        onClose={() => setPreviewAtt(null)}
      />
    </div>
  );
}

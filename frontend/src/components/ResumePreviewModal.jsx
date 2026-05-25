import { useEffect } from 'react';
import { attachmentDownloadUrl, attachmentInlineUrl } from '../api/attachments';

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Modal that previews a single resume attachment.
 *
 * Props:
 *   attachment — { id, original_name, mime_type, size_bytes } or null
 *   onClose    — called when the user dismisses the modal
 */
export default function ResumePreviewModal({ attachment, onClose }) {
  // Close on Escape key
  useEffect(() => {
    if (!attachment) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [attachment, onClose]);

  if (!attachment) return null;

  const isPdf      = attachment.mime_type === 'application/pdf';
  const isText     = attachment.mime_type === 'text/plain';
  const isImage    = ['image/jpeg', 'image/jpg', 'image/png'].includes(attachment.mime_type);
  const canPreview = isPdf || isText || isImage;
  const inlineUrl  = attachmentInlineUrl(attachment.id);
  const dlUrl      = attachmentDownloadUrl(attachment.id);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div className="min-h-full flex items-start justify-center p-4 sm:p-8">
        <div
          className="w-full max-w-4xl rounded-xl overflow-hidden shadow-2xl bg-white flex flex-col"
          style={{ maxHeight: '92vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ───────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 py-4 bg-toyota-red flex-shrink-0">
            <div className="min-w-0 flex-1">
              <h2 className="text-white font-black text-base tracking-tight truncate">
                {attachment.original_name || 'Resume'}
              </h2>
              <p className="text-white/70 text-xs mt-0.5">
                {attachment.mime_type || 'document'}
                {attachment.size_bytes ? ` · ${fmtSize(attachment.size_bytes)}` : ''}
              </p>
            </div>
            <a
              href={dlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-white/80 hover:text-white text-xs font-semibold border border-white/30 rounded px-3 py-1.5 transition-colors hover:bg-white/10"
            >
              ⬇ Download
            </a>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-white/70 hover:text-white text-2xl leading-none font-light ml-1"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>

          {/* ── Body ─────────────────────────────────────────────────────────── */}
          {isImage ? (
            <div className="flex items-center justify-center p-4 flex-1 bg-gray-50 overflow-auto">
              <img
                src={inlineUrl}
                alt={attachment.original_name || 'Resume'}
                className="max-w-full object-contain"
                style={{ maxHeight: '80vh' }}
              />
            </div>
          ) : canPreview ? (
            <iframe
              src={inlineUrl}
              title={attachment.original_name || 'Resume preview'}
              className="w-full flex-1 border-0"
              style={{ minHeight: '70vh' }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4 flex-1">
              <span className="text-6xl select-none">📄</span>
              <p className="text-sm font-semibold text-gray-700">Preview not available</p>
              <p className="text-xs text-gray-400">{attachment.mime_type}</p>
              <a
                href={dlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm mt-2"
              >
                ⬇ Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use strict';

const fsp  = require('fs').promises;
const path = require('path');

let pdfParse, mammoth;
try { pdfParse = require('pdf-parse'); }   catch { /* optional */ }
try { mammoth  = require('mammoth'); }     catch { /* optional */ }

// Lazy-load to avoid a circular dependency at module initialisation time.
// aiService → (nothing in this file), so it's safe once fully loaded.
function getAiService() {
  return require('../services/aiService');
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const IMAGE_MIME_RE    = /^image\/(jpe?g|png)$/i;

/**
 * Extract plain text from a saved resume file.
 * Supports PDF, DOCX, plain-text, and image files (JPG/PNG via AI vision).
 *
 * @param {string} filePath  Absolute path to the saved attachment
 * @param {string} mimeType  MIME type reported by the email
 * @returns {Promise<string|null>}  Extracted text, or null if unsupported type
 */
async function extractText(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  const isPdf  = mimeType === 'application/pdf'  || ext === '.pdf';
  const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              || ext === '.docx';
  const isText  = (mimeType && mimeType.startsWith('text/')) || ext === '.txt';
  const isImage = IMAGE_MIME_RE.test(mimeType || '') || IMAGE_EXTENSIONS.has(ext);

  if (isPdf) {
    if (!pdfParse) throw new Error('pdf-parse is not installed');
    const buf  = await fsp.readFile(filePath);
    const data = await pdfParse(buf);
    return data.text.trim();
  }

  if (isDocx) {
    if (!mammoth) throw new Error('mammoth is not installed');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.trim();
  }

  if (isText) {
    const buf = await fsp.readFile(filePath);
    return buf.toString('utf8').trim();
  }

  if (isImage) {
    const buf        = await fsp.readFile(filePath);
    const effectiveMime = IMAGE_MIME_RE.test(mimeType || '') ? mimeType : (ext === '.png' ? 'image/png' : 'image/jpeg');
    const { extractTextFromImage } = getAiService();
    const text = await extractTextFromImage(buf, effectiveMime);
    return text ? text.trim() : null;
  }

  return null;
}

module.exports = { extractText };

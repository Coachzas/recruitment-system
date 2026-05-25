/** Direct URL for browser download — forces save-as dialog. */
export const attachmentDownloadUrl = (id) => `/api/attachments/${id}/download`;

/** Direct URL for inline rendering — PDFs open in browser / iframe. */
export const attachmentInlineUrl = (id) => `/api/attachments/${id}/inline`;

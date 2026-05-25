import client from './client';

export const fetchApplicants = (params = {}) =>
  client.get('/applicants', { params });

export const fetchApplicant = (id) =>
  client.get(`/applicants/${id}`);

export const rescoreApplicant = (id) =>
  client.post(`/applicants/${id}/rescore`);

/** Direct URL for browser download / inline view — no fetch wrapper needed. */
export const resumeDownloadUrl = (id) => `/api/applicants/${id}/resume`;

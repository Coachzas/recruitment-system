import client from './client';

export const fetchEmails = (params = {}) =>
  client.get('/emails', { params });

export const fetchStats = () =>
  client.get('/emails/stats');

export const bulkDeleteEmails = (ids) =>
  client.post('/emails/bulk-delete', { ids });

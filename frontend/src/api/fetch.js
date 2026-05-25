import client from './client';

export function triggerManualFetch(body) {
  return client.post('/fetch/manual', body);
}

export function fetchRunningStatus() {
  return client.get('/fetch/status');
}

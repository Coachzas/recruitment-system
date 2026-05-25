import client from './client';

export const getAiSettings  = ()     => client.get('/settings/ai');
export const saveAiSettings = (data) => client.post('/settings/ai', data);
export const testAiSettings = (data) => client.post('/settings/ai/test', data);

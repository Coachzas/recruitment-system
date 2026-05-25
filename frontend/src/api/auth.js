import client from './client';

export const loginApi  = (body) => client.post('/auth/login', body);
export const meApi     = ()     => client.get('/auth/me');
export const logoutApi = ()     => client.post('/auth/logout');

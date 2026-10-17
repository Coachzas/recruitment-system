import client from './client';

export const fetchConnections  = ()       => client.get('/connections');
export const createConnection  = (body)   => client.post('/connections', body, { timeout: 75000 });
export const testConnection    = (body)   => client.post('/connections/test', body, { timeout: 75000 });
export const deleteConnection  = (id)     => client.delete(`/connections/${id}`);

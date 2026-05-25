import client from './client';

export const fetchConnections  = ()       => client.get('/connections');
export const createConnection  = (body)   => client.post('/connections', body);
export const deleteConnection  = (id)     => client.delete(`/connections/${id}`);

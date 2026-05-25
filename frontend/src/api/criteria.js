import client from './client';

export const fetchCriteria  = ()     => client.get('/criteria');
export const createCriteria = (body) => client.post('/criteria', body);
export const deleteCriteria = (id)   => client.delete(`/criteria/${id}`);

import client from './client';

export const fetchSchedulerProfiles  = ()         => client.get('/scheduler');
export const fetchSchedulerStatus    = ()         => client.get('/scheduler/status');
export const createSchedulerProfile  = (body)     => client.post('/scheduler', body);
export const updateSchedulerProfile  = (id, body) => client.patch(`/scheduler/${id}`, body);
export const toggleSchedulerProfile  = (id, body) => client.patch(`/scheduler/${id}/toggle`, body);
export const deleteSchedulerProfile  = (id)       => client.delete(`/scheduler/${id}`);

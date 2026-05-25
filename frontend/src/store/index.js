import { create } from 'zustand';

const _storedToken = localStorage.getItem('auth_token');
const _storedUser  = (() => {
  try { return JSON.parse(localStorage.getItem('auth_user') || 'null'); } catch { return null; }
})();

const useStore = create((set) => ({
  // ── Email table ────────────────────────────────────────────────────────────
  emails:      [],
  emailsTotal: 0,
  emailsPage:  1,
  emailsMode:  'all',   // 'all' | 'application' | 'general'
  stats:       null,
  emailsLoading: false,
  emailsError:   null,

  setEmails:      (emails, total) => set({ emails, emailsTotal: total }),
  setEmailsPage:  (page)  => set({ emailsPage: page }),
  setEmailsMode:  (mode)  => set({ emailsMode: mode, emailsPage: 1 }),
  setEmailsLoading: (v)   => set({ emailsLoading: v }),
  setEmailsError:   (e)   => set({ emailsError: e }),
  setStats:         (s)   => set({ stats: s }),

  // ── Auth ──────────────────────────────────────────────────────────────────
  token: _storedToken || null,
  user:  _storedUser  || null,

  setAuth: (token, user) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    set({ token, user });
  },
  clearAuth: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    set({ token: null, user: null });
  },

  // ── Connections ────────────────────────────────────────────────────────────
  connections:        [],
  connectionsLoading: false,
  connectionsError:   null,

  setConnections:        (c)  => set({ connections: c }),
  setConnectionsLoading: (v)  => set({ connectionsLoading: v }),
  setConnectionsError:   (e)  => set({ connectionsError: e }),
}));

export default useStore;

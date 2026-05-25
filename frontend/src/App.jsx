import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useStore         from './store';
import Layout           from './components/Layout';
import Login            from './pages/Login';
import Dashboard        from './pages/Dashboard';
import Applicants       from './pages/Applicants';
import ApplicantDetail  from './pages/ApplicantDetail';
import Criteria         from './pages/Criteria';
import Settings         from './pages/Settings';
import AiSettings       from './pages/AiSettings';

// Redirects unauthenticated users to /login
function RequireAuth() {
  const token = useStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  // Preload translations (hook must be called to init i18n in this component tree)
  useTranslation();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Protected: all routes inside RequireAuth + Layout */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index                  element={<Dashboard />} />
          <Route path="applicants"      element={<Applicants />} />
          <Route path="applicants/:id"  element={<ApplicantDetail />} />
          <Route path="criteria"        element={<Criteria />} />
          <Route path="settings"        element={<Settings />} />
          <Route path="ai-settings"     element={<AiSettings />} />
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

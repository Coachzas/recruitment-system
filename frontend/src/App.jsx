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
import Welcome          from './pages/Welcome';
import { DemoLayout } from './pages/Demo';

// Redirects unauthenticated users to /login
function RequireAuth() {
  const token = useStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function Home() {
  const token = useStore((s) => s.token);
  if (!token) return <Welcome />;
  return <Layout><Dashboard /></Layout>;
}

export default function App() {
  // Preload translations (hook must be called to init i18n in this component tree)
  useTranslation();

  return (
    <Routes>
      {/* Public entry points */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/demo" element={<DemoLayout />}>
        <Route index element={<Dashboard demo />} />
        <Route path="applicants" element={<Applicants demo />} />
        <Route path="applicants/:id" element={<ApplicantDetail demo />} />
        <Route path="criteria" element={<Criteria demo />} />
        <Route path="connections" element={<Settings demo />} />
        <Route path="ai-settings" element={<AiSettings demo />} />
      </Route>

      {/* Normal mode remains backed by the existing API and database. */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="applicants"      element={<Applicants />} />
          <Route path="applicants/:id"  element={<ApplicantDetail />} />
          <Route path="criteria"        element={<Criteria />} />
          <Route path="settings"        element={<Settings />} />
          <Route path="ai-settings"     element={<AiSettings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

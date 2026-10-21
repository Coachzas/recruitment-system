import { Outlet } from 'react-router-dom';
import Layout from '../components/Layout';

export function DemoLayout() {
  return <Layout demo><Outlet /></Layout>;
}

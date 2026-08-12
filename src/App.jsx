import { lazy, Suspense } from 'react';
import MarketingSite from './site/MarketingSite';
const CvBuildaPage = lazy(() => import('./cv-builda/CvBuildaPage'));
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === '/cv-builda' ? <Suspense fallback={<main aria-live="polite">Loading CV Builda…</main>}><CvBuildaPage /></Suspense> : <MarketingSite />;
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App.tsx';

if (!import.meta.env.VITE_KINDE_DOMAIN || !import.meta.env.VITE_KINDE_CLIENT_ID) {
  throw new Error(
    'Missing Kinde configuration. Copy frontend/.env.example to frontend/.env.local and set ' +
      'VITE_KINDE_DOMAIN and VITE_KINDE_CLIENT_ID from your Kinde Dashboard → Applications → Futuros FE.',
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

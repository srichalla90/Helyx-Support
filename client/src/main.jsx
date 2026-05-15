import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './authConfig';
import App from './App.jsx';

// MSAL 3.x requires initialization before first use.
// We wait for it before rendering the app.
msalInstance.initialize().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>
  );
}).catch((err) => {
  // If MSAL fails to initialize (e.g. bad config), show a clear message
  console.error('MSAL initialization failed:', err);
  document.getElementById('root').innerHTML =
    '<div style="padding:40px;font-family:sans-serif;color:#DC2626">' +
    '<h2>Authentication configuration error</h2>' +
    '<p>Could not connect to Microsoft authentication. Please check the Azure configuration.</p>' +
    '<pre style="background:#FEF2F2;padding:12px;border-radius:8px;font-size:12px">' + err.message + '</pre>' +
    '</div>';
});

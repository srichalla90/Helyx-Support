import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';
import { api } from '../api';

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

export default function LoginPage({ error, onDevLogin }) {
  const { instance } = useMsal();
  const [devEmail,   setDevEmail]   = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const [devError,   setDevError]   = useState('');

  function handleSignIn() {
    instance.loginRedirect(loginRequest).catch(console.error);
  }

  async function handleDevSubmit(e) {
    e.preventDefault();
    if (!devEmail.trim()) return;
    setDevLoading(true);
    setDevError('');
    try {
      const { token, user } = await api.devLogin(devEmail.trim());
      onDevLogin(token, user);
    } catch (err) {
      setDevError(err.message || 'Login failed.');
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">H</div>
          <h1>Helyx Support</h1>
          {DEV_MODE ? (
            <p style={{ color: '#D97706', fontWeight: 600, fontSize: 13 }}>
              ⚠️ Dev mode — no SSO required
            </p>
          ) : (
            <p>Sign in with your Helyx Microsoft account</p>
          )}
        </div>

        {(error || devError) && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
            padding: '12px 16px', marginBottom: 20, color: '#991B1B', fontSize: 13,
          }}>
            {error || devError}
          </div>
        )}

        {DEV_MODE ? (
          /* ── Dev mode: plain email form ─────────────────────────────────── */
          <form onSubmit={handleDevSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              placeholder="Enter your email address"
              value={devEmail}
              onChange={e => setDevEmail(e.target.value)}
              required
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px', borderRadius: 8, fontSize: 14,
                border: '1px solid #D1D5DB', outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={devLoading}
              style={{
                width: '100%', padding: '11px 20px',
                background: devLoading ? '#93C5FD' : '#2563EB',
                border: 'none', borderRadius: 8, cursor: devLoading ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 600, color: '#fff',
                transition: 'background 0.15s',
              }}
            >
              {devLoading ? 'Signing in…' : 'Sign in (Dev)'}
            </button>
            <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', margin: 0 }}>
              Use any email from the users table for agent/admin access,
              <br />or any other email to sign in as a customer.
            </p>
          </form>
        ) : (
          /* ── Production: Microsoft SSO button ───────────────────────────── */
          <>
            <button
              onClick={handleSignIn}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                padding: '12px 20px', background: '#fff',
                border: '1px solid #D1D5DB', borderRadius: 8, cursor: 'pointer',
                fontSize: 15, fontWeight: 600, color: '#111827',
                transition: 'background 0.15s, box-shadow 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }}
            >
              <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
                <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              Sign in with Microsoft
            </button>
            <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginTop: 20 }}>
              Use your Helyx Microsoft account to sign in.
              <br />Contact IT if you need access.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * authConfig.js — Microsoft Azure Entra ID (MSAL) configuration
 *
 * Your engineering team needs to:
 *   1. Go to Azure Portal → Azure Active Directory → App registrations
 *   2. Create a new registration called "Helyx Support" (or similar)
 *   3. Set Application type to: Single-page application (SPA)
 *   4. Set Redirect URI to: https://your-production-domain.com
 *      (also add http://localhost:5173 for local development)
 *   5. Copy the "Application (client) ID" → VITE_AZURE_CLIENT_ID
 *   6. Copy the "Directory (tenant) ID"   → VITE_AZURE_TENANT_ID
 *   7. Add these to client/.env (for local dev) and docker-compose.yml (for production)
 *
 * No client secret is needed for a single-page application.
 *
 * Required API permissions (all delegated, all default consent):
 *   - openid
 *   - profile
 *   - email
 */

import { PublicClientApplication } from '@azure/msal-browser';

// In dev mode the Azure vars are intentionally blank — use safe fallbacks so
// MSAL initialises without throwing. The dev-login bypass means MSAL is never
// actually invoked until Azure is wired up and VITE_DEV_MODE is removed.
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || 'common';
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || '00000000-0000-0000-0000-000000000000';

export const msalConfig = {
  auth: {
    clientId:               CLIENT_ID,
    authority:              `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri:            window.location.origin,
    postLogoutRedirectUri:  window.location.origin,
  },
  cache: {
    cacheLocation:          'localStorage', // persists across browser tabs
    storeAuthStateInCookie: true,           // needed for Safari/IE compatibility
  },
};

// Scopes requested at login — gives us the user's name and email
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};

// Singleton MSAL instance — shared across the whole app
export const msalInstance = new PublicClientApplication(msalConfig);

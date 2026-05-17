# Azure Entra ID (Azure AD) Integration

Helyx Support uses **Microsoft Azure Entra ID** (formerly Azure Active Directory) as its sole identity provider for Single Sign-On (SSO). Authentication is handled via the **MSAL (Microsoft Authentication Library)** for browser-based OAuth 2.0 / OIDC flows.

---

## Overview

```
User clicks "Sign in with Microsoft"
        │
MSAL popup/redirect → Microsoft login
        │
Microsoft issues ID token (RS256, signed with tenant keys)
        │
Frontend: POST /api/auth/azure { idToken }
        │
Backend:
  1. Fetches Microsoft's JWKS (public keys) for the tenant
  2. Verifies ID token signature, audience (CLIENT_ID), issuer (tenant)
  3. Extracts email from preferred_username / email claim
  4. Looks up email in Helyx users table
  5. Issues app JWT (HS256, 8h) with { id, name, email, role }
        │
Frontend stores app JWT in localStorage
  → Used as Bearer token on all subsequent API requests
```

---

## Required Azure App Registration

Your IT team must create an App Registration in Azure Portal:

1. Go to **Azure Portal → Azure Active Directory → App registrations → New registration**
2. Name: `Helyx Support` (or similar)
3. **Supported account types**: Accounts in this organizational directory only (Single tenant)
4. **Redirect URI platform**: Single-page application (SPA)
5. **Redirect URIs**: Add both:
   - `https://your-production-domain.com` (production)
   - `http://localhost:5173` (local development)

6. After creation, note:
   - **Application (client) ID** → `VITE_AZURE_CLIENT_ID` and `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `VITE_AZURE_TENANT_ID` and `AZURE_TENANT_ID`

7. Under **API Permissions**, ensure these **delegated** permissions are granted:
   - `openid`
   - `profile`
   - `email`

8. No client secret is needed for the SPA authentication flow (PKCE).

---

## Configuration Variables

### Server (`server/.env`)

| Variable | Description |
|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID from App Registration |
| `AZURE_CLIENT_ID` | Application (client) ID from App Registration |
| `JWT_SECRET` | Secret for signing the app JWT (must be long and random in production) |

### Client (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_AZURE_TENANT_ID` | Same tenant ID (used by MSAL in browser) |
| `VITE_AZURE_CLIENT_ID` | Same client ID (used by MSAL in browser) |
| `VITE_DEV_MODE` | Set to `"true"` to enable dev-login bypass (development only) |

---

## Token Validation (Backend)

The backend uses `jsonwebtoken` + `jwks-rsa` to verify the Microsoft ID token:

- **Algorithm**: RS256
- **JWKS endpoint**: `https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys`
- **Audience**: Must match `AZURE_CLIENT_ID`
- **Issuer**: Must match `https://login.microsoftonline.com/{TENANT_ID}/v2.0`
- Keys are **cached for 24 hours** (Microsoft rotates infrequently)

If validation fails (tampered, expired, wrong audience), the backend returns `401 Unauthorized`.

---

## App JWT

After successful validation, the backend issues its own JWT:

```json
{
  "id": 1,
  "name": "A Ong",
  "email": "aong@helyxtech.com",
  "role": "agent",
  "iat": 1716000000,
  "exp": 1716028800
}
```

- **Algorithm**: HS256
- **Expiry**: 8 hours
- **Secret**: `JWT_SECRET` environment variable (must be cryptographically strong in production)
- Stored in `localStorage` as `helyx_token`
- The frontend checks validity before every page load (2-minute buffer)

---

## Dev Login Bypass

For local development without Azure credentials:

```
POST /api/auth/dev-login
{ "email": "admin@helyxtech.com" }
```

- Only available when `NODE_ENV === 'development'` or `NODE_ENV === 'test'`
- Looks up the email in the users table and issues the same app JWT
- Returns 403 for unknown or inactive emails (same security model as production)
- The React frontend enables this bypass when `VITE_DEV_MODE=true`

---

## Security Notes

- Azure AD handles **authentication** (who you are). Helyx handles **authorisation** (what you can do).
- Every user must be explicitly added to the `users` table by an admin, even if they have a valid Azure account.
- The app JWT secret must be set via environment variable. The server refuses to start in production without it.
- Weak secrets (`secret`, `changeme`, etc.) trigger a startup warning.
- Token expiry is 8 hours; users are silently re-authenticated on next page load.

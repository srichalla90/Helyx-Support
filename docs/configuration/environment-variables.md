# Environment Variables

---

## Server (`server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **Yes (production)** | `dev-secret-NOT-for-production` | Secret for signing app JWTs. Must be a cryptographically strong random string (48+ bytes). Server refuses to start in production without this. |
| `NODE_ENV` | No | `development` | Set to `production` in production deployments. Disables dev-login, changes error verbosity. |
| `PORT` | No | `3001` | HTTP port the Express server listens on |
| `AZURE_TENANT_ID` | Yes (for SSO) | `YOUR_TENANT_ID_HERE` | Azure AD tenant ID for token validation and Graph API |
| `AZURE_CLIENT_ID` | Yes (for SSO) | `YOUR_CLIENT_ID_HERE` | Azure AD app registration client ID |
| `AZURE_CLIENT_SECRET` | Yes (for Graph email) | `YOUR_CLIENT_SECRET_HERE` | Azure AD client secret for server-side Graph API access |
| `SUPPORT_MAILBOX` | Yes (for email) | `support@helyxtech.com` | Email address of the support inbox that Graph watches |
| `WEBHOOK_BASE_URL` | Yes (for email) | `https://YOUR_SERVER_DOMAIN_HERE` | Public HTTPS URL for Microsoft Graph to call the webhook. Must be reachable by Microsoft. |
| `GRAPH_WEBHOOK_SECRET` | Yes (for email) | `helyx-support-webhook-secret` | Arbitrary shared secret Microsoft echoes in all webhook calls. Change this to a random string. |
| `ADO_ORG_URL` | Yes (for ADO) | `https://dev.azure.com/CelitoTech` | Azure DevOps organization URL |
| `ADO_PAT` | Yes (for ADO) | *(none)* | Azure DevOps Personal Access Token (Work Items: Read & Write) |
| `ADO_PROJECT_HELYX_PLATFORM` | No | `Quality System` | ADO project name for Helyx Platform |
| `ADO_PROJECT_HELYX_DATA` | No | `HelyxData` | ADO project name for Helyx Data |
| `CORS_ORIGIN` | Yes (production) | *(none — allow all)* | Allowed origin for CORS. Should be the exact frontend URL in production (e.g. `https://support.helyxtech.com`) |
| `EMAIL_INGEST_SECRET` | Yes (for email ingest) | *(none)* | Shared secret for the generic `/api/email/ingest` webhook endpoint |

### Generating a Strong JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Security Warnings at Startup

The server logs warnings if:
- `JWT_SECRET` is not set or is a known weak value
- `CORS_ORIGIN` is not set (accepts all origins — dev-safe, not production-safe)
- In production (`NODE_ENV=production`), missing `JWT_SECRET` causes the process to exit

---

## Client (`client/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_AZURE_TENANT_ID` | Yes (for SSO) | `common` | Azure AD tenant ID for MSAL browser configuration |
| `VITE_AZURE_CLIENT_ID` | Yes (for SSO) | `00000000-0000-0000-0000-000000000000` | Azure AD client ID for MSAL browser configuration |
| `VITE_DEV_MODE` | No | *(unset)* | Set to `"true"` to enable the dev-login bypass and skip Azure SSO. **Never set in production.** |

`client/.env.example` contains a template with all variables listed.

---

## Docker / `docker-compose.yml`

In containerised deployments, set all server environment variables under the `environment:` key in `docker-compose.yml`. The build-time client variables (`VITE_*`) must be passed as `build.args` since Vite bakes them into the JS bundle at build time.

### Example `docker-compose.yml` environment section

```yaml
services:
  app:
    build:
      context: .
      args:
        VITE_AZURE_TENANT_ID: "your-tenant-id"
        VITE_AZURE_CLIENT_ID: "your-client-id"
    environment:
      NODE_ENV: production
      PORT: 3001
      JWT_SECRET: "your-strong-random-jwt-secret"
      AZURE_TENANT_ID: "your-tenant-id"
      AZURE_CLIENT_ID: "your-client-id"
      AZURE_CLIENT_SECRET: "your-client-secret"
      SUPPORT_MAILBOX: "support@helyxtech.com"
      WEBHOOK_BASE_URL: "https://support.helyxtech.com"
      GRAPH_WEBHOOK_SECRET: "your-random-webhook-secret"
      ADO_ORG_URL: "https://dev.azure.com/CelitoTech"
      ADO_PAT: "your-ado-pat"
      ADO_PROJECT_HELYX_PLATFORM: "Quality System"
      ADO_PROJECT_HELYX_DATA: "HelyxData"
      CORS_ORIGIN: "https://support.helyxtech.com"
```

---

## Minimum Configuration for Local Development

The bare minimum to run the app locally without any external integrations:

**`server/.env`:**
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=dev-local-secret-change-in-production
```

**`client/.env`:**
```env
VITE_DEV_MODE=true
```

With this configuration:
- Login via `POST /auth/dev-login` with any email in the users table
- No Azure SSO, no email, no ADO integration
- All ticket management features work fully

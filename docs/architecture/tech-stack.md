# Tech Stack

## Backend

| Technology | Version / Notes | Purpose |
|---|---|---|
| **Node.js** | 18+ recommended | Runtime environment |
| **Express.js** | `^4.x` | HTTP server framework |
| **sql.js** | Pure-JS SQLite (WASM) | Database engine — no native binaries needed |
| **jsonwebtoken** | `^9.x` | Signing and verifying app JWTs (HS256, 8h expiry) |
| **jwks-rsa** | Latest | Fetching Microsoft's public keys to verify Azure ID tokens |
| **multer** | `^1.x` | Multipart file upload handling (tickets, KB, deployments) |
| **express-rate-limit** | `^7.x` | Rate limiting — 300 req/min general, 30/15min on auth endpoints |
| **helmet** | `^7.x` | Security headers (CSP, HSTS, X-Frame-Options, etc.) |
| **cors** | `^2.x` | Cross-origin resource sharing — configurable per `CORS_ORIGIN` env var |
| **dotenv** | `^16.x` | Environment variable loading from `server/.env` |
| **nodemailer** / **graph.js** | Custom service | Outbound email via Microsoft Graph `sendMail` |

### Backend Dev Dependencies

| Package | Purpose |
|---|---|
| None declared | All deps are production |

---

## Frontend

| Technology | Version / Notes | Purpose |
|---|---|---|
| **React** | 18 | UI component framework |
| **Vite** | 5 | Build tool and dev server (ESM, HMR) |
| **@azure/msal-browser** | `^3.x` | Microsoft Authentication Library for browser-based SSO |
| **@azure/msal-react** | `^2.x` | React hooks and components wrapping MSAL |
| **CSS Custom Properties** | Native | Design tokens and theming via `index.css` |

### Frontend: No External UI Library
The UI is built with **custom CSS** (no Tailwind, no MUI, no Bootstrap). All styling lives in `client/src/styles/index.css` with CSS custom properties for theming.

---

## Infrastructure & Tooling

| Tool | Purpose |
|---|---|
| **Docker** | Containerised deployment (multi-stage Dockerfile) |
| **docker-compose** | Orchestration for container-based production setup |
| **Microsoft Azure Entra ID** | Identity provider for SSO (OAuth 2.0 / OIDC) |
| **Microsoft Graph API** | Inbound email via webhook, outbound email via sendMail |
| **Azure DevOps REST API** | Work item creation, release pipeline data |

---

## External APIs and Services

### Microsoft Azure
- **Azure Entra ID (formerly Azure AD)**: OIDC/OAuth 2.0 for user authentication. The backend validates RS256-signed ID tokens using Microsoft's JWKS endpoint.
- **Microsoft Graph API v1.0**: Used for:
  - Watching the support mailbox (`users/{mailbox}/mailFolders/Inbox/messages`)
  - Fetching full message content and file attachments
  - Sending reply and notification emails via `sendMail`

### Azure DevOps
- **Work Items API** (`dev.azure.com`): Creating Bug and Task work items from tickets
- **Release Management API** (`vsrm.dev.azure.com`): Fetching classic release pipeline data for the Operations Center
- Authentication: Personal Access Token (PAT) via HTTP Basic auth

---

## Security Libraries / Practices

| Practice | Implementation |
|---|---|
| JWT auth | `jsonwebtoken` — HS256, 8-hour expiry, secret must be set in env |
| Microsoft token validation | RS256, audience + issuer checked against Azure JWKS |
| Rate limiting | `express-rate-limit` — auth: 30/15min, API: 300/min, ingest: 30/min |
| Security headers | `helmet` middleware on all routes |
| File upload safety | MIME type allowlist (no .exe, .sh etc.); 50 MB size limit; random filenames |
| Path traversal prevention | All file downloads resolve paths and assert they're within the upload dir |
| SQL injection prevention | sql.js `?` parameter interpolation with string escaping |
| CORS | Configurable `CORS_ORIGIN` — defaults open in dev, must be set in production |
| Role-based access | `adminOnly`, `staffOnly` middleware on sensitive routes |
| Customer data isolation | Customer-role tokens can only query their own tickets |

---

## File Storage

All uploaded files are stored on the local filesystem under `server/uploads/`:

| Directory | Contents |
|---|---|
| `uploads/ticket_attachments/` | Files attached to support tickets and comments |
| `uploads/kb/` | Files uploaded to knowledge base folders/articles |
| `uploads/downloads/` | Admin-uploaded resources in the Downloads library |

Files are renamed to `{timestamp}-{randomhex}.{ext}` to prevent collisions and obscure original names.

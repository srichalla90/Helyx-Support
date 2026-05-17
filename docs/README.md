# Helyx Support — Documentation Index

**Helyx Support** is an internal customer support ticketing system built for Helyx Tech. It is a full-stack, Freshdesk-style platform providing ticket management, a customer portal, knowledge base, feature request board, announcements, deployment tracking, Azure DevOps integration, and automated email-to-ticket ingestion.

---

## Documentation Map

### Architecture
| Document | Description |
|---|---|
| [Architecture Overview](./architecture/overview.md) | System design, component breakdown, and request flow |
| [Tech Stack](./architecture/tech-stack.md) | All technologies, libraries, and frameworks used |

### Database
| Document | Description |
|---|---|
| [Database Schema](./database/schema.md) | All tables, columns, relationships, and indexes |

### API Reference
| Document | Description |
|---|---|
| [API Reference](./api/api-reference.md) | Every endpoint: method, path, auth, request/response |

### Features
| Document | Description |
|---|---|
| [Feature Descriptions](./features/feature-descriptions.md) | Full description of every feature in the application |

### Integrations
| Document | Description |
|---|---|
| [Azure AD / MSAL Authentication](./integrations/azure-ad.md) | Microsoft SSO and JWT auth flow |
| [Azure DevOps (ADO)](./integrations/ado.md) | Work item creation and release tracking |
| [Microsoft Graph / Email](./integrations/microsoft-graph.md) | Inbound email via Graph webhook and outbound notifications |
| [Email Ingest Webhook](./integrations/email-ingest.md) | Generic HTTP webhook for email-to-ticket from any mail service |

### Configuration
| Document | Description |
|---|---|
| [Environment Variables](./configuration/environment-variables.md) | All server and client environment variables |

### Deployment
| Document | Description |
|---|---|
| [Deployment Guide](./deployment/deployment-guide.md) | Docker, manual, and production deployment instructions |

### Tests
| Document | Description |
|---|---|
| [Test Overview](./tests/test-overview.md) | Test strategy, files, and how to run them |
| [E2E Test Cases](./tests/e2e-test-cases.md) | Every test case across all three test suites |
| [Test Scenarios by Feature](./tests/test-scenarios.md) | Functional test scenarios grouped by feature area |

---

## Quick Facts

| Attribute | Value |
|---|---|
| Application Name | Helyx Support |
| Stack | Node.js + Express (API), React + Vite (UI), SQLite via sql.js (DB) |
| Auth | Microsoft Azure Entra ID (MSAL) + custom app JWT |
| Database file | `server/helix_support.db.bin` |
| Default API port | 3001 |
| Default UI dev port | 5173 |
| ADO Org | `https://dev.azure.com/CelitoTech` |
| ADO Projects | `Quality System` (Helyx Platform), `HelyxData` (Helyx Data) |
| Support mailbox | `support@helyxtech.com` |

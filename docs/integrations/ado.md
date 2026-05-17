# Azure DevOps (ADO) Integration

Helyx Support integrates with **Azure DevOps** to allow support agents to:
1. Create Bug or Task work items in ADO directly from a ticket
2. View the live state of a linked ADO work item
3. Browse "Retain Indefinitely" Classic Release pipelines in the Operations Center

---

## Configuration

Add these to `server/.env`:

| Variable | Example Value | Description |
|---|---|---|
| `ADO_ORG_URL` | `https://dev.azure.com/CelitoTech` | ADO organization URL (no trailing slash) |
| `ADO_PAT` | `<personal-access-token>` | Personal Access Token with Work Items: Read & Write scope |
| `ADO_PROJECT_HELYX_PLATFORM` | `Quality System` | ADO project name for Helyx Platform |
| `ADO_PROJECT_HELYX_DATA` | `HelyxData` | ADO project name for Helyx Data |

### Creating a PAT (Personal Access Token)
1. Go to `https://dev.azure.com/<org>/_usersSettings/tokens`
2. Create a new token with:
   - **Work Items**: Read & Write
   - **Release** (optional, for release pipeline fetching): Read
3. Copy the token value — it is only shown once

If `ADO_ORG_URL` or `ADO_PAT` are not set, all ADO endpoints return `503 Service Unavailable` with a clear error message (graceful degradation).

---

## Project Mapping

The integration maps Helyx product names to ADO projects:

| Product (case-insensitive match) | ADO Project |
|---|---|
| Contains "helyx platform" | `Quality System` |
| Contains "helyx data" | `HelyxData` |

The `GET /api/devops/suggest/:ticketId` endpoint returns the suggested project and work item type based on the ticket's product field.

---

## API Endpoints

### GET `/api/devops/config`
Returns available ADO projects and work item types. Used by the frontend to populate dropdowns.

**Response:**
```json
{
  "configured": true,
  "projects": [
    { "label": "Helyx Platform", "value": "Quality System" },
    { "label": "Helyx Data",     "value": "HelyxData" }
  ],
  "workItemTypes": ["Bug", "Task"]
}
```

---

### GET `/api/devops/suggest/:ticketId`
Suggests the ADO project and work item type based on the ticket's product field.

**Response:**
```json
{
  "suggested": "Quality System",
  "suggestedType": "Task",
  "product": "Helyx Platform"
}
```

---

### POST `/api/devops/create-work-item`
Creates a work item in ADO from a Helyx ticket.

**Request:**
```json
{
  "ticketId": 42,
  "adoProject": "Quality System",
  "workItemType": "Bug"
}
```

**What happens:**
1. Validates `adoProject` is one of the configured projects
2. Validates `workItemType` is `Bug` or `Task`
3. Fetches the ticket from the database
4. Builds an ADO JSON Patch document with:
   - Title: `[Helyx #42] <ticket title>`
   - Description: ticket description + metadata (customer, priority, type, requester)
   - Priority: mapped from Helyx (Low→4, Medium→3, High→2, Critical→1)
   - Tags: `helyx;helyx-42`
5. Calls `PATCH /{project}/_apis/wit/workitems/${type}?api-version=7.1`
6. Saves the work item ID to:
   - `ticket_custom_fields` (ado_bug_id field)
   - `tickets.ado_bug_id`, `tickets.ado_work_item_url`, `tickets.ado_work_item_type` columns
7. Logs the action to `ticket_activity`

**Response:**
```json
{
  "workItemId": 1234,
  "workItemUrl": "https://dev.azure.com/CelitoTech/Quality%20System/_workitems/edit/1234",
  "workItemType": "Bug",
  "adoProject": "Quality System",
  "title": "[Helyx #42] Login page broken"
}
```

---

### GET `/api/devops/work-item-state/:workItemId`
Fetches the live state of an ADO work item. Uses the org-scoped endpoint (no project needed).

**Response:**
```json
{
  "state": "Active",
  "workItemType": "Bug",
  "title": "[Helyx #42] Login page broken",
  "project": "Quality System",
  "workItemUrl": "https://dev.azure.com/...",
  "workItemId": "1234"
}
```

---

### GET `/api/devops/releases`
Returns Classic Release pipeline data for the Operations Center dashboard.

**Behaviour:**
- Fetches from both ADO projects simultaneously
- **Only includes releases with `keepForever === true`** (Retain Indefinitely flag in ADO)
- Merges and sorts newest-first
- Returns environment deployment statuses for each release

**Query params:**
- `top` — max releases per project (default 100, max 200)
- `definition` — filter by release definition ID

**Response:**
```json
{
  "releases": [
    {
      "id": 501,
      "name": "Release-v3.2.1",
      "status": "Active",
      "keepForever": true,
      "createdOn": "2024-11-15T10:30:00Z",
      "createdBy": "A Ong",
      "definition": "Helyx Platform Release",
      "definitionId": 12,
      "webUrl": "https://vsrm.dev.azure.com/...",
      "project": "Quality System",
      "projectLabel": "Helyx Platform",
      "environments": [
        { "id": 1, "name": "Staging", "status": "succeeded", "deployedOn": "..." },
        { "id": 2, "name": "Production", "status": "notStarted", "deployedOn": null }
      ],
      "buildVersion": "3.2.1.45",
      "buildBranch": "refs/heads/main"
    }
  ],
  "errors": []
}
```

---

### GET `/api/devops/release-definitions`
Returns the list of release pipeline definitions for the filter dropdown in the Operations Center.

---

## Priority Mapping

| Helyx Priority | ADO Priority (Microsoft.VSTS.Common.Priority) |
|---|---|
| Critical | 1 |
| High | 2 |
| Medium | 3 |
| Low | 4 |

---

## Error Handling

- If ADO credentials are not configured: `503 Service Unavailable`
- If ADO API returns an error: `502 Bad Gateway` with the ADO error message
- Invalid project or work item type: `400 Bad Request`
- Access is restricted to `staffOnly` (agents + admins)

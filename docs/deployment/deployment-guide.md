# Deployment Guide

---

## Local Development

### Prerequisites
- Node.js 18+
- npm 9+

### Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd "FD Clone"

# 2. Install server dependencies
cd server && npm install

# 3. Install client dependencies
cd ../client && npm install

# 4. Configure environment
cp server/.env.example server/.env    # Edit with your values
cp client/.env.example client/.env    # Set VITE_DEV_MODE=true for local bypass

# 5. (Optional) Seed demo data
cd server && node seed.js

# 6. Start the API server (Terminal 1)
cd server && node index.js
# → Server starts on http://localhost:3001

# 7. Start the React dev server (Terminal 2)
cd client && npx vite
# → UI starts on http://localhost:5173
```

Open `http://localhost:5173` in your browser.

With `VITE_DEV_MODE=true`, you can log in directly using any registered email (e.g. `admin@helyxtech.com`) without Azure SSO.

---

## Production (Manual / VPS)

### Build the React client

```bash
cd client
npm run build
# Outputs to client/dist/
```

### Start the server

```bash
cd server
NODE_ENV=production node index.js
```

The Express server serves the built React app from `client/dist/`. Both the API and UI are served from the same process on the configured `PORT`.

### Process Management

Use a process manager for production reliability:

**PM2:**
```bash
npm install -g pm2
cd server
pm2 start index.js --name "helyx-support" --env production
pm2 save
pm2 startup  # Set up auto-restart on reboot
```

**systemd service** (`/etc/systemd/system/helyx-support.service`):
```ini
[Unit]
Description=Helyx Support
After=network.target

[Service]
Type=simple
User=nodeuser
WorkingDirectory=/opt/helyx-support/server
ExecStart=/usr/bin/node index.js
Restart=on-failure
EnvironmentFile=/opt/helyx-support/server/.env
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable helyx-support
systemctl start helyx-support
```

---

## Docker

### Build and run

```bash
# Build image
docker build -t helyx-support .

# Run with environment variables
docker run -d \
  --name helyx-support \
  -p 3001:3001 \
  -v $(pwd)/server/helix_support.db.bin:/app/server/helix_support.db.bin \
  -v $(pwd)/server/uploads:/app/server/uploads \
  -e NODE_ENV=production \
  -e JWT_SECRET="your-strong-jwt-secret" \
  -e AZURE_TENANT_ID="your-tenant-id" \
  -e AZURE_CLIENT_ID="your-client-id" \
  -e AZURE_CLIENT_SECRET="your-client-secret" \
  -e SUPPORT_MAILBOX="support@helyxtech.com" \
  -e WEBHOOK_BASE_URL="https://your-domain.com" \
  -e ADO_ORG_URL="https://dev.azure.com/CelitoTech" \
  -e ADO_PAT="your-ado-pat" \
  -e CORS_ORIGIN="https://your-domain.com" \
  helyx-support
```

> **Important:** Mount the database file and uploads directory as volumes so data persists across container restarts/updates.

### Docker Compose

```bash
# Set environment variables in docker-compose.yml (see configuration docs)
docker-compose up -d
```

---

## Nginx Reverse Proxy (Recommended for Production)

Route traffic through Nginx for SSL termination and better performance:

```nginx
server {
    listen 443 ssl;
    server_name support.helyxtech.com;

    ssl_certificate     /etc/letsencrypt/live/support.helyxtech.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/support.helyxtech.com/privkey.pem;

    # Larger body for file uploads
    client_max_body_size 60M;

    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name support.helyxtech.com;
    return 301 https://$host$request_uri;
}
```

---

## Data Backup

All application data lives in two locations:

1. **Database**: `server/helix_support.db.bin` — SQLite binary file. Back up this file regularly.
2. **Uploads**: `server/uploads/` — All uploaded files (ticket attachments, KB files, download resources).

### Automated Backup Script

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/helyx-support"
APP_DIR="/opt/helyx-support/server"

mkdir -p "$BACKUP_DIR"

# Database
cp "$APP_DIR/helix_support.db.bin" "$BACKUP_DIR/helix_support_$DATE.db.bin"

# Uploads (optional — can be large)
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C "$APP_DIR" uploads/

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.db.bin" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup complete: $BACKUP_DIR"
```

Add to cron: `0 2 * * * /opt/scripts/backup-helyx.sh`

---

## First-Time Production Setup Checklist

- [ ] Set `JWT_SECRET` to a cryptographically random string
- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGIN` to the exact frontend URL
- [ ] Configure Azure App Registration with production redirect URI
- [ ] Set `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` (both server and client build args)
- [ ] Set `AZURE_CLIENT_SECRET` for Graph API email features
- [ ] Set `SUPPORT_MAILBOX` to the support email address
- [ ] Set `WEBHOOK_BASE_URL` to the public HTTPS URL (Microsoft Graph requirement)
- [ ] Set `GRAPH_WEBHOOK_SECRET` to a random string
- [ ] Set `ADO_ORG_URL` and `ADO_PAT` for Azure DevOps integration
- [ ] Configure Nginx with SSL
- [ ] Set up automated database backups
- [ ] Create an admin user: `INSERT INTO users (name, email, role) VALUES ('...', '...', 'admin')`
- [ ] Test login flow end-to-end

---

## Upgrade Process

```bash
# 1. Pull latest code
git pull origin main

# 2. Install new dependencies
cd server && npm install
cd ../client && npm install

# 3. Rebuild client
cd client && npm run build

# 4. Restart server (schema migrations run automatically on startup)
pm2 restart helyx-support
# OR
systemctl restart helyx-support
```

Schema migrations are applied automatically via `ALTER TABLE ... ADD COLUMN` blocks in `db.js`. These are idempotent (use `IF NOT EXISTS` / try-catch) and safe to run on an existing database.

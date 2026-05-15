# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS client-build

WORKDIR /build/client

# Install dependencies first (layer-cached unless package files change)
COPY client/package*.json ./
RUN npm ci

# Azure config is baked into the frontend bundle at build time.
# These are NOT secrets — they identify the App Registration, not authenticate it.
ARG VITE_AZURE_TENANT_ID
ARG VITE_AZURE_CLIENT_ID
ENV VITE_AZURE_TENANT_ID=$VITE_AZURE_TENANT_ID
ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID

# Copy source and build
COPY client/ ./
RUN npm run build
# Output: /build/client/dist


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production server image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built frontend into the location the server expects
# server/index.js: path.join(__dirname, '..', 'client', 'dist')
COPY --from=client-build /build/client/dist ./client/dist

# Create upload directories (will be volume-mounted in production)
RUN mkdir -p server/uploads/kb server/uploads/kb_articles

# The database file lives at server/helix_support.db.bin — volume-mounted
# so it persists across container restarts and image updates.

EXPOSE 3001

# Run as non-root for security
RUN addgroup -S helyx && adduser -S helyx -G helyx \
  && chown -R helyx:helyx /app
USER helyx

CMD ["node", "server/index.js"]

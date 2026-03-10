# ═══════════════════════════════════════════
# XBot Docker Image
# Multi-stage build for minimal image size
# ═══════════════════════════════════════════

# --- Stage 1: Build dashboard ---
FROM node:20-slim AS dashboard-builder
WORKDIR /build/dashboard
COPY dashboard/package*.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

# --- Stage 2: Install bot dependencies ---
FROM node:20-slim AS deps
WORKDIR /build
# Install native build tools for sqlite3, canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --no-audit --no-fund --omit=dev

# --- Stage 3: Production image ---
FROM node:20-slim AS production
LABEL maintainer="XBot" description="XBot Telegram Bot + Dashboard"

# Install runtime dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libjpeg62-turbo libpango-1.0-0 libpangocairo-1.0-0 \
    libgif7 librsvg2-2 ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy production node_modules
COPY --from=deps /build/node_modules ./node_modules

# Copy bot source
COPY package.json index.js db.js ./
COPY src/ ./src/
COPY locales/ ./locales/

# Copy built dashboard
COPY --from=dashboard-builder /build/dashboard/dist ./dashboard/dist

# Create data directory for SQLite DB
RUN mkdir -p /app/data

# Environment defaults
ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "index.js"]

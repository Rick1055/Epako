# ==============================================================================
# Epako Voice - Web Frontend SSR Server (React Router v7 on Cloud Run)
# ==============================================================================
# Stage 1: Build production assets
FROM node:22-slim AS builder

WORKDIR /app

# Build arguments for Vite client bundle (with defaults from .env)
ARG VITE_SUPPORT_EMAIL="hello@epakovoice.example"
ARG VITE_SUPPORT_PHONE="+44 20 7946 0958"
ARG VITE_DEMO_CONTACT="true"
ARG VITE_SUPABASE_URL="https://mdaqikxrsyacuttnxpmr.supabase.co"
ARG VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYXFpa3hyc3lhY3V0dG54cG1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MzUyNzEsImV4cCI6MjEwODUxMTI3MX0.KJzdFegqiN7kgwWmKv52X23hg6AYhDuiMDvp3UciZDs"
ARG VITE_TURNSTILE_SITE_KEY="0x4AAAAAAFkURGHLWXu2hUx_"

ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL \
    VITE_SUPPORT_PHONE=$VITE_SUPPORT_PHONE \
    VITE_DEMO_CONTACT=$VITE_DEMO_CONTACT \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

# Copy package manifests
COPY package*.json ./
RUN npm ci

# Copy full web source and build client + server bundles
COPY . .
RUN npm run build

# Stage 2: Minimal Production Runner
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled bundles and server from builder
COPY --from=builder /app/build ./build
COPY server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]

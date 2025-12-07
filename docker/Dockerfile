# Stage 1: Build
FROM oven/bun:1.3.2 AS builder
WORKDIR /app

# Copy root package files
COPY package.json .
COPY bun.lock .

# Copy workspace package.json files
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY vite/package.json ./vite/package.json
COPY scripts/package.json ./scripts/package.json

# Install dependencies
RUN bun install --ignore-scripts

# Copy rest of the code
COPY . .

# Build shared package first
WORKDIR /app/shared
RUN bun run build

# Build Vite frontend - backend URL is same origin in self-hosted mode
WORKDIR /app/vite
ENV VITE_BACKEND_URL=""
ENV VITE_FRONTEND_URL=""
RUN bun run build

# Stage 2: Production
FROM oven/bun:1.3.2 AS production
WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/package.json .
COPY --from=builder /app/bun.lock .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/vite/dist ./vite/dist

ENV NODE_ENV=production
EXPOSE 8080

WORKDIR /app/server
CMD ["bun", "start"]
# Multi-stage build for Luna Agent Production
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
RUN npm ci --only=production && \
    npm install --save-dev electron-builder

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    libx11 \
    libxkbcommon \
    libxcomposite \
    libxdamage \
    libxext \
    libxfixes \
    libxrandr \
    libxrender \
    libxtst \
    libxss \
    libnss \
    libatk-bridge2.0 \
    libgtk-3.0 \
    libdrm \
    libasound2

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S luna && \
    adduser -u 1001 -S luna -G luna && \
    chown -R luna:luna /app

USER luna

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Expose ports
EXPOSE 3001 3002

# Start the application
CMD ["npm", "start"]
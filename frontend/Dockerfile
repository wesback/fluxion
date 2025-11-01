# Multi-stage Dockerfile for Next.js frontend with Nginx

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Build Next.js application
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js application with standalone output
# This creates an optimized production build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Configure Next.js to output standalone
RUN npm run build

# Stage 3: Production image with Nginx and Node.js
FROM node:20-alpine AS runner

WORKDIR /app

# Install nginx, dumb-init, and curl for health checks
RUN apk add --no-cache nginx dumb-init curl && \
    mkdir -p /run/nginx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy Next.js standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy nginx configuration
COPY --chown=nextjs:nodejs nginx.conf /etc/nginx/nginx.conf

# Create runtime config directory
RUN mkdir -p /app/public/config && \
    chown -R nextjs:nodejs /app/public/config

# Set permissions for nginx
RUN chown -R nextjs:nodejs /var/lib/nginx && \
    chown -R nextjs:nodejs /var/log/nginx && \
    chown -R nextjs:nodejs /run/nginx && \
    touch /run/nginx.pid && \
    chown nextjs:nodejs /run/nginx.pid

# Switch to non-root user
USER nextjs

# Expose ports (3000 for Next.js, 8080 for Nginx)
EXPOSE 8080

# Health check on nginx
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Copy entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start both Next.js and Nginx via entrypoint script
CMD ["/app/docker-entrypoint.sh"]

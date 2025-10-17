# Multi-stage Dockerfile for LLM Test App
# Optimized for local development, VM deployment, and Azure Container Instances

# Stage 1: Dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Production image
FROM node:22-alpine AS runner

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs server.js ./
COPY --chown=nodejs:nodejs package*.json ./

# Copy source modules (CRITICAL - app won't run without this!)
COPY --chown=nodejs:nodejs src ./src

# Copy static files and frontend
COPY --chown=nodejs:nodejs public ./public

# Copy test data required by pdf-parse module
COPY --chown=nodejs:nodejs test ./test

# Create data directory for runtime files (will be mounted as volume in production)
RUN mkdir -p src/data && chown nodejs:nodejs src/data

# Set environment variables
ENV NODE_ENV=production \
    PORT=3003

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]

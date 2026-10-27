# Production-grade, lightweight Node.js 20 runtime
FROM node:20-alpine AS base

# Install security updates and set deployment directory
WORKDIR /app

# Install production dependencies only using locked package-lock.json
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source and static public assets only
COPY src ./src
COPY public ./public

# Run as non-privileged node user for container security
USER node

# Default port exposure
EXPOSE 8080

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8080

# Launch server
CMD ["node", "src/server.js"]

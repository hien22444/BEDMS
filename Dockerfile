FROM node:20-alpine

WORKDIR /app

# Install production dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/

# Railway/Render set PORT automatically; default to 3001 for local docker runs
ENV PORT=3001
EXPOSE 3001

CMD ["node", "src/server.js"]

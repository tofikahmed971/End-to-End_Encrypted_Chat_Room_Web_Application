FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build
ENV NODE_ENV=production
RUN bun run build

# Run
EXPOSE 3001
CMD ["bun", "server.ts"]

# Stage 1: build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: production
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/schema ./src/schema
COPY --from=builder /app/src/lib/entity/directives.graphql ./src/lib/entity/directives.graphql
EXPOSE 4000
CMD ["node", "dist/index.js"]

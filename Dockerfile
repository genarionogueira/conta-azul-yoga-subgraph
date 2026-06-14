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
RUN apk add --no-cache wget
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/schema ./src/schema
COPY --from=builder /app/src/lib/entity/directives.graphql ./src/lib/entity/directives.graphql
COPY --from=builder /app/src/templates ./dist/templates
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/index.js"]

FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend ./apps/frontend

ARG ADMIN_BASE_PATH
ENV NEXT_PUBLIC_ADMIN_BASE_PATH=${ADMIN_BASE_PATH}

RUN npm run build --workspace apps/frontend \
  && cd /app/apps/frontend \
  && if [ -f .next/standalone/apps/frontend/server.js ]; then \
       cp .next/standalone/apps/frontend/server.js .next/standalone/server.js; \
       mkdir -p .next/standalone/.next; \
       cp -R .next/standalone/apps/frontend/.next/. .next/standalone/.next/; \
     fi \
  && mkdir -p .next/standalone/.next/static \
  && if [ -d .next/static ]; then cp -R .next/static/. .next/standalone/.next/static/; fi \
  && mkdir -p .next/standalone/public \
  && if [ -d public ]; then cp -R public/. .next/standalone/public/; fi

FROM node:20-alpine AS runner
WORKDIR /app/apps/frontend

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/apps/frontend/.next/standalone ./.next/standalone

EXPOSE 3000

CMD ["node", ".next/standalone/server.js"]

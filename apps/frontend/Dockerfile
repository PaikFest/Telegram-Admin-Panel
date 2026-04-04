FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci

COPY apps/frontend ./apps/frontend

ARG ADMIN_BASE_PATH
ENV NEXT_PUBLIC_ADMIN_BASE_PATH=${ADMIN_BASE_PATH}
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN npm run build --workspace apps/frontend && npm prune --omit=dev \
  && cd /app/apps/frontend \
  && if [ -f .next/standalone/apps/frontend/server.js ]; then \
       cp .next/standalone/apps/frontend/server.js .next/standalone/server.js; \
       mkdir -p .next/standalone/.next; \
       cp -R .next/standalone/apps/frontend/.next/. .next/standalone/.next/; \
     fi \
  && mkdir -p .next/standalone/.next/static \
  && if [ -d .next/static ]; then cp -R .next/static/. .next/standalone/.next/static/; fi \
  && if [ -d public ]; then mkdir -p .next/standalone/public && cp -R public/. .next/standalone/public/; fi

WORKDIR /app/apps/frontend

EXPOSE 3000

CMD ["node", ".next/standalone/server.js"]

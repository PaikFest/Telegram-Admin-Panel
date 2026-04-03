FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci

COPY prisma ./prisma
COPY apps/backend ./apps/backend

RUN npm run build --workspace apps/backend && npm prune --omit=dev

WORKDIR /app/apps/backend

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema=/app/prisma/schema.prisma && node dist/main.js"]

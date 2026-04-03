FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci

COPY apps/frontend ./apps/frontend

RUN npm run build --workspace apps/frontend && npm prune --omit=dev

WORKDIR /app/apps/frontend

EXPOSE 3000

CMD ["npm", "run", "start"]

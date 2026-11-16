FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY client/package.json ./client/package.json
RUN npm ci

COPY api ./api
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run db:generate --workspace=@tqms/api
RUN npm run build --workspace=@tqms/api

FROM build AS migrate
CMD ["npm", "run", "db:deploy", "--workspace=@tqms/api"]

FROM build AS runtime
RUN npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["npm", "run", "start", "--workspace=@tqms/api"]

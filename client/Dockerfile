FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY client/package.json ./client/package.json
RUN npm ci

COPY client ./client
RUN npm run build --workspace=@tqms/client

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80

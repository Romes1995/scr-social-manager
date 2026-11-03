# Vitrine publique — build Vite puis service statique par Nginx (deploy/docker-compose.yml)
# La configuration Nginx (proxy /api et /uploads) est montée depuis deploy/nginx.conf.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# vitrine : sans /live ni /buteurs ; API vide : /api sur la même origine (proxy Nginx)
ARG VITE_MODE=vitrine
ARG VITE_API_URL=
ENV VITE_MODE=$VITE_MODE VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# Backend SCR Social Manager — image utilisée par deploy/docker-compose.yml (MODE=vitrine)
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Fichiers servis sous /uploads (logos FFF et miniatures) : volume persistant
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads
USER node

EXPOSE 3001
CMD ["node", "index.js"]

FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server/audio-level.* ./server/
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb x11vnc novnc websockify ffmpeg rclone tini ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8090 DISPLAY=:99 CHROMIUM_PATH=/usr/bin/chromium DATA_DIR=/data
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && mkdir -p /data && chown node:node /data
COPY server ./server
COPY ops/start.sh ./ops/start.sh
COPY releases/CinemaHub-AndroidTV-v1.3.11.apk ./clients/CinemaHub-AndroidTV-v1.3.11.apk
COPY --from=frontend /app/dist ./dist
USER node
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8090/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["sh", "/app/ops/start.sh"]

FROM node:20-alpine
WORKDIR /app
COPY api/package*.json ./api/
# Install build tools to compile native dependencies like better-sqlite3
RUN apk add --no-cache --virtual .build-deps g++ make python3 \
    && cd api && npm ci --omit=dev --build-from-source \
    && apk del .build-deps
COPY api /app/api
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "api/server.js"]

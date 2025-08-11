FROM node:20-alpine
WORKDIR /app
COPY api/package*.json ./api/
RUN cd api && npm ci --only=production
COPY api /app/api
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "api/server.js"]

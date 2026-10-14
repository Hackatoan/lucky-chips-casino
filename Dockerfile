FROM node:24-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=3000 HOST=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node","server.js"]

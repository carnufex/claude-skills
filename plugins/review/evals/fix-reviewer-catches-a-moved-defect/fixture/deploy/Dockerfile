FROM node:22-slim
WORKDIR /app
COPY dist/ ./dist/
COPY node_modules/ ./node_modules/
ENV APP_ENV=prod
USER 10001
CMD ["node", "dist/server.js"]

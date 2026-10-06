FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY web web
RUN npm run build -w web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json api/
RUN npm ci --omit=dev --workspace api --include-workspace-root
COPY api api
COPY --from=build /app/web/dist api/public
EXPOSE 3333
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "api/src/index.ts"]

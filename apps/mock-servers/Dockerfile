# Build context: repository root
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY apps/mock-servers/package.json ./
RUN pnpm install --no-frozen-lockfile
COPY apps/mock-servers/tsconfig.json ./
COPY apps/mock-servers/src ./src
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4100
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY apps/mock-servers/package.json ./
EXPOSE 4100
HEALTHCHECK CMD wget -qO- http://localhost:4100/health || exit 1
CMD ["node", "dist/main.js"]

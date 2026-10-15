# Build context: repository root
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
RUN pnpm install --filter @jmsurf-hmis/api... --frozen-lockfile=false
COPY apps/api apps/api
RUN cd apps/api && npx prisma generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
COPY apps/api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]

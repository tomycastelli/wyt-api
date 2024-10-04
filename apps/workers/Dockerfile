FROM node:20-alpine AS base

RUN apk add --no-cache gcompat
RUN npm install pnpm turbo --global
RUN pnpm config set store-dir ~/.pnpm-store

FROM base AS pruner

WORKDIR /app

COPY . .

RUN turbo prune @repo/workers --docker

FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=~/.pnpm-store pnpm install --frozen-lockfile

# Build the project
COPY --from=pruner /app/out/full/ .

RUN pnpm turbo run build
RUN echo "Y" | pnpm prune --prod --no-optional
RUN echo "Y" | pnpm install --prod

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

COPY --from=installer --chown=hono:nodejs /app /app

USER hono

CMD ["node", "apps/workers/dist/index.js"]

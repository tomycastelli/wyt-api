FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache gcompat
RUN yarn global add pnpm

FROM base AS builder

WORKDIR /app

RUN pnpm -g add turbo@2.1.3

COPY . .

RUN turbo prune @repo/web-api --docker

FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=builder /app/out/json/ .
RUN pnpm install

# Build the project
COPY --from=builder /app/out/full/ .
RUN pnpm turbo run build --filter=@repo/web-api

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

COPY --from=installer --chown=hono:nodejs /app /app

USER hono
EXPOSE 3000

CMD ["node", "apps/web-api/dist/index.js"]

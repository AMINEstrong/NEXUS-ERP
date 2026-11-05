FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @nexus/api db:generate && pnpm --filter @nexus/api build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo /app
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/src/main.js"]

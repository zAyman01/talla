# syntax=docker/dockerfile:1
#
# Built from the repository root so the workspace is intact: the app consumes its
# packages as TypeScript source, not as published artefacts.
#
#   docker build -f apps/storefront/Dockerfile -t talla-storefront:local .
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/usr/local/bin
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @talla/storefront build

FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
# Never root. A process that parses nothing untrusted still has no reason to be able to
# write its own image (spec 12.2 applies the same reasoning to the image worker).
USER node
COPY --from=build --chown=node:node /app/apps/storefront/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build --chown=node:node /app/apps/storefront/public ./apps/storefront/public
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]

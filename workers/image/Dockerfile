FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
WORKDIR /worker
COPY workers/image/runtime/package.json workers/image/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY workers/image/canonicalize.ts workers/image/run.ts ./
USER 65532:65532
ENTRYPOINT ["node", "run.ts"]

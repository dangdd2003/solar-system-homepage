# syntax=docker/dockerfile:1

# Build from the repository root so the context holds the site sources:
#   docker build -f .github/deployment/Dockerfile .
# The context is filtered by Dockerfile.dockerignore next to this file.

# ---- build: compile the static site ----
# The output is platform-independent, so build once on the builder's native
# platform: no emulation, and one shared cache entry for every target platform.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /app
RUN apk add --no-cache brotli

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Pre-compress text assets so the server never compresses at runtime.
RUN find dist -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.mjs' \
      -o -name '*.json' -o -name '*.svg' -o -name '*.xml' -o -name '*.txt' -o -name '*.webmanifest' \) \
      -size +1k -print0 \
    | xargs -0 -r -n 1 -P "$(nproc)" sh -c 'gzip -9 -k -n "$1" && brotli -q 11 -k "$1"' _

# ---- server binary ----
FROM ghcr.io/static-web-server/static-web-server:2.44.1 AS server

# ---- runtime: scratch + one static binary + files ----
FROM scratch
COPY --from=server /static-web-server /static-web-server
COPY .github/deployment/sws.toml /sws.toml
COPY --from=build /app/dist/ /public/

USER 65532:65532
EXPOSE 8080

# No shell/curl in scratch: point your platform's HTTP probe at GET /health.
ENTRYPOINT ["/static-web-server"]
CMD ["--config-file", "/sws.toml"]

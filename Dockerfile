# EasyOnward MCP server — hosted Streamable HTTP transport (mcp.easyonward.com).
# Multi-stage: build with dev deps (tsc), ship a lean runtime with prod deps
# only (just @modelcontextprotocol/sdk + zod; the HTTP server uses node:http).

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: skip the `prepare` hook (it runs tsc, which would fire
# before tsconfig/src are copied). We build explicitly below.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
# Bust the cached apk layer per build so OS packages with published fixes are
# pulled fresh even when base layers predate the advisory (mirrors the
# backend/frontend SECURITY_REFRESH pattern; the arg is unique per CI build).
ARG SECURITY_REFRESH=unset
RUN apk upgrade --no-cache && echo "security-refresh ${SECURITY_REFRESH}" >/dev/null
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8200
COPY package.json package-lock.json ./
# --ignore-scripts: skip `prepare` (tsc); it's a devDep not present here, and
# we copy the prebuilt dist/ from the build stage anyway.
#
# Then REMOVE npm + corepack from the runtime image. The container only runs
# `node dist/http.js`, so it never needs npm — and every node:*-alpine bundles an
# npm whose OWN dependencies (cross-spawn, tar, sigstore, …) carry HIGH CVEs that
# Trivy flags under /usr/local/lib/node_modules/npm/. A base bump doesn't fix it
# (node 20's npm 10 → 12 HIGH; node 24's npm 11 → still 1); only dropping npm
# reaches zero, and it's node-version-independent. Done in the same layer as the
# install so npm is gone from the final image, not just an upper layer.
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
              /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8200)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/http.js"]

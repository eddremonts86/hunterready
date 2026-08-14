# HunterReady — production image.
#
# Everything the app needs at runtime lives in here. Nothing is expected from the host: no
# system fonts, no locally installed converters, no node_modules. That is the whole point —
# a render must produce identical bytes on a Mac and on the VPS.
#
# System dependencies deliberately included:
#   • libreoffice-core + libreoffice-writer — converts legacy binary `.doc` to `.docx` so
#     mammoth can read it (ADR-008). There is no usable pure-JS parser for OLE2, and this is
#     the format a large share of the general working population still has on an old laptop.
#   • fonts-liberation — LibreOffice needs *some* font present to open a document at all.
#     It is not used for rendering our PDFs; those fonts are bundled in the app.
#   • poppler-utils + tesseract-ocr (eng/spa/dan) — reads a scanned, image-only PDF
#     (src/ingest/adapters/ocr.ts). A large share of the general working population has one
#     printed copy of their CV and a phone camera; without this the product's answer to them
#     is "upload a PDF with selectable text", which is no answer at all.
#
# Deliberately NOT included: Chromium. takumi-pdf is WASM, which is why this image is ~1 GB
# with LibreOffice rather than 1.5 GB with a headless browser on top.

# ── build ─────────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

WORKDIR /app

# NODE_ENV=production at build time is load-bearing, not decoration: with anything else Vite
# emits the *development* JSX transform into a bundle that runs against production React, and
# every SSR render dies with "jsxDEV is not a function". Found in Block 1b.
ENV NODE_ENV=production

RUN corepack enable

# Dependency layer first, so a source-only change does not reinstall the world.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Builds, then copies the takumi WASM and the bundled fonts into .output (see copy-assets.mjs).
RUN pnpm build

# ── test ──────────────────────────────────────────────────────────────────────────────────
#
# Never shipped. It exists so the suites that need system binaries can actually run somewhere:
# the runtime image carries the tools but no node_modules, and the build stage carries
# node_modules but no tools. Without this stage the OCR and `.doc` tests skip themselves on
# every machine, which is the same as not having them.
#
#   docker build --target test -t hunterready:test .
#   docker run --rm hunterready:test
FROM build AS test

RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      libreoffice-core \
      libreoffice-writer \
      fonts-liberation \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-eng \
      tesseract-ocr-spa \
      tesseract-ocr-dan \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# LibreOffice needs a writable home, same as in the runtime image.
ENV HOME=/tmp

CMD ["pnpm", "vitest", "run"]

# ── runtime ───────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    # LibreOffice writes a profile on first run; give it a writable home it actually owns.
    HOME=/tmp

RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      libreoffice-core \
      libreoffice-writer \
      fonts-liberation \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-eng \
      tesseract-ocr-spa \
      tesseract-ocr-dan \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# The server output is self-contained: no node_modules are copied on purpose.
COPY --from=build /app/.output ./.output

# Fixtures back the sample-CV preview until ingestion is wired to real uploads. They are
# synthetic — no personal data ships in this image (docs/07-privacy.md).
COPY --from=build /app/fixtures ./fixtures

# The migration and retention scripts, plus the two packages they need.
#
# `.output` is self-contained, but these are standalone `.mjs` files that Nitro does not bundle — so
# without this the post-deployment command fails with "Cannot find module 'postgres'" *after* a green
# build, which is the failure shape this project already has one scar from (ADR-005). Two packages,
# both plain JS, ~4 MB: the alternative is a second image or a migration step that runs somewhere the
# database is not reachable.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/db ./scripts/db
COPY --from=build /app/scripts/deploy ./scripts/deploy
COPY --from=build /app/node_modules/postgres ./node_modules/postgres
COPY --from=build /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Unprivileged: the node image ships a `node` user. Nothing here needs root at runtime, and
# this process parses untrusted files for a living.
USER node

EXPOSE 3000

# Node's own fetch, so no curl/wget in the image just to check health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]

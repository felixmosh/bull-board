FROM node:22-alpine AS deps

ARG BULL_BOARD_VERSION=latest

WORKDIR /opt/bull-board
RUN npm install --omit=dev --no-audit --no-fund "@bull-board/cli@${BULL_BOARD_VERSION}"

FROM node:22-alpine

ENV NODE_ENV=production \
    BULL_BOARD_HOST=0.0.0.0 \
    BULL_BOARD_OPEN=false

COPY --from=deps /opt/bull-board/node_modules /opt/bull-board/node_modules
RUN ln -s /opt/bull-board/node_modules/.bin/bull-board /usr/local/bin/bull-board \
    && mkdir -p /app && chown node:node /app

WORKDIR /app
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD \
    node -e "fetch('http://127.0.0.1:'+(process.env.BULL_BOARD_PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"

ENTRYPOINT ["bull-board"]

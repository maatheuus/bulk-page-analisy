FROM ghcr.io/puppeteer/puppeteer:22

USER root
WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json .yarnrc.yml yarn.lock ./
COPY packages/worker/package.json ./packages/worker/
COPY packages/db/package.json ./packages/db/

RUN corepack enable && yarn install

COPY packages/db ./packages/db
COPY packages/worker ./packages/worker

CMD ["yarn", "workspace", "@bulk/worker", "dev"]

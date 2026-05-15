FROM node:20-slim
WORKDIR /app

# chromium is available in Debian repos; google-chrome-stable requires adding Google's apt repo
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-noto-color-emoji \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json .yarnrc.yml yarn.lock ./
COPY packages/worker/package.json ./packages/worker/
COPY packages/db/package.json ./packages/db/

RUN corepack enable && yarn install

COPY packages/db ./packages/db
COPY packages/worker ./packages/worker

CMD ["yarn", "workspace", "@bulk/worker", "dev"]

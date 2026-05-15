FROM node:20-alpine AS base
WORKDIR /app

COPY package.json .yarnrc.yml yarn.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/

RUN corepack enable && yarn install

COPY packages/db ./packages/db
COPY apps/api ./apps/api

EXPOSE 4000
CMD ["yarn", "workspace", "@bulk/api", "dev"]

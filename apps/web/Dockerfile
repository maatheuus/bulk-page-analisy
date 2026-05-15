FROM node:20-alpine AS base
WORKDIR /app

COPY package.json .yarnrc.yml yarn.lock ./
COPY apps/web/package.json ./apps/web/

RUN corepack enable && yarn install

COPY apps/web ./apps/web

# NEXT_PUBLIC_* vars are baked at build time, not runtime
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app/apps/web
RUN yarn build

EXPOSE 3000
CMD ["yarn", "start"]

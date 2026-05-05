# syntax=docker/dockerfile:1
FROM node:20.16.0-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@9.12.0 --activate
# Create a dedicated unprivileged account that can be reused across build and runtime stages.
# Pre-create the writable paths it needs so later non-root steps do not require root-owned fallbacks.
RUN groupadd --gid 10001 dokploy \
    && useradd --uid 10001 --gid dokploy --create-home --home-dir /home/dokploy dokploy \
    && mkdir -p "$PNPM_HOME/store" /usr/src/app /app /etc/dokploy /prod \
    && chown -R dokploy:dokploy "$PNPM_HOME" /usr/src/app /app /etc/dokploy /prod /home/dokploy

FROM base AS build
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y python3 make g++ git python3-pip pkg-config libsecret-1-dev && rm -rf /var/lib/apt/lists/*

ENV HOME="/home/dokploy"
# Drop privileges after the required package installation so the application build does not run as root.
USER dokploy
# Copy sources with dokploy ownership so dependency installation and artifact generation stay writable to the non-root user.
COPY --chown=dokploy:dokploy . /usr/src/app

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,uid=10001,gid=10001 pnpm install --frozen-lockfile

# Deploy only the dokploy app

ENV NODE_ENV=production
RUN pnpm --filter=@dokploy/server build
RUN pnpm --filter=./apps/dokploy run build

RUN pnpm --filter=./apps/dokploy --prod deploy /prod/dokploy

RUN cp -R /usr/src/app/apps/dokploy/.next /prod/dokploy/.next
RUN cp -R /usr/src/app/apps/dokploy/dist /prod/dokploy/dist

FROM base AS dokploy
WORKDIR /app

# Set production
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y curl unzip zip apache2-utils iproute2 rsync git-lfs && git lfs install && rm -rf /var/lib/apt/lists/*

# Copy runtime assets with dokploy ownership so the final process can access its files without root privileges.
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/.next ./.next
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/dist ./dist
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/next.config.mjs ./next.config.mjs
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/public ./public
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/package.json ./package.json
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/drizzle ./drizzle
COPY --chown=dokploy:dokploy .env.production ./.env
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/components.json ./components.json
COPY --from=build --chown=dokploy:dokploy /prod/dokploy/node_modules ./node_modules

# Install docker
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh && curl https://rclone.org/install.sh | bash

# Install Nixpacks and tsx
# | VERBOSE=1 VERSION=1.21.0 bash

ARG NIXPACKS_VERSION=1.39.0
RUN curl -sSL https://nixpacks.com/install.sh -o install.sh \
    && chmod +x install.sh \
    && ./install.sh \
    && pnpm install -g tsx \
    && chown -R dokploy:dokploy "$PNPM_HOME"

# Install Railpack
ARG RAILPACK_VERSION=0.0.64
RUN curl -sSL https://railpack.com/install.sh | bash

# Install buildpacks
COPY --from=buildpacksio/pack:0.35.0 /usr/local/bin/pack /usr/local/bin/pack

ENV HOME="/home/dokploy"
# Ensure the container entrypoint runs as the unprivileged account instead of inheriting root.
USER dokploy

EXPOSE 3000
CMD [ "pnpm", "start" ]

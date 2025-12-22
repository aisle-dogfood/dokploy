# syntax=docker/dockerfile:1
FROM node:20.16.0-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@9.12.0 --activate

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y python3 make g++ git python3-pip pkg-config libsecret-1-dev && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

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

# Copy only the necessary files
COPY --from=build /prod/dokploy/.next ./.next
COPY --from=build /prod/dokploy/dist ./dist
COPY --from=build /prod/dokploy/next.config.mjs ./next.config.mjs
COPY --from=build /prod/dokploy/public ./public
COPY --from=build /prod/dokploy/package.json ./package.json
COPY --from=build /prod/dokploy/drizzle ./drizzle
COPY .env.production ./.env
COPY --from=build /prod/dokploy/components.json ./components.json
COPY --from=build /prod/dokploy/node_modules ./node_modules


# Install docker using official Docker repository with GPG verification
RUN apt-get update && \
    apt-get install -y ca-certificates gnupg lsb-release && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y docker-ce-cli docker-ce docker-buildx-plugin docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/*

# Install rclone with checksum verification from official release
ARG RCLONE_VERSION=1.68.2
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        RCLONE_ARCH="amd64"; \
    elif [ "$ARCH" = "arm64" ]; then \
        RCLONE_ARCH="arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -fsSL "https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${RCLONE_ARCH}.zip" -o rclone.zip && \
    curl -fsSL "https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/SHA256SUMS" -o SHA256SUMS && \
    grep "rclone-v${RCLONE_VERSION}-linux-${RCLONE_ARCH}.zip" SHA256SUMS | sha256sum -c - && \
    unzip -q rclone.zip && \
    mv "rclone-v${RCLONE_VERSION}-linux-${RCLONE_ARCH}/rclone" /usr/local/bin/ && \
    chmod +x /usr/local/bin/rclone && \
    rm -rf rclone.zip SHA256SUMS "rclone-v${RCLONE_VERSION}-linux-${RCLONE_ARCH}"

# Install Nixpacks with checksum verification from official GitHub release
ARG NIXPACKS_VERSION=1.39.0
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        NIXPACKS_ARCH="x64"; \
    elif [ "$ARCH" = "arm64" ]; then \
        NIXPACKS_ARCH="arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -fsSL "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-v${NIXPACKS_VERSION}-${NIXPACKS_ARCH}.tar.gz" -o nixpacks.tar.gz && \
    curl -fsSL "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-v${NIXPACKS_VERSION}-${NIXPACKS_ARCH}.tar.gz.sha256" -o nixpacks.tar.gz.sha256 && \
    sha256sum -c nixpacks.tar.gz.sha256 && \
    tar -xzf nixpacks.tar.gz && \
    mv nixpacks /usr/local/bin/ && \
    chmod +x /usr/local/bin/nixpacks && \
    rm -rf nixpacks.tar.gz nixpacks.tar.gz.sha256 && \
    pnpm install -g tsx

# Install Railpack with checksum verification from official GitHub release
ARG RAILPACK_VERSION=0.0.64
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        RAILPACK_ARCH="x64"; \
    elif [ "$ARCH" = "arm64" ]; then \
        RAILPACK_ARCH="arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -fsSL "https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-${RAILPACK_ARCH}.tar.gz" -o railpack.tar.gz && \
    curl -fsSL "https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-${RAILPACK_ARCH}.tar.gz.sha256" -o railpack.tar.gz.sha256 && \
    sha256sum -c railpack.tar.gz.sha256 && \
    tar -xzf railpack.tar.gz && \
    mv railpack /usr/local/bin/ && \
    chmod +x /usr/local/bin/railpack && \
    rm -rf railpack.tar.gz railpack.tar.gz.sha256

# Install buildpacks
COPY --from=buildpacksio/pack:0.35.0 /usr/local/bin/pack /usr/local/bin/pack

EXPOSE 3000
CMD [ "pnpm", "start" ]

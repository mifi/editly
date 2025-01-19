FROM node:lts-bookworm AS build

# Install dependencies for building canvas/gl
RUN apt-get update -y

RUN apt-get -y install \
    build-essential \
    libcairo2-dev \
    libgif-dev \
    libgl1-mesa-dev \
    libglew-dev \
    libglu1-mesa-dev \
    libjpeg-dev \
    libpango1.0-dev \
    librsvg2-dev \
    libxi-dev \
    pkg-config \
    python-is-python3

WORKDIR /app

# Install node dependencies
COPY package.json ./
RUN npm install --no-fund --no-audit

# Add app source
COPY . .

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# Purge build dependencies
RUN apt-get --purge autoremove -y \
    build-essential \
    libcairo2-dev \
    libgif-dev \
    libgl1-mesa-dev \
    libglew-dev \
    libglu1-mesa-dev \
    libjpeg-dev \
    libpango1.0-dev \
    librsvg2-dev \
    libxi-dev \
    pkg-config \
    python-is-python3

# Remove Apt cache
RUN rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Final stage for app image
FROM node:lts-bookworm

# Install runtime dependencies
RUN apt-get update -y \
  && apt-get -y install ffmpeg dumb-init xvfb libcairo2 libpango1.0 libgif7 librsvg2-2 \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

WORKDIR /app
COPY --from=build /app /app

# Ensure `editly` binary available in container
RUN npm link

ENTRYPOINT ["/usr/bin/dumb-init", "--", "xvfb-run", "--server-args", "-screen 0 1280x1024x24 -ac"]
CMD [ "editly" ]

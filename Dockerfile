# Prebuilt binaries for canvas on linux/amd-64 are not available, so need to use node:20-bookworm.
# Change this to node:lts-bookworm after upgrading to canvas 3
FROM node:20-bookworm

# Install ffmpeg and xvfb
RUN apt-get update -y && \
    apt-get -y install ffmpeg xvfb libgl1-mesa-dev dumb-init && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Confirm versions
RUN node -v
RUN npm -v
RUN ffmpeg -version

RUN echo "export LD_LIBRARY_PATH=/app/node_modules/canvas/build/Release/" >> /root/.bashrc
ENV LD_LIBRARY_PATH=/app/node_modules/canvas/build/Release/

WORKDIR /app

# Install dependencies, but don't run `prepare` script yet.
COPY package.json ./
RUN npm install --ignore-scripts

# Add app source
COPY . .

# Build typescript dependencies
RUN npm run prepare

# Ensure `editly` binary available in container
RUN npm link

ENTRYPOINT ["/usr/bin/dumb-init", "--", "xvfb-run", "--server-args", "-screen 0 1280x1024x24 -ac"]
CMD [ "editly" ]

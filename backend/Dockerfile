FROM ghcr.io/puppeteer/puppeteer:latest

# The official image already sets PUPPETEER_EXECUTABLE_PATH to the correct internal path.
# We just need to tell npm not to download it again.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Run the server
CMD ["node", "server.js"]

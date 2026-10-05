FROM ghcr.io/puppeteer/puppeteer:latest

# We don't need to install Chrome since it's already in the image,
# but we need to tell Puppeteer where it is!
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Run the server
CMD ["node", "server.js"]

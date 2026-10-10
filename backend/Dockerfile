FROM node:18-alpine

# We no longer need Puppeteer, so we can use a tiny, blazing-fast Alpine Linux image!

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Run the server
CMD ["node", "server.js"]

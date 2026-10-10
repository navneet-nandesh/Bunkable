FROM node:20-alpine

# We no longer need Puppeteer, so we can use a tiny, blazing-fast Alpine Linux image!
# Upgraded to Node 20 to perfectly support modern internal modules used by Axios.

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Run the server
CMD ["node", "server.js"]

const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer so that Render can persist 
  // the installed Chrome binary from the build step to the runtime step.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};

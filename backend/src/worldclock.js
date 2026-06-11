/** The shared world clock — both players sync their day/night cycle from this. */
const { DAY_LENGTH_MS } = require('./config');

const worldStart = Date.now();

function timeInfo() {
  return {
    serverNow: Date.now(),
    worldStart,
    dayLength: DAY_LENGTH_MS,
  };
}

module.exports = { timeInfo };

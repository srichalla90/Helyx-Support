/**
 * subscriptionManager.js
 *
 * Keeps the Microsoft Graph change-notification subscription alive.
 *
 * Graph mail subscriptions expire after a maximum of 4230 minutes (~3 days).
 * This manager creates the subscription on startup and renews it every 2 days
 * so it never lapses.
 */

const graph = require('./graph');

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

let _interval = null;

async function start() {
  // Initial subscription attempt — runs async, won't block server start
  graph.createSubscription().catch((e) => {
    console.error('Subscription startup error:', e.message);
  });

  // Renew every 2 days (well before the 3-day expiry)
  _interval = setInterval(async () => {
    try {
      await graph.renewSubscription();
    } catch (e) {
      console.error('Subscription renewal error:', e.message);
    }
  }, TWO_DAYS_MS);

  // Don't keep the process alive just for this timer
  if (_interval.unref) _interval.unref();
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { start, stop };

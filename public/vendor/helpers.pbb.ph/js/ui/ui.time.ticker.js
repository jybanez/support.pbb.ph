const ACTIVE_SUBSCRIBERS = new Set();
let tickerId = null;

export function subscribeTimeTick(callback, active = true) {
  if (typeof callback !== "function") {
    return () => {};
  }

  setTimeTickSubscription(callback, active);
  return () => setTimeTickSubscription(callback, false);
}

export function setTimeTickSubscription(callback, active = true) {
  if (typeof callback !== "function") {
    return;
  }

  if (active) {
    ACTIVE_SUBSCRIBERS.add(callback);
  } else {
    ACTIVE_SUBSCRIBERS.delete(callback);
  }

  syncTicker();
}

export function getTimeTickerState() {
  return {
    activeCount: ACTIVE_SUBSCRIBERS.size,
    running: Boolean(tickerId),
  };
}

function syncTicker() {
  if (ACTIVE_SUBSCRIBERS.size > 0 && !tickerId) {
    tickerId = window.setInterval(() => {
      const nowMs = Date.now();
      ACTIVE_SUBSCRIBERS.forEach((callback) => callback(nowMs));
    }, 1000);
  } else if (ACTIVE_SUBSCRIBERS.size === 0 && tickerId) {
    window.clearInterval(tickerId);
    tickerId = null;
  }
}

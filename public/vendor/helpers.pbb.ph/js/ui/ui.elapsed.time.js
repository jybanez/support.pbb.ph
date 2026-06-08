import { createElement, clearNode } from "./ui.dom.js";
import { setTimeTickSubscription } from "./ui.time.ticker.js";

const DEFAULT_OPTIONS = {
  startTime: null,
  endTime: null,
  running: true,
  label: "",
  prefix: "",
  suffix: "",
  showLabel: false,
  showPrefix: false,
  showSuffix: false,
  format: "fixed",
  size: "md",
  variant: "neutral",
  thresholds: [],
  invalidText: "--:--:--:--",
  ariaLabel: "Elapsed time",
  ariaLive: "off",
  title: "",
  className: "",
  chrome: true,
};

export function createElapsedTime(container, options = {}) {
  let currentOptions = normalizeOptions(options);
  let root = null;
  let labelNode = null;
  let valueNode = null;
  let prefixNode = null;
  let suffixNode = null;
  let destroyed = false;

  function renderShell() {
    if (!container || container.nodeType !== 1 || destroyed) {
      return;
    }

    clearNode(container);
    root = createElement("span", {
      className: buildClassName(currentOptions),
      attrs: {
        role: "timer",
        "aria-label": buildAriaLabel(currentOptions),
        "aria-live": normalizeAriaLive(currentOptions.ariaLive),
      },
    });

    if (currentOptions.title) {
      root.setAttribute("title", String(currentOptions.title));
    }

    if (currentOptions.showLabel && currentOptions.label) {
      labelNode = createElement("span", {
        className: "ui-elapsed-time-label",
        text: currentOptions.label,
      });
      root.appendChild(labelNode);
    } else {
      labelNode = null;
    }

    if (currentOptions.showPrefix && currentOptions.prefix) {
      prefixNode = createElement("span", {
        className: "ui-elapsed-time-prefix",
        text: currentOptions.prefix,
      });
      root.appendChild(prefixNode);
    } else {
      prefixNode = null;
    }

    valueNode = createElement("span", { className: "ui-elapsed-time-value" });
    root.appendChild(valueNode);

    if (currentOptions.showSuffix && currentOptions.suffix) {
      suffixNode = createElement("span", {
        className: "ui-elapsed-time-suffix",
        text: currentOptions.suffix,
      });
      root.appendChild(suffixNode);
    } else {
      suffixNode = null;
    }

    container.appendChild(root);
    renderValue(Date.now());
    syncTicker(renderValue, shouldTick(currentOptions));
  }

  function renderValue(nowMs = Date.now()) {
    if (!root || !valueNode || destroyed) {
      return;
    }

    const state = resolveState(currentOptions, nowMs);
    const thresholdVariant = resolveThresholdVariant(state.elapsedMs, currentOptions.thresholds);
    const variant = thresholdVariant || currentOptions.variant;
    root.className = buildClassName({ ...currentOptions, variant });
    root.dataset.elapsedMs = String(state.elapsedMs);
    root.dataset.running = state.running ? "true" : "false";

    const displayText = state.valid
      ? formatElapsedParts(toElapsedParts(state.elapsedMs), currentOptions)
      : String(currentOptions.invalidText);
    valueNode.textContent = displayText;

    const spoken = state.valid
      ? humanizeElapsed(toElapsedParts(state.elapsedMs))
      : "invalid start time";
    root.setAttribute("aria-label", `${buildAriaLabel(currentOptions)}: ${spoken}`);
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    renderShell();
  }

  function pause(atTime = Date.now()) {
    currentOptions = normalizeOptions({
      ...currentOptions,
      endTime: atTime,
      running: false,
    });
    renderValue(Date.now());
    syncTicker(renderValue, shouldTick(currentOptions));
  }

  function resume() {
    currentOptions = normalizeOptions({
      ...currentOptions,
      endTime: null,
      running: true,
    });
    renderValue(Date.now());
    syncTicker(renderValue, shouldTick(currentOptions));
  }

  function stop(atTime = Date.now()) {
    pause(atTime);
  }

  function destroy() {
    destroyed = true;
    syncTicker(renderValue, false);
    clearNode(container);
    root = null;
    labelNode = null;
    valueNode = null;
    prefixNode = null;
    suffixNode = null;
  }

  function getState(nowMs = Date.now()) {
    const state = resolveState(currentOptions, nowMs);
    return {
      options: { ...currentOptions },
      elapsedMs: state.elapsedMs,
      parts: toElapsedParts(state.elapsedMs),
      running: state.running,
      valid: state.valid,
      text: state.valid ? formatElapsedParts(toElapsedParts(state.elapsedMs), currentOptions) : String(currentOptions.invalidText),
    };
  }

  renderShell();

  return {
    destroy,
    getState,
    pause,
    resume,
    stop,
    update,
  };
}

function normalizeOptions(input) {
  const next = {
    ...DEFAULT_OPTIONS,
    ...(input || {}),
  };
  return {
    ...next,
    startTime: normalizeTime(next.startTime),
    endTime: normalizeTime(next.endTime),
    running: Boolean(next.running),
    chrome: next.chrome !== false,
    format: normalizeFormat(next.format),
    size: normalizeSize(next.size),
    variant: normalizeVariant(next.variant),
    thresholds: normalizeThresholds(next.thresholds),
  };
}

function normalizeTime(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSize(size) {
  const value = String(size || "md").toLowerCase();
  return value === "sm" || value === "lg" ? value : "md";
}

function normalizeFormat(format) {
  const value = String(format || "fixed").toLowerCase();
  return value === "compact" ? "compact" : "fixed";
}

function normalizeVariant(variant) {
  const value = String(variant || "neutral").toLowerCase();
  return ["neutral", "info", "success", "warn", "danger"].includes(value) ? value : "neutral";
}

function normalizeAriaLive(value) {
  const next = String(value || "off").toLowerCase();
  return ["off", "polite", "assertive"].includes(next) ? next : "off";
}

function normalizeThresholds(thresholds) {
  if (!Array.isArray(thresholds)) {
    return [];
  }
  return thresholds
    .map((threshold) => {
      if (!threshold || typeof threshold !== "object") {
        return null;
      }
      const atMs = Number(threshold.atMs ?? threshold.ms ?? 0);
      if (!Number.isFinite(atMs) || atMs < 0) {
        return null;
      }
      return {
        atMs,
        variant: normalizeVariant(threshold.variant),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.atMs - b.atMs);
}

function resolveState(options, nowMs) {
  const startMs = options.startTime;
  const valid = Number.isFinite(startMs);
  const running = Boolean(options.running && !Number.isFinite(options.endTime));
  const effectiveEnd = Number.isFinite(options.endTime) ? options.endTime : nowMs;
  const elapsedMs = valid ? Math.max(0, effectiveEnd - startMs) : 0;
  return {
    elapsedMs,
    running,
    valid,
  };
}

function shouldTick(options) {
  return Boolean(options.running && Number.isFinite(options.startTime) && !Number.isFinite(options.endTime));
}

function resolveThresholdVariant(elapsedMs, thresholds) {
  let variant = "";
  thresholds.forEach((threshold) => {
    if (elapsedMs >= threshold.atMs) {
      variant = threshold.variant;
    }
  });
  return variant;
}

function toElapsedParts(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(elapsedMs || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function formatElapsedParts(parts, options = DEFAULT_OPTIONS) {
  const values = [
    pad2(parts.days),
    pad2(parts.hours),
    pad2(parts.minutes),
    pad2(parts.seconds),
  ];
  if (options.format !== "compact") {
    return values.join(":");
  }

  const firstNonZero = values.findIndex((value) => value !== "00");
  if (firstNonZero === -1) {
    return values[values.length - 1];
  }
  return values.slice(firstNonZero).join(":");
}

function humanizeElapsed(parts) {
  const labels = [
    [parts.days, "day"],
    [parts.hours, "hour"],
    [parts.minutes, "minute"],
    [parts.seconds, "second"],
  ];
  return labels
    .filter(([value]) => value > 0)
    .map(([value, label]) => `${value} ${label}${value === 1 ? "" : "s"}`)
    .join(", ") || "0 seconds";
}

function pad2(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
}

function buildAriaLabel(options) {
  return String(options.ariaLabel || options.label || "Elapsed time");
}

function buildClassName(options) {
  return [
    "ui-elapsed-time",
    `ui-elapsed-time--${normalizeSize(options.size)}`,
    `ui-elapsed-time--${normalizeVariant(options.variant)}`,
    `ui-elapsed-time--${normalizeFormat(options.format)}`,
    options.chrome === false ? "is-chrome-less" : "",
    options.running ? "is-running" : "is-stopped",
    options.className || "",
  ].filter(Boolean).join(" ");
}

function syncTicker(render, active) {
  setTimeTickSubscription(render, active);
}

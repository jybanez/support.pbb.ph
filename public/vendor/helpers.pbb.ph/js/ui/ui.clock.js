import { createElement, clearNode } from "./ui.dom.js";
import { setTimeTickSubscription } from "./ui.time.ticker.js";

const DEFAULT_OPTIONS = {
  label: "",
  showLabel: true,
  showDate: true,
  showSeconds: true,
  hour12: true,
  timezone: "",
  locale: "en-US",
  dateFormat: "short",
  timeFormatter: null,
  dateFormatter: null,
  running: true,
  ariaLabel: "Current time",
  ariaLive: "off",
  title: "",
  size: "md",
  variant: "neutral",
  chrome: true,
  className: "",
};

const SIZES = new Set(["sm", "md", "lg"]);
const VARIANTS = new Set(["neutral", "info", "success", "warn", "warning", "danger", "critical"]);
const DATE_FORMATS = new Set(["short", "medium", "long", "none"]);

export function createClock(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createClock] A container element is required.");
  }

  let currentOptions = normalizeOptions(options);
  let root = null;
  let labelNode = null;
  let timeNode = null;
  let dateNode = null;
  let destroyed = false;

  function renderShell() {
    if (destroyed) {
      return;
    }

    clearNode(container);
    root = createElement("section", {
      className: buildClassName(currentOptions),
      attrs: {
        role: "timer",
        "aria-label": buildAriaLabel(currentOptions, Date.now()),
        "aria-live": normalizeAriaLive(currentOptions.ariaLive),
      },
      dataset: {
        running: currentOptions.running ? "true" : "false",
        variant: currentOptions.variant,
        size: currentOptions.size,
      },
    });

    if (currentOptions.title) {
      root.setAttribute("title", currentOptions.title);
    }

    if (currentOptions.showLabel && currentOptions.label) {
      labelNode = createElement("span", {
        className: "ui-clock-label",
        text: currentOptions.label,
      });
      root.appendChild(labelNode);
    } else {
      labelNode = null;
    }

    timeNode = createElement("span", { className: "ui-clock-time" });
    root.appendChild(timeNode);

    if (currentOptions.showDate && currentOptions.dateFormat !== "none") {
      dateNode = createElement("span", { className: "ui-clock-date" });
      root.appendChild(dateNode);
    } else {
      dateNode = null;
    }

    container.appendChild(root);
    renderValue(Date.now());
    syncTicker();
  }

  function renderValue(nowMs = Date.now()) {
    if (!root || !timeNode || destroyed) {
      return;
    }

    const state = resolveState(currentOptions, nowMs);
    timeNode.textContent = state.timeText;
    if (dateNode) {
      dateNode.textContent = state.dateText;
    }
    root.dataset.timestamp = String(state.timestamp);
    root.dataset.running = currentOptions.running ? "true" : "false";
    root.setAttribute("aria-label", buildAriaLabel(currentOptions, nowMs));
  }

  function syncTicker() {
    setTimeTickSubscription(renderValue, Boolean(currentOptions.running && !destroyed));
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    renderShell();
  }

  function pause() {
    currentOptions = normalizeOptions({ ...currentOptions, running: false });
    renderValue(Date.now());
    syncTicker();
  }

  function resume() {
    currentOptions = normalizeOptions({ ...currentOptions, running: true });
    renderValue(Date.now());
    syncTicker();
  }

  function getState(nowMs = Date.now()) {
    const state = resolveState(currentOptions, nowMs);
    return {
      options: {
        ...currentOptions,
        timeFormatter: currentOptions.timeFormatter,
        dateFormatter: currentOptions.dateFormatter,
      },
      timestamp: state.timestamp,
      date: new Date(state.timestamp),
      timeText: state.timeText,
      dateText: state.dateText,
      running: currentOptions.running,
    };
  }

  function destroy() {
    destroyed = true;
    setTimeTickSubscription(renderValue, false);
    clearNode(container);
    root = null;
    labelNode = null;
    timeNode = null;
    dateNode = null;
  }

  renderShell();

  return {
    destroy,
    getState,
    pause,
    resume,
    update,
  };
}

function normalizeOptions(input = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(input || {}) };
  return {
    ...next,
    label: String(next.label || ""),
    showLabel: next.showLabel !== false,
    showDate: next.showDate !== false,
    showSeconds: next.showSeconds !== false,
    hour12: next.hour12 !== false,
    timezone: String(next.timezone || next.timeZone || ""),
    locale: String(next.locale || DEFAULT_OPTIONS.locale),
    dateFormat: normalizeDateFormat(next.dateFormat),
    timeFormatter: typeof next.timeFormatter === "function" ? next.timeFormatter : null,
    dateFormatter: typeof next.dateFormatter === "function" ? next.dateFormatter : null,
    running: next.running !== false,
    ariaLabel: String(next.ariaLabel || DEFAULT_OPTIONS.ariaLabel),
    ariaLive: normalizeAriaLive(next.ariaLive),
    title: String(next.title || ""),
    size: normalizeSize(next.size),
    variant: normalizeVariant(next.variant),
    chrome: next.chrome !== false,
    className: String(next.className || ""),
  };
}

function resolveState(options, nowMs) {
  const timestamp = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const date = new Date(timestamp);
  return {
    timestamp,
    timeText: formatTime(date, options),
    dateText: formatDate(date, options),
  };
}

function formatTime(date, options) {
  if (options.timeFormatter) {
    return String(options.timeFormatter(date, options));
  }
  return new Intl.DateTimeFormat(options.locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: options.showSeconds ? "2-digit" : undefined,
    hour12: options.hour12,
    timeZone: options.timezone || undefined,
  }).format(date);
}

function formatDate(date, options) {
  if (options.dateFormatter) {
    return String(options.dateFormatter(date, options));
  }
  if (options.dateFormat === "none") {
    return "";
  }
  const dateStyle = options.dateFormat === "long" ? "long" : options.dateFormat === "medium" ? "medium" : undefined;
  if (dateStyle) {
    return new Intl.DateTimeFormat(options.locale, {
      dateStyle,
      timeZone: options.timezone || undefined,
    }).format(date);
  }
  return new Intl.DateTimeFormat(options.locale, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: options.timezone || undefined,
  }).format(date).toUpperCase();
}

function buildAriaLabel(options, nowMs) {
  const state = resolveState(options, nowMs);
  const label = options.label ? `${options.label}: ` : "";
  const date = state.dateText ? `, ${state.dateText}` : "";
  return `${options.ariaLabel}: ${label}${state.timeText}${date}`;
}

function normalizeSize(value) {
  const size = String(value || "md").toLowerCase();
  return SIZES.has(size) ? size : "md";
}

function normalizeVariant(value) {
  const variant = String(value || "neutral").toLowerCase();
  if (variant === "warning") {
    return "warn";
  }
  return VARIANTS.has(variant) ? variant : "neutral";
}

function normalizeDateFormat(value) {
  const next = String(value || "short").toLowerCase();
  return DATE_FORMATS.has(next) ? next : "short";
}

function normalizeAriaLive(value) {
  const next = String(value || "off").toLowerCase();
  return ["off", "polite", "assertive"].includes(next) ? next : "off";
}

function buildClassName(options) {
  return [
    "ui-clock",
    `ui-clock--${options.size}`,
    `ui-clock--${options.variant}`,
    options.chrome === false ? "is-chrome-less" : "",
    options.running ? "is-running" : "is-stopped",
    options.className,
  ].filter(Boolean).join(" ");
}

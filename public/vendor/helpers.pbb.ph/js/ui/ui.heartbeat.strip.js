import { createElement, clearNode } from "./ui.dom.js";

const DEFAULT_OPTIONS = {
  status: "unknown",
  lastSeenAt: "",
  ageSeconds: null,
  history: [],
  hours: null,
  bucketCount: 48,
  rangeLabel: "",
  label: "Heartbeat",
  labels: {},
  chrome: true,
  compact: true,
  showStatus: true,
  showAge: true,
  showAverage: true,
  bucketTone: "uptime",
  ariaLabel: "",
  ariaLive: "off",
  title: "",
  palette: {},
  className: "",
};

const STATUS_VALUES = ["online", "stale", "offline", "unknown"];

export function createHeartbeatStrip(container, options = {}) {
  let currentOptions = normalizeOptions(options);
  let root = null;
  let statusNode = null;
  let averageNode = null;
  let ageNode = null;
  let stripNode = null;
  let summaryNode = null;
  let destroyed = false;

  function renderShell() {
    if (!container || container.nodeType !== 1 || destroyed) {
      return;
    }
    clearNode(container);
    root = createElement("div", {
      className: buildClassName(currentOptions),
      attrs: {
        role: "group",
        "aria-label": buildAriaLabel(currentOptions),
        "aria-live": currentOptions.ariaLive,
        title: currentOptions.title || buildAriaLabel(currentOptions),
      },
      dataset: {
        status: currentOptions.status,
        hours: currentOptions.hours == null ? "" : String(currentOptions.hours),
        bucketCount: String(currentOptions.bucketCount),
        averageUptime: formatRatio(currentOptions.averageUptime),
      },
    });

    const header = createElement("div", { className: "ui-heartbeat-strip-header" });
    if (currentOptions.showStatus) {
      statusNode = createElement("span", {
        className: "ui-heartbeat-strip-status",
        attrs: { "aria-hidden": "true" },
      });
      statusNode.appendChild(createElement("span", { className: "ui-heartbeat-strip-status-dot" }));
      statusNode.appendChild(createElement("span", { className: "ui-heartbeat-strip-status-text" }));
      header.appendChild(statusNode);
    } else {
      statusNode = null;
    }
    if (currentOptions.showAverage) {
      averageNode = createElement("span", { className: "ui-heartbeat-strip-average" });
      header.appendChild(averageNode);
    } else {
      averageNode = null;
    }
    if (currentOptions.showAge) {
      ageNode = createElement("span", { className: "ui-heartbeat-strip-age" });
      header.appendChild(ageNode);
    } else {
      ageNode = null;
    }
    if (currentOptions.showStatus || currentOptions.showAverage || currentOptions.showAge) {
      root.appendChild(header);
    }

    stripNode = createElement("div", {
      className: "ui-heartbeat-strip-buckets",
      attrs: { "aria-hidden": "true" },
    });
    root.appendChild(stripNode);

    summaryNode = createElement("span", { className: "ui-sr-only" });
    root.appendChild(summaryNode);

    container.appendChild(root);
    sync();
  }

  function sync() {
    if (!root || destroyed) {
      return;
    }
    root.className = buildClassName(currentOptions);
    root.dataset.status = currentOptions.status;
    root.dataset.hours = currentOptions.hours == null ? "" : String(currentOptions.hours);
    root.dataset.bucketCount = String(currentOptions.bucketCount);
    root.dataset.averageUptime = formatRatio(currentOptions.averageUptime);
    root.setAttribute("aria-label", buildAriaLabel(currentOptions));
    root.setAttribute("aria-live", currentOptions.ariaLive);
    root.setAttribute("title", currentOptions.title || buildAriaLabel(currentOptions));
    applyPalette(root, currentOptions.palette);

    const statusText = getStatusText(currentOptions.status, currentOptions.labels);
    const ageText = buildAgeText(currentOptions);
    if (statusNode) {
      statusNode.dataset.status = currentOptions.status;
      const textNode = statusNode.querySelector(".ui-heartbeat-strip-status-text");
      if (textNode) {
        textNode.textContent = statusText;
      }
    }
    if (ageNode) {
      ageNode.textContent = ageText;
    }
    if (averageNode) {
      averageNode.textContent = buildAverageText(currentOptions);
    }
    renderBuckets();
    if (summaryNode) {
      summaryNode.textContent = buildSummary(currentOptions);
    }
  }

  function renderBuckets() {
    if (!stripNode) {
      return;
    }
    clearNode(stripNode);
    currentOptions.history.forEach((bucket, index) => {
      const node = createElement("span", {
        className: `ui-heartbeat-strip-bucket ui-heartbeat-strip-bucket--${bucket.status}`,
        attrs: {
          title: buildBucketTitle(bucket, index, currentOptions),
        },
        dataset: {
          index: String(index),
          status: bucket.status,
          expectedCount: String(bucket.expectedCount),
          receivedCount: String(bucket.receivedCount),
          uptime: formatRatio(bucket.uptime),
          bucketStartedAt: bucket.bucketStartedAt,
        },
      });
      if (currentOptions.bucketTone === "uptime" && bucket.uptime != null) {
        node.style.setProperty("--ui-heartbeat-bucket-color", uptimeColor(bucket.uptime));
      }
      stripNode.appendChild(node);
    });
  }

  function update(nextOptions = {}) {
    const patch = nextOptions || {};
    const merged = { ...currentOptions, ...patch };
    if (
      Object.prototype.hasOwnProperty.call(patch, "hours") &&
      !Object.prototype.hasOwnProperty.call(patch, "bucketCount") &&
      !Object.prototype.hasOwnProperty.call(patch, "bucket_count")
    ) {
      merged.bucketCount = patch.hours;
    }
    const next = normalizeOptions(merged);
    const needsShell =
      next.showStatus !== currentOptions.showStatus ||
      next.showAverage !== currentOptions.showAverage ||
      next.showAge !== currentOptions.showAge;
    currentOptions = next;
    if (needsShell) {
      renderShell();
    } else {
      sync();
    }
  }

  function setStatus(status) {
    update({ status });
  }

  function getState() {
    return {
      ...currentOptions,
      history: currentOptions.history.map((bucket) => ({ ...bucket })),
      labels: { ...currentOptions.labels },
      palette: { ...currentOptions.palette },
    };
  }

  function destroy() {
    destroyed = true;
    clearNode(container);
    root = null;
    statusNode = null;
    ageNode = null;
    averageNode = null;
    stripNode = null;
    summaryNode = null;
  }

  renderShell();

  return {
    destroy,
    getState,
    setStatus,
    update,
  };
}

function normalizeOptions(input = {}) {
  const next = {
    ...DEFAULT_OPTIONS,
    ...(input || {}),
  };
  const hours = normalizeNullablePositiveInteger(next.hours, null, 1, 10000);
  const explicitBucketCount = input?.bucket_count ?? input?.bucketCount;
  const bucketCount = normalizePositiveInteger(explicitBucketCount ?? hours, 48, 1, 10000);
  const history = normalizeHistory(next.history, bucketCount);
  return {
    ...next,
    status: normalizeStatus(next.status),
    lastSeenAt: normalizeDateText(next.lastSeenAt),
    ageSeconds: normalizeNullableNumber(next.ageSeconds),
    history,
    hours,
    bucketCount,
    rangeLabel: String(next.rangeLabel || next.range_label || ""),
    averageUptime: calculateUptime(history),
    label: String(next.label || "Heartbeat"),
    labels: isPlainObject(next.labels) ? { ...next.labels } : {},
    chrome: next.chrome !== false,
    compact: next.compact !== false,
    showStatus: next.showStatus !== false,
    showAge: next.showAge !== false,
    showAverage: next.showAverage !== false,
    bucketTone: normalizeBucketTone(next.bucketTone ?? next.bucket_tone),
    ariaLabel: String(next.ariaLabel || ""),
    ariaLive: normalizeAriaLive(next.ariaLive),
    title: String(next.title || ""),
    palette: isPlainObject(next.palette) ? { ...next.palette } : {},
    className: String(next.className || ""),
  };
}

function normalizeHistory(history, bucketCount) {
  const rows = Array.isArray(history) ? history : [];
  const normalized = rows.slice(-bucketCount).map((bucket) => normalizeBucket(bucket));
  while (normalized.length < bucketCount) {
    normalized.unshift({
      status: "unknown",
      expectedCount: 0,
      receivedCount: 0,
      uptime: null,
      bucketStartedAt: "",
    });
  }
  return normalized;
}

function normalizeBucket(bucket = {}) {
  const expectedCount = normalizePositiveInteger(bucket.expected_count ?? bucket.expectedCount, 0, 0, 9999);
  const receivedCount = normalizePositiveInteger(bucket.received_count ?? bucket.receivedCount, 0, 0, 9999);
  return {
    status: normalizeBucketStatus(bucket.status),
    expectedCount,
    receivedCount,
    uptime: calculateBucketUptime(receivedCount, expectedCount),
    bucketStartedAt: normalizeDateText(bucket.bucket_started_at ?? bucket.bucketStartedAt ?? bucket.startedAt),
  };
}

function normalizeStatus(value) {
  const next = String(value || "unknown").toLowerCase();
  return STATUS_VALUES.includes(next) ? next : "unknown";
}

function normalizeBucketStatus(value) {
  const next = String(value || "unknown").trim().toLowerCase();
  return next ? next.replace(/[^a-z0-9_-]/g, "-") : "unknown";
}

function normalizeBucketTone(value) {
  const next = String(value || "uptime").toLowerCase();
  return next === "status" ? "status" : "uptime";
}

function normalizeAriaLive(value) {
  const next = String(value || "off").toLowerCase();
  return ["off", "polite", "assertive"].includes(next) ? next : "off";
}

function normalizePositiveInteger(value, fallback, min, max) {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback;
  }
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeNullablePositiveInteger(value, fallback, min, max) {
  if (value === null || typeof value === "undefined" || value === "") {
    return fallback;
  }
  return normalizePositiveInteger(value, fallback, min, max);
}

function normalizeNullableNumber(value) {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function normalizeDateText(value) {
  return String(value || "");
}

function buildClassName(options) {
  return [
    "ui-heartbeat-strip",
    options.compact ? "ui-heartbeat-strip--compact" : "ui-heartbeat-strip--regular",
    `ui-heartbeat-strip--${options.status}`,
    options.chrome ? "" : "ui-heartbeat-strip--chromeless",
    options.showStatus ? "" : "is-status-hidden",
    options.showAge ? "" : "is-age-hidden",
    options.className,
  ].filter(Boolean).join(" ");
}

function buildAriaLabel(options) {
  if (options.ariaLabel) {
    return options.ariaLabel;
  }
  return buildSummary(options);
}

function buildSummary(options) {
  const label = options.label || "Heartbeat";
  const statusText = getStatusText(options.status, options.labels);
  const ageText = buildAgeText(options);
  const counts = countBuckets(options.history);
  const averageText = buildAverageText(options);
  const rangeText = buildRangeText(options);
  return `${label}: ${statusText}; ${averageText}; ${ageText}; ${rangeText}; ${counts.ok} ok, ${counts.partial} partial, ${counts.missed} missed, ${counts.unknown} unknown.`;
}

function countBuckets(history) {
  return history.reduce((counts, bucket) => {
    if (Object.prototype.hasOwnProperty.call(counts, bucket.status)) {
      counts[bucket.status] += 1;
    } else {
      counts.unknown += 1;
    }
    return counts;
  }, { ok: 0, partial: 0, missed: 0, unknown: 0 });
}

function buildAverageText(options) {
  if (typeof options.labels.average === "string") {
    return options.labels.average;
  }
  if (options.averageUptime == null) {
    return "No uptime data";
  }
  return `${Math.round(options.averageUptime * 100)}% uptime`;
}

function buildRangeText(options) {
  if (options.rangeLabel) {
    return `${options.bucketCount} buckets, ${options.rangeLabel}`;
  }
  if (options.hours != null) {
    return `${options.bucketCount} buckets across ${options.hours} hours`;
  }
  return `${options.bucketCount} buckets`;
}

function calculateUptime(history) {
  const totals = history.reduce((acc, bucket) => {
    if (bucket.expectedCount > 0) {
      acc.expected += bucket.expectedCount;
      acc.received += Math.min(bucket.receivedCount, bucket.expectedCount);
    }
    return acc;
  }, { expected: 0, received: 0 });
  if (totals.expected <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, totals.received / totals.expected));
}

function calculateBucketUptime(receivedCount, expectedCount) {
  if (expectedCount <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, receivedCount / expectedCount));
}

function buildAgeText(options) {
  if (typeof options.labels.age === "string") {
    return options.labels.age;
  }
  if (options.ageSeconds != null) {
    return formatAge(options.ageSeconds);
  }
  if (options.lastSeenAt) {
    return `Last ${formatDateLabel(options.lastSeenAt)}`;
  }
  return "No heartbeat";
}

function formatAge(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return String(value);
}

function getStatusText(status, labels = {}) {
  if (typeof labels[status] === "string") {
    return labels[status];
  }
  if (status === "online") {
    return "Online";
  }
  if (status === "stale") {
    return "Stale";
  }
  if (status === "offline") {
    return "Offline";
  }
  return "Unknown";
}

function buildBucketTitle(bucket, index, options) {
  const statusText = getBucketText(bucket.status, options.labels);
  const timeText = bucket.bucketStartedAt ? formatDateLabel(bucket.bucketStartedAt) : `Bucket ${index + 1}`;
  const counts = bucket.expectedCount > 0
    ? `${bucket.receivedCount}/${bucket.expectedCount} heartbeats`
    : `${bucket.receivedCount} heartbeats`;
  const uptimeText = bucket.uptime == null ? "no uptime data" : `${Math.round(bucket.uptime * 100)}% uptime`;
  return `${timeText}: ${statusText}, ${uptimeText}, ${counts}`;
}

function getBucketText(status, labels = {}) {
  const bucketLabels = isPlainObject(labels.buckets) ? labels.buckets : {};
  if (typeof bucketLabels[status] === "string") {
    return bucketLabels[status];
  }
  if (status === "ok") {
    return "OK";
  }
  if (status === "partial") {
    return "Partial";
  }
  if (status === "missed") {
    return "Missed";
  }
  return "Unknown";
}

function uptimeColor(ratio) {
  const clamped = Math.max(0, Math.min(1, Number(ratio)));
  const hue = Math.round(clamped * 138);
  return `hsl(${hue} 72% 56%)`;
}

function formatRatio(value) {
  return value == null ? "" : String(Math.round(value * 1000) / 1000);
}

function applyPalette(root, palette) {
  const pairs = {
    ok: "--ui-heartbeat-ok",
    partial: "--ui-heartbeat-partial",
    missed: "--ui-heartbeat-missed",
    unknown: "--ui-heartbeat-unknown",
    online: "--ui-heartbeat-online",
    stale: "--ui-heartbeat-stale",
    offline: "--ui-heartbeat-offline",
  };
  Object.entries(pairs).forEach(([key, property]) => {
    if (typeof palette[key] === "string" && palette[key].trim()) {
      root.style.setProperty(property, palette[key]);
    } else {
      root.style.removeProperty(property);
    }
  });
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

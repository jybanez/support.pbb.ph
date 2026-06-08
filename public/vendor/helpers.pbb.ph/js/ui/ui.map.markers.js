import { createElement } from "./ui.dom.js";
import { createIcon } from "./ui.icons.js?v=0.21.84";

const ALLOWED_TYPES = new Set(["incident", "source-hub", "target-hub", "hotspot", "route", "boundary-centroid"]);
const ALLOWED_SHAPES = new Set(["pin", "dot", "hub", "cluster", "hotspot", "route"]);
const ALLOWED_TONES = new Set(["neutral", "info", "success", "warning", "danger", "critical"]);
const ALLOWED_SIZES = new Set(["sm", "md", "lg"]);

const DEFAULT_MARKER = {
  id: "",
  type: "incident",
  tone: "neutral",
  icon: "",
  label: "",
  count: "",
  selected: false,
  active: false,
  muted: false,
  size: "md",
  pulse: false,
  shape: "",
  color: "",
  meta: {},
};

const DEFAULT_CLUSTER = {
  count: 0,
  tone: "neutral",
  label: "",
  size: "md",
  selected: false,
  active: false,
  color: "",
};

export function createMapMarker(options = {}) {
  const marker = normalizeMarker(options);
  const root = createMarkerRoot(marker, false);
  root.appendChild(createShape(marker));
  if (marker.count !== "") {
    root.appendChild(createCount(marker.count));
  }
  return root;
}

export function createMapClusterMarker(options = {}) {
  const cluster = normalizeCluster(options);
  const marker = {
    ...DEFAULT_MARKER,
    id: "cluster",
    type: "hotspot",
    shape: "cluster",
    tone: cluster.tone,
    label: cluster.label || `${cluster.count} markers`,
    count: cluster.count,
    selected: cluster.selected,
    active: cluster.active,
    size: cluster.size,
    color: cluster.color,
  };
  const root = createMarkerRoot(marker, true);
  root.appendChild(createShape(marker));
  root.appendChild(createCount(cluster.count));
  return root;
}

export function getMapMarkerClass(options = {}) {
  const marker = normalizeMarker(options);
  return buildClassName(marker, false);
}

function createMarkerRoot(marker, cluster) {
  const root = createElement("span", {
    className: buildClassName(marker, cluster),
    attrs: {
      role: "img",
      "aria-label": buildLabel(marker, cluster),
      title: buildLabel(marker, cluster),
    },
    dataset: {
      id: marker.id,
      markerId: marker.id,
      type: marker.type,
      tone: marker.tone,
      shape: marker.shape,
      size: marker.size,
      selected: marker.selected ? "true" : "false",
      active: marker.active ? "true" : "false",
      muted: marker.muted ? "true" : "false",
      pulse: marker.pulse ? "true" : "false",
      count: marker.count,
    },
  });
  if (marker.color) {
    root.style.setProperty("--ui-map-marker-color", marker.color);
  }
  root.__uiMapMarker = {
    id: marker.id,
    type: marker.type,
    tone: marker.tone,
    shape: marker.shape,
    size: marker.size,
    meta: { ...marker.meta },
  };
  return root;
}

function createShape(marker) {
  const shape = createElement("span", {
    className: `ui-map-marker-shape ui-map-marker-shape--${marker.shape}`,
    attrs: { "aria-hidden": "true" },
  });
  if (marker.icon) {
    const iconWrap = createElement("span", { className: "ui-map-marker-icon" });
    try {
      iconWrap.appendChild(createIcon(marker.icon, { size: iconSize(marker.size) }));
      shape.appendChild(iconWrap);
    } catch (_error) {
      // Shape alone is a valid marker if an app supplies an unknown icon id.
    }
  }
  return shape;
}

function createCount(count) {
  return createElement("span", {
    className: "ui-map-marker-count",
    text: count,
    attrs: { "aria-hidden": "true" },
  });
}

function normalizeMarker(input = {}) {
  const next = { ...DEFAULT_MARKER, ...(input || {}) };
  const type = normalizeType(next.type);
  const shape = normalizeShape(next.shape || defaultShapeForType(type));
  return {
    ...next,
    id: String(next.id || ""),
    type,
    tone: normalizeTone(next.tone),
    icon: String(next.icon || ""),
    label: String(next.label || ""),
    count: next.count === null || next.count === undefined || next.count === "" ? "" : String(next.count),
    selected: next.selected === true,
    active: next.active === true,
    muted: next.muted === true,
    size: normalizeSize(next.size),
    pulse: next.pulse === true,
    shape,
    color: String(next.color || ""),
    meta: next.meta && typeof next.meta === "object" ? { ...next.meta } : {},
  };
}

function normalizeCluster(input = {}) {
  const next = { ...DEFAULT_CLUSTER, ...(input || {}) };
  return {
    ...next,
    count: next.count === null || next.count === undefined || next.count === "" ? 0 : String(next.count),
    tone: normalizeTone(next.tone),
    label: String(next.label || ""),
    size: normalizeSize(next.size),
    selected: next.selected === true,
    active: next.active === true,
    color: String(next.color || ""),
  };
}

function normalizeType(value) {
  const type = String(value || "incident").toLowerCase();
  return ALLOWED_TYPES.has(type) ? type : "incident";
}

function normalizeShape(value) {
  const shape = String(value || "pin").toLowerCase();
  return ALLOWED_SHAPES.has(shape) ? shape : "pin";
}

function normalizeTone(value) {
  const tone = String(value || "neutral").toLowerCase();
  return ALLOWED_TONES.has(tone) ? tone : "neutral";
}

function normalizeSize(value) {
  const size = String(value || "md").toLowerCase();
  return ALLOWED_SIZES.has(size) ? size : "md";
}

function defaultShapeForType(type) {
  if (type === "source-hub" || type === "target-hub" || type === "boundary-centroid") {
    return "hub";
  }
  if (type === "hotspot") {
    return "hotspot";
  }
  if (type === "route") {
    return "route";
  }
  return "pin";
}

function buildClassName(marker, cluster) {
  return [
    "ui-map-marker",
    cluster ? "ui-map-marker--cluster" : "",
    `ui-map-marker--${marker.type}`,
    `ui-map-marker--${marker.shape}`,
    `ui-map-marker--${marker.tone}`,
    `ui-map-marker--${marker.size}`,
    marker.selected ? "is-selected" : "",
    marker.active ? "is-active" : "",
    marker.muted ? "is-muted" : "",
    marker.pulse ? "is-pulsing" : "",
  ].filter(Boolean).join(" ");
}

function buildLabel(marker, cluster) {
  if (marker.label) {
    return marker.label;
  }
  if (cluster) {
    return `${marker.count || 0} markers`;
  }
  const type = marker.type.replace(/-/g, " ");
  const count = marker.count !== "" ? `, count ${marker.count}` : "";
  return `${type} marker${count}`;
}

function iconSize(size) {
  if (size === "lg") {
    return 18;
  }
  if (size === "sm") {
    return 12;
  }
  return 14;
}

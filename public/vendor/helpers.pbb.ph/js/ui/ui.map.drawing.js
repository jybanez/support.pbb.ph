import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  modes: ["select", "point", "line", "polygon", "rectangle", "circle"],
  actions: ["finish", "cancel", "undo", "redo", "delete", "clear"],
  activeMode: "select",
  orientation: "vertical",
  placement: "map",
  size: "md",
  variant: "neutral",
  chrome: true,
  labels: "auto",
  disabled: false,
  busy: false,
  features: [],
  selectedFeatureId: "",
  measurement: null,
  adapter: null,
  className: "",
  ariaLabel: "Map drawing tools",
  emptyText: "No drawing tools configured.",
  onModeChange: null,
  onAction: null,
  onCreate: null,
  onUpdate: null,
  onDelete: null,
  onSelect: null,
};

const MODES = new Set(["select", "pan", "point", "line", "polygon", "rectangle", "circle"]);
const ACTIONS = new Set(["finish", "cancel", "undo", "redo", "delete", "clear"]);
const ORIENTATIONS = new Set(["vertical", "horizontal"]);
const PLACEMENTS = new Set(["map", "external"]);
const SIZES = new Set(["sm", "md", "lg"]);
const VARIANTS = new Set(["neutral", "info", "success", "warning", "danger", "critical"]);
const LABEL_MODES = new Set(["auto", "always", "none"]);

const MODE_META = {
  select: { label: "Select", symbol: "↖" },
  pan: { label: "Pan", symbol: "✋" },
  point: { label: "Point", symbol: "●" },
  line: { label: "Line", symbol: "╱" },
  polygon: { label: "Polygon", symbol: "⬟" },
  rectangle: { label: "Rectangle", symbol: "▭" },
  circle: { label: "Circle", symbol: "○" },
};

const ACTION_META = {
  finish: { label: "Finish drawing", shortLabel: "Finish", symbol: "✓", method: "finish" },
  cancel: { label: "Cancel drawing", shortLabel: "Cancel", symbol: "×", method: "cancel" },
  undo: { label: "Undo drawing action", shortLabel: "Undo", symbol: "↶", method: "undo" },
  redo: { label: "Redo drawing action", shortLabel: "Redo", symbol: "↷", method: "redo" },
  delete: { label: "Delete selected drawing", shortLabel: "Delete", symbol: "⌫", method: "deleteSelected" },
  clear: { label: "Clear drawings", shortLabel: "Clear", symbol: "⌧", method: "clear" },
};

export function createMapDrawingTools(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createMapDrawingTools] A container element is required.");
  }

  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let activeMode = normalizeMode(currentOptions.activeMode, currentOptions.modes);
  let currentFeatures = normalizeFeatures(currentOptions.features);
  let selectedFeatureId = currentOptions.selectedFeatureId;
  let currentMeasurement = normalizeMeasurement(currentOptions.measurement);
  let adapterOffs = [];
  let root = null;
  let destroyed = false;

  function render() {
    if (destroyed) {
      return;
    }

    events.clear();
    bindAdapterEvents();
    clearNode(container);

    root = createElement("section", {
      className: buildRootClass(currentOptions),
      attrs: {
        role: "toolbar",
        "aria-label": currentOptions.ariaLabel,
        "aria-disabled": currentOptions.disabled || currentOptions.busy ? "true" : "false",
      },
      dataset: {
        activeMode,
        orientation: currentOptions.orientation,
        placement: currentOptions.placement,
        labels: currentOptions.labels,
        disabled: currentOptions.disabled ? "true" : "false",
        busy: currentOptions.busy ? "true" : "false",
        featureCount: String(currentFeatures.length),
        selectedFeatureId,
      },
    });

    if (!currentOptions.modes.length && !currentOptions.actions.length) {
      root.appendChild(createElement("span", {
        className: "ui-map-drawing-empty",
        text: currentOptions.emptyText,
      }));
      container.appendChild(root);
      return;
    }

    if (currentOptions.modes.length) {
      root.appendChild(renderModeGroup());
    }
    if (currentOptions.actions.length) {
      root.appendChild(renderActionGroup());
    }
    const measurement = renderMeasurement();
    if (measurement) {
      root.appendChild(measurement);
    }
    container.appendChild(root);
  }

  function renderModeGroup() {
    const group = createElement("div", {
      className: "ui-map-drawing-group ui-map-drawing-modes",
      attrs: { role: "group", "aria-label": "Drawing modes" },
    });
    currentOptions.modes.forEach((mode) => {
      const meta = MODE_META[mode] || { label: mode, symbol: "•" };
      const active = mode === activeMode;
      const unavailable = isModeDisabled(mode);
      const button = createElement("button", {
        className: `ui-map-drawing-button ui-map-drawing-mode${active ? " is-active" : ""}`,
        attrs: {
          type: "button",
          title: meta.label,
          "aria-label": meta.label,
          "aria-pressed": active ? "true" : "false",
          "aria-disabled": unavailable ? "true" : "false",
          disabled: unavailable ? "disabled" : null,
        },
        dataset: { mode },
      });
      button.appendChild(createElement("span", {
        className: "ui-map-drawing-button-icon",
        text: meta.symbol,
        attrs: { "aria-hidden": "true" },
      }));
      button.appendChild(createElement("span", {
        className: "ui-map-drawing-button-label",
        text: meta.label,
      }));
      events.on(button, "click", () => setMode(mode));
      group.appendChild(button);
    });
    return group;
  }

  function renderActionGroup() {
    const group = createElement("div", {
      className: "ui-map-drawing-group ui-map-drawing-actions",
      attrs: { role: "group", "aria-label": "Drawing actions" },
    });
    currentOptions.actions.forEach((action) => {
      const meta = ACTION_META[action] || { label: action, shortLabel: action, symbol: "•", method: action };
      const unavailable = isActionDisabled(action);
      const button = createElement("button", {
        className: "ui-map-drawing-button ui-map-drawing-action",
        attrs: {
          type: "button",
          title: meta.label,
          "aria-label": meta.label,
          "aria-disabled": unavailable ? "true" : "false",
          disabled: unavailable ? "disabled" : null,
        },
        dataset: { action },
      });
      button.appendChild(createElement("span", {
        className: "ui-map-drawing-button-icon",
        text: meta.symbol,
        attrs: { "aria-hidden": "true" },
      }));
      button.appendChild(createElement("span", {
        className: "ui-map-drawing-button-label",
        text: meta.shortLabel || meta.label,
      }));
      events.on(button, "click", () => runAction(action));
      group.appendChild(button);
    });
    return group;
  }

  function renderMeasurement() {
    if (!currentMeasurement) {
      return null;
    }
    return createElement("div", {
      className: "ui-map-drawing-measurement",
      attrs: {
        role: "status",
        "aria-label": buildMeasurementLabel(currentMeasurement),
      },
      text: currentMeasurement.label || buildMeasurementLabel(currentMeasurement),
    });
  }

  function setMode(mode) {
    const nextMode = normalizeMode(mode, currentOptions.modes);
    if (currentOptions.disabled || currentOptions.busy || !nextMode || !currentOptions.modes.includes(nextMode)) {
      return;
    }

    activeMode = nextMode;
    currentOptions.activeMode = nextMode;
    if (currentOptions.adapter?.setMode) {
      currentOptions.adapter.setMode(nextMode);
    }
    currentOptions.onModeChange?.(nextMode, getState());
    render();
  }

  function runAction(action) {
    const nextAction = normalizeAction(action);
    if (currentOptions.disabled || currentOptions.busy || !nextAction || isActionDisabled(nextAction)) {
      return;
    }

    const meta = ACTION_META[nextAction];
    const method = meta?.method || nextAction;
    const adapter = currentOptions.adapter;
    if (adapter && typeof adapter[method] === "function") {
      adapter[method]();
    }
    currentOptions.onAction?.(nextAction, getState());
    render();
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    activeMode = normalizeMode(currentOptions.activeMode || activeMode, currentOptions.modes);
    currentFeatures = Object.prototype.hasOwnProperty.call(nextOptions || {}, "features")
      ? normalizeFeatures(currentOptions.features)
      : currentFeatures;
    selectedFeatureId = Object.prototype.hasOwnProperty.call(nextOptions || {}, "selectedFeatureId")
      ? currentOptions.selectedFeatureId
      : selectedFeatureId;
    currentMeasurement = Object.prototype.hasOwnProperty.call(nextOptions || {}, "measurement")
      ? normalizeMeasurement(currentOptions.measurement)
      : currentMeasurement;
    render();
  }

  function setFeatures(features = []) {
    currentFeatures = normalizeFeatures(features);
    currentOptions.features = currentFeatures.map(clonePlain);
    if (currentOptions.adapter?.setFeatures) {
      currentOptions.adapter.setFeatures(currentFeatures.map(clonePlain));
    }
    render();
  }

  function getState() {
    return {
      options: {
        ...currentOptions,
        adapter: currentOptions.adapter,
        onModeChange: currentOptions.onModeChange,
        onAction: currentOptions.onAction,
        onCreate: currentOptions.onCreate,
        onUpdate: currentOptions.onUpdate,
        onDelete: currentOptions.onDelete,
        onSelect: currentOptions.onSelect,
      },
      activeMode,
      features: currentFeatures.map(clonePlain),
      featureCount: currentFeatures.length,
      selectedFeatureId,
      measurement: currentMeasurement ? { ...currentMeasurement } : null,
      capabilities: readCapabilities(),
      disabled: currentOptions.disabled,
      busy: currentOptions.busy,
    };
  }

  function destroy() {
    destroyed = true;
    events.clear();
    clearAdapterEvents();
    clearNode(container);
    root = null;
  }

  function bindAdapterEvents() {
    clearAdapterEvents();
    const adapter = currentOptions.adapter;
    if (!adapter || typeof adapter.on !== "function") {
      return;
    }

    const eventMap = {
      create: handleAdapterCreate,
      update: handleAdapterUpdate,
      delete: handleAdapterDelete,
      select: handleAdapterSelect,
      measure: handleAdapterMeasure,
      modechange: handleAdapterModeChange,
    };

    Object.entries(eventMap).forEach(([eventName, handler]) => {
      const off = adapter.on(eventName, handler);
      if (typeof off === "function") {
        adapterOffs.push(off);
      }
    });
  }

  function clearAdapterEvents() {
    adapterOffs.splice(0).forEach((off) => off());
  }

  function handleAdapterCreate(feature) {
    const normalized = normalizeFeature(feature, currentFeatures.length);
    if (normalized) {
      currentFeatures = [...currentFeatures.filter((item) => item.id !== normalized.id), normalized];
      currentOptions.features = currentFeatures.map(clonePlain);
      currentOptions.onCreate?.(clonePlain(normalized), getState());
      render();
    }
  }

  function handleAdapterUpdate(feature) {
    const normalized = normalizeFeature(feature, currentFeatures.length);
    if (normalized) {
      currentFeatures = currentFeatures.map((item) => item.id === normalized.id ? normalized : item);
      if (!currentFeatures.some((item) => item.id === normalized.id)) {
        currentFeatures.push(normalized);
      }
      currentOptions.features = currentFeatures.map(clonePlain);
      currentOptions.onUpdate?.(clonePlain(normalized), getState());
      render();
    }
  }

  function handleAdapterDelete(payload) {
    const featureId = normalizeFeatureId(payload);
    currentFeatures = featureId ? currentFeatures.filter((item) => item.id !== featureId) : currentFeatures;
    if (selectedFeatureId === featureId) {
      selectedFeatureId = "";
    }
    currentOptions.features = currentFeatures.map(clonePlain);
    currentOptions.onDelete?.(featureId || payload, getState());
    render();
  }

  function handleAdapterSelect(payload) {
    selectedFeatureId = normalizeFeatureId(payload);
    currentOptions.onSelect?.(payload, getState());
    render();
  }

  function handleAdapterMeasure(payload) {
    currentMeasurement = normalizeMeasurement(payload);
    render();
  }

  function handleAdapterModeChange(payload) {
    const nextMode = normalizeMode(typeof payload === "string" ? payload : payload?.mode, currentOptions.modes);
    if (nextMode) {
      activeMode = nextMode;
      currentOptions.activeMode = nextMode;
      currentOptions.onModeChange?.(nextMode, getState());
      render();
    }
  }

  function isModeDisabled(mode) {
    const caps = readCapabilities();
    if (currentOptions.disabled || currentOptions.busy) {
      return true;
    }
    if (Array.isArray(caps.modes) && caps.modes.length) {
      return !caps.modes.includes(mode);
    }
    return false;
  }

  function isActionDisabled(action) {
    const caps = readCapabilities();
    if (currentOptions.disabled || currentOptions.busy) {
      return true;
    }
    if (caps.actions && Object.prototype.hasOwnProperty.call(caps.actions, action)) {
      return caps.actions[action] !== true;
    }
    return false;
  }

  function readCapabilities() {
    const caps = currentOptions.adapter?.getCapabilities?.();
    return caps && typeof caps === "object" ? caps : {};
  }

  render();

  return {
    destroy,
    getState,
    setFeatures,
    setMode,
    update,
  };
}

function normalizeOptions(input = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(input || {}) };
  const modes = normalizeModes(next.modes);
  const actions = normalizeActions(next.actions);
  return {
    ...next,
    modes,
    actions,
    activeMode: normalizeMode(next.activeMode, modes),
    orientation: normalizeChoice(next.orientation, ORIENTATIONS, "vertical"),
    placement: normalizeChoice(next.placement, PLACEMENTS, "map"),
    size: normalizeChoice(next.size, SIZES, "md"),
    variant: normalizeChoice(next.variant, VARIANTS, "neutral"),
    chrome: next.chrome !== false,
    labels: normalizeChoice(next.labels, LABEL_MODES, "auto"),
    disabled: next.disabled === true,
    busy: next.busy === true,
    features: normalizeFeatures(next.features),
    selectedFeatureId: String(next.selectedFeatureId || ""),
    measurement: normalizeMeasurement(next.measurement),
    adapter: next.adapter && typeof next.adapter === "object" ? next.adapter : null,
    className: String(next.className || ""),
    ariaLabel: String(next.ariaLabel || DEFAULT_OPTIONS.ariaLabel),
    emptyText: String(next.emptyText || DEFAULT_OPTIONS.emptyText),
    onModeChange: typeof next.onModeChange === "function" ? next.onModeChange : null,
    onAction: typeof next.onAction === "function" ? next.onAction : null,
    onCreate: typeof next.onCreate === "function" ? next.onCreate : null,
    onUpdate: typeof next.onUpdate === "function" ? next.onUpdate : null,
    onDelete: typeof next.onDelete === "function" ? next.onDelete : null,
    onSelect: typeof next.onSelect === "function" ? next.onSelect : null,
  };
}

function normalizeModes(modes) {
  const values = Array.isArray(modes) ? modes : DEFAULT_OPTIONS.modes;
  return values.map((mode) => normalizeMode(mode)).filter(Boolean).filter(unique);
}

function normalizeActions(actions) {
  const values = Array.isArray(actions) ? actions : DEFAULT_OPTIONS.actions;
  return values.map((action) => normalizeAction(action)).filter(Boolean).filter(unique);
}

function normalizeMode(mode, availableModes = null) {
  const value = String(mode || "select").toLowerCase();
  if (!MODES.has(value)) {
    return availableModes?.[0] || "select";
  }
  if (Array.isArray(availableModes) && availableModes.length && !availableModes.includes(value)) {
    return availableModes[0];
  }
  return value;
}

function normalizeAction(action) {
  const value = String(action || "").toLowerCase();
  return ACTIONS.has(value) ? value : "";
}

function normalizeChoice(value, allowed, fallback) {
  const next = String(value || fallback).toLowerCase();
  return allowed.has(next) ? next : fallback;
}

function normalizeFeatures(features) {
  if (!Array.isArray(features)) {
    return [];
  }
  return features.map((feature, index) => normalizeFeature(feature, index)).filter(Boolean);
}

function normalizeFeature(feature, index = 0) {
  if (!feature || typeof feature !== "object") {
    return null;
  }
  const id = normalizeFeatureId(feature) || `feature-${index + 1}`;
  const geometry = feature.geometry && typeof feature.geometry === "object" ? clonePlain(feature.geometry) : null;
  return {
    ...clonePlain(feature),
    type: "Feature",
    id,
    geometry,
    properties: feature.properties && typeof feature.properties === "object" ? { ...feature.properties } : {},
  };
}

function normalizeFeatureId(payload) {
  if (typeof payload === "string" || typeof payload === "number") {
    return String(payload);
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }
  return String(payload.id || payload.featureId || payload.feature?.id || "");
}

function normalizeMeasurement(measurement) {
  if (!measurement || typeof measurement !== "object") {
    return null;
  }
  return {
    distanceMeters: normalizeNumber(measurement.distanceMeters),
    areaSquareMeters: normalizeNumber(measurement.areaSquareMeters),
    radiusMeters: normalizeNumber(measurement.radiusMeters),
    label: String(measurement.label || ""),
  };
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function buildMeasurementLabel(measurement) {
  if (measurement.label) {
    return measurement.label;
  }
  if (measurement.radiusMeters !== null) {
    return `Radius ${formatMeters(measurement.radiusMeters)}`;
  }
  if (measurement.distanceMeters !== null) {
    return `Distance ${formatMeters(measurement.distanceMeters)}`;
  }
  if (measurement.areaSquareMeters !== null) {
    return `Area ${formatArea(measurement.areaSquareMeters)}`;
  }
  return "No measurement";
}

function formatMeters(value) {
  if (value >= 1000) {
    return `${formatNumber(value / 1000)} km`;
  }
  return `${formatNumber(value)} m`;
}

function formatArea(value) {
  if (value >= 1000000) {
    return `${formatNumber(value / 1000000)} sq km`;
  }
  return `${formatNumber(value)} sq m`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function buildRootClass(options) {
  return [
    "ui-map-drawing",
    `ui-map-drawing--${options.orientation}`,
    `ui-map-drawing--${options.placement}`,
    `ui-map-drawing--${options.size}`,
    `ui-map-drawing--${options.variant}`,
    `ui-map-drawing--labels-${options.labels}`,
    options.chrome === false ? "is-chrome-less" : "",
    options.disabled ? "is-disabled" : "",
    options.busy ? "is-busy" : "",
    options.className,
  ].filter(Boolean).join(" ");
}

function unique(value, index, array) {
  return array.indexOf(value) === index;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

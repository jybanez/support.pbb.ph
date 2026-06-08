import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  map: null,
  controls: ["zoom", "compass", "pitch", "locate", "fit", "layers"],
  layers: [],
  pitchPresets: [
    { value: 0, label: "2D" },
    { value: 45, label: "45" },
    { value: 60, label: "3D" },
  ],
  locateTitle: "Locate",
  fitTitle: "Fit view",
  zoomInTitle: "Zoom in",
  zoomOutTitle: "Zoom out",
  resetNorthTitle: "Reset north",
  layersTitle: "Layers",
  ariaLabel: "Map controls",
  className: "",
  placement: "top-right",
  orientation: "vertical",
  compact: false,
  onZoomIn: null,
  onZoomOut: null,
  onResetNorth: null,
  onPitchChange: null,
  onLocate: null,
  onFit: null,
  onLayerToggle: null,
};

export function createMapControls(container, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let root = null;
  let bearingNeedle = null;
  let pitchButtons = new Map();
  let layerButtons = new Map();
  let layerOpen = false;
  let mapOffs = [];

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearMapEvents();
    clearNode(container);
    pitchButtons = new Map();
    layerButtons = new Map();

    root = createElement("section", {
      className: buildRootClassName(currentOptions),
      attrs: {
        role: "group",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    currentOptions.controls.forEach((control) => {
      if (control === "zoom") {
        root.appendChild(renderZoom());
      } else if (control === "compass") {
        root.appendChild(renderCompass());
      } else if (control === "pitch") {
        root.appendChild(renderPitch());
      } else if (control === "locate") {
        root.appendChild(renderAction("locate", "◎", currentOptions.locateTitle, handleLocate));
      } else if (control === "fit") {
        root.appendChild(renderAction("fit", "□", currentOptions.fitTitle, handleFit));
      } else if (control === "layers") {
        root.appendChild(renderLayers());
      }
    });

    container.appendChild(root);
    bindMapEvents();
    syncFromMap();
  }

  function renderZoom() {
    const group = createElement("div", { className: "ui-map-controls__group", attrs: { role: "group", "aria-label": "Zoom controls" } });
    group.appendChild(renderAction("zoom-in", "+", currentOptions.zoomInTitle, handleZoomIn));
    group.appendChild(renderAction("zoom-out", "-", currentOptions.zoomOutTitle, handleZoomOut));
    return group;
  }

  function renderCompass() {
    const button = renderAction("compass", "N", currentOptions.resetNorthTitle, handleResetNorth);
    button.classList.add("ui-map-controls__compass");
    bearingNeedle = createElement("span", {
      className: "ui-map-controls__compass-needle",
      attrs: { "aria-hidden": "true" },
    });
    bearingNeedle.appendChild(createElement("span", { className: "ui-map-controls__compass-arrow", text: "▲" }));
    button.prepend(bearingNeedle);
    return button;
  }

  function renderPitch() {
    const group = createElement("div", { className: "ui-map-controls__group ui-map-controls__pitch", attrs: { role: "group", "aria-label": "Pitch controls" } });
    currentOptions.pitchPresets.forEach((preset) => {
      const button = renderAction(`pitch-${preset.value}`, preset.label, `Set pitch ${preset.value} degrees`, () => handlePitch(preset.value));
      button.dataset.pitch = String(preset.value);
      pitchButtons.set(String(preset.value), button);
      group.appendChild(button);
    });
    return group;
  }

  function renderLayers() {
    const wrap = createElement("div", { className: "ui-map-controls__layers" });
    const trigger = renderAction("layers", "☰", currentOptions.layersTitle, () => {
      layerOpen = !layerOpen;
      syncLayerOpen(wrap, trigger);
    });
    trigger.setAttribute("aria-expanded", layerOpen ? "true" : "false");
    wrap.appendChild(trigger);

    const panel = createElement("div", {
      className: "ui-map-controls__layers-panel",
      attrs: { role: "group", "aria-label": "Map layers" },
    });
    currentOptions.layers.forEach((layer) => {
      const row = createElement("label", { className: "ui-map-controls__layer" });
      const input = createElement("input", {
        attrs: {
          type: "checkbox",
          checked: layer.checked ? "checked" : null,
        },
      });
      input.checked = Boolean(layer.checked);
      input.dataset.layerId = layer.id;
      row.appendChild(input);
      row.appendChild(createElement("span", { text: layer.label }));
      events.on(input, "change", () => handleLayerToggle(layer.id, input.checked));
      panel.appendChild(row);
      layerButtons.set(layer.id, input);
    });
    wrap.appendChild(panel);
    syncLayerOpen(wrap, trigger);
    return wrap;
  }

  function renderAction(id, text, title, handler) {
    const button = createElement("button", {
      className: "ui-map-controls__button",
      text,
      attrs: {
        type: "button",
        title,
        "aria-label": title,
      },
      dataset: { control: id },
    });
    events.on(button, "click", handler);
    return button;
  }

  function handleZoomIn() {
    if (typeof currentOptions.onZoomIn === "function") {
      currentOptions.onZoomIn({ map: currentOptions.map });
    } else {
      currentOptions.map?.zoomIn?.();
    }
  }

  function handleZoomOut() {
    if (typeof currentOptions.onZoomOut === "function") {
      currentOptions.onZoomOut({ map: currentOptions.map });
    } else {
      currentOptions.map?.zoomOut?.();
    }
  }

  function handleResetNorth() {
    if (typeof currentOptions.onResetNorth === "function") {
      currentOptions.onResetNorth({ map: currentOptions.map });
    } else {
      easeMap({ bearing: 0 });
    }
    syncFromMap();
  }

  function handlePitch(value) {
    if (typeof currentOptions.onPitchChange === "function") {
      currentOptions.onPitchChange({ pitch: value, map: currentOptions.map });
    } else {
      easeMap({ pitch: value });
    }
    syncFromMap();
  }

  function handleLocate() {
    if (typeof currentOptions.onLocate === "function") {
      currentOptions.onLocate({ map: currentOptions.map });
    }
  }

  function handleFit() {
    if (typeof currentOptions.onFit === "function") {
      currentOptions.onFit({ map: currentOptions.map });
    }
  }

  function handleLayerToggle(layerId, checked) {
    currentOptions.layers = currentOptions.layers.map((layer) => (
      layer.id === layerId ? { ...layer, checked } : layer
    ));
    const map = currentOptions.map;
    if (map?.setLayoutProperty && map?.getLayer?.(layerId)) {
      map.setLayoutProperty(layerId, "visibility", checked ? "visible" : "none");
    }
    if (typeof currentOptions.onLayerToggle === "function") {
      currentOptions.onLayerToggle({ layerId, checked, map });
    }
  }

  function easeMap(next) {
    if (currentOptions.map?.easeTo) {
      currentOptions.map.easeTo(next);
    }
  }

  function bindMapEvents() {
    const map = currentOptions.map;
    if (!map?.on || !map?.off) {
      return;
    }
    clearMapEvents();
    ["rotate", "pitch", "move"].forEach((eventName) => {
      map.on(eventName, syncFromMap);
      mapOffs.push(() => map.off(eventName, syncFromMap));
    });
  }

  function clearMapEvents() {
    mapOffs.splice(0).forEach((off) => off());
  }

  function syncFromMap() {
    const map = currentOptions.map;
    const bearing = Number(map?.getBearing?.() || 0);
    const pitch = Number(map?.getPitch?.() || 0);
    if (bearingNeedle) {
      bearingNeedle.style.transform = `rotate(${-bearing}deg)`;
    }
    pitchButtons.forEach((button, value) => {
      const active = Math.round(pitch) === Number(value);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncLayerOpen(wrap, trigger) {
    wrap.classList.toggle("is-open", layerOpen);
    trigger.setAttribute("aria-expanded", layerOpen ? "true" : "false");
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function getState() {
    return {
      controls: [...currentOptions.controls],
      layers: currentOptions.layers.map((layer) => ({ ...layer })),
      bearing: Number(currentOptions.map?.getBearing?.() || 0),
      pitch: Number(currentOptions.map?.getPitch?.() || 0),
      layerOpen,
    };
  }

  function destroy() {
    events.clear();
    clearMapEvents();
    clearNode(container);
    root = null;
    bearingNeedle = null;
    pitchButtons = new Map();
    layerButtons = new Map();
  }

  const api = {
    destroy,
    getState,
    syncFromMap,
    update,
  };

  render();
  return api;
}

function normalizeOptions(input) {
  const next = { ...DEFAULT_OPTIONS, ...(input || {}) };
  return {
    ...next,
    controls: normalizeControls(next.controls),
    layers: normalizeLayers(next.layers),
    pitchPresets: normalizePitchPresets(next.pitchPresets),
    placement: normalizePlacement(next.placement),
    orientation: normalizeOrientation(next.orientation),
    compact: Boolean(next.compact),
    ariaLabel: String(next.ariaLabel || "Map controls"),
    className: String(next.className || ""),
  };
}

function normalizeControls(controls) {
  const allowed = ["zoom", "compass", "pitch", "locate", "fit", "layers"];
  const source = Array.isArray(controls) ? controls : DEFAULT_OPTIONS.controls;
  return source.map((item) => String(item)).filter((item, index, all) => allowed.includes(item) && all.indexOf(item) === index);
}

function normalizeLayers(layers) {
  if (!Array.isArray(layers)) {
    return [];
  }
  return layers
    .map((layer) => ({
      id: String(layer?.id || ""),
      label: String(layer?.label || layer?.id || "Layer"),
      checked: layer?.checked !== false,
    }))
    .filter((layer) => layer.id);
}

function normalizePitchPresets(presets) {
  if (!Array.isArray(presets)) {
    return DEFAULT_OPTIONS.pitchPresets;
  }
  return presets
    .map((preset) => ({
      value: clampPitch(Number(preset?.value ?? preset)),
      label: String(preset?.label ?? Math.round(Number(preset?.value ?? preset))),
    }))
    .filter((preset, index, all) => all.findIndex((item) => item.value === preset.value) === index);
}

function clampPitch(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(85, Math.round(value)));
}

function normalizePlacement(value) {
  const next = String(value || "top-right").toLowerCase();
  return ["top-left", "top-right", "bottom-left", "bottom-right"].includes(next) ? next : "top-right";
}

function normalizeOrientation(value) {
  const next = String(value || "vertical").toLowerCase();
  return next === "horizontal" ? "horizontal" : "vertical";
}

function buildRootClassName(options) {
  return [
    "ui-map-controls",
    `ui-map-controls--${options.placement}`,
    `ui-map-controls--${options.orientation}`,
    options.compact ? "is-compact" : "",
    options.className,
  ].filter(Boolean).join(" ");
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createIcon } from "./ui.icons.js?v=0.21.86";

const DEFAULT_OPTIONS = {
  ariaLabel: "Map legend",
  className: "",
  title: "",
  sections: [],
  compact: false,
  collapsible: false,
  defaultCollapsed: false,
  showCounts: true,
  emptyText: "No legend items to display.",
  onToggle: null,
};

const ALLOWED_TONES = new Set(["neutral", "info", "success", "warning", "danger", "critical"]);
const ALLOWED_SWATCHES = new Set(["solid", "outline", "dashed", "gradient", "marker", "line"]);
const ALLOWED_MARKERS = new Set(["pin", "dot", "cluster", "hub", "hotspot", "route"]);

export function createMapLegend(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createMapLegend] A container element is required.");
  }

  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let collapsed = currentOptions.defaultCollapsed;
  let destroyed = false;
  let root = null;

  function render() {
    if (destroyed) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: buildRootClass(currentOptions, collapsed),
      attrs: {
        "aria-label": currentOptions.ariaLabel,
        "aria-expanded": currentOptions.collapsible ? String(!collapsed) : null,
      },
      dataset: {
        compact: currentOptions.compact ? "true" : "false",
        collapsible: currentOptions.collapsible ? "true" : "false",
        collapsed: collapsed ? "true" : "false",
      },
    });

    if (currentOptions.title || currentOptions.collapsible) {
      root.appendChild(renderHeader());
    }

    const body = createElement("div", { className: "ui-map-legend-body" });
    if (!currentOptions.sections.length || !countItems(currentOptions.sections)) {
      body.appendChild(createElement("div", {
        className: "ui-map-legend-empty",
        text: currentOptions.emptyText,
      }));
    } else {
      currentOptions.sections.forEach((section) => {
        body.appendChild(renderSection(section));
      });
    }
    root.appendChild(body);
    container.appendChild(root);
  }

  function renderHeader() {
    const header = createElement("div", { className: "ui-map-legend-header" });
    if (currentOptions.title) {
      header.appendChild(createElement("h3", { className: "ui-map-legend-title", text: currentOptions.title }));
    }
    if (currentOptions.collapsible) {
      const button = createElement("button", {
        className: "ui-map-legend-toggle",
        text: collapsed ? "Show" : "Hide",
        attrs: {
          type: "button",
          "aria-label": collapsed ? "Show map legend" : "Hide map legend",
          "aria-expanded": String(!collapsed),
        },
      });
      events.on(button, "click", () => {
        collapsed = !collapsed;
        currentOptions.onToggle?.({ collapsed, expanded: !collapsed });
        render();
      });
      header.appendChild(button);
    }
    return header;
  }

  function renderSection(section) {
    const node = createElement("div", {
      className: "ui-map-legend-section",
      dataset: { id: section.id },
    });
    if (section.title || section.description) {
      const header = createElement("div", { className: "ui-map-legend-section-header" });
      if (section.title) {
        header.appendChild(createElement("h4", { className: "ui-map-legend-section-title", text: section.title }));
      }
      if (section.description) {
        header.appendChild(createElement("p", { className: "ui-map-legend-section-description", text: section.description }));
      }
      node.appendChild(header);
    }

    const list = createElement("div", { className: "ui-map-legend-items", attrs: { role: "list" } });
    section.items.forEach((item) => {
      list.appendChild(renderItem(item));
    });
    node.appendChild(list);
    return node;
  }

  function renderItem(item) {
    const row = createElement("div", {
      className: buildItemClass(item),
      attrs: {
        role: "listitem",
        "aria-label": buildItemLabel(item),
      },
      dataset: {
        id: item.id,
        tone: item.tone,
        swatch: item.swatch,
        marker: item.marker,
        disabled: item.disabled ? "true" : "false",
      },
    });
    if (item.color) {
      row.style.setProperty("--ui-map-legend-color", item.color);
    }

    row.appendChild(renderSample(item));

    const text = createElement("span", { className: "ui-map-legend-item-text" });
    text.appendChild(createElement("span", { className: "ui-map-legend-item-label", text: item.label }));
    if (item.description && !currentOptions.compact) {
      text.appendChild(createElement("span", { className: "ui-map-legend-item-description", text: item.description }));
    }
    row.appendChild(text);

    if (currentOptions.showCounts && item.count !== null && item.count !== "") {
      row.appendChild(createElement("span", { className: "ui-map-legend-count", text: item.count }));
    }
    return row;
  }

  function renderSample(item) {
    const sample = createElement("span", {
      className: "ui-map-legend-sample",
      attrs: { "aria-hidden": "true" },
    });

    if (item.icon) {
      try {
        sample.appendChild(createIcon(item.icon, { size: currentOptions.compact ? 14 : 16 }));
        return sample;
      } catch (_error) {
        // Fall through to marker/swatch rendering if the icon id is not available.
      }
    }

    if (item.marker) {
      sample.appendChild(createElement("span", { className: `ui-map-legend-marker ui-map-legend-marker--${item.marker}` }));
      return sample;
    }

    sample.appendChild(createElement("span", { className: `ui-map-legend-swatch ui-map-legend-swatch--${item.swatch}` }));
    return sample;
  }

  function update(nextOptions = {}) {
    const merged = { ...currentOptions, ...(nextOptions || {}) };
    currentOptions = normalizeOptions(merged);
    if (Object.prototype.hasOwnProperty.call(nextOptions || {}, "defaultCollapsed")) {
      collapsed = currentOptions.defaultCollapsed;
    }
    render();
  }

  function setSections(sections = []) {
    currentOptions = normalizeOptions({ ...currentOptions, sections });
    render();
  }

  function getState() {
    return {
      options: {
        ...currentOptions,
        sections: currentOptions.sections.map(cloneSection),
        onToggle: currentOptions.onToggle,
      },
      collapsed,
      expanded: !collapsed,
    };
  }

  function destroy() {
    destroyed = true;
    events.clear();
    clearNode(container);
    root = null;
  }

  render();

  return {
    destroy,
    getState,
    setSections,
    update,
  };
}

function normalizeOptions(input = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(input || {}) };
  return {
    ...next,
    ariaLabel: String(next.ariaLabel || DEFAULT_OPTIONS.ariaLabel),
    className: String(next.className || ""),
    title: String(next.title || ""),
    sections: normalizeSections(next.sections),
    compact: next.compact === true,
    collapsible: next.collapsible === true,
    defaultCollapsed: next.defaultCollapsed === true,
    showCounts: next.showCounts !== false,
    emptyText: String(next.emptyText || DEFAULT_OPTIONS.emptyText),
    onToggle: typeof next.onToggle === "function" ? next.onToggle : null,
  };
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) {
    return [];
  }
  return sections.map((section, index) => normalizeSection(section, index)).filter(Boolean);
}

function normalizeSection(section, index) {
  if (!section || typeof section !== "object") {
    return null;
  }
  return {
    id: String(section.id || section.title || `section-${index}`),
    title: String(section.title || ""),
    description: String(section.description || ""),
    items: normalizeItems(section.items),
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item, index) => normalizeItem(item, index)).filter(Boolean);
}

function normalizeItem(item, index) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const id = String(item.id || item.label || `item-${index}`);
  const marker = normalizeMarker(item.marker);
  return {
    id,
    label: String(item.label || id),
    description: String(item.description || ""),
    tone: normalizeTone(item.tone),
    color: String(item.color || ""),
    icon: String(item.icon || ""),
    swatch: normalizeSwatch(item.swatch || (marker ? "marker" : "solid")),
    marker,
    count: item.count === null || item.count === undefined ? "" : String(item.count),
    disabled: item.disabled === true,
  };
}

function normalizeTone(value) {
  const tone = String(value || "neutral").toLowerCase();
  return ALLOWED_TONES.has(tone) ? tone : "neutral";
}

function normalizeSwatch(value) {
  const swatch = String(value || "solid").toLowerCase();
  return ALLOWED_SWATCHES.has(swatch) ? swatch : "solid";
}

function normalizeMarker(value) {
  const marker = String(value || "").toLowerCase();
  return ALLOWED_MARKERS.has(marker) ? marker : "";
}

function buildRootClass(options, collapsed) {
  return [
    "ui-map-legend",
    options.compact ? "is-compact" : "",
    options.collapsible ? "is-collapsible" : "",
    collapsed ? "is-collapsed" : "",
    options.className,
  ].filter(Boolean).join(" ");
}

function buildItemClass(item) {
  return [
    "ui-map-legend-item",
    `ui-map-legend-item--${item.tone}`,
    item.disabled ? "is-disabled" : "",
  ].filter(Boolean).join(" ");
}

function buildItemLabel(item) {
  const parts = [item.label];
  if (item.description) {
    parts.push(item.description);
  }
  if (item.count !== "") {
    parts.push(`${item.count} count`);
  }
  if (item.disabled) {
    parts.push("disabled");
  }
  return parts.join(", ");
}

function countItems(sections) {
  return sections.reduce((total, section) => total + section.items.length, 0);
}

function cloneSection(section) {
  return {
    ...section,
    items: section.items.map((item) => ({ ...item })),
  };
}

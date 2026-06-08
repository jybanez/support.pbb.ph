import { createElement, clearNode } from "./ui.dom.js";
import { createIcon } from "./ui.icons.js?v=0.21.84";

const DEFAULT_OPTIONS = {
  ariaLabel: "Key metrics",
  className: "",
  columns: "auto",
  size: "md",
  chrome: true,
  selectable: false,
  selectedId: "",
  emptyText: "No metrics to display.",
  formatter: null,
  onSelect: null,
};

const ALLOWED_TONES = new Set(["neutral", "info", "success", "warning", "danger", "critical"]);
const ALLOWED_SIZES = new Set(["sm", "md", "lg"]);
const ALLOWED_TRENDS = new Set(["up", "down", "flat"]);

export function createStatCards(container, items = [], options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createStatCards] A container element is required.");
  }

  let currentItems = normalizeItems(items);
  let currentOptions = normalizeOptions(options);
  let root = null;
  let destroyed = false;

  function render() {
    if (destroyed) {
      return;
    }
    clearNode(container);
    root = createElement("section", {
      className: buildRootClass(currentOptions),
      attrs: {
        "aria-label": currentOptions.ariaLabel,
      },
      dataset: {
        columns: currentOptions.columns,
        size: currentOptions.size,
        chrome: currentOptions.chrome ? "true" : "false",
        selectable: currentOptions.selectable ? "true" : "false",
      },
    });

    if (!currentItems.length) {
      root.appendChild(createElement("div", {
        className: "ui-stat-cards-empty",
        text: currentOptions.emptyText,
      }));
      container.appendChild(root);
      return;
    }

    currentItems.forEach((item) => {
      root.appendChild(renderCard(item));
    });
    container.appendChild(root);
  }

  function renderCard(item) {
    const selected = item.id === currentOptions.selectedId;
    const interactive = currentOptions.selectable && typeof currentOptions.onSelect === "function";
    const tagName = interactive ? "button" : "article";
    const card = createElement(tagName, {
      className: buildCardClass(item, selected, interactive),
      attrs: {
        type: interactive ? "button" : null,
        "aria-label": buildCardAriaLabel(item),
        "aria-pressed": interactive ? String(selected) : null,
        title: item.detail || item.note || item.label,
      },
      dataset: {
        id: item.id,
        tone: item.tone,
        selected: selected ? "true" : "false",
      },
    });

    if (interactive) {
      card.addEventListener("click", () => {
        currentOptions.selectedId = item.id;
        currentOptions.onSelect?.({ ...item }, { id: item.id, item: { ...item } });
        render();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          card.click();
        }
      });
    }

    const header = createElement("div", { className: "ui-stat-card-header" });
    if (item.icon) {
      const iconWrap = createElement("span", {
        className: "ui-stat-card-icon",
        attrs: { "aria-hidden": "true" },
      });
      try {
        iconWrap.appendChild(createIcon(item.icon, { size: iconSize(currentOptions.size) }));
      } catch (_error) {
        iconWrap.appendChild(createIcon("status.info", { size: iconSize(currentOptions.size) }));
      }
      header.appendChild(iconWrap);
    }

    const textWrap = createElement("span", { className: "ui-stat-card-title-wrap" });
    textWrap.appendChild(createElement("span", { className: "ui-stat-card-label", text: item.label }));
    if (item.unit) {
      textWrap.appendChild(createElement("span", { className: "ui-stat-card-unit", text: item.unit }));
    }
    header.appendChild(textWrap);
    card.appendChild(header);

    const valueRow = createElement("div", { className: "ui-stat-card-value-row" });
    valueRow.appendChild(createElement("span", {
      className: "ui-stat-card-value",
      text: formatValue(item.value, item, currentOptions),
    }));
    if (item.trend) {
      const trend = createElement("span", {
        className: `ui-stat-card-trend ui-stat-card-trend--${item.trend.direction}`,
        text: item.trend.label,
        attrs: { "aria-label": `Trend: ${item.trend.label}` },
        dataset: { direction: item.trend.direction },
      });
      valueRow.appendChild(trend);
    }
    card.appendChild(valueRow);

    if (item.note) {
      card.appendChild(createElement("span", { className: "ui-stat-card-note", text: item.note }));
    }
    if (item.action?.label) {
      card.appendChild(createElement("span", {
        className: "ui-stat-card-action",
        text: item.action.label,
        dataset: { value: item.action.value || item.id },
      }));
    }

    return card;
  }

  function update(nextItems = currentItems, nextOptions = {}) {
    currentItems = normalizeItems(nextItems);
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function setItems(nextItems = []) {
    update(nextItems);
  }

  function getState() {
    return {
      items: currentItems.map((item) => clonePlain(item)),
      options: { ...currentOptions, formatter: currentOptions.formatter, onSelect: currentOptions.onSelect },
      selectedId: currentOptions.selectedId,
    };
  }

  function destroy() {
    destroyed = true;
    clearNode(container);
    root = null;
  }

  render();

  return {
    destroy,
    getState,
    setItems,
    update,
  };
}

function normalizeOptions(input = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(input || {}) };
  return {
    ...next,
    ariaLabel: String(next.ariaLabel || DEFAULT_OPTIONS.ariaLabel),
    className: String(next.className || ""),
    columns: normalizeColumns(next.columns),
    size: normalizeSize(next.size),
    chrome: next.chrome !== false,
    selectable: next.selectable === true,
    selectedId: String(next.selectedId || ""),
    emptyText: String(next.emptyText || DEFAULT_OPTIONS.emptyText),
    formatter: typeof next.formatter === "function" ? next.formatter : null,
    onSelect: typeof next.onSelect === "function" ? next.onSelect : null,
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
  const id = String(item.id || item.label || `stat-${index}`);
  const label = String(item.label || id);
  const trend = normalizeTrend(item.trend);
  const action = item.action && typeof item.action === "object"
    ? {
        label: String(item.action.label || ""),
        value: String(item.action.value || ""),
      }
    : null;
  return {
    id,
    label,
    value: item.value ?? "",
    unit: String(item.unit || ""),
    note: String(item.note || ""),
    detail: String(item.detail || ""),
    icon: String(item.icon || ""),
    tone: normalizeTone(item.tone),
    trend,
    action,
    meta: item.meta && typeof item.meta === "object" ? { ...item.meta } : {},
  };
}

function normalizeTrend(trend) {
  if (!trend || typeof trend !== "object") {
    return null;
  }
  const direction = String(trend.direction || "flat").toLowerCase();
  return {
    direction: ALLOWED_TRENDS.has(direction) ? direction : "flat",
    label: String(trend.label || ""),
  };
}

function normalizeTone(value) {
  const tone = String(value || "neutral").toLowerCase();
  return ALLOWED_TONES.has(tone) ? tone : "neutral";
}

function normalizeSize(value) {
  const size = String(value || "md").toLowerCase();
  return ALLOWED_SIZES.has(size) ? size : "md";
}

function normalizeColumns(value) {
  const next = String(value || "auto").toLowerCase();
  return ["auto", "1", "2", "3", "4"].includes(next) ? next : "auto";
}

function buildRootClass(options) {
  return [
    "ui-stat-cards",
    `ui-stat-cards--${options.size}`,
    `ui-stat-cards--columns-${options.columns}`,
    options.chrome ? "" : "is-chrome-less",
    options.selectable ? "is-selectable" : "",
    options.className,
  ].filter(Boolean).join(" ");
}

function buildCardClass(item, selected, interactive) {
  return [
    "ui-stat-card",
    `ui-stat-card--${item.tone}`,
    selected ? "is-selected" : "",
    interactive ? "is-interactive" : "",
  ].filter(Boolean).join(" ");
}

function buildCardAriaLabel(item) {
  const parts = [item.label, formatRawValue(item.value)];
  if (item.unit) {
    parts.push(item.unit);
  }
  if (item.note) {
    parts.push(item.note);
  }
  if (item.trend?.label) {
    parts.push(`Trend ${item.trend.label}`);
  }
  return parts.filter(Boolean).join(", ");
}

function formatValue(value, item, options) {
  if (options.formatter) {
    return String(options.formatter(value, item));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat().format(value);
  }
  return formatRawValue(value);
}

function formatRawValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function iconSize(size) {
  if (size === "lg") {
    return 24;
  }
  if (size === "sm") {
    return 18;
  }
  return 20;
}

function clonePlain(item) {
  return {
    ...item,
    trend: item.trend ? { ...item.trend } : null,
    action: item.action ? { ...item.action } : null,
    meta: { ...item.meta },
  };
}

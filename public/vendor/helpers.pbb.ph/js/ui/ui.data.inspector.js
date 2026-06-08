import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  chrome: true,
  ariaLabel: "Data inspector",
  expandDepth: 1,
  emptyText: "No data.",
  onCopyPath: null,
};

export function createDataInspector(container, data = null, options = {}) {
  const events = createEventBag();
  let currentData = data;
  let currentOptions = normalizeOptions(options);

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    const root = createElement("section", {
      className: `ui-data-inspector${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className || ""}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });
    if (currentData == null) {
      root.appendChild(createElement("p", { className: "ui-data-inspector-empty", text: currentOptions.emptyText }));
      container.appendChild(root);
      return;
    }

    const tree = renderNode("(root)", currentData, "$", 0);
    root.appendChild(tree);
    container.appendChild(root);
  }

  function renderNode(key, value, path, depth) {
    const type = getValueType(value);
    const node = createElement("article", { className: "ui-data-inspector-node" });
    const header = createElement("div", { className: "ui-data-inspector-head" });
    const keyEl = createElement("span", { className: "ui-data-inspector-key", text: key });
    const typeEl = createElement("span", { className: "ui-data-inspector-type", text: type });
    const copyBtn = createElement("button", {
      className: "ui-button ui-data-inspector-copy",
      text: "Copy Path",
      attrs: { type: "button" },
    });
    events.on(copyBtn, "click", () => {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(path).catch(() => {});
      }
      currentOptions.onCopyPath?.(path, value);
    });
    header.append(keyEl, typeEl, copyBtn);
    node.appendChild(header);

    if (type === "object" || type === "array") {
      const details = createElement("details", {
        className: "ui-data-inspector-branch",
        attrs: { open: depth < currentOptions.expandDepth ? "open" : null },
      });
      const summary = createElement("summary", {
        className: "ui-data-inspector-summary",
        text: type === "array" ? `Array(${value.length})` : `Object(${Object.keys(value).length})`,
      });
      details.appendChild(summary);
      const list = createElement("div", { className: "ui-data-inspector-children" });
      const entries = type === "array"
        ? value.map((entry, index) => [String(index), entry])
        : Object.entries(value);
      entries.forEach(([childKey, childValue]) => {
        const childPath = type === "array" ? `${path}[${childKey}]` : `${path}.${childKey}`;
        list.appendChild(renderNode(childKey, childValue, childPath, depth + 1));
      });
      details.appendChild(list);
      node.appendChild(details);
    } else {
      node.appendChild(createElement("pre", {
        className: "ui-data-inspector-value",
        text: stringifyValue(value),
      }));
    }

    return node;
  }

  function update(nextData = currentData, nextOptions = {}) {
    currentData = nextData;
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function getState() {
    return {
      data: currentData,
      options: { ...currentOptions },
    };
  }

  function destroy() {
    events.clear();
    clearNode(container);
  }

  render();
  return { update, getState, destroy };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.chrome = next.chrome !== false;
  next.ariaLabel = String(next.ariaLabel || "Data inspector");
  next.expandDepth = Math.max(0, Number(next.expandDepth) || 0);
  return next;
}

function getValueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function stringifyValue(value) {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

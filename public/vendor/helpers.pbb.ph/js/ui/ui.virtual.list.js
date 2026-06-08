import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  chrome: true,
  ariaLabel: "Virtual list",
  height: 320,
  rowHeight: 36,
  overscan: 6,
  emptyText: "No items.",
  renderItem: null, // (item, index) => HTMLElement | string
  onRangeChange: null,
};

export function createVirtualList(container, items = [], options = {}) {
  const events = createEventBag();
  const rowEvents = createEventBag();
  let currentItems = normalizeItems(items);
  let currentOptions = normalizeOptions(options);
  let root = null;
  let viewport = null;
  let layer = null;
  let scrollTop = 0;
  let lastRange = { start: 0, end: -1 };

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    rowEvents.clear();
    clearNode(container);

    root = createElement("section", {
      className: `ui-virtual-list${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className || ""}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    if (!currentItems.length) {
      root.appendChild(createElement("p", {
        className: "ui-virtual-list-empty",
        text: currentOptions.emptyText,
      }));
      container.appendChild(root);
      return;
    }

    viewport = createElement("div", { className: "ui-virtual-list-viewport" });
    viewport.setAttribute("role", "list");
    viewport.setAttribute("aria-label", currentOptions.ariaLabel);
    viewport.style.height = `${Math.max(120, currentOptions.height)}px`;
    layer = createElement("div", { className: "ui-virtual-list-layer" });
    viewport.appendChild(layer);
    root.appendChild(viewport);
    container.appendChild(root);

    events.on(viewport, "scroll", () => {
      scrollTop = viewport.scrollTop;
      renderRows();
    });
    viewport.scrollTop = Math.max(0, scrollTop);
    renderRows();
  }

  function renderRows() {
    if (!viewport || !layer) {
      return;
    }
    rowEvents.clear();
    clearNode(layer);

    const rowHeight = Math.max(20, currentOptions.rowHeight);
    const total = currentItems.length;
    const viewportHeight = viewport.clientHeight || currentOptions.height;
    const overscan = Math.max(0, currentOptions.overscan);
    const start = Math.max(0, Math.floor((viewport.scrollTop || 0) / rowHeight) - overscan);
    const end = Math.min(total, Math.ceil(((viewport.scrollTop || 0) + viewportHeight) / rowHeight) + overscan);
    layer.style.height = `${Math.max(1, total * rowHeight)}px`;

    for (let index = start; index < end; index += 1) {
      const item = currentItems[index];
      const row = createElement("article", {
        className: "ui-virtual-list-row",
        attrs: { "data-index": String(index), role: "listitem" },
      });
      row.style.top = `${index * rowHeight}px`;
      row.style.height = `${rowHeight}px`;
      const content = renderItemContent(item, index, currentOptions.renderItem);
      if (content instanceof HTMLElement) {
        row.appendChild(content);
      } else {
        row.textContent = String(content);
      }
      layer.appendChild(row);
    }

    if (start !== lastRange.start || end !== lastRange.end) {
      lastRange = { start, end: end - 1 };
      currentOptions.onRangeChange?.(lastRange, getState());
    }
  }

  function update(nextItems = currentItems, nextOptions = {}) {
    currentItems = normalizeItems(nextItems);
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    if (!currentItems.length) {
      scrollTop = 0;
    } else {
      const maxScroll = Math.max(0, (currentItems.length * currentOptions.rowHeight) - currentOptions.height);
      scrollTop = Math.min(Math.max(0, scrollTop), maxScroll);
    }
    render();
  }

  function setItems(nextItems = []) {
    update(nextItems);
  }

  function scrollToIndex(index, behavior = "auto") {
    if (!viewport) {
      return;
    }
    const safeIndex = clamp(Math.round(Number(index) || 0), 0, Math.max(0, currentItems.length - 1));
    const target = safeIndex * currentOptions.rowHeight;
    viewport.scrollTo({ top: target, behavior });
    scrollTop = target;
    renderRows();
  }

  function getState() {
    return {
      count: currentItems.length,
      range: { ...lastRange },
      options: { ...currentOptions },
    };
  }

  function destroy() {
    events.clear();
    rowEvents.clear();
    clearNode(container);
    root = null;
    viewport = null;
    layer = null;
  }

  render();
  return {
    update,
    setItems,
    scrollToIndex,
    getState,
    destroy,
  };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.chrome = next.chrome !== false;
  next.ariaLabel = String(next.ariaLabel || "Virtual list");
  next.height = Math.max(120, Number(next.height) || 320);
  next.rowHeight = Math.max(20, Number(next.rowHeight) || 36);
  next.overscan = Math.max(0, Number(next.overscan) || 6);
  next.emptyText = String(next.emptyText || "No items.");
  next.renderItem = typeof next.renderItem === "function" ? next.renderItem : null;
  return next;
}

function normalizeItems(items) {
  return Array.isArray(items) ? items.slice() : [];
}

function renderItemContent(item, index, renderItem) {
  if (typeof renderItem === "function") {
    return renderItem(item, index);
  }
  return item?.label ?? item?.name ?? item?.title ?? `Item ${index + 1}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

import { createElement, clearNode } from "./ui.dom.js";

const DEFAULT_OPTIONS = {
  className: "",
  variant: "lines", // lines | card | grid
  lines: 4,
  columns: 3,
  rows: 2,
  animated: true,
};

export function createSkeleton(container, data = {}, options = {}) {
  let currentData = normalizeData(data);
  let currentOptions = normalizeOptions(options);

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    clearNode(container);

    const root = createElement("section", {
      className: [
        "ui-skeleton",
        `ui-skeleton--${currentOptions.variant}`,
        currentOptions.animated ? "is-animated" : "is-static",
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
    });

    if (currentOptions.variant === "card") {
      root.appendChild(createElement("span", { className: "ui-skeleton-block ui-skeleton-card-media" }));
      root.appendChild(createElement("span", { className: "ui-skeleton-block ui-skeleton-card-title" }));
      root.appendChild(createElement("span", { className: "ui-skeleton-block ui-skeleton-card-line" }));
      root.appendChild(createElement("span", { className: "ui-skeleton-block ui-skeleton-card-line is-short" }));
    } else if (currentOptions.variant === "grid") {
      const grid = createElement("div", { className: "ui-skeleton-grid" });
      grid.style.setProperty("--ui-skeleton-cols", String(currentOptions.columns));
      const total = Math.max(1, currentOptions.columns * currentData.rows);
      for (let i = 0; i < total; i += 1) {
        grid.appendChild(createElement("span", { className: "ui-skeleton-block ui-skeleton-grid-cell" }));
      }
      root.appendChild(grid);
    } else {
      for (let i = 0; i < currentData.lines; i += 1) {
        root.appendChild(createElement("span", {
          className: `ui-skeleton-block ui-skeleton-line${i === currentData.lines - 1 ? " is-short" : ""}`,
        }));
      }
    }

    container.appendChild(root);
  }

  function update(nextData = {}, nextOptions = {}) {
    currentData = normalizeData({ ...currentData, ...(nextData || {}) });
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function getState() {
    return {
      data: { ...currentData },
      options: { ...currentOptions },
    };
  }

  function destroy() {
    clearNode(container);
  }

  render();
  return { update, getState, destroy };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const variant = String(next.variant || "lines").toLowerCase();
  next.variant = ["lines", "card", "grid"].includes(variant) ? variant : "lines";
  next.columns = Math.max(1, Number(next.columns) || 3);
  next.rows = Math.max(1, Number(next.rows) || 2);
  next.animated = Boolean(next.animated);
  return next;
}

function normalizeData(data) {
  const next = (data && typeof data === "object") ? data : {};
  return {
    lines: Math.max(1, Number(next.lines) || 4),
    rows: Math.max(1, Number(next.rows) || 2),
  };
}

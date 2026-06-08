import { createElement, clearNode } from "./ui.dom.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_OPTIONS = {
  type: "bar",
  title: "",
  description: "",
  ariaLabel: "",
  className: "",
  valueLabel: "Value",
  secondaryValueLabel: "",
  size: "md",
  tone: "neutral",
  showLegend: true,
  showValues: true,
  showAxis: true,
  maxValue: null,
  sort: "input",
  emptyText: "No chart data available.",
  loading: false,
  loadingText: "Loading chart data...",
  error: "",
  formatter: null,
  onSelect: null,
  onHover: null,
};

const CHART_TYPES = new Set(["bar", "horizontal-bar", "stacked-bar", "donut", "sparkline"]);
const TONES = new Set(["neutral", "info", "success", "warning", "danger", "critical"]);
const SIZES = new Set(["sm", "md", "lg"]);
const SORTS = new Set(["input", "value-desc", "value-asc", "label"]);
const PALETTE_TONES = ["info", "success", "warning", "danger", "critical", "neutral"];

export function createChart(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createChart] A container element is required.");
  }

  let currentOptions = normalizeOptions(options);
  let currentData = normalizeData(currentOptions.data, currentOptions.type, currentOptions);
  let destroyed = false;
  let root = null;

  function render() {
    if (destroyed) {
      return;
    }
    clearNode(container);
    currentData = normalizeData(currentOptions.data, currentOptions.type, currentOptions);

    root = createElement("section", {
      className: buildRootClass(currentOptions),
      attrs: {
        role: "figure",
        "aria-label": buildAriaLabel(currentOptions),
      },
      dataset: {
        type: currentOptions.type,
        size: currentOptions.size,
        tone: currentOptions.tone,
      },
    });

    renderHeader(root);

    if (currentOptions.loading) {
      renderState(root, "loading", currentOptions.loadingText);
      container.appendChild(root);
      return;
    }

    if (currentOptions.error) {
      renderState(root, "error", currentOptions.error);
      container.appendChild(root);
      return;
    }

    if (!hasChartData(currentData, currentOptions.type)) {
      renderState(root, "empty", currentOptions.emptyText);
      container.appendChild(root);
      return;
    }

    if (currentOptions.type === "horizontal-bar") {
      renderHorizontalBar(root);
    } else if (currentOptions.type === "stacked-bar") {
      renderStackedBar(root);
    } else if (currentOptions.type === "donut") {
      renderDonut(root);
    } else if (currentOptions.type === "sparkline") {
      renderSparkline(root);
    } else {
      renderVerticalBar(root);
    }

    root.appendChild(renderSummaryTable());
    if (currentOptions.showLegend && currentOptions.type !== "sparkline") {
      root.appendChild(renderLegend());
    }
    container.appendChild(root);
  }

  function renderHeader(host) {
    if (!currentOptions.title && !currentOptions.description) {
      return;
    }
    const header = createElement("header", { className: "ui-chart-header" });
    if (currentOptions.title) {
      header.appendChild(createElement("h3", { className: "ui-chart-title", text: currentOptions.title }));
    }
    if (currentOptions.description) {
      header.appendChild(createElement("p", { className: "ui-chart-description", text: currentOptions.description }));
    }
    host.appendChild(header);
  }

  function renderState(host, kind, text) {
    host.appendChild(createElement("div", {
      className: `ui-chart-state ui-chart-state--${kind}`,
      text,
      attrs: { role: kind === "error" ? "alert" : "status" },
    }));
  }

  function renderVerticalBar(host) {
    const chart = createElement("div", { className: "ui-chart-plot ui-chart-plot--bar" });
    const svg = createSvg({ viewBox: "0 0 640 280", className: "ui-chart-svg", ariaHidden: true });
    const margin = { top: 20, right: 18, bottom: 60, left: 42 };
    const plotWidth = 640 - margin.left - margin.right;
    const plotHeight = 280 - margin.top - margin.bottom;
    const max = getSimpleMax();
    const gap = 12;
    const barWidth = Math.max(12, (plotWidth - gap * Math.max(0, currentData.length - 1)) / currentData.length);

    if (currentOptions.showAxis) {
      appendLine(svg, margin.left, margin.top + plotHeight, margin.left + plotWidth, margin.top + plotHeight, "ui-chart-axis");
    }

    currentData.forEach((item, index) => {
      const height = Math.max(2, (item.value / max) * plotHeight);
      const x = margin.left + index * (barWidth + gap);
      const y = margin.top + plotHeight - height;
      const group = createSvgElement("g", {
        class: buildItemClass(item, index),
        tabindex: isInteractive() ? "0" : null,
        role: isInteractive() ? "button" : "img",
        "aria-label": buildSimpleLabel(item),
        "data-id": item.id,
        "data-index": index,
        style: item.color ? `--ui-chart-item-color: ${item.color}` : null,
      });
      wireInteractive(group, item, index);
      appendSvg(group, "rect", {
        x,
        y,
        width: barWidth,
        height,
        rx: 4,
        class: "ui-chart-bar-rect",
      });
      if (currentOptions.showValues) {
        appendSvgText(group, x + barWidth / 2, y - 7, formatValue(item.value, item), "ui-chart-value-text", "middle");
      }
      appendSvgText(group, x + barWidth / 2, margin.top + plotHeight + 18, item.label, "ui-chart-axis-label", "middle");
      svg.appendChild(group);
    });

    chart.appendChild(svg);
    host.appendChild(chart);
  }

  function renderHorizontalBar(host) {
    const chart = createElement("div", { className: "ui-chart-plot ui-chart-plot--horizontal-bar" });
    const rowHeight = 42;
    const height = Math.max(150, currentData.length * rowHeight + 28);
    const svg = createSvg({ viewBox: `0 0 720 ${height}`, className: "ui-chart-svg", ariaHidden: true });
    const margin = { top: 18, right: 72, bottom: 18, left: 190 };
    const plotWidth = 720 - margin.left - margin.right;
    const max = getSimpleMax();

    currentData.forEach((item, index) => {
      const y = margin.top + index * rowHeight;
      const width = Math.max(2, (item.value / max) * plotWidth);
      const group = createSvgElement("g", {
        class: buildItemClass(item, index),
        tabindex: isInteractive() ? "0" : null,
        role: isInteractive() ? "button" : "img",
        "aria-label": buildSimpleLabel(item),
        "data-id": item.id,
        "data-index": index,
        style: item.color ? `--ui-chart-item-color: ${item.color}` : null,
      });
      wireInteractive(group, item, index);
      appendSvgText(group, margin.left - 12, y + 21, item.label, "ui-chart-y-label", "end");
      appendSvg(group, "rect", {
        x: margin.left,
        y: y + 6,
        width,
        height: 22,
        rx: 5,
        class: "ui-chart-bar-rect",
      });
      if (currentOptions.showValues) {
        appendSvgText(group, margin.left + width + 10, y + 22, formatValue(item.value, item), "ui-chart-value-text", "start");
      }
      svg.appendChild(group);
    });

    chart.appendChild(svg);
    host.appendChild(chart);
  }

  function renderStackedBar(host) {
    const list = createElement("div", { className: "ui-chart-stacked-list", attrs: { role: "list" } });
    const max = Math.max(1, ...currentData.map((row) => row.total));
    currentData.forEach((row, rowIndex) => {
      const item = createElement("article", {
        className: "ui-chart-stacked-row",
        attrs: { role: "listitem", "aria-label": `${row.label}: ${formatValue(row.total, row)} total` },
      });
      item.appendChild(createElement("span", { className: "ui-chart-stacked-label", text: row.label }));
      const track = createElement("div", { className: "ui-chart-stacked-track" });
      row.segments.forEach((segment, segmentIndex) => {
        const width = Math.max(0, (segment.value / max) * 100);
        const segmentNode = createElement("span", {
          className: buildSegmentClass(segment, segmentIndex),
          attrs: {
            role: isInteractive() ? "button" : "img",
            tabindex: isInteractive() ? "0" : null,
            "aria-label": `${row.label}, ${segment.label}: ${formatValue(segment.value, segment)}`,
            title: `${row.label}, ${segment.label}: ${formatValue(segment.value, segment)}`,
          },
          dataset: {
            id: segment.id,
            rowId: row.id,
            segmentIndex,
          },
        });
        if (segment.color) {
          segmentNode.style.setProperty("--ui-chart-item-color", segment.color);
        }
        segmentNode.style.width = `${width}%`;
        wireDomInteractive(segmentNode, { ...segment, row }, segmentIndex);
        track.appendChild(segmentNode);
      });
      item.appendChild(track);
      if (currentOptions.showValues) {
        item.appendChild(createElement("span", { className: "ui-chart-stacked-total", text: formatValue(row.total, row) }));
      }
      list.appendChild(item);
    });
    host.appendChild(list);
  }

  function renderDonut(host) {
    const chart = createElement("div", { className: "ui-chart-donut-wrap" });
    const svg = createSvg({ viewBox: "0 0 240 240", className: "ui-chart-svg ui-chart-donut-svg", ariaHidden: true });
    const total = Math.max(0, currentData.reduce((sum, item) => sum + item.value, 0));
    let start = -90;
    currentData.forEach((item, index) => {
      const angle = total > 0 ? (item.value / total) * 360 : 0;
      const end = start + angle;
      const path = createSvgElement("path", {
        d: describeArc(120, 120, 82, 48, start, end),
        class: buildItemClass(item, index),
        tabindex: isInteractive() ? "0" : null,
        role: isInteractive() ? "button" : "img",
        "aria-label": buildSimpleLabel(item),
        "data-id": item.id,
        "data-index": index,
        style: item.color ? `--ui-chart-item-color: ${item.color}` : null,
      });
      wireInteractive(path, item, index);
      svg.appendChild(path);
      start = end;
    });
    appendSvgText(svg, 120, 113, formatValue(total, { label: "Total" }), "ui-chart-donut-total", "middle");
    appendSvgText(svg, 120, 137, currentOptions.valueLabel || "Total", "ui-chart-donut-label", "middle");
    chart.appendChild(svg);
    host.appendChild(chart);
  }

  function renderSparkline(host) {
    const chart = createElement("div", { className: "ui-chart-plot ui-chart-plot--sparkline" });
    const svg = createSvg({ viewBox: "0 0 640 160", className: "ui-chart-svg", ariaHidden: true });
    const margin = { top: 18, right: 24, bottom: 30, left: 28 };
    const width = 640 - margin.left - margin.right;
    const height = 160 - margin.top - margin.bottom;
    const max = Math.max(1, ...currentData.map((point) => point.y));
    const min = Math.min(0, ...currentData.map((point) => point.y));
    const range = Math.max(1, max - min);
    const points = currentData.map((point, index) => {
      const x = margin.left + (currentData.length === 1 ? width / 2 : (index / (currentData.length - 1)) * width);
      const y = margin.top + height - ((point.y - min) / range) * height;
      return { ...point, xPos: x, yPos: y };
    });
    if (currentOptions.showAxis) {
      appendLine(svg, margin.left, margin.top + height, margin.left + width, margin.top + height, "ui-chart-axis");
    }
    appendSvg(svg, "polyline", {
      points: points.map((point) => `${point.xPos},${point.yPos}`).join(" "),
      class: "ui-chart-sparkline-line",
    });
    points.forEach((point, index) => {
      const circle = createSvgElement("circle", {
        cx: point.xPos,
        cy: point.yPos,
        r: 4,
        class: buildItemClass(point, index),
        tabindex: isInteractive() ? "0" : null,
        role: isInteractive() ? "button" : "img",
        "aria-label": `${point.label}: ${formatValue(point.y, point)}`,
        "data-id": point.id,
        "data-index": index,
      });
      wireInteractive(circle, point, index);
      svg.appendChild(circle);
    });
    if (currentOptions.showValues && points.length) {
      const last = points[points.length - 1];
      appendSvgText(svg, last.xPos, Math.max(14, last.yPos - 10), formatValue(last.y, last), "ui-chart-value-text", "middle");
    }
    chart.appendChild(svg);
    host.appendChild(chart);
  }

  function renderSummaryTable() {
    const table = createElement("table", { className: "ui-chart-summary", attrs: { "aria-label": "Chart data summary" } });
    const thead = createElement("thead");
    const headRow = createElement("tr");
    headRow.appendChild(createElement("th", { text: "Label" }));
    headRow.appendChild(createElement("th", { text: currentOptions.valueLabel || "Value" }));
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = createElement("tbody");
    getSummaryRows().forEach((row) => {
      const tr = createElement("tr");
      tr.appendChild(createElement("td", { text: row.label }));
      tr.appendChild(createElement("td", { text: row.value }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function renderLegend() {
    const legend = createElement("div", { className: "ui-chart-legend", attrs: { "aria-label": "Chart legend" } });
    getLegendItems().forEach((item, index) => {
      const row = createElement("span", { className: "ui-chart-legend-item" });
      row.appendChild(createElement("span", {
        className: `ui-chart-legend-swatch ui-chart-item--${item.tone || toneForIndex(index)}`,
        attrs: { "aria-hidden": "true" },
      }));
      row.appendChild(createElement("span", { className: "ui-chart-legend-label", text: item.label }));
      legend.appendChild(row);
    });
    return legend;
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function setData(data = []) {
    currentOptions = normalizeOptions({ ...currentOptions, data });
    render();
  }

  function getState() {
    return {
      options: { ...currentOptions, formatter: currentOptions.formatter, onSelect: currentOptions.onSelect, onHover: currentOptions.onHover },
      data: clonePlain(currentData),
      type: currentOptions.type,
    };
  }

  function destroy() {
    destroyed = true;
    clearNode(container);
    root = null;
  }

  function getSimpleMax() {
    const dataMax = Math.max(1, ...currentData.map((item) => item.value));
    return currentOptions.maxValue || dataMax;
  }

  function isInteractive() {
    return typeof currentOptions.onSelect === "function";
  }

  function wireInteractive(node, item, index) {
    if (typeof currentOptions.onHover === "function") {
      node.addEventListener("mouseenter", () => currentOptions.onHover(clonePlain(item), { item: clonePlain(item), index }));
      node.addEventListener("focus", () => currentOptions.onHover(clonePlain(item), { item: clonePlain(item), index }));
    }
    if (!isInteractive()) {
      return;
    }
    node.addEventListener("click", () => currentOptions.onSelect(clonePlain(item), { item: clonePlain(item), index }));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        currentOptions.onSelect(clonePlain(item), { item: clonePlain(item), index });
      }
    });
  }

  function wireDomInteractive(node, item, index) {
    if (typeof currentOptions.onHover === "function") {
      node.addEventListener("mouseenter", () => currentOptions.onHover(clonePlain(item), { item: clonePlain(item), index }));
      node.addEventListener("focus", () => currentOptions.onHover(clonePlain(item), { item: clonePlain(item), index }));
    }
    if (!isInteractive()) {
      return;
    }
    node.addEventListener("click", () => currentOptions.onSelect(clonePlain(item), { item: clonePlain(item), index }));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        currentOptions.onSelect(clonePlain(item), { item: clonePlain(item), index });
      }
    });
  }

  function buildSimpleLabel(item) {
    const secondary = item.secondaryLabel ? `, ${item.secondaryLabel}` : "";
    return `${item.label}: ${formatValue(item.value ?? item.y, item)} ${currentOptions.valueLabel}${secondary}`.trim();
  }

  function formatValue(value, item = {}) {
    if (currentOptions.formatter) {
      return String(currentOptions.formatter(value, item));
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
    }
    return String(value ?? "");
  }

  function getSummaryRows() {
    if (currentOptions.type === "stacked-bar") {
      return currentData.flatMap((row) => row.segments.map((segment) => ({
        label: `${row.label} - ${segment.label}`,
        value: formatValue(segment.value, segment),
      })));
    }
    if (currentOptions.type === "sparkline") {
      return currentData.map((point) => ({ label: point.label, value: formatValue(point.y, point) }));
    }
    return currentData.map((item) => ({ label: item.label, value: formatValue(item.value, item) }));
  }

  function getLegendItems() {
    if (currentOptions.type === "stacked-bar") {
      const segments = [];
      currentData.forEach((row) => {
        row.segments.forEach((segment) => {
          if (!segments.some((item) => item.label === segment.label)) {
            segments.push(segment);
          }
        });
      });
      return segments;
    }
    return currentData;
  }

  render();

  return {
    destroy,
    getState,
    setData,
    update,
  };
}

export function createBarChart(container, data = [], options = {}) {
  return createChart(container, { ...options, type: "bar", data });
}

export function createHorizontalBarChart(container, data = [], options = {}) {
  return createChart(container, { ...options, type: "horizontal-bar", data });
}

export function createStackedBarChart(container, data = [], options = {}) {
  return createChart(container, { ...options, type: "stacked-bar", data });
}

export function createDonutChart(container, data = [], options = {}) {
  return createChart(container, { ...options, type: "donut", data });
}

export function createSparkline(container, data = [], options = {}) {
  return createChart(container, { ...options, type: "sparkline", data });
}

function normalizeOptions(input = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(input || {}) };
  const type = String(next.type || "bar").toLowerCase();
  const size = String(next.size || "md").toLowerCase();
  const tone = String(next.tone || "neutral").toLowerCase();
  const sort = String(next.sort || "input").toLowerCase();
  return {
    ...next,
    type: CHART_TYPES.has(type) ? type : "bar",
    title: String(next.title || ""),
    description: String(next.description || ""),
    ariaLabel: String(next.ariaLabel || next.title || "Chart"),
    className: String(next.className || ""),
    valueLabel: String(next.valueLabel || DEFAULT_OPTIONS.valueLabel),
    secondaryValueLabel: String(next.secondaryValueLabel || ""),
    size: SIZES.has(size) ? size : "md",
    tone: TONES.has(tone) ? tone : "neutral",
    showLegend: next.showLegend !== false,
    showValues: next.showValues !== false,
    showAxis: next.showAxis !== false,
    maxValue: Number.isFinite(Number(next.maxValue)) && Number(next.maxValue) > 0 ? Number(next.maxValue) : null,
    sort: SORTS.has(sort) ? sort : "input",
    emptyText: String(next.emptyText || DEFAULT_OPTIONS.emptyText),
    loading: next.loading === true,
    loadingText: String(next.loadingText || DEFAULT_OPTIONS.loadingText),
    error: next.error ? String(next.error) : "",
    formatter: typeof next.formatter === "function" ? next.formatter : null,
    onSelect: typeof next.onSelect === "function" ? next.onSelect : null,
    onHover: typeof next.onHover === "function" ? next.onHover : null,
    data: Array.isArray(next.data) ? next.data : [],
  };
}

function normalizeData(data, type, options) {
  if (type === "stacked-bar") {
    return normalizeStackedSeries(data);
  }
  if (type === "sparkline") {
    return normalizeSparklineSeries(data);
  }
  return sortSimpleSeries(normalizeSimpleSeries(data), options.sort);
}

function normalizeSimpleSeries(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((item, index) => {
    if (!item || typeof item !== "object") {
      return null;
    }
    const id = String(item.id || item.label || `item-${index}`);
    const value = toNumber(item.value);
    return {
      id,
      label: String(item.label || id),
      value,
      secondaryValue: item.secondaryValue === undefined ? null : toNumber(item.secondaryValue),
      secondaryLabel: String(item.secondaryLabel || ""),
      tone: normalizeTone(item.tone || toneForIndex(index)),
      color: String(item.color || ""),
      icon: String(item.icon || ""),
      meta: item.meta && typeof item.meta === "object" ? { ...item.meta } : {},
    };
  }).filter((item) => item && item.value >= 0);
}

function normalizeStackedSeries(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((row, rowIndex) => {
    if (!row || typeof row !== "object") {
      return null;
    }
    const id = String(row.id || row.label || `row-${rowIndex}`);
    const segments = Array.isArray(row.segments)
      ? row.segments.map((segment, segmentIndex) => normalizeSegment(segment, segmentIndex)).filter(Boolean)
      : [];
    return {
      id,
      label: String(row.label || id),
      segments,
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      meta: row.meta && typeof row.meta === "object" ? { ...row.meta } : {},
    };
  }).filter((row) => row && row.segments.length && row.total > 0);
}

function normalizeSegment(segment, index) {
  if (!segment || typeof segment !== "object") {
    return null;
  }
  const id = String(segment.id || segment.label || `segment-${index}`);
  const value = toNumber(segment.value);
  if (value < 0) {
    return null;
  }
  return {
    id,
    label: String(segment.label || id),
    value,
    tone: normalizeTone(segment.tone || toneForIndex(index)),
    color: String(segment.color || ""),
    meta: segment.meta && typeof segment.meta === "object" ? { ...segment.meta } : {},
  };
}

function normalizeSparklineSeries(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((point, index) => {
    if (!point || typeof point !== "object") {
      return null;
    }
    const id = String(point.id || point.x || point.label || `point-${index}`);
    return {
      id,
      label: String(point.label || point.x || id),
      x: point.x ?? index,
      y: toNumber(point.y ?? point.value),
      tone: normalizeTone(point.tone || "info"),
      meta: point.meta && typeof point.meta === "object" ? { ...point.meta } : {},
    };
  }).filter((point) => point && point.y >= 0);
}

function sortSimpleSeries(data, sort) {
  const next = [...data];
  if (sort === "value-desc") {
    next.sort((a, b) => b.value - a.value);
  } else if (sort === "value-asc") {
    next.sort((a, b) => a.value - b.value);
  } else if (sort === "label") {
    next.sort((a, b) => a.label.localeCompare(b.label));
  }
  return next;
}

function hasChartData(data, type) {
  if (!data.length) {
    return false;
  }
  if (type === "stacked-bar") {
    return data.some((row) => row.total > 0);
  }
  if (type === "sparkline") {
    return data.some((point) => Number.isFinite(point.y));
  }
  return data.some((item) => item.value > 0);
}

function buildRootClass(options) {
  return [
    "ui-chart",
    `ui-chart--${options.type}`,
    `ui-chart--${options.size}`,
    `ui-chart--${options.tone}`,
    options.className,
  ].filter(Boolean).join(" ");
}

function buildItemClass(item, index) {
  return [
    "ui-chart-item",
    `ui-chart-item--${item.tone || toneForIndex(index)}`,
    item.color ? "has-custom-color" : "",
  ].filter(Boolean).join(" ");
}

function buildSegmentClass(segment, index) {
  return [
    "ui-chart-segment",
    `ui-chart-item--${segment.tone || toneForIndex(index)}`,
    segment.color ? "has-custom-color" : "",
  ].filter(Boolean).join(" ");
}

function buildAriaLabel(options) {
  return options.ariaLabel || options.title || "Chart";
}

function normalizeTone(value) {
  const tone = String(value || "neutral").toLowerCase();
  return TONES.has(tone) ? tone : "neutral";
}

function toneForIndex(index) {
  return PALETTE_TONES[index % PALETTE_TONES.length];
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSvg({ viewBox, className, ariaHidden = false }) {
  const svg = createSvgElement("svg", {
    class: className,
    viewBox,
    role: "img",
    "aria-hidden": ariaHidden ? "true" : null,
    focusable: "false",
  });
  return svg;
}

function createSvgElement(tagName, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      element.setAttribute(key, String(value));
    }
  });
  return element;
}

function appendSvg(parent, tagName, attrs = {}) {
  const child = createSvgElement(tagName, attrs);
  parent.appendChild(child);
  return child;
}

function appendLine(parent, x1, y1, x2, y2, className) {
  return appendSvg(parent, "line", { x1, y1, x2, y2, class: className });
}

function appendSvgText(parent, x, y, text, className, anchor = "start") {
  const node = appendSvg(parent, "text", {
    x,
    y,
    class: className,
    "text-anchor": anchor,
  });
  node.textContent = String(text);
  return node;
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians)),
  };
}

function describeArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  if (Math.abs(endAngle - startAngle) >= 359.99) {
    endAngle = startAngle + 359.99;
  }
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", outerStart.x, outerStart.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, outerEnd.x, outerEnd.y,
    "L", innerStart.x, innerStart.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, innerEnd.x, innerEnd.y,
    "Z",
  ].join(" ");
}

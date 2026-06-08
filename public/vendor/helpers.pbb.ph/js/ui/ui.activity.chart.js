import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Activity chart",
  mode: "matrix", // matrix | stacked-bars | sparklines
  metric: "total", // total | direct | broadcast | targeted
  locale: "en-US",
  emptyText: "No activity to display.",
  showHeader: false,
  eyebrow: "Activity",
  title: "Last 7 days",
  projectOrder: "alpha", // alpha | input
  projects: [],
  dates: [],
  selectedProject: "",
  selectedDate: "",
  showLegend: true,
  showTotals: true,
  onSelect: null,
  onHover: null,
};

const METRIC_KEYS = new Set(["total", "direct", "broadcast", "targeted"]);
const MODE_KEYS = new Set(["matrix", "stacked-bars", "sparklines"]);
const PROJECT_ORDER_KEYS = new Set(["alpha", "input"]);

export function createActivityChart(container, records = [], options = {}) {
  const events = createEventBag();
  let currentRecords = normalizeRecords(records);
  let currentOptions = normalizeOptions(options);
  let state = deriveState(currentRecords, currentOptions);
  let root = null;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }

    events.clear();
    clearNode(container);
    state = deriveState(currentRecords, currentOptions);

    root = createElement("section", {
      className: [
        "ui-activity-chart",
        `ui-activity-chart--${currentOptions.mode}`,
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    renderHeader(root);

    if (!state.projects.length || !state.dates.length) {
      root.appendChild(createElement("p", {
        className: "ui-activity-chart-empty",
        text: currentOptions.emptyText,
      }));
      container.appendChild(root);
      return;
    }

    renderSummary(root);
    if (currentOptions.mode === "stacked-bars") {
      renderStackedBars(root);
    } else if (currentOptions.mode === "sparklines") {
      renderSparklines(root);
    } else {
      renderMatrix(root);
    }

    if (currentOptions.showLegend) {
      renderLegend(root);
    }
    container.appendChild(root);
  }

  function renderHeader(host) {
    if (!currentOptions.showHeader) {
      return;
    }

    const header = createElement("div", { className: "ui-activity-chart-header" });
    if (currentOptions.eyebrow) {
      header.appendChild(createElement("div", {
        className: "ui-activity-chart-eyebrow",
        text: currentOptions.eyebrow,
      }));
    }
    if (currentOptions.title) {
      header.appendChild(createElement("div", {
        className: "ui-activity-chart-title",
        text: currentOptions.title,
      }));
    }
    host.appendChild(header);
  }

  function renderSummary(host) {
    const summary = createElement("div", { className: "ui-activity-chart-summary" });
    const title = createElement("div", { className: "ui-activity-chart-summary-main" });
    title.appendChild(createElement("strong", { text: formatNumber(state.totals.total) }));
    title.appendChild(createElement("span", { text: "messages" }));
    summary.appendChild(title);

    const stats = createElement("div", { className: "ui-activity-chart-stats" });
    stats.appendChild(renderStat("Direct", state.totals.direct));
    stats.appendChild(renderStat("Broadcast", state.totals.broadcast));
    stats.appendChild(renderStat("Targeted", state.totals.targeted));
    stats.appendChild(renderStat("Projects", state.projects.length));
    summary.appendChild(stats);
    host.appendChild(summary);
  }

  function renderStat(label, value) {
    const stat = createElement("span", { className: "ui-activity-chart-stat" });
    stat.appendChild(createElement("b", { text: formatNumber(value) }));
    stat.appendChild(createElement("span", { text: label }));
    return stat;
  }

  function renderMatrix(host) {
    const wrap = createElement("div", { className: "ui-activity-chart-scroll" });
    const table = createElement("table", { className: "ui-activity-chart-matrix" });
    const thead = createElement("thead");
    const headRow = createElement("tr");
    headRow.appendChild(createElement("th", { text: "Project" }));
    state.dates.forEach((date) => {
      headRow.appendChild(createElement("th", { text: formatDateShort(date, currentOptions.locale) }));
    });
    if (currentOptions.showTotals) {
      headRow.appendChild(createElement("th", { text: "Total" }));
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = createElement("tbody");
    state.projects.forEach((project) => {
      const row = createElement("tr");
      row.appendChild(renderProjectHeader(project));
      state.dates.forEach((date) => {
        row.appendChild(renderCell(project, date));
      });
      if (currentOptions.showTotals) {
        const total = getProjectTotal(project, currentOptions.metric);
        row.appendChild(createElement("td", {
          className: "ui-activity-chart-total",
          text: formatNumber(total),
        }));
      }
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
  }

  function renderProjectHeader(project) {
    const th = createElement("th", { className: "ui-activity-chart-project" });
    const button = createElement("button", {
      className: isSelected(project, "") ? "is-selected" : "",
      text: project,
      attrs: {
        type: "button",
        "aria-pressed": isSelected(project, "") ? "true" : "false",
      },
    });
    events.on(button, "click", () => selectActivity(project, ""));
    th.appendChild(button);
    return th;
  }

  function renderCell(project, date) {
    const bucket = getBucket(project, date);
    const value = getMetricValue(bucket, currentOptions.metric);
    const level = getIntensityLevel(value);
    const selected = isSelected(project, date);
    const td = createElement("td", {
      className: `ui-activity-chart-cell-wrap ui-activity-chart-cell-wrap--level-${level}${selected ? " is-selected" : ""}`,
    });
    const button = createElement("button", {
      className: `ui-activity-chart-cell${selected ? " is-selected" : ""}`,
      attrs: {
        type: "button",
        title: buildBucketLabel(project, date, bucket),
        "aria-label": buildBucketLabel(project, date, bucket),
        "aria-pressed": selected ? "true" : "false",
        "data-project": project,
        "data-date": date,
      },
    });
    button.appendChild(createElement("span", {
      className: "ui-activity-chart-cell-value",
      text: value ? formatNumber(value) : "",
    }));
    events.on(button, "click", () => selectActivity(project, date));
    events.on(button, "mouseenter", () => currentOptions.onHover?.(createSelection(project, date, bucket)));
    events.on(button, "focus", () => currentOptions.onHover?.(createSelection(project, date, bucket)));
    td.appendChild(button);
    return td;
  }

  function renderStackedBars(host) {
    const list = createElement("div", { className: "ui-activity-chart-bars", attrs: { role: "list" } });
    const max = Math.max(1, ...state.projects.map((project) => getProjectTotal(project, "total")));
    state.projects.forEach((project) => {
      const totals = getProjectBreakdown(project);
      const item = createElement("article", {
        className: "ui-activity-chart-bar-row",
        attrs: { role: "listitem" },
      });
      item.appendChild(renderProjectButton(project));
      const bar = createElement("button", {
        className: `ui-activity-chart-bar${isSelected(project, "") ? " is-selected" : ""}`,
        attrs: {
          type: "button",
          "aria-label": `${project}: ${totals.total} messages`,
          "aria-pressed": isSelected(project, "") ? "true" : "false",
        },
      });
      appendSegment(bar, "broadcast", totals.broadcast, max);
      appendSegment(bar, "direct", totals.direct, max);
      appendSegment(bar, "targeted", totals.targeted, max);
      const residual = Math.max(0, totals.total - totals.broadcast - totals.direct - totals.targeted);
      appendSegment(bar, "other", residual, max);
      events.on(bar, "click", () => selectActivity(project, ""));
      item.appendChild(bar);
      item.appendChild(createElement("span", {
        className: "ui-activity-chart-bar-total",
        text: formatNumber(totals.total),
      }));
      list.appendChild(item);
    });
    host.appendChild(list);
  }

  function renderSparklines(host) {
    const list = createElement("div", { className: "ui-activity-chart-sparklines", attrs: { role: "list" } });
    state.projects.forEach((project) => {
      const item = createElement("article", {
        className: "ui-activity-chart-spark-row",
        attrs: { role: "listitem" },
      });
      item.appendChild(renderProjectButton(project));
      const spark = createElement("div", { className: "ui-activity-chart-spark" });
      state.dates.forEach((date) => {
        const bucket = getBucket(project, date);
        const value = getMetricValue(bucket, currentOptions.metric);
        const button = createElement("button", {
          className: `ui-activity-chart-spark-bar${isSelected(project, date) ? " is-selected" : ""}`,
          attrs: {
            type: "button",
            title: buildBucketLabel(project, date, bucket),
            "aria-label": buildBucketLabel(project, date, bucket),
            "aria-pressed": isSelected(project, date) ? "true" : "false",
          },
        });
        button.style.setProperty("--ui-activity-height", `${Math.max(8, Math.round(getIntensityRatio(value) * 100))}%`);
        events.on(button, "click", () => selectActivity(project, date));
        spark.appendChild(button);
      });
      item.appendChild(spark);
      item.appendChild(createElement("span", {
        className: "ui-activity-chart-bar-total",
        text: formatNumber(getProjectTotal(project, currentOptions.metric)),
      }));
      list.appendChild(item);
    });
    host.appendChild(list);
  }

  function renderProjectButton(project) {
    const button = createElement("button", {
      className: `ui-activity-chart-project-button${isSelected(project, "") ? " is-selected" : ""}`,
      text: project,
      attrs: {
        type: "button",
        "aria-pressed": isSelected(project, "") ? "true" : "false",
      },
    });
    events.on(button, "click", () => selectActivity(project, ""));
    return button;
  }

  function appendSegment(host, name, value, max) {
    if (!value) {
      return;
    }
    const segment = createElement("span", {
      className: `ui-activity-chart-bar-segment is-${name}`,
      attrs: { "aria-hidden": "true" },
    });
    segment.style.flexGrow = String(Math.max(0.5, value));
    segment.style.maxWidth = `${Math.max(4, Math.round((value / max) * 100))}%`;
    host.appendChild(segment);
  }

  function renderLegend(host) {
    const legend = createElement("div", { className: "ui-activity-chart-legend" });
    if (currentOptions.mode !== "stacked-bars") {
      legend.appendChild(createElement("span", {
        className: "ui-activity-chart-legend-label",
        text: "Low activity",
      }));
      [0, 1, 2, 3, 4].forEach((level) => {
        legend.appendChild(createElement("span", {
          className: `ui-activity-chart-swatch ui-activity-chart-swatch--level-${level}`,
          attrs: { "aria-hidden": "true" },
        }));
      });
      legend.appendChild(createElement("span", {
        className: "ui-activity-chart-legend-label",
        text: "High activity",
      }));
      return host.appendChild(legend);
    }

    [
      ["Broadcast", "broadcast"],
      ["Direct", "direct"],
      ["Targeted", "targeted"],
      ["Other", "other"],
    ].forEach(([label, key]) => {
      const item = createElement("span", { className: "ui-activity-chart-legend-item" });
      item.appendChild(createElement("span", { className: `ui-activity-chart-swatch is-${key}` }));
      item.appendChild(createElement("span", { text: label }));
      legend.appendChild(item);
    });
    host.appendChild(legend);
  }

  function getBucket(project, date) {
    return state.bucketMap.get(getBucketKey(project, date)) || createEmptyBucket(project, date);
  }

  function getProjectTotal(project, metric) {
    return state.dates.reduce((sum, date) => sum + getMetricValue(getBucket(project, date), metric), 0);
  }

  function getProjectBreakdown(project) {
    return state.dates.reduce((totals, date) => {
      const bucket = getBucket(project, date);
      totals.total += bucket.total;
      totals.direct += bucket.direct;
      totals.broadcast += bucket.broadcast;
      totals.targeted += bucket.targeted;
      return totals;
    }, { total: 0, direct: 0, broadcast: 0, targeted: 0 });
  }

  function getIntensityRatio(value) {
    if (!value || !state.maxMetric) {
      return 0;
    }
    return Math.min(1, value / state.maxMetric);
  }

  function getIntensityLevel(value) {
    const ratio = getIntensityRatio(value);
    if (ratio <= 0) {
      return 0;
    }
    if (ratio < 0.25) {
      return 1;
    }
    if (ratio < 0.5) {
      return 2;
    }
    if (ratio < 0.75) {
      return 3;
    }
    return 4;
  }

  function isSelected(project, date) {
    return currentOptions.selectedProject === project && (currentOptions.selectedDate || "") === (date || "");
  }

  function selectActivity(project, date) {
    const bucket = date ? getBucket(project, date) : null;
    currentOptions = {
      ...currentOptions,
      selectedProject: project,
      selectedDate: date || "",
    };
    currentOptions.onSelect?.(createSelection(project, date, bucket));
    render();
  }

  function createSelection(project, date, bucket) {
    return {
      project,
      date: date || "",
      metric: currentOptions.metric,
      mode: currentOptions.mode,
      summary: bucket || getProjectBreakdown(project),
    };
  }

  const api = {
    update(nextRecords = [], nextOptions = {}) {
      currentRecords = normalizeRecords(nextRecords);
      currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
      render();
    },
    setMode(mode) {
      currentOptions = normalizeOptions({ ...currentOptions, mode });
      render();
    },
    setMetric(metric) {
      currentOptions = normalizeOptions({ ...currentOptions, metric });
      render();
    },
    setSelection(selection = {}) {
      currentOptions = normalizeOptions({
        ...currentOptions,
        selectedProject: selection.project || "",
        selectedDate: selection.date || "",
      });
      render();
    },
    getState() {
      return {
        options: { ...currentOptions },
        records: currentRecords.map((record) => ({ ...record })),
        projects: [...state.projects],
        dates: [...state.dates],
        totals: { ...state.totals },
      };
    },
    destroy() {
      events.clear();
      clearNode(container);
      root = null;
    },
  };

  render();
  return api;
}

function normalizeOptions(options = {}) {
  const mode = MODE_KEYS.has(String(options.mode)) ? String(options.mode) : DEFAULT_OPTIONS.mode;
  const metric = METRIC_KEYS.has(String(options.metric)) ? String(options.metric) : DEFAULT_OPTIONS.metric;
  const projectOrder = PROJECT_ORDER_KEYS.has(String(options.projectOrder)) ? String(options.projectOrder) : DEFAULT_OPTIONS.projectOrder;
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    mode,
    metric,
    projectOrder,
    showHeader: Boolean(options.showHeader),
    eyebrow: typeof options.eyebrow === "string" ? options.eyebrow : DEFAULT_OPTIONS.eyebrow,
    title: typeof options.title === "string" ? options.title : DEFAULT_OPTIONS.title,
    projects: Array.isArray(options.projects) ? options.projects.map(String).filter(Boolean) : [],
    dates: Array.isArray(options.dates) ? options.dates.map(normalizeDate).filter(Boolean) : [],
    selectedProject: options.selectedProject ? String(options.selectedProject) : "",
    selectedDate: options.selectedDate ? normalizeDate(options.selectedDate) : "",
  };
}

function normalizeRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }
  return records.map((record) => {
    const date = normalizeDate(record?.date || record?.day || record?.timestamp);
    const project = String(record?.project || record?.name || "").trim();
    if (!date || !project) {
      return null;
    }
    const total = toCount(record.total ?? record.messages ?? record.count);
    const direct = toCount(record.direct);
    const broadcast = toCount(record.broadcast);
    const targeted = toCount(record.targeted ?? record.mentions ?? record.directed);
    return {
      ...record,
      date,
      project,
      total: total || direct + broadcast + targeted,
      direct,
      broadcast,
      targeted,
      targets: record.targets && typeof record.targets === "object" ? { ...record.targets } : {},
      topics: Array.isArray(record.topics) ? record.topics.map(String) : [],
    };
  }).filter(Boolean);
}

function deriveState(records, options) {
  const projectSet = new Set(options.projects);
  const dateSet = new Set(options.dates);
  const bucketMap = new Map();
  const totals = { total: 0, direct: 0, broadcast: 0, targeted: 0 };

  records.forEach((record) => {
    projectSet.add(record.project);
    dateSet.add(record.date);
    const key = getBucketKey(record.project, record.date);
    const bucket = bucketMap.get(key) || createEmptyBucket(record.project, record.date);
    bucket.total += record.total;
    bucket.direct += record.direct;
    bucket.broadcast += record.broadcast;
    bucket.targeted += record.targeted;
    bucket.records.push(record);
    record.topics.forEach((topic) => bucket.topics.add(topic));
    Object.entries(record.targets).forEach(([target, count]) => {
      bucket.targets[target] = (bucket.targets[target] || 0) + toCount(count);
    });
    bucketMap.set(key, bucket);
  });

  bucketMap.forEach((bucket) => {
    totals.total += bucket.total;
    totals.direct += bucket.direct;
    totals.broadcast += bucket.broadcast;
    totals.targeted += bucket.targeted;
  });

  const projects = Array.from(projectSet);
  if (options.projectOrder === "alpha") {
    projects.sort((a, b) => a.localeCompare(b));
  }
  const dates = Array.from(dateSet).sort();
  const maxMetric = Math.max(0, ...Array.from(bucketMap.values()).map((bucket) => getMetricValue(bucket, options.metric)));

  return { projects, dates, bucketMap, totals, maxMetric };
}

function createEmptyBucket(project, date) {
  return {
    project,
    date,
    total: 0,
    direct: 0,
    broadcast: 0,
    targeted: 0,
    targets: {},
    topics: new Set(),
    records: [],
  };
}

function getMetricValue(bucket, metric) {
  return toCount(bucket?.[metric]);
}

function getBucketKey(project, date) {
  return `${project}\u0000${date}`;
}

function normalizeDate(value) {
  if (!value) {
    return "";
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) {
    return direct[1];
  }
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function toCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }
  return Math.round(count);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(toCount(value));
}

function formatDateShort(date, locale) {
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(parsed);
}

function buildBucketLabel(project, date, bucket) {
  const parts = [
    project,
    formatDateShort(date, DEFAULT_OPTIONS.locale),
    `${bucket.total} messages`,
    `${bucket.direct} direct`,
    `${bucket.broadcast} broadcast`,
  ];
  if (bucket.targeted) {
    parts.push(`${bucket.targeted} targeted`);
  }
  return parts.join(", ");
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Timeline",
  orientation: "vertical", // vertical | horizontal
  density: "comfortable", // compact | comfortable
  emptyText: "No timeline items.",
  locale: "en-US",
  timeZone: undefined,
  groupByDate: true,
  showConnector: true,
  linkedRange: null, // { startMs, endMs, anchorMs? }
  includeUndatedInRange: false,
  onItemClick: null,
  onActionClick: null,
  mountItemContent: null,
};

export function createTimeline(container, items = [], options = {}) {
  const events = createEventBag();
  const customMounts = new Map();
  let currentItems = normalizeItems(items);
  let currentOptions = normalizeOptions(options);
  let visibleItems = [];
  let root = null;
  let api = null;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    visibleItems = applyLinkedRange(currentItems, currentOptions);
    reconcileCustomMounts(visibleItems);
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: [
        "ui-timeline",
        `ui-timeline--${currentOptions.orientation}`,
        `ui-timeline--density-${currentOptions.density}`,
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    if (!visibleItems.length) {
      root.appendChild(createElement("p", {
        className: "ui-timeline-empty",
        text: currentOptions.emptyText,
      }));
      container.appendChild(root);
      return;
    }

    if (currentOptions.orientation === "vertical" && currentOptions.groupByDate) {
      renderVerticalGrouped(root, visibleItems);
    } else {
      renderList(root, visibleItems);
    }

    container.appendChild(root);
  }

  function renderVerticalGrouped(host, itemsToRender) {
    const groups = groupItemsByDate(itemsToRender, currentOptions.locale, currentOptions.timeZone);
    groups.forEach((group) => {
      const section = createElement("section", { className: "ui-timeline-group" });
      section.appendChild(createElement("p", {
        className: "ui-timeline-group-label",
        text: group.label,
      }));
      const list = createElement("div", {
        className: "ui-timeline-list",
        attrs: { role: "list" },
      });
      renderList(list, group.items);
      section.appendChild(list);
      host.appendChild(section);
    });
  }

  function renderList(host, listItems) {
    const list = createElement("div", {
      className: "ui-timeline-list",
      attrs: { role: "list" },
    });
    listItems.forEach((item, index) => {
      const card = renderItem(item, index, listItems.length);
      list.appendChild(card);
    });
    host.appendChild(list);
  }

  function renderItem(item, index, total) {
    const row = createElement("article", {
      className: "ui-timeline-item",
      attrs: {
        "data-item-id": String(item.id),
        role: "listitem",
        tabindex: typeof currentOptions.onItemClick === "function" ? "0" : null,
        "aria-label": buildItemAriaLabel(item),
      },
    });

    const rail = createElement("div", { className: "ui-timeline-rail" });
    const marker = createElement("span", {
      className: `ui-timeline-marker${item.status ? ` is-${item.status}` : ""}`,
      html: item.iconHtml || getStatusIconHtml(item.status),
    });
    rail.appendChild(marker);
    if (currentOptions.showConnector && index < total - 1) {
      rail.appendChild(createElement("span", { className: "ui-timeline-connector" }));
    }

    const body = createElement("div", { className: "ui-timeline-body" });
    const header = createElement("header", { className: "ui-timeline-header" });
    header.appendChild(createElement("h4", { className: "ui-timeline-title", text: item.title }));
    if (item.timestamp) {
      header.appendChild(createElement("time", {
        className: "ui-timeline-time",
        text: formatTimestamp(item.timestamp, currentOptions.locale, currentOptions.timeZone),
      }));
    }
    body.appendChild(header);

    if (item.subtitle) {
      body.appendChild(createElement("p", { className: "ui-timeline-subtitle", text: item.subtitle }));
    }
    if (item.description) {
      body.appendChild(createElement("p", { className: "ui-timeline-description", text: item.description }));
    }
    if (Array.isArray(item.meta) && item.meta.length) {
      const metaWrap = createElement("div", { className: "ui-timeline-meta" });
      item.meta.forEach((entry) => {
        metaWrap.appendChild(createElement("span", {
          className: "ui-timeline-tag",
          text: String(entry),
        }));
      });
      body.appendChild(metaWrap);
    }
    if (Array.isArray(item.actions) && item.actions.length) {
      const actions = createElement("div", { className: "ui-timeline-actions" });
      item.actions.forEach((action) => {
        const button = createElement("button", {
          className: `ui-button ${action.className || ""}`.trim(),
          text: action.label,
          attrs: { type: "button" },
        });
        events.on(button, "click", (event) => {
          event.stopPropagation();
          currentOptions.onActionClick?.(action, item);
        });
        actions.appendChild(button);
      });
      body.appendChild(actions);
    }
    renderCustomContent(body, item, index, total);

    events.on(row, "click", (event) => {
      if (shouldIgnoreItemActivation(event)) {
        return;
      }
      currentOptions.onItemClick?.(item);
    });
    if (typeof currentOptions.onItemClick === "function") {
      events.on(row, "keydown", (event) => {
        if (event.defaultPrevented) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        if (shouldIgnoreItemActivation(event)) {
          return;
        }
        event.preventDefault();
        currentOptions.onItemClick?.(item);
      });
    }

    row.append(rail, body);
    return row;
  }

  function renderCustomContent(body, item, index, total) {
    if (typeof currentOptions.mountItemContent !== "function" || item.hasCustomContent === false) {
      return;
    }
    const key = getCustomMountKey(item);
    const context = createItemContext(index, total);
    let record = customMounts.get(key);
    if (record) {
      body.appendChild(record.host);
      record.item = item;
      record.context = context;
      record.host.dataset.itemId = String(item.id);
      record.host.dataset.contentKey = String(item.contentKey ?? "");
      callMountUpdate(record, item, context);
      return;
    }

    const host = createElement("div", {
      className: "ui-timeline-custom-content",
      attrs: {
        "data-item-id": String(item.id),
        "data-content-key": String(item.contentKey ?? ""),
      },
    });
    body.appendChild(host);

    let result = null;
    try {
      result = currentOptions.mountItemContent(host, item, context);
    } catch (error) {
      host.textContent = "";
      host.hidden = true;
      throw error;
    }
    if (!result && !host.childNodes.length) {
      host.remove();
      return;
    }
    record = normalizeMountRecord({
      key,
      id: String(item.id),
      contentKey: String(item.contentKey ?? ""),
      host,
      item,
      context,
      result,
    });
    customMounts.set(key, record);
  }

  function createItemContext(index, total) {
    return {
      index,
      total,
      timeline: api,
      options: { ...currentOptions },
      visibleItems: visibleItems.map((item) => ({ ...item })),
    };
  }

  function reconcileCustomMounts(nextVisibleItems) {
    if (!customMounts.size) {
      return;
    }
    if (typeof currentOptions.mountItemContent !== "function") {
      destroyAllCustomMounts();
      return;
    }
    const nextKeys = new Set(
      nextVisibleItems
        .filter((item) => item.hasCustomContent !== false)
        .map((item) => getCustomMountKey(item)),
    );
    Array.from(customMounts.entries()).forEach(([key, record]) => {
      if (!nextKeys.has(key)) {
        destroyCustomMount(record);
        customMounts.delete(key);
      }
    });
  }

  function callMountUpdate(record, item, context) {
    if (!record || typeof record.update !== "function") {
      return;
    }
    record.update(item, context);
  }

  function normalizeMountRecord(record) {
    if (typeof record.result === "function") {
      record.destroy = record.result;
      record.update = null;
      return record;
    }
    if (record.result && typeof record.result === "object") {
      record.update = typeof record.result.update === "function"
        ? record.result.update.bind(record.result)
        : null;
      record.destroy = typeof record.result.destroy === "function"
        ? record.result.destroy.bind(record.result)
        : null;
      return record;
    }
    record.update = null;
    record.destroy = null;
    return record;
  }

  function destroyCustomMount(record) {
    if (!record) {
      return;
    }
    try {
      record.destroy?.();
    } finally {
      record.host?.remove?.();
    }
  }

  function destroyAllCustomMounts() {
    Array.from(customMounts.values()).forEach((record) => destroyCustomMount(record));
    customMounts.clear();
  }

  function update(nextItems = currentItems, nextOptions = {}) {
    currentItems = normalizeItems(nextItems);
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function append(nextItems = []) {
    const incoming = normalizeItems(nextItems);
    currentItems = currentItems.concat(incoming);
    render();
  }

  function prepend(nextItems = []) {
    const incoming = normalizeItems(nextItems);
    currentItems = incoming.concat(currentItems);
    render();
  }

  function setLinkedRange(range) {
    currentOptions = normalizeOptions({
      ...currentOptions,
      linkedRange: range ?? null,
    });
    render();
  }

  function destroy() {
    events.clear();
    destroyAllCustomMounts();
    clearNode(container);
    root = null;
  }

  function getState() {
    return {
      options: { ...currentOptions },
      items: currentItems.map((item) => ({ ...item })),
      visibleItems: visibleItems.map((item) => ({ ...item })),
    };
  }

  api = {
    update,
    append,
    prepend,
    setLinkedRange,
    destroy,
    getState,
  };

  render();

  return api;
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.orientation = String(next.orientation || "vertical").toLowerCase() === "horizontal"
    ? "horizontal"
    : "vertical";
  next.density = String(next.density || "comfortable").toLowerCase() === "compact"
    ? "compact"
    : "comfortable";
  if (next.linkedRange != null) {
    const normalizedRange = normalizeLinkedRange(next.linkedRange);
    next.linkedRange = normalizedRange || null;
  } else {
    next.linkedRange = null;
  }
  next.includeUndatedInRange = Boolean(next.includeUndatedInRange);
  next.mountItemContent = typeof next.mountItemContent === "function" ? next.mountItemContent : null;
  return next;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const ts = item.timestamp ? new Date(item.timestamp) : null;
      return {
        ...item,
        id: item.id ?? index + 1,
        title: String(item.title ?? "Untitled Event"),
        subtitle: item.subtitle == null ? "" : String(item.subtitle),
        description: item.description == null ? "" : String(item.description),
        timestamp: ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : null,
        status: normalizeStatus(item.status),
        meta: Array.isArray(item.meta) ? item.meta : [],
        actions: normalizeActions(item.actions),
        iconHtml: item.iconHtml ? String(item.iconHtml) : "",
        contentKey: item.contentKey == null ? "" : String(item.contentKey),
        hasCustomContent: item.hasCustomContent === false ? false : item.hasCustomContent,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const x = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const y = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return y - x;
    });
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }
  return actions
    .map((action, index) => {
      if (!action || typeof action !== "object" || !action.label) {
        return null;
      }
      return {
        id: action.id ?? `action-${index}`,
        label: String(action.label),
        className: String(action.className || ""),
      };
    })
    .filter(Boolean);
}

function getCustomMountKey(item) {
  return `${String(item.id)}::${String(item.contentKey ?? "")}`;
}

function shouldIgnoreItemActivation(event) {
  const target = event?.target;
  if (!target || !(target instanceof Element)) {
    return false;
  }
  const customHost = target.closest(".ui-timeline-custom-content");
  if (customHost) {
    return true;
  }
  const interactive = target.closest("button, a, input, select, textarea, summary, [contenteditable='true'], [role='button'], [role='link'], [role='checkbox'], [role='switch'], [role='textbox'], [role='menuitem'], [tabindex]");
  return Boolean(interactive && !interactive.classList?.contains("ui-timeline-item"));
}

function buildItemAriaLabel(item) {
  const parts = [item.title];
  if (item.subtitle) {
    parts.push(item.subtitle);
  }
  if (item.timestamp) {
    parts.push(item.timestamp);
  }
  if (item.description) {
    parts.push(item.description);
  }
  return parts.filter(Boolean).join(". ");
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (!value) {
    return "";
  }
  const clean = value.replace(/[^a-z0-9_-]/g, "");
  const aliasMap = {
    assigned: "assigned",
    requested: "requested",
    accepted: "accepted",
    en_route: "en_route",
    on_scene: "on_scene",
    completed: "completed",
    cancelled: "cancelled",
    canceled: "cancelled",
    success: "completed",
    warning: "requested",
    error: "cancelled",
    info: "accepted",
  };
  return aliasMap[clean] || clean;
}

function formatTimestamp(value, locale, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

function groupItemsByDate(items, locale, timeZone) {
  const byDay = new Map();
  items.forEach((item) => {
    const key = item.timestamp
      ? new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
      }).format(new Date(item.timestamp))
      : "unknown";
    if (!byDay.has(key)) {
      byDay.set(key, []);
    }
    byDay.get(key).push(item);
  });

  return Array.from(byDay.entries()).map(([key, groupItems]) => ({
    key,
    label: key === "unknown" ? "Undated" : formatGroupLabel(key, locale),
    items: groupItems,
  }));
}

function applyLinkedRange(items, options) {
  if (!options?.linkedRange) {
    return items.slice();
  }
  const anchorMs = resolveRangeAnchorMs(items, options);
  if (!Number.isFinite(anchorMs)) {
    return options.includeUndatedInRange ? items.slice() : [];
  }
  const startMs = options.linkedRange.startMs;
  const endMs = options.linkedRange.endMs;

  return items.filter((item) => {
    if (!item.timestamp) {
      return options.includeUndatedInRange;
    }
    const timestampMs = new Date(item.timestamp).getTime();
    if (!Number.isFinite(timestampMs)) {
      return options.includeUndatedInRange;
    }
    const relativeMs = timestampMs - anchorMs;
    return relativeMs >= startMs && relativeMs <= endMs;
  });
}

function resolveRangeAnchorMs(items, options) {
  const explicitAnchor = Number(options?.linkedRange?.anchorMs);
  if (Number.isFinite(explicitAnchor)) {
    return explicitAnchor;
  }
  let minMs = Infinity;
  items.forEach((item) => {
    if (!item.timestamp) {
      return;
    }
    const timestampMs = new Date(item.timestamp).getTime();
    if (Number.isFinite(timestampMs) && timestampMs < minMs) {
      minMs = timestampMs;
    }
  });
  return Number.isFinite(minMs) ? minMs : NaN;
}

function normalizeLinkedRange(range) {
  if (!range || typeof range !== "object") {
    return null;
  }
  const startRaw = Number(range.startMs);
  const endRaw = Number(range.endMs);
  if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) {
    return null;
  }
  let startMs = Math.max(0, Math.round(startRaw));
  let endMs = Math.max(0, Math.round(endRaw));
  if (startMs > endMs) {
    const temp = startMs;
    startMs = endMs;
    endMs = temp;
  }
  const normalized = { startMs, endMs };
  const anchorRaw = Number(range.anchorMs);
  if (Number.isFinite(anchorRaw)) {
    normalized.anchorMs = Math.round(anchorRaw);
  }
  return normalized;
}

function formatGroupLabel(isoDate, locale) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function getStatusIconHtml(status) {
  const key = String(status || "").toLowerCase();
  if (!key) {
    return "";
  }
  const common = 'viewBox="0 0 24 24" aria-hidden="true"';
  const icons = {
    assigned: `<svg ${common}><circle cx="12" cy="12" r="5"/></svg>`,
    requested: `<svg ${common}><path d="M12 4v8l5 3"/></svg>`,
    accepted: `<svg ${common}><path d="m5 13 4 4L19 7"/></svg>`,
    en_route: `<svg ${common}><path d="M3 12h8l3-4 7 4h-4l-2 5-3-2-2 2"/></svg>`,
    on_scene: `<svg ${common}><path d="M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10z"/><circle cx="12" cy="11" r="2.5"/></svg>`,
    completed: `<svg ${common}><path d="m5 13 4 4L19 7"/></svg>`,
    cancelled: `<svg ${common}><path d="M7 7l10 10M17 7 7 17"/></svg>`,
  };
  return icons[key] || "";
}

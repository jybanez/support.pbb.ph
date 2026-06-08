import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Date picker",
  locale: "en-US",
  placeholder: "Select date",
  mode: "single", // single | range
  value: null, // single: Date|string|null, range: {start,end}|[start,end]
  closeOnSelect: true,
  weekStartsOn: 0, // 0=Sun
  showTime: false,
  min: null,
  max: null,
  disabledDates: null, // (date:Date) => boolean
  yearRangePast: 80,
  yearRangeFuture: 20,
  onChange: null,
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function createDatepicker(container, options = {}) {
  const events = createEventBag();
  const globalEvents = createEventBag();
  let currentOptions = normalizeOptions(options);
  let open = false;
  let viewDate = startOfMonth(new Date());
  let start = null;
  let end = null;
  let startTime = "00:00";
  let endTime = "00:00";
  let root = null;
  let trigger = null;
  let panel = null;
  let lastFocusedElement = null;
  const panelId = `ui-datepicker-panel-${Math.random().toString(36).slice(2, 10)}`;

  hydrateValue(currentOptions.value);

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("div", {
      className: `ui-datepicker ${currentOptions.className || ""}`.trim(),
    });
    trigger = createElement("button", {
      className: "ui-datepicker-trigger",
      attrs: {
        type: "button",
        "aria-haspopup": "dialog",
        "aria-expanded": open ? "true" : "false",
        "aria-label": currentOptions.ariaLabel,
        "aria-controls": open ? panelId : null,
      },
    });
    trigger.appendChild(createElement("span", {
      className: "ui-datepicker-value",
      text: getDisplayValue(),
    }));
    trigger.appendChild(createElement("span", {
      className: "ui-datepicker-caret",
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    }));
    events.on(trigger, "click", () => {
      if (!open) {
        lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      open = !open;
      render();
    });
    root.appendChild(trigger);

    if (open) {
      panel = createElement("div", { className: "ui-datepicker-panel", attrs: { role: "dialog", id: panelId, "aria-label": currentOptions.ariaLabel } });
      renderHeader(panel);
      renderWeekdayRow(panel);
      renderCalendarGrid(panel);
      if (currentOptions.showTime) {
        renderTimeSection(panel);
      }
      root.appendChild(panel);
      requestAnimationFrame(() => {
        panel?.querySelector?.(".ui-datepicker-day:not(.is-disabled), .ui-datepicker-nav, .ui-datepicker-select, .ui-input")?.focus?.();
      });
    }

    container.appendChild(root);
    bindGlobal();
  }

  function renderHeader(host) {
    const header = createElement("div", { className: "ui-datepicker-header" });
    const prevBtn = createElement("button", {
      className: "ui-button ui-datepicker-nav",
      attrs: { type: "button", "aria-label": "Previous month" },
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    });
    const nextBtn = createElement("button", {
      className: "ui-button ui-datepicker-nav",
      attrs: { type: "button", "aria-label": "Next month" },
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    });
    const title = createElement("p", {
      className: "ui-datepicker-title",
      text: formatMonthYear(viewDate, currentOptions.locale),
    });
    events.on(prevBtn, "click", () => {
      viewDate = addMonths(viewDate, -1);
      render();
    });
    events.on(nextBtn, "click", () => {
      viewDate = addMonths(viewDate, 1);
      render();
    });
    header.append(prevBtn, title, nextBtn);
    host.appendChild(header);

    const jump = createElement("div", { className: "ui-datepicker-jump" });
    const monthSelect = createElement("select", {
      className: "ui-input ui-datepicker-select",
      attrs: { "aria-label": "Select month" },
    });
    getMonthOptions(currentOptions.locale).forEach((month, index) => {
      const option = createElement("option", {
        text: month,
        attrs: { value: String(index) },
      });
      monthSelect.appendChild(option);
    });
    monthSelect.value = String(viewDate.getMonth());

    const yearSelect = createElement("select", {
      className: "ui-input ui-datepicker-select",
      attrs: { "aria-label": "Select year" },
    });
    getYearRange(viewDate.getFullYear(), currentOptions.yearRangePast, currentOptions.yearRangeFuture).forEach((year) => {
      const option = createElement("option", {
        text: String(year),
        attrs: { value: String(year) },
      });
      yearSelect.appendChild(option);
    });
    yearSelect.value = String(viewDate.getFullYear());

    events.on(monthSelect, "change", () => {
      const month = Number(monthSelect.value);
      if (!Number.isFinite(month)) {
        return;
      }
      viewDate = new Date(viewDate.getFullYear(), month, 1);
      render();
    });
    events.on(yearSelect, "change", () => {
      const year = Number(yearSelect.value);
      if (!Number.isFinite(year)) {
        return;
      }
      viewDate = new Date(year, viewDate.getMonth(), 1);
      render();
    });

    jump.append(monthSelect, yearSelect);
    host.appendChild(jump);
  }

  function renderWeekdayRow(host) {
    const row = createElement("div", { className: "ui-datepicker-weekdays" });
    const weekNames = rotateWeekdays(DAY_NAMES, currentOptions.weekStartsOn);
    weekNames.forEach((day) => {
      row.appendChild(createElement("span", { className: "ui-datepicker-weekday", text: day }));
    });
    host.appendChild(row);
  }

  function renderCalendarGrid(host) {
    const grid = createElement("div", { className: "ui-datepicker-grid" });
    buildCalendarDays(viewDate, currentOptions.weekStartsOn).forEach((item) => {
      const classes = ["ui-datepicker-day"];
      if (item.outsideMonth) {
        classes.push("is-outside");
      }
      if (isSameDay(item.date, new Date())) {
        classes.push("is-today");
      }
      if (isSelected(item.date)) {
        classes.push("is-selected");
      }
      if (isInRange(item.date)) {
        classes.push("is-in-range");
      }
      if (currentOptions.mode === "range" && start && isSameDay(item.date, start)) {
        classes.push("is-range-start");
      }
      if (currentOptions.mode === "range" && end && isSameDay(item.date, end)) {
        classes.push("is-range-end");
      }
      const disabled = isDisabledDate(item.date);
      if (disabled) {
        classes.push("is-disabled");
      }
      const cell = createElement("button", {
        className: classes.join(" "),
        text: String(item.date.getDate()),
        attrs: { type: "button", disabled: disabled ? "disabled" : null },
      });
      if (!disabled) {
        events.on(cell, "click", () => {
          selectDate(item.date);
        });
      }
      grid.appendChild(cell);
    });
    host.appendChild(grid);
  }

  function renderTimeSection(host) {
    const wrap = createElement("div", { className: "ui-datepicker-time" });
    if (currentOptions.mode === "single") {
      wrap.appendChild(createElement("label", { className: "ui-datepicker-time-label", text: "Time" }));
      const input = createElement("input", {
        className: "ui-input",
        attrs: { type: "time" },
      });
      input.value = startTime;
      events.on(input, "input", () => {
        startTime = normalizeTime(input.value);
        emitChange();
      });
      wrap.appendChild(input);
    } else {
      const startLabel = createElement("label", { className: "ui-datepicker-time-label", text: "Start Time" });
      const startInput = createElement("input", { className: "ui-input", attrs: { type: "time" } });
      startInput.value = startTime;
      events.on(startInput, "input", () => {
        startTime = normalizeTime(startInput.value);
        emitChange();
      });

      const endLabel = createElement("label", { className: "ui-datepicker-time-label", text: "End Time" });
      const endInput = createElement("input", { className: "ui-input", attrs: { type: "time" } });
      endInput.value = endTime;
      events.on(endInput, "input", () => {
        endTime = normalizeTime(endInput.value);
        emitChange();
      });

      wrap.append(startLabel, startInput, endLabel, endInput);
    }
    host.appendChild(wrap);
  }

  function selectDate(date) {
    if (currentOptions.mode === "single") {
      start = atTime(date, startTime);
      end = null;
      emitChange();
      if (currentOptions.closeOnSelect) {
        open = false;
      }
      render();
      return;
    }

    if (!start || (start && end)) {
      start = atTime(date, startTime);
      end = null;
      emitChange();
      render();
      return;
    }

    const next = atTime(date, endTime);
    if (compareDay(next, start) < 0) {
      end = start;
      start = atTime(next, startTime);
    } else {
      end = next;
    }
    emitChange();
    if (currentOptions.closeOnSelect) {
      open = false;
    }
    render();
  }

  function isSelected(date) {
    if (!start) {
      return false;
    }
    if (currentOptions.mode === "single") {
      return isSameDay(date, start);
    }
    return isSameDay(date, start) || (end ? isSameDay(date, end) : false);
  }

  function isInRange(date) {
    if (currentOptions.mode !== "range" || !start || !end) {
      return false;
    }
    const d = startOfDay(date).getTime();
    const a = startOfDay(start).getTime();
    const b = startOfDay(end).getTime();
    return d > Math.min(a, b) && d < Math.max(a, b);
  }

  function isDisabledDate(date) {
    const day = startOfDay(date);
    const minDate = currentOptions.min ? startOfDay(parseAnyDate(currentOptions.min)) : null;
    const maxDate = currentOptions.max ? startOfDay(parseAnyDate(currentOptions.max)) : null;
    if (minDate && day < minDate) {
      return true;
    }
    if (maxDate && day > maxDate) {
      return true;
    }
    if (typeof currentOptions.disabledDates === "function") {
      return Boolean(currentOptions.disabledDates(new Date(day)));
    }
    return false;
  }

  function getDisplayValue() {
    if (currentOptions.mode === "single") {
      if (!start) {
        return currentOptions.placeholder;
      }
      return formatValue(start, currentOptions.locale, currentOptions.showTime);
    }
    if (!start && !end) {
      return currentOptions.placeholder;
    }
    const s = start ? formatValue(start, currentOptions.locale, currentOptions.showTime) : "";
    const e = end ? formatValue(end, currentOptions.locale, currentOptions.showTime) : "";
    return e ? `${s} - ${e}` : `${s} -`;
  }

  function hydrateValue(value) {
    if (currentOptions.mode === "single") {
      const date = parseAnyDate(value);
      start = date;
      end = null;
      if (date) {
        startTime = formatTime(date);
        viewDate = startOfMonth(date);
      }
      return;
    }

    const pair = parseRange(value);
    start = pair.start;
    end = pair.end;
    if (start) {
      startTime = formatTime(start);
      viewDate = startOfMonth(start);
    }
    if (end) {
      endTime = formatTime(end);
    }
  }

  function emitChange() {
    if (typeof currentOptions.onChange !== "function") {
      return;
    }
    currentOptions.onChange(getValue(), getState());
  }

  function bindGlobal() {
    globalEvents.clear();
    if (!open) {
      return;
    }
    globalEvents.on(document, "mousedown", (event) => {
      const target = event.target;
      if (target && root && !root.contains(target)) {
        open = false;
        render();
        restoreFocus();
      }
    });
    globalEvents.on(document, "keydown", (event) => {
      if (event.key === "Escape") {
        open = false;
        render();
        restoreFocus();
      }
    });
  }

  function restoreFocus() {
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      try {
        lastFocusedElement.focus();
      } catch (_error) {
        // Ignore focus restore failures.
      }
    }
    lastFocusedElement = null;
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    hydrateValue(currentOptions.value);
    render();
  }

  function setValue(nextValue) {
    hydrateValue(nextValue);
    emitChange();
    render();
  }

  function getValue() {
    if (currentOptions.mode === "single") {
      return start ? start.toISOString() : null;
    }
    return {
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
    };
  }

  function getState() {
    return {
      open,
      mode: currentOptions.mode,
      viewDate: viewDate.toISOString(),
      start: start ? start.toISOString() : null,
      end: end ? end.toISOString() : null,
      startTime,
      endTime,
      options: { ...currentOptions },
    };
  }

  function destroy() {
    globalEvents.clear();
    events.clear();
    clearNode(container);
    root = null;
    trigger = null;
    panel = null;
  }

  render();

  return {
    update,
    setValue,
    getValue,
    getState,
    destroy,
  };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.ariaLabel = String(next.ariaLabel || "Date picker");
  next.mode = next.mode === "range" ? "range" : "single";
  const week = Number(next.weekStartsOn);
  next.weekStartsOn = Number.isFinite(week) ? ((week % 7) + 7) % 7 : 0;
  const past = Number(next.yearRangePast);
  const future = Number(next.yearRangeFuture);
  next.yearRangePast = Number.isFinite(past) && past >= 0 ? Math.floor(past) : DEFAULT_OPTIONS.yearRangePast;
  next.yearRangeFuture = Number.isFinite(future) && future >= 0 ? Math.floor(future) : DEFAULT_OPTIONS.yearRangeFuture;
  return next;
}

function parseAnyDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseRange(value) {
  if (Array.isArray(value)) {
    return {
      start: parseAnyDate(value[0]),
      end: parseAnyDate(value[1]),
    };
  }
  if (value && typeof value === "object") {
    return {
      start: parseAnyDate(value.start),
      end: parseAnyDate(value.end),
    };
  }
  return { start: null, end: null };
}

function buildCalendarDays(monthDate, weekStartsOn) {
  const first = startOfMonth(monthDate);
  const startOffset = (first.getDay() - weekStartsOn + 7) % 7;
  const gridStart = addDays(first, -startOffset);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(gridStart, i);
    days.push({
      date,
      outsideMonth: date.getMonth() !== first.getMonth(),
    });
  }
  return days;
}

function rotateWeekdays(days, start) {
  const head = days.slice(start);
  const tail = days.slice(0, start);
  return head.concat(tail);
}

function getMonthOptions(locale) {
  const formatter = new Intl.DateTimeFormat(locale, { month: "short" });
  const year = 2026;
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    months.push(formatter.format(new Date(year, i, 1)));
  }
  return months;
}

function getYearRange(baseYear, past, future) {
  const years = [];
  for (let year = baseYear + future; year >= baseYear - past; year -= 1) {
    years.push(year);
  }
  return years;
}

function addMonths(date, amount) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + amount);
  return startOfMonth(next);
}

function addDays(date, amount) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function compareDay(a, b) {
  const x = startOfDay(a).getTime();
  const y = startOfDay(b).getTime();
  if (x === y) {
    return 0;
  }
  return x < y ? -1 : 1;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMonthYear(date, locale) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function formatValue(date, locale, withTime) {
  if (!withTime) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    return "00:00";
  }
  const [h, m] = text.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return "00:00";
  }
  const clampedH = Math.max(0, Math.min(23, h));
  const clampedM = Math.max(0, Math.min(59, m));
  return `${String(clampedH).padStart(2, "0")}:${String(clampedM).padStart(2, "0")}`;
}

function atTime(date, time) {
  const next = new Date(date.getTime());
  const normalized = normalizeTime(time);
  const [h, m] = normalized.split(":").map((part) => Number(part));
  next.setHours(h, m, 0, 0);
  return next;
}

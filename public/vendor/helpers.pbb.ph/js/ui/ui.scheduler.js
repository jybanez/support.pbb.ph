import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  chrome: true,
  ariaLabel: "Scheduler",
  view: "month", // month | week
  locale: "en-US",
  weekStartsOn: 0, // 0=Sunday
  events: [], // { id, title, start, end?, color? }
  onViewChange: null,
  onDateChange: null,
  onSlotClick: null,
  onEventClick: null,
};

export function createScheduler(container, data = {}, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let currentDate = normalizeDate(data?.date);
  let currentEvents = normalizeEvents(data?.events ?? currentOptions.events);

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    const root = createElement("section", {
      className: `ui-scheduler${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className || ""}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });
    const header = renderHeader();
    const body = currentOptions.view === "week" ? renderWeekView() : renderMonthView();
    root.append(header, body);
    container.appendChild(root);
  }

  function renderHeader() {
    const header = createElement("header", { className: "ui-scheduler-header" });
    const left = createElement("div", { className: "ui-scheduler-header-left" });
    const prevBtn = createElement("button", { className: "ui-button", text: "Prev", attrs: { type: "button" } });
    const todayBtn = createElement("button", { className: "ui-button", text: "Today", attrs: { type: "button" } });
    const nextBtn = createElement("button", { className: "ui-button", text: "Next", attrs: { type: "button" } });
    events.on(prevBtn, "click", () => shiftRange(-1));
    events.on(todayBtn, "click", () => {
      currentDate = startOfDay(new Date());
      currentOptions.onDateChange?.(currentDate, getState());
      render();
    });
    events.on(nextBtn, "click", () => shiftRange(1));
    left.append(prevBtn, todayBtn, nextBtn);

    const title = createElement("h3", {
      className: "ui-title ui-scheduler-title",
      text: formatTitle(currentDate, currentOptions.view, currentOptions.locale),
    });

    const right = createElement("div", { className: "ui-scheduler-header-right" });
    const monthBtn = createElement("button", {
      className: `ui-button${currentOptions.view === "month" ? " ui-button-primary" : ""}`,
      text: "Month",
      attrs: { type: "button" },
    });
    const weekBtn = createElement("button", {
      className: `ui-button${currentOptions.view === "week" ? " ui-button-primary" : ""}`,
      text: "Week",
      attrs: { type: "button" },
    });
    events.on(monthBtn, "click", () => setView("month"));
    events.on(weekBtn, "click", () => setView("week"));
    right.append(monthBtn, weekBtn);

    header.append(left, title, right);
    return header;
  }

  function renderMonthView() {
    const grid = createElement("div", { className: "ui-scheduler-month" });
    const weekdayRow = createElement("div", { className: "ui-scheduler-weekdays" });
    getWeekdayNames(currentOptions.locale, currentOptions.weekStartsOn).forEach((label) => {
      weekdayRow.appendChild(createElement("div", { className: "ui-scheduler-weekday", text: label }));
    });
    grid.appendChild(weekdayRow);

    const daysWrap = createElement("div", { className: "ui-scheduler-days" });
    const first = startOfMonth(currentDate);
    const firstGridDate = startOfWeek(first, currentOptions.weekStartsOn);
    for (let i = 0; i < 42; i += 1) {
      const day = addDays(firstGridDate, i);
      const inMonth = day.getMonth() === currentDate.getMonth();
      const cell = createElement("button", {
        className: `ui-scheduler-day${inMonth ? "" : " is-muted"}${isSameDay(day, new Date()) ? " is-today" : ""}`,
        attrs: { type: "button" },
      });
      const label = createElement("span", { className: "ui-scheduler-day-label", text: String(day.getDate()) });
      cell.appendChild(label);
      const eventList = createElement("div", { className: "ui-scheduler-day-events" });
      const dayEvents = currentEvents.filter((entry) => isSameDay(entry.start, day));
      dayEvents.slice(0, 3).forEach((entry) => {
        const badge = createElement("button", {
          className: "ui-scheduler-event",
          text: entry.title,
          attrs: { type: "button" },
        });
        if (entry.color) {
          badge.style.borderColor = entry.color;
        }
        events.on(badge, "click", (event) => {
          event.stopPropagation();
          currentOptions.onEventClick?.(entry, getState());
        });
        eventList.appendChild(badge);
      });
      if (dayEvents.length > 3) {
        eventList.appendChild(createElement("span", {
          className: "ui-scheduler-more",
          text: `+${dayEvents.length - 3} more`,
        }));
      }
      cell.appendChild(eventList);
      events.on(cell, "click", () => {
        currentDate = startOfDay(day);
        currentOptions.onSlotClick?.({ date: currentDate, view: "month" }, getState());
        currentOptions.onDateChange?.(currentDate, getState());
        render();
      });
      daysWrap.appendChild(cell);
    }
    grid.appendChild(daysWrap);
    return grid;
  }

  function renderWeekView() {
    const wrap = createElement("div", { className: "ui-scheduler-week" });
    const start = startOfWeek(currentDate, currentOptions.weekStartsOn);
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(start, i);
      const col = createElement("div", {
        className: `ui-scheduler-week-col${isSameDay(day, new Date()) ? " is-today" : ""}`,
      });
      col.appendChild(createElement("div", {
        className: "ui-scheduler-week-col-head",
        text: new Intl.DateTimeFormat(currentOptions.locale, { weekday: "short", month: "short", day: "2-digit" }).format(day),
      }));
      const list = createElement("div", { className: "ui-scheduler-week-events" });
      const dayEvents = currentEvents.filter((entry) => isSameDay(entry.start, day));
      if (!dayEvents.length) {
        list.appendChild(createElement("p", { className: "ui-scheduler-empty", text: "No events." }));
      } else {
        dayEvents.forEach((entry) => {
          const item = createElement("button", {
            className: "ui-scheduler-event is-week",
            text: entry.title,
            attrs: { type: "button" },
          });
          if (entry.color) {
            item.style.borderColor = entry.color;
          }
          events.on(item, "click", () => currentOptions.onEventClick?.(entry, getState()));
          list.appendChild(item);
        });
      }
      events.on(col, "click", (event) => {
        if (event.target !== col && !event.target.classList.contains("ui-scheduler-week-col-head")) {
          return;
        }
        currentDate = startOfDay(day);
        currentOptions.onSlotClick?.({ date: currentDate, view: "week" }, getState());
        currentOptions.onDateChange?.(currentDate, getState());
        render();
      });
      col.appendChild(list);
      wrap.appendChild(col);
    }
    return wrap;
  }

  function shiftRange(direction) {
    const delta = direction < 0 ? -1 : 1;
    currentDate = currentOptions.view === "week"
      ? addDays(currentDate, delta * 7)
      : addMonths(currentDate, delta);
    currentOptions.onDateChange?.(currentDate, getState());
    render();
  }

  function setView(nextView) {
    const normalized = nextView === "week" ? "week" : "month";
    if (normalized === currentOptions.view) {
      return;
    }
    currentOptions.view = normalized;
    currentOptions.onViewChange?.(normalized, getState());
    render();
  }

  function update(nextData = {}, nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    if (nextData && Object.prototype.hasOwnProperty.call(nextData, "date")) {
      currentDate = normalizeDate(nextData.date);
    }
    if (nextData && (Object.prototype.hasOwnProperty.call(nextData, "events") || Object.prototype.hasOwnProperty.call(nextOptions, "events"))) {
      currentEvents = normalizeEvents(nextData.events ?? currentOptions.events);
    } else if (Object.prototype.hasOwnProperty.call(nextOptions, "events")) {
      currentEvents = normalizeEvents(currentOptions.events);
    }
    render();
  }

  function getState() {
    return {
      date: new Date(currentDate.getTime()),
      view: currentOptions.view,
      events: currentEvents.map((entry) => ({ ...entry, start: new Date(entry.start.getTime()), end: entry.end ? new Date(entry.end.getTime()) : null })),
      options: { ...currentOptions },
    };
  }

  function destroy() {
    events.clear();
    clearNode(container);
    root = null;
    viewport = null;
    rowsLayer = null;
    staticHost = null;
  }

  render();
  return {
    update,
    setView,
    setDate(nextDate) {
      currentDate = normalizeDate(nextDate);
      render();
    },
    getState,
    destroy,
  };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.chrome = next.chrome !== false;
  next.ariaLabel = String(next.ariaLabel || "Scheduler");
  next.view = String(next.view || "month").toLowerCase() === "week" ? "week" : "month";
  next.weekStartsOn = clamp(Math.round(Number(next.weekStartsOn) || 0), 0, 6);
  return next;
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return startOfDay(new Date());
  }
  return startOfDay(date);
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) {
    return [];
  }
  return events
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const start = new Date(entry.start || entry.date || Date.now());
      if (Number.isNaN(start.getTime())) {
        return null;
      }
      const end = entry.end ? new Date(entry.end) : null;
      return {
        id: String(entry.id ?? `event-${index + 1}`),
        title: String(entry.title ?? `Event ${index + 1}`),
        start,
        end: end && !Number.isNaN(end.getTime()) ? end : null,
        color: entry.color == null ? "" : String(entry.color),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function formatTitle(date, view, locale) {
  if (view === "week") {
    const start = startOfWeek(date, 0);
    const end = addDays(start, 6);
    return `${new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit" }).format(start)} - ${new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit", year: "numeric" }).format(end)}`;
  }
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function getWeekdayNames(locale, weekStartsOn) {
  const base = startOfWeek(new Date(), weekStartsOn);
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(addDays(base, index))
  );
}

function startOfDay(date) {
  const next = new Date(date.getTime());
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(date) {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function startOfWeek(date, weekStartsOn) {
  const next = startOfDay(date);
  const day = next.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(next, -diff);
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function addMonths(date, months) {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return startOfDay(next);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Timeline scrubber",
  valueLabel: "Timeline position",
  rangeStartLabel: "Range start",
  rangeEndLabel: "Range end",
  durationMs: 60_000,
  valueMs: 0,
  enableRange: false,
  range: null, // { startMs, endMs }
  zoom: 1,
  zoomLevels: [1, 2, 5],
  showZoomControls: true,
  seekStepMs: 1_000,
  seekStepMsFast: 10_000,
  preventPageScrollOnInteract: true,
  onSeek: null,
  onRangeChange: null,
  onZoomChange: null,
};

export function createTimelineScrubber(container, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let durationMs = currentOptions.durationMs;
  let valueMs = clampMs(currentOptions.valueMs, durationMs);
  let rangeStartMs = 0;
  let rangeEndMs = durationMs;
  let zoom = currentOptions.zoom;

  if (currentOptions.enableRange && currentOptions.range) {
    const normalized = normalizeRange(currentOptions.range, durationMs);
    rangeStartMs = normalized.startMs;
    rangeEndMs = normalized.endMs;
  }

  let root = null;
  let currentLabel = null;
  let totalLabel = null;
  let viewport = null;
  let rail = null;
  let fill = null;
  let rangeNode = null;
  let thumb = null;
  let startHandle = null;
  let endHandle = null;
  let tickWrap = null;
  let dragState = null;
  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: `ui-timeline-scrubber ${currentOptions.className || ""}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    const top = createElement("div", { className: "ui-timeline-scrubber-top" });
    const labels = createElement("div", { className: "ui-timeline-scrubber-labels" });
    currentLabel = createElement("span", { className: "ui-timeline-scrubber-current", text: formatDuration(valueMs, durationMs) });
    totalLabel = createElement("span", { className: "ui-timeline-scrubber-total", text: formatDuration(durationMs, durationMs) });
    labels.append(currentLabel, totalLabel);
    top.appendChild(labels);

    if (currentOptions.showZoomControls) {
      const controls = createElement("div", { className: "ui-timeline-scrubber-zoom" });
      currentOptions.zoomLevels.forEach((level) => {
        const button = createElement("button", {
          className: `ui-button ui-timeline-scrubber-zoom-btn${level === zoom ? " is-active" : ""}`,
          text: `${level}x`,
          attrs: { type: "button" },
        });
        events.on(button, "click", () => {
          setZoom(level, { emit: true });
        });
        controls.appendChild(button);
      });
      top.appendChild(controls);
    }
    root.appendChild(top);

    viewport = createElement("div", { className: "ui-timeline-scrubber-viewport" });
    rail = createElement("div", { className: "ui-timeline-scrubber-rail" });
    rail.setAttribute("tabindex", "0");
    rail.setAttribute("role", "slider");
    rail.setAttribute("aria-label", currentOptions.valueLabel);
    rail.setAttribute("aria-valuemin", "0");
    rail.setAttribute("aria-valuemax", String(durationMs));
    rail.setAttribute("aria-valuenow", String(valueMs));
    rail.style.width = `${Math.max(100, zoom * 100)}%`;
    fill = createElement("div", { className: "ui-timeline-scrubber-fill" });
    rangeNode = createElement("div", { className: "ui-timeline-scrubber-range" });
    thumb = createElement("button", {
      className: "ui-timeline-scrubber-thumb",
      attrs: { type: "button", "aria-label": currentOptions.valueLabel },
    });
    startHandle = createElement("button", {
      className: "ui-timeline-scrubber-handle is-start",
      attrs: {
        type: "button",
        "aria-label": currentOptions.rangeStartLabel,
        role: "slider",
      },
    });
    endHandle = createElement("button", {
      className: "ui-timeline-scrubber-handle is-end",
      attrs: {
        type: "button",
        "aria-label": currentOptions.rangeEndLabel,
        role: "slider",
      },
    });

    rail.append(fill, rangeNode, thumb);
    if (currentOptions.enableRange) {
      rail.append(startHandle, endHandle);
      events.on(startHandle, "pointerdown", (event) => startDrag(event, "range-start"));
      events.on(endHandle, "pointerdown", (event) => startDrag(event, "range-end"));
      events.on(startHandle, "keydown", (event) => onHandleKeyDown(event, "range-start"));
      events.on(endHandle, "keydown", (event) => onHandleKeyDown(event, "range-end"));
      events.on(startHandle, "mousedown", (event) => event.preventDefault());
      events.on(endHandle, "mousedown", (event) => event.preventDefault());
      events.on(startHandle, "touchstart", (event) => event.preventDefault(), { passive: false });
      events.on(endHandle, "touchstart", (event) => event.preventDefault(), { passive: false });
    }
    events.on(thumb, "pointerdown", (event) => startDrag(event, "value"));
    events.on(thumb, "mousedown", (event) => event.preventDefault());
    events.on(thumb, "touchstart", (event) => event.preventDefault(), { passive: false });
    events.on(rail, "mousedown", (event) => event.preventDefault());
    events.on(rail, "touchstart", (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    }, { passive: false });
    events.on(rail, "pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      rail.focus({ preventScroll: true });
      if (event.target === thumb || event.target === startHandle || event.target === endHandle) {
        return;
      }
      const ms = getMsFromPointer(event);
      setTime(ms, { emit: true });
      startDrag(event, "value");
    });
    events.on(rail, "keydown", onRailKeyDown);
    events.on(viewport, "wheel", onViewportWheel, { passive: false });

    viewport.appendChild(rail);
    root.appendChild(viewport);

    tickWrap = createElement("div", { className: "ui-timeline-scrubber-ticks" });
    [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
      tickWrap.appendChild(createElement("span", {
        className: "ui-timeline-scrubber-tick",
        text: formatDuration(Math.round(durationMs * ratio), durationMs),
      }));
    });
    root.appendChild(tickWrap);

    container.appendChild(root);
    syncVisuals();
  }

  function onViewportWheel(event) {
    if (!currentOptions.preventPageScrollOnInteract || !viewport || !rail) {
      return;
    }
    const canScrollX = viewport.scrollWidth > viewport.clientWidth;
    if (!canScrollX) {
      return;
    }
    const horizontalIntent = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
    if (horizontalIntent) {
      return;
    }
    viewport.scrollLeft += event.deltaY;
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function onRailKeyDown(event) {
    if (!rail) {
      return;
    }
    const isFast = event.shiftKey;
    const step = Math.max(1, Number(isFast ? currentOptions.seekStepMsFast : currentOptions.seekStepMs) || 1000);
    let handled = true;
    if (event.key === "ArrowLeft") {
      setTime(valueMs - step, { emit: true });
    } else if (event.key === "ArrowRight") {
      setTime(valueMs + step, { emit: true });
    } else if (event.key === "Home") {
      setTime(0, { emit: true });
    } else if (event.key === "End") {
      setTime(durationMs, { emit: true });
    } else if (event.key === "PageUp") {
      setTime(valueMs + (step * 5), { emit: true });
    } else if (event.key === "PageDown") {
      setTime(valueMs - (step * 5), { emit: true });
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
    }
  }

  function onHandleKeyDown(event, type) {
    const isFast = event.shiftKey;
    const step = Math.max(1, Number(isFast ? currentOptions.seekStepMsFast : currentOptions.seekStepMs) || 1000);
    let nextValue = type === "range-start" ? rangeStartMs : rangeEndMs;
    let handled = true;
    if (event.key === "ArrowLeft") {
      nextValue -= step;
    } else if (event.key === "ArrowRight") {
      nextValue += step;
    } else if (event.key === "Home") {
      nextValue = 0;
    } else if (event.key === "End") {
      nextValue = durationMs;
    } else if (event.key === "PageUp") {
      nextValue += step * 5;
    } else if (event.key === "PageDown") {
      nextValue -= step * 5;
    } else {
      handled = false;
    }
    if (!handled) {
      return;
    }
    event.preventDefault();
    if (type === "range-start") {
      setRange(nextValue, rangeEndMs, { emit: true });
      startHandle?.focus({ preventScroll: true });
      return;
    }
    setRange(rangeStartMs, nextValue, { emit: true });
    endHandle?.focus({ preventScroll: true });
  }

  function syncVisuals() {
    if (!rail) {
      return;
    }
    const valuePct = toPct(valueMs, durationMs);
    fill.style.width = `${valuePct}%`;
    thumb.style.left = `${valuePct}%`;
    currentLabel.textContent = formatDuration(valueMs, durationMs);
    totalLabel.textContent = formatDuration(durationMs, durationMs);
    rail.setAttribute("aria-valuemax", String(durationMs));
    rail.setAttribute("aria-valuenow", String(valueMs));
    rail.setAttribute("aria-valuetext", formatDuration(valueMs, durationMs));

    if (currentOptions.enableRange) {
      const startPct = toPct(rangeStartMs, durationMs);
      const endPct = toPct(rangeEndMs, durationMs);
      rangeNode.style.left = `${startPct}%`;
      rangeNode.style.width = `${Math.max(0, endPct - startPct)}%`;
      startHandle.style.left = `${startPct}%`;
      endHandle.style.left = `${endPct}%`;
      startHandle.setAttribute("aria-valuemin", "0");
      startHandle.setAttribute("aria-valuemax", String(rangeEndMs));
      startHandle.setAttribute("aria-valuenow", String(rangeStartMs));
      startHandle.setAttribute("aria-valuetext", formatDuration(rangeStartMs, durationMs));
      endHandle.setAttribute("aria-valuemin", String(rangeStartMs));
      endHandle.setAttribute("aria-valuemax", String(durationMs));
      endHandle.setAttribute("aria-valuenow", String(rangeEndMs));
      endHandle.setAttribute("aria-valuetext", formatDuration(rangeEndMs, durationMs));
      rangeNode.hidden = false;
      startHandle.hidden = false;
      endHandle.hidden = false;
    } else {
      rangeNode.hidden = true;
      startHandle.hidden = true;
      endHandle.hidden = true;
    }
  }

  function startDrag(event, type) {
    if (event.cancelable) {
      event.preventDefault();
    }
    event.stopPropagation();
    if (!rail) {
      return;
    }
    rail.focus({ preventScroll: true });
    dragState = { type, pointerId: event.pointerId };
    if (event.target && typeof event.target.setPointerCapture === "function" && event.pointerId != null) {
      event.target.setPointerCapture(event.pointerId);
    }
    const onMove = (moveEvent) => {
      if (!dragState) {
        return;
      }
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }
      const ms = getMsFromPointer(moveEvent);
      if (dragState.type === "value") {
        setTime(ms, { emit: true });
        return;
      }
      if (dragState.type === "range-start") {
        setRange(ms, rangeEndMs, { emit: true });
        return;
      }
      if (dragState.type === "range-end") {
        setRange(rangeStartMs, ms, { emit: true });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dragState = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function getMsFromPointer(event) {
    const rect = rail.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width || 1);
    const ratio = rect.width ? x / rect.width : 0;
    return Math.round(durationMs * ratio);
  }

  function setTime(ms, config = {}) {
    valueMs = clampMs(ms, durationMs);
    if (currentOptions.enableRange) {
      valueMs = clamp(valueMs, rangeStartMs, rangeEndMs);
    }
    syncVisuals();
    if (config.emit) {
      currentOptions.onSeek?.(valueMs, getState());
    }
  }

  function setRange(startMs, endMs, config = {}) {
    const normalized = normalizeRange({ startMs, endMs }, durationMs);
    rangeStartMs = normalized.startMs;
    rangeEndMs = normalized.endMs;
    valueMs = clamp(valueMs, rangeStartMs, rangeEndMs);
    syncVisuals();
    if (config.emit) {
      currentOptions.onRangeChange?.({ startMs: rangeStartMs, endMs: rangeEndMs }, getState());
    }
  }

  function setZoom(nextZoom, config = {}) {
    const allowed = currentOptions.zoomLevels;
    const zoomValue = allowed.includes(Number(nextZoom)) ? Number(nextZoom) : allowed[0] || 1;
    zoom = zoomValue;
    render();
    if (config.emit) {
      currentOptions.onZoomChange?.(zoom, getState());
    }
  }

  function setDuration(nextDurationMs) {
    durationMs = Math.max(1, Number(nextDurationMs) || 1);
    valueMs = clampMs(valueMs, durationMs);
    if (currentOptions.enableRange) {
      setRange(rangeStartMs, rangeEndMs, { emit: false });
    }
    render();
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    durationMs = currentOptions.durationMs;
    if (Object.prototype.hasOwnProperty.call(nextOptions, "valueMs")) {
      valueMs = clampMs(nextOptions.valueMs, durationMs);
    } else {
      valueMs = clampMs(valueMs, durationMs);
    }
    if (currentOptions.enableRange && Object.prototype.hasOwnProperty.call(nextOptions, "range")) {
      const normalized = normalizeRange(nextOptions.range, durationMs);
      rangeStartMs = normalized.startMs;
      rangeEndMs = normalized.endMs;
    }
    if (Object.prototype.hasOwnProperty.call(nextOptions, "zoom")) {
      zoom = currentOptions.zoomLevels.includes(Number(nextOptions.zoom)) ? Number(nextOptions.zoom) : currentOptions.zoom;
    } else if (!currentOptions.zoomLevels.includes(zoom)) {
      zoom = currentOptions.zoom;
    }
    render();
  }

  function destroy() {
    events.clear();
    clearNode(container);
    root = null;
  }

  function getState() {
    return {
      options: { ...currentOptions },
      durationMs,
      valueMs,
      zoom,
      range: currentOptions.enableRange
        ? { startMs: rangeStartMs, endMs: rangeEndMs }
        : null,
    };
  }

  render();

  return {
    update,
    setTime,
    setRange(startMs, endMs) {
      setRange(startMs, endMs, { emit: false });
    },
    setDuration,
    setZoom(nextZoom) {
      setZoom(nextZoom, { emit: false });
    },
    getValue() {
      return valueMs;
    },
    getState,
    destroy,
  };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.durationMs = Math.max(1, Number(next.durationMs) || 1);
  next.valueMs = clampMs(next.valueMs, next.durationMs);
  next.enableRange = Boolean(next.enableRange);
  next.zoomLevels = Array.isArray(next.zoomLevels) && next.zoomLevels.length
    ? next.zoomLevels.map((level) => Math.max(1, Number(level) || 1))
    : [1, 2, 5];
  next.zoom = next.zoomLevels.includes(Number(next.zoom)) ? Number(next.zoom) : next.zoomLevels[0];
  return next;
}

function normalizeRange(range, durationMs) {
  const rawStart = Number(range?.startMs);
  const rawEnd = Number(range?.endMs);
  let startMs = Number.isFinite(rawStart) ? rawStart : 0;
  let endMs = Number.isFinite(rawEnd) ? rawEnd : durationMs;
  startMs = clampMs(startMs, durationMs);
  endMs = clampMs(endMs, durationMs);
  if (startMs > endMs) {
    const tmp = startMs;
    startMs = endMs;
    endMs = tmp;
  }
  return { startMs, endMs };
}

function clampMs(value, durationMs) {
  return clamp(Math.round(Number(value) || 0), 0, durationMs);
}

function toPct(ms, durationMs) {
  if (!durationMs) {
    return 0;
  }
  return (clampMs(ms, durationMs) / durationMs) * 100;
}

function formatDuration(ms, contextDurationMs = 0) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const contextSeconds = Math.max(totalSeconds, Math.floor((Number(contextDurationMs) || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (contextSeconds >= 86400) {
    return `${String(days).padStart(2, "0")}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  if (contextSeconds >= 3600) {
    const totalHours = Math.floor(totalSeconds / 3600);
    return `${String(totalHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

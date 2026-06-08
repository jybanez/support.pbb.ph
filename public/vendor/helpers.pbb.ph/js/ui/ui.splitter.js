import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  orientation: "horizontal", // horizontal = left/right, vertical = top/bottom
  initialRatio: 0.5,
  minRatio: 0.2,
  maxRatio: 0.8,
  paneA: null,
  paneB: null,
  onResize: null,
};

export function createSplitter(container, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let ratio = clamp(currentOptions.initialRatio, currentOptions.minRatio, currentOptions.maxRatio);
  let root = null;
  let divider = null;
  let paneA = null;
  let paneB = null;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: [
        "ui-splitter",
        `ui-splitter--${currentOptions.orientation}`,
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
    });
    paneA = createElement("div", { className: "ui-splitter-pane is-a" });
    paneB = createElement("div", { className: "ui-splitter-pane is-b" });
    divider = createElement("button", {
      className: "ui-splitter-divider",
      attrs: { type: "button", "aria-label": "Resize panes" },
    });

    setSlot(paneA, currentOptions.paneA, "Pane A");
    setSlot(paneB, currentOptions.paneB, "Pane B");

    root.append(paneA, divider, paneB);
    container.appendChild(root);
    applyRatio();

    events.on(divider, "pointerdown", startDrag);
    events.on(divider, "mousedown", startDragMouse);
    events.on(divider, "touchstart", startDragTouch, { passive: false });
    events.on(divider, "keydown", onDividerKeyDown);
  }

  function startDrag(event) {
    event.preventDefault();
    try {
      if (typeof divider?.setPointerCapture === "function" && event.pointerId != null) {
        divider.setPointerCapture(event.pointerId);
      }
    } catch (_) {
      // ignore unsupported pointer capture
    }
    beginDrag(() => ({ x: event.clientX, y: event.clientY }), {
      moveEvent: "pointermove",
      endEvents: ["pointerup", "pointercancel"],
      extract: (moveEvent) => ({ x: moveEvent.clientX, y: moveEvent.clientY }),
    });
  }

  function startDragMouse(event) {
    if (typeof window.PointerEvent !== "undefined") {
      return;
    }
    event.preventDefault();
    beginDrag(() => ({ x: event.clientX, y: event.clientY }), {
      moveEvent: "mousemove",
      endEvents: ["mouseup"],
      extract: (moveEvent) => ({ x: moveEvent.clientX, y: moveEvent.clientY }),
    });
  }

  function startDragTouch(event) {
    if (!event.touches || !event.touches[0]) {
      return;
    }
    event.preventDefault();
    beginDrag(() => ({ x: event.touches[0].clientX, y: event.touches[0].clientY }), {
      moveEvent: "touchmove",
      endEvents: ["touchend", "touchcancel"],
      extract: (moveEvent) => {
        const touch = moveEvent.touches?.[0] ?? moveEvent.changedTouches?.[0];
        return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
      },
      moveOptions: { passive: false },
    });
  }

  function beginDrag(getStartPoint, config) {
    const rect = root.getBoundingClientRect();
    const docEl = document.documentElement;
    const body = document.body;
    root.classList.add("is-dragging");
    if (docEl) {
      docEl.style.userSelect = "none";
      docEl.style.cursor = currentOptions.orientation === "vertical" ? "row-resize" : "col-resize";
    }
    if (body) {
      body.style.userSelect = "none";
      body.style.cursor = currentOptions.orientation === "vertical" ? "row-resize" : "col-resize";
    }
    const start = getStartPoint();
    if (start && Number.isFinite(start.x) && Number.isFinite(start.y)) {
      const rawStart = currentOptions.orientation === "vertical"
        ? ((start.y - rect.top) / Math.max(1, rect.height))
        : ((start.x - rect.left) / Math.max(1, rect.width));
      setRatio(rawStart, { emit: true });
    }
    const onMove = (moveEvent) => {
      if (typeof moveEvent.preventDefault === "function") {
        moveEvent.preventDefault();
      }
      const point = config.extract(moveEvent);
      const raw = currentOptions.orientation === "vertical"
        ? ((point.y - rect.top) / Math.max(1, rect.height))
        : ((point.x - rect.left) / Math.max(1, rect.width));
      setRatio(raw, { emit: true });
    };
    const onUp = () => {
      window.removeEventListener(config.moveEvent, onMove, config.moveOptions);
      for (const eventName of config.endEvents) {
        window.removeEventListener(eventName, onUp);
      }
      root.classList.remove("is-dragging");
      if (docEl) {
        docEl.style.userSelect = "";
        docEl.style.cursor = "";
      }
      if (body) {
        body.style.userSelect = "";
        body.style.cursor = "";
      }
    };
    window.addEventListener(config.moveEvent, onMove, config.moveOptions);
    for (const eventName of config.endEvents) {
      window.addEventListener(eventName, onUp);
    }
  }

  function onDividerKeyDown(event) {
    const step = 0.02;
    let handled = true;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      setRatio(ratio - step, { emit: true });
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      setRatio(ratio + step, { emit: true });
    } else if (event.key === "Home") {
      setRatio(currentOptions.minRatio, { emit: true });
    } else if (event.key === "End") {
      setRatio(currentOptions.maxRatio, { emit: true });
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
    }
  }

  function applyRatio() {
    if (!root) {
      return;
    }
    const ratioA = `${Math.max(0.0001, ratio)}fr`;
    const ratioB = `${Math.max(0.0001, 1 - ratio)}fr`;
    root.style.setProperty("--ui-splitter-ratio-a", String(ratio));
    root.style.setProperty("--ui-splitter-ratio-b", String(1 - ratio));
    if (currentOptions.orientation === "vertical") {
      root.style.gridTemplateRows = `${ratioA} 8px ${ratioB}`;
      root.style.gridTemplateColumns = "";
    } else {
      root.style.gridTemplateColumns = `${ratioA} 8px ${ratioB}`;
      root.style.gridTemplateRows = "";
    }
  }

  function setRatio(nextRatio, config = {}) {
    ratio = clamp(Number(nextRatio) || 0.5, currentOptions.minRatio, currentOptions.maxRatio);
    applyRatio();
    if (config.emit) {
      currentOptions.onResize?.(ratio, getState());
    }
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    if (Object.prototype.hasOwnProperty.call(nextOptions, "initialRatio")) {
      ratio = clamp(currentOptions.initialRatio, currentOptions.minRatio, currentOptions.maxRatio);
    } else {
      ratio = clamp(ratio, currentOptions.minRatio, currentOptions.maxRatio);
    }
    render();
  }

  function getState() {
    return {
      ratio,
      options: { ...currentOptions },
    };
  }

  function destroy() {
    events.clear();
    clearNode(container);
    root = null;
    divider = null;
    paneA = null;
    paneB = null;
  }

  render();
  return {
    update,
    setRatio,
    getState,
    destroy,
  };
}

function setSlot(target, value, fallback) {
  clearNode(target);
  if (value == null) {
    target.appendChild(createElement("p", { className: "ui-splitter-empty", text: fallback }));
    return;
  }
  if (typeof value === "function") {
    setSlot(target, value(), fallback);
    return;
  }
  if (value instanceof HTMLElement) {
    target.appendChild(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => setSlot(target, entry, fallback));
    return;
  }
  target.appendChild(document.createTextNode(String(value)));
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.orientation = String(next.orientation || "horizontal").toLowerCase() === "vertical"
    ? "vertical"
    : "horizontal";
  next.initialRatio = clamp(Number(next.initialRatio) || 0.5, 0.05, 0.95);
  next.minRatio = clamp(Number(next.minRatio) || 0.2, 0.05, 0.95);
  next.maxRatio = clamp(Number(next.maxRatio) || 0.8, 0.05, 0.95);
  if (next.minRatio > next.maxRatio) {
    const temp = next.minRatio;
    next.minRatio = next.maxRatio;
    next.maxRatio = temp;
  }
  return next;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

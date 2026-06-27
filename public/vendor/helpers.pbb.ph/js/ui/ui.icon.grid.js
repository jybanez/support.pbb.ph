import { createElement, clearNode } from "./ui.dom.js";
import { createIcon } from "./ui.icons.js?v=0.21.86";

const DEFAULT_OPTIONS = {
  ariaLabel: "Application launcher",
  className: "",
  columns: "auto",
  minTileWidth: 92,
  iconSize: 52,
  chrome: true,
  editable: true,
  autoArrange: true,
  scrollable: false,
  maxHeight: "",
  touchDragDelay: 280,
  touchHoldTolerance: 36,
  activateOnClick: true,
  layout: null,
  slots: 0,
  emptyText: "No applications available.",
  emptySlotLabel: "Empty slot",
  keyboardReorder: true,
  onActivate: null,
  onSelect: null,
  onLayoutChange: null,
  onReorderStart: null,
  onReorderEnd: null,
};

const ALLOWED_TONES = new Set(["neutral", "info", "success", "warning", "danger", "critical"]);
const ALLOWED_STATUSES = new Set(["online", "warning", "offline", "unknown", "busy"]);

export function createIconGrid(container, items = [], options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createIconGrid] A container element is required.");
  }

  let currentItems = normalizeItems(items);
  let currentOptions = normalizeOptions(options);
  let currentOrder = resolveOrder(currentItems, currentOptions.layout, currentOptions);
  let selectedId = "";
  let root = null;
  let dragId = "";
  let pointerDrag = null;
  let touchDrag = null;
  let edgeScrollFrame = 0;
  let suppressClickUntil = 0;
  let suppressClickTimer = 0;
  let destroyed = false;

  function render() {
    if (destroyed) {
      return;
    }
    const previousScrollTop = currentOptions.scrollable && root ? root.scrollTop : 0;
    clearNode(container);
    root = createElement("section", {
      className: buildRootClass(currentOptions),
      attrs: {
        "aria-label": currentOptions.ariaLabel,
      },
      dataset: {
        columns: currentOptions.columns,
        chrome: currentOptions.chrome ? "true" : "false",
        editable: currentOptions.editable ? "true" : "false",
        scrollable: currentOptions.scrollable ? "true" : "false",
      },
    });
    root.style.setProperty("--ui-icon-grid-min-tile-width", `${currentOptions.minTileWidth}px`);
    root.style.setProperty("--ui-icon-grid-icon-size", `${currentOptions.iconSize}px`);
    if (currentOptions.maxHeight) {
      root.style.setProperty("--ui-icon-grid-max-height", currentOptions.maxHeight);
    } else {
      root.style.removeProperty("--ui-icon-grid-max-height");
    }

    if (!currentItems.length) {
      root.appendChild(createElement("div", {
        className: "ui-icon-grid-empty",
        text: currentOptions.emptyText,
      }));
      container.appendChild(root);
      restoreScrollTop(previousScrollTop);
      return;
    }

    const slotCount = getSlotCount();
    for (let index = 0; index < slotCount; index += 1) {
      const item = getItemById(currentOrder[index]);
      root.appendChild(item ? renderTile(item, index) : renderEmptySlot(index));
    }
    container.appendChild(root);
    restoreScrollTop(previousScrollTop);
  }

  function restoreScrollTop(scrollTop) {
    if (!currentOptions.scrollable || !root || !scrollTop) {
      return;
    }
    root.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (root) {
        root.scrollTop = scrollTop;
      }
    });
  }

  function renderTile(item, index) {
    const isSelected = item.id === selectedId;
    const tile = createElement("button", {
      className: buildTileClass(item, isSelected),
      attrs: {
        type: "button",
        draggable: currentOptions.editable && !item.disabled ? "true" : "false",
        "aria-label": buildTileAriaLabel(item, index),
        "aria-pressed": isSelected ? "true" : "false",
        disabled: item.disabled ? "disabled" : null,
        title: item.description || item.label,
      },
      dataset: {
        id: item.id,
        index,
        tone: item.tone,
        status: item.status,
      },
    });

    tile.appendChild(renderIcon(item));
    tile.appendChild(createElement("span", { className: "ui-icon-grid-label", text: item.label }));
    if (item.badge) {
      tile.appendChild(createElement("span", { className: "ui-icon-grid-badge", text: item.badge }));
    }
    if (item.status !== "unknown") {
      tile.appendChild(createElement("span", {
        className: `ui-icon-grid-status ui-icon-grid-status--${item.status}`,
        attrs: { "aria-label": `Status: ${item.status}` },
      }));
    }

    tile.addEventListener("click", (event) => {
      if (shouldSuppressClick() || item.disabled) {
        return;
      }
      selectedId = item.id;
      currentOptions.onSelect?.(cloneItem(item), { id: item.id, index, layout: getLayout() });
      if (currentOptions.activateOnClick) {
        currentOptions.onActivate?.(cloneItem(item), { id: item.id, index, href: item.href, event });
      }
      render();
    });

    tile.addEventListener("contextmenu", (event) => {
      if (!currentOptions.editable || item.disabled) {
        return;
      }
      event.preventDefault();
    });

    tile.addEventListener("keydown", (event) => {
      const nextIndex = keyboardTargetIndex(index, event.key);
      if (nextIndex === index) {
        return;
      }
      if (shouldKeyboardReorder(event)) {
        event.preventDefault();
        moveItem(index, nextIndex, "keyboard");
        requestAnimationFrame(() => {
          root?.querySelector(`[data-id="${cssEscape(item.id)}"]`)?.focus();
        });
        return;
      }
      const focusIndex = keyboardFocusTargetIndex(index, event.key);
      if (focusIndex !== index) {
        event.preventDefault();
        root?.querySelector(`[data-index="${focusIndex}"].ui-icon-grid-tile`)?.focus();
      }
    });

    tile.addEventListener("dragstart", (event) => {
      if (!currentOptions.editable || item.disabled) {
        event.preventDefault();
        return;
      }
      dragId = item.id;
      tile.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
      currentOptions.onReorderStart?.(cloneItem(item), { id: item.id, index, layout: getLayout() });
    });
    tile.addEventListener("dragend", () => {
      tile.classList.remove("is-dragging");
      dragId = "";
      suppressNextSyntheticClick();
    });
    tile.addEventListener("pointerdown", (event) => {
      if (!currentOptions.editable || item.disabled || event.pointerType === "mouse" || event.pointerType === "touch") {
        return;
      }
      pointerDrag = {
        id: item.id,
        fromIndex: index,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        timer: 0,
        active: false,
      };
      pointerDrag.timer = window.setTimeout(() => {
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
          return;
        }
        pointerDrag.active = true;
        dragId = pointerDrag.id;
        tile.classList.add("is-dragging");
        tile.setPointerCapture?.(event.pointerId);
        currentOptions.onReorderStart?.(cloneItem(item), { id: item.id, index, layout: getLayout(), source: "pointer" });
      }, currentOptions.touchDragDelay);
    });
    tile.addEventListener("pointermove", (event) => {
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
        return;
      }
      pointerDrag.lastX = event.clientX;
      pointerDrag.lastY = event.clientY;
      const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
      if (!pointerDrag.active && distance > currentOptions.touchHoldTolerance) {
        cancelPointerDragTimer();
        return;
      }
      if (pointerDrag.active) {
        event.preventDefault();
        updatePointerDropTarget(event.clientX, event.clientY);
        scheduleEdgeScroll(event.clientY);
      }
    });
    tile.addEventListener("pointerup", (event) => {
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
        return;
      }
      const wasActive = pointerDrag.active;
      const fromIndex = pointerDrag.fromIndex;
      cancelPointerDragTimer();
      pointerDrag = null;
      tile.releasePointerCapture?.(event.pointerId);
      tile.classList.remove("is-dragging");
      clearPointerDropTargets();
      cancelEdgeScroll();
      if (wasActive) {
        event.preventDefault();
        suppressNextSyntheticClick();
        const targetIndex = findDropIndexAt(event.clientX, event.clientY);
        if (targetIndex >= 0) {
          moveItem(fromIndex, targetIndex, "pointer");
        }
      }
      dragId = "";
    });
    tile.addEventListener("pointercancel", (event) => {
      if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) {
        return;
      }
      cancelPointerDragTimer();
      pointerDrag = null;
      dragId = "";
      tile.classList.remove("is-dragging");
      clearPointerDropTargets();
      cancelEdgeScroll();
    });
    tile.addEventListener("touchstart", (event) => {
      if (!currentOptions.editable || item.disabled || event.touches.length !== 1) {
        return;
      }
      const touch = event.touches[0];
      touchDrag = {
        id: item.id,
        fromIndex: index,
        touchId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        timer: 0,
        clone: null,
        offsetX: 0,
        offsetY: 0,
        active: false,
        tile,
        item: cloneItem(item),
      };
      touchDrag.timer = window.setTimeout(() => {
        if (!touchDrag || touchDrag.touchId !== touch.identifier) {
          return;
        }
        startTouchDragMode(touchDrag, tile, item, index);
      }, currentOptions.touchDragDelay);
    }, { passive: true });
    tile.addEventListener("touchmove", (event) => {
      if (!touchDrag) {
        return;
      }
      const touch = findTouch(event.changedTouches, touchDrag.touchId) || findTouch(event.touches, touchDrag.touchId);
      if (!touch) {
        return;
      }
      touchDrag.lastX = touch.clientX;
      touchDrag.lastY = touch.clientY;
      if (!touchDrag.active && event.cancelable) {
        event.preventDefault();
      }
      if (touchDrag.active) {
        if (event.cancelable) {
          event.preventDefault();
        }
        moveTouchDragClone(touchDrag, touch.clientX, touch.clientY);
        updatePointerDropTarget(touch.clientX, touch.clientY);
        scheduleEdgeScroll(touch.clientY);
      }
    }, { passive: false });
    tile.addEventListener("touchend", (event) => {
      if (!touchDrag) {
        return;
      }
      const touch = findTouch(event.changedTouches, touchDrag.touchId);
      if (!touch) {
        return;
      }
      const wasActive = touchDrag.active;
      const fromIndex = touchDrag.fromIndex;
      const endX = touch.clientX;
      const endY = touch.clientY;
      const activeDrag = touchDrag;
      cleanupTouchDrag();
      clearPointerDropTargets();
      cancelEdgeScroll();
      dragId = "";
      if (wasActive) {
        if (event.cancelable) {
          event.preventDefault();
        }
        suppressNextSyntheticClick();
        const targetIndex = findDropIndexAt(endX, endY);
        if (targetIndex >= 0) {
          moveItem(fromIndex, targetIndex, "touch");
        } else {
          currentOptions.onReorderEnd?.(activeDrag.item, { id: activeDrag.id, fromIndex, toIndex: fromIndex, source: "touch", cancelled: true, layout: getLayout() });
        }
      }
    }, { passive: false });
    tile.addEventListener("touchcancel", (event) => {
      if (!touchDrag) {
        return;
      }
      const touch = findTouch(event.changedTouches, touchDrag.touchId);
      if (!touch) {
        return;
      }
      const activeDrag = touchDrag;
      cleanupTouchDrag();
      dragId = "";
      clearPointerDropTargets();
      cancelEdgeScroll();
      if (activeDrag?.active) {
        currentOptions.onReorderEnd?.(activeDrag.item, { id: activeDrag.id, fromIndex: activeDrag.fromIndex, toIndex: activeDrag.fromIndex, source: "touch", cancelled: true, layout: getLayout() });
      }
    });
    attachDropHandlers(tile, index);

    return tile;
  }

  function renderIcon(item) {
    const wrap = createElement("span", {
      className: "ui-icon-grid-icon",
      attrs: { "aria-hidden": "true" },
    });
    if (item.image) {
      wrap.appendChild(createElement("img", {
        attrs: {
          alt: "",
          src: item.image,
          loading: "lazy",
        },
      }));
      return wrap;
    }
    if (item.icon) {
      try {
        wrap.appendChild(createIcon(item.icon, { size: currentOptions.iconSize }));
        return wrap;
      } catch (_error) {
        // Fall through to initial fallback.
      }
    }
    wrap.appendChild(createElement("span", {
      className: "ui-icon-grid-initial",
      text: item.initial,
    }));
    return wrap;
  }

  function renderEmptySlot(index) {
    const slot = createElement("div", {
      className: "ui-icon-grid-slot",
      attrs: {
        role: "presentation",
        "aria-label": currentOptions.emptySlotLabel,
      },
      dataset: { index },
    });
    attachDropHandlers(slot, index);
    return slot;
  }

  function attachDropHandlers(element, index) {
    element.addEventListener("dragover", (event) => {
      if (!currentOptions.editable || !dragId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      element.classList.add("is-drop-target");
    });
    element.addEventListener("dragleave", () => {
      element.classList.remove("is-drop-target");
    });
    element.addEventListener("drop", (event) => {
      if (!currentOptions.editable) {
        return;
      }
      event.preventDefault();
      element.classList.remove("is-drop-target");
      const id = event.dataTransfer.getData("text/plain") || dragId;
      const fromIndex = currentOrder.indexOf(id);
      if (fromIndex < 0) {
        return;
      }
      moveItem(fromIndex, index, "drag");
    });
  }

  function moveItem(fromIndex, toIndex, source) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(toIndex, Math.max(getSlotCount() - 1, 0)));
    const nextOrder = currentOrder.slice();
    const id = nextOrder[fromIndex];
    if (!id) {
      return;
    }
    if (currentOptions.autoArrange) {
      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(Math.min(boundedIndex, nextOrder.length), 0, id);
      currentOrder = normalizeOrder(nextOrder, currentItems);
    } else {
      while (nextOrder.length <= boundedIndex) {
        nextOrder.push(null);
      }
      const targetId = nextOrder[boundedIndex] || null;
      nextOrder[boundedIndex] = id;
      nextOrder[fromIndex] = targetId;
      currentOrder = normalizeSparseOrder(nextOrder, currentItems, currentOptions);
    }
    const item = getItemById(id);
    const layout = getLayout();
    currentOptions.onLayoutChange?.(layout, { id, item: item ? cloneItem(item) : null, fromIndex, toIndex: boundedIndex, source });
    currentOptions.onReorderEnd?.(item ? cloneItem(item) : null, { id, fromIndex, toIndex: boundedIndex, source, layout });
    render();
  }

  function suppressNextSyntheticClick() {
    suppressClickUntil = Date.now() + 220;
    if (suppressClickTimer) {
      window.clearTimeout(suppressClickTimer);
    }
    suppressClickTimer = window.setTimeout(() => {
      if (Date.now() >= suppressClickUntil) {
        suppressClickUntil = 0;
      }
      suppressClickTimer = 0;
    }, 240);
  }

  function shouldSuppressClick() {
    if (!suppressClickUntil) {
      return false;
    }
    if (Date.now() <= suppressClickUntil) {
      suppressClickUntil = 0;
      return true;
    }
    suppressClickUntil = 0;
    return false;
  }

  function updatePointerDropTarget(clientX, clientY) {
    clearPointerDropTargets();
    const target = document.elementFromPoint(clientX, clientY)?.closest?.(".ui-icon-grid-tile, .ui-icon-grid-slot");
    if (target && root?.contains(target)) {
      target.classList.add("is-drop-target");
    }
  }

  function cancelPointerDragTimer() {
    if (pointerDrag?.timer) {
      window.clearTimeout(pointerDrag.timer);
      pointerDrag.timer = 0;
    }
  }

  function cancelTouchDragTimer() {
    if (touchDrag?.timer) {
      window.clearTimeout(touchDrag.timer);
      touchDrag.timer = 0;
    }
  }

  function startTouchDragMode(state, tile, item, index) {
    if (!state || state.active) {
      return;
    }
    const rect = tile.getBoundingClientRect();
    state.active = true;
    state.offsetX = Math.max(0, Math.min(state.lastX - rect.left, rect.width));
    state.offsetY = Math.max(0, Math.min(state.lastY - rect.top, rect.height));
    dragId = state.id;
    root?.classList.add("is-drag-mode");
    tile.classList.add("is-dragging", "is-drag-source");
    state.clone = createTouchDragClone(tile, rect);
    moveTouchDragClone(state, state.lastX, state.lastY);
    currentOptions.onReorderStart?.(cloneItem(item), { id: item.id, index, layout: getLayout(), source: "touch" });
  }

  function createTouchDragClone(tile, rect) {
    const clone = tile.cloneNode(true);
    clone.classList.add("ui-icon-grid-drag-clone", "is-dragging");
    clone.removeAttribute("id");
    clone.setAttribute("aria-hidden", "true");
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    document.body.appendChild(clone);
    return clone;
  }

  function moveTouchDragClone(state, clientX, clientY) {
    if (!state?.clone) {
      return;
    }
    const x = clientX - state.offsetX;
    const y = clientY - state.offsetY;
    state.clone.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  function cleanupTouchDrag() {
    cancelTouchDragTimer();
    touchDrag?.tile?.classList.remove("is-dragging", "is-drag-source");
    touchDrag?.clone?.remove();
    root?.classList.remove("is-drag-mode");
    touchDrag = null;
  }

  function scheduleEdgeScroll(clientY) {
    if (!currentOptions.scrollable || !root || edgeScrollFrame) {
      return;
    }
    edgeScrollFrame = window.requestAnimationFrame(() => {
      edgeScrollFrame = 0;
      if ((!pointerDrag?.active && !touchDrag?.active) || !root) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const threshold = 44;
      const maxStep = 16;
      let delta = 0;
      if (clientY < rect.top + threshold) {
        delta = -Math.ceil(((rect.top + threshold - clientY) / threshold) * maxStep);
      } else if (clientY > rect.bottom - threshold) {
        delta = Math.ceil(((clientY - (rect.bottom - threshold)) / threshold) * maxStep);
      }
      if (delta !== 0) {
        root.scrollTop += delta;
        const activeDrag = pointerDrag?.active ? pointerDrag : touchDrag;
        updatePointerDropTarget(activeDrag.lastX, activeDrag.lastY);
        scheduleEdgeScroll(activeDrag.lastY);
      }
    });
  }

  function cancelEdgeScroll() {
    if (edgeScrollFrame) {
      window.cancelAnimationFrame(edgeScrollFrame);
      edgeScrollFrame = 0;
    }
  }

  function clearPointerDropTargets() {
    root?.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
  }

  function findDropIndexAt(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY)?.closest?.(".ui-icon-grid-tile, .ui-icon-grid-slot");
    if (!target || !root?.contains(target)) {
      return -1;
    }
    return Number(target.dataset.index);
  }

  function keyboardTargetIndex(index, key) {
    const columns = effectiveColumnCount();
    const maxIndex = Math.max(0, getSlotCount() - 1);
    if (key === "ArrowLeft") {
      return Math.max(0, index - 1);
    }
    if (key === "ArrowRight") {
      return Math.min(maxIndex, index + 1);
    }
    if (key === "ArrowUp") {
      return Math.max(0, index - columns);
    }
    if (key === "ArrowDown") {
      return Math.min(maxIndex, index + columns);
    }
    return index;
  }

  function keyboardFocusTargetIndex(index, key) {
    const columns = effectiveColumnCount();
    const maxIndex = Math.max(0, getSlotCount() - 1);
    const step = getKeyboardStep(key, columns);
    if (!step) {
      return index;
    }
    let nextIndex = index + step;
    while (nextIndex >= 0 && nextIndex <= maxIndex) {
      const item = getItemById(currentOrder[nextIndex]);
      if (item && !item.disabled) {
        return nextIndex;
      }
      nextIndex += step;
    }
    return index;
  }

  function getKeyboardStep(key, columns) {
    if (key === "ArrowLeft") {
      return -1;
    }
    if (key === "ArrowRight") {
      return 1;
    }
    if (key === "ArrowUp") {
      return -columns;
    }
    if (key === "ArrowDown") {
      return columns;
    }
    return 0;
  }

  function shouldKeyboardReorder(event) {
    return currentOptions.editable
      && currentOptions.keyboardReorder
      && (event.ctrlKey || event.metaKey);
  }

  function getSlotCount() {
    return Math.max(currentOrder.length, currentOptions.slots, currentItems.length);
  }

  function effectiveColumnCount() {
    if (currentOptions.columns !== "auto") {
      return Number(currentOptions.columns);
    }
    const width = root?.clientWidth || container.clientWidth || currentOptions.minTileWidth;
    return Math.max(1, Math.floor(width / currentOptions.minTileWidth));
  }

  function getItemById(id) {
    return currentItems.find((item) => item.id === id) || null;
  }

  function update(nextItems = currentItems, nextOptions = {}) {
    const previousOrder = currentOrder.slice();
    const hasExplicitLayout = Object.prototype.hasOwnProperty.call(nextOptions || {}, "layout");
    currentItems = normalizeItems(nextItems);
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    currentOrder = resolveOrder(currentItems, hasExplicitLayout ? currentOptions.layout : previousOrder, currentOptions);
    render();
  }

  function setItems(nextItems = []) {
    update(nextItems);
  }

  function setLayout(nextLayout = []) {
    currentOptions = normalizeOptions({ ...currentOptions, layout: nextLayout });
    currentOrder = resolveOrder(currentItems, currentOptions.layout, currentOptions);
    render();
  }

  function getLayout() {
    const columns = effectiveColumnCount();
    return currentOrder
      .map((id, index) => id ? ({
        id,
        index,
        row: Math.floor(index / columns),
        col: index % columns,
      }) : null)
      .filter(Boolean);
  }

  function getState() {
    return {
      items: currentItems.map(cloneItem),
      layout: getLayout(),
      selectedId,
      options: {
        ...currentOptions,
        onActivate: currentOptions.onActivate,
        onSelect: currentOptions.onSelect,
        onLayoutChange: currentOptions.onLayoutChange,
        onReorderStart: currentOptions.onReorderStart,
        onReorderEnd: currentOptions.onReorderEnd,
      },
    };
  }

  function destroy() {
    destroyed = true;
    if (suppressClickTimer) {
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = 0;
    }
    suppressClickUntil = 0;
    clearNode(container);
    root = null;
  }

  render();

  return {
    destroy,
    getLayout,
    getState,
    setItems,
    setLayout,
    update,
  };
}

function normalizeOptions(input = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(input || {}) };
  return {
    ...next,
    ariaLabel: String(next.ariaLabel || DEFAULT_OPTIONS.ariaLabel),
    className: String(next.className || ""),
    columns: normalizeColumns(next.columns),
    minTileWidth: normalizeNumber(next.minTileWidth, DEFAULT_OPTIONS.minTileWidth, 64, 220),
    iconSize: normalizeNumber(next.iconSize, DEFAULT_OPTIONS.iconSize, 24, 96),
    chrome: next.chrome !== false,
    editable: next.editable !== false,
    autoArrange: next.autoArrange !== false,
    scrollable: next.scrollable === true,
    maxHeight: normalizeCssSize(next.maxHeight),
    touchDragDelay: normalizeNumber(next.touchDragDelay, DEFAULT_OPTIONS.touchDragDelay, 120, 1200),
    touchHoldTolerance: normalizeNumber(next.touchHoldTolerance, DEFAULT_OPTIONS.touchHoldTolerance, 4, 48),
    activateOnClick: next.activateOnClick !== false,
    layout: next.layout || null,
    slots: Math.max(0, Math.floor(Number(next.slots) || 0)),
    emptyText: String(next.emptyText || DEFAULT_OPTIONS.emptyText),
    emptySlotLabel: String(next.emptySlotLabel || DEFAULT_OPTIONS.emptySlotLabel),
    keyboardReorder: next.keyboardReorder !== false,
    onActivate: typeof next.onActivate === "function" ? next.onActivate : null,
    onSelect: typeof next.onSelect === "function" ? next.onSelect : null,
    onLayoutChange: typeof next.onLayoutChange === "function" ? next.onLayoutChange : null,
    onReorderStart: typeof next.onReorderStart === "function" ? next.onReorderStart : null,
    onReorderEnd: typeof next.onReorderEnd === "function" ? next.onReorderEnd : null,
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item, index) => normalizeItem(item, index)).filter(Boolean);
}

function normalizeItem(item, index) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const id = String(item.id || item.key || `icon-${index}`).trim();
  if (!id) {
    return null;
  }
  const label = String(item.label || item.title || id).trim() || id;
  const tone = ALLOWED_TONES.has(item.tone) ? item.tone : "neutral";
  const status = ALLOWED_STATUSES.has(item.status) ? item.status : "unknown";
  return {
    id,
    label,
    description: String(item.description || item.subtitle || ""),
    href: String(item.href || item.url || ""),
    icon: String(item.icon || ""),
    image: String(item.image || item.imageUrl || ""),
    initial: String(item.initial || label.charAt(0) || "?").slice(0, 3).toUpperCase(),
    badge: String(item.badge || ""),
    status,
    tone,
    disabled: item.disabled === true,
    meta: clonePlain(item.meta || null),
  };
}

function normalizeColumns(value) {
  if (value === "auto" || value === undefined || value === null || value === "") {
    return "auto";
  }
  const numeric = Math.floor(Number(value));
  return numeric >= 1 && numeric <= 8 ? String(numeric) : "auto";
}

function normalizeNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function resolveOrder(items, layout, options = DEFAULT_OPTIONS) {
  const itemIds = items.map((item) => item.id);
  if (options.autoArrange) {
    const layoutIds = normalizeLayoutIds(layout);
    return normalizeOrder([...layoutIds, ...itemIds], items);
  }
  return normalizeSparseOrder(normalizeSparseLayout(layout, options), items, options);
}

function normalizeOrder(order, items) {
  const allowed = new Set(items.map((item) => item.id));
  const seen = new Set();
  const next = [];
  order.forEach((id) => {
    const key = String(id || "");
    if (allowed.has(key) && !seen.has(key)) {
      seen.add(key);
      next.push(key);
    }
  });
  items.forEach((item) => {
    if (!seen.has(item.id)) {
      next.push(item.id);
    }
  });
  return next;
}

function normalizeSparseOrder(order, items, options = DEFAULT_OPTIONS) {
  const allowed = new Set(items.map((item) => item.id));
  const seen = new Set();
  const minLength = Math.max(options.slots || 0, items.length, Array.isArray(order) ? order.length : 0);
  const next = Array.from({ length: minLength }, (_, index) => {
    const id = Array.isArray(order) ? order[index] : null;
    const key = id ? String(id) : "";
    if (key && allowed.has(key) && !seen.has(key)) {
      seen.add(key);
      return key;
    }
    return null;
  });
  items.forEach((item) => {
    if (seen.has(item.id)) {
      return;
    }
    const emptyIndex = next.findIndex((id) => !id);
    if (emptyIndex >= 0) {
      next[emptyIndex] = item.id;
    } else {
      next.push(item.id);
    }
    seen.add(item.id);
  });
  return trimSparseOrder(next, options.slots || 0);
}

function trimSparseOrder(order, minLength) {
  const next = order.slice();
  while (next.length > minLength && next.length && !next[next.length - 1]) {
    next.pop();
  }
  return next;
}

function normalizeLayoutIds(layout) {
  if (!Array.isArray(layout)) {
    return [];
  }
  if (layout.every((entry) => typeof entry === "string")) {
    return layout.map((entry) => String(entry));
  }
  return layout
    .map((entry, fallbackIndex) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const hasPosition = Number.isFinite(Number(entry.index))
        || (Number.isFinite(Number(entry.row)) && Number.isFinite(Number(entry.col)));
      const index = Number.isFinite(Number(entry.index))
        ? Number(entry.index)
        : (Number(entry.row) * 1000) + Number(entry.col);
      return {
        id: String(entry.id || ""),
        index: hasPosition ? index : fallbackIndex,
      };
    })
    .filter((entry) => entry?.id)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.id);
}

function normalizeSparseLayout(layout, options = DEFAULT_OPTIONS) {
  if (!Array.isArray(layout)) {
    return [];
  }
  if (layout.every((entry) => typeof entry === "string")) {
    return layout.map((entry) => String(entry));
  }
  const inferredColumns = inferLayoutColumns(layout, options);
  const entries = layout
    .map((entry, fallbackIndex) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const id = String(entry.id || "");
      if (!id) {
        return null;
      }
      const hasIndex = Number.isFinite(Number(entry.index));
      const hasRowCol = Number.isFinite(Number(entry.row)) && Number.isFinite(Number(entry.col));
      const index = hasIndex
        ? Number(entry.index)
        : hasRowCol
          ? (Number(entry.row) * inferredColumns) + Number(entry.col)
          : fallbackIndex;
      return { id, index: Math.max(0, Math.floor(index)) };
    })
    .filter(Boolean);
  const length = Math.max(options.slots || 0, ...entries.map((entry) => entry.index + 1), 0);
  const next = Array.from({ length }, () => null);
  entries
    .sort((a, b) => a.index - b.index)
    .forEach((entry) => {
      next[entry.index] = entry.id;
    });
  return next;
}

function inferLayoutColumns(layout, options) {
  const configured = Number(options.columns);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  const maxCol = layout.reduce((max, entry) => {
    const col = Number(entry?.col);
    return Number.isFinite(col) ? Math.max(max, col) : max;
  }, 0);
  return Math.max(1, maxCol + 1);
}

function buildRootClass(options) {
  return [
    "ui-icon-grid",
    `ui-icon-grid--columns-${options.columns}`,
    options.chrome ? "" : "is-chrome-less",
    options.editable ? "is-editable" : "is-readonly",
    options.scrollable ? "is-scrollable" : "",
    options.className,
  ].filter(Boolean).join(" ");
}

function buildTileClass(item, selected) {
  return [
    "ui-icon-grid-tile",
    `ui-icon-grid-tile--${item.tone}`,
    item.disabled ? "is-disabled" : "",
    selected ? "is-selected" : "",
  ].filter(Boolean).join(" ");
}

function buildTileAriaLabel(item, index) {
  const parts = [item.label, `Position ${index + 1}`];
  if (item.status !== "unknown") {
    parts.push(`Status ${item.status}`);
  }
  if (item.description) {
    parts.push(item.description);
  }
  return parts.join(", ");
}

function cloneItem(item) {
  return {
    ...item,
    meta: clonePlain(item.meta),
  };
}

function clonePlain(value) {
  if (value === null || value === undefined) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}

function normalizeCssSize(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `${value}px`;
  }
  const text = String(value).trim();
  return text || "";
}

function findTouch(touches, identifier) {
  for (let index = 0; index < touches.length; index += 1) {
    if (touches[index].identifier === identifier) {
      return touches[index];
    }
  }
  return null;
}

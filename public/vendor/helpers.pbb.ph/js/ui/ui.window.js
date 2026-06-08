const DEFAULT_MANAGER_OPTIONS = {
  container: null,
  bounds: "viewport",
  showTaskbar: true,
  taskbarMode: "auto",
  showTaskbarClose: true,
  taskbarItemOrder: "open-order",
  className: "",
  onWindowOpen: null,
  onWindowClose: null,
  onActiveChange: null,
};

const DEFAULT_WINDOW_OPTIONS = {
  id: "",
  title: "Window",
  content: null,
  width: 640,
  height: 420,
  x: null,
  y: null,
  minWidth: 320,
  minHeight: 220,
  draggable: true,
  resizable: true,
  minimizable: true,
  maximizable: true,
  closable: true,
  initialState: "normal",
  className: "",
  headerActions: [],
  onOpen: null,
  onClose: null,
  onFocus: null,
  onMove: null,
  onResize: null,
  onStateChange: null,
};

const RESIZE_DIRECTIONS = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

export function createWindowManager(options = {}) {
  const managerOptions = normalizeManagerOptions(options);
  const container = managerOptions.container || document.body;
  const containerIsBody = container === document.body;
  const effectiveTaskbarMode = resolveTaskbarMode(managerOptions.taskbarMode, containerIsBody);
  const previousPosition = !containerIsBody ? window.getComputedStyle(container).position : "";
  if (!containerIsBody && previousPosition === "static") {
    container.style.position = "relative";
  }

  const root = createNode("div", "ui-window-manager");
  root.classList.toggle("is-taskbar-hidden", managerOptions.showTaskbar === false);
  if (managerOptions.className) {
    root.classList.add(...splitClasses(managerOptions.className));
  }
  const layer = createNode("div", "ui-window-manager-layer");
  const taskbar = createNode("div", "ui-window-manager-taskbar");
  taskbar.hidden = true;
  root.append(layer, taskbar);
  container.appendChild(root);

  const windows = new Map();
  const windowOrder = [];
  let destroyed = false;
  let activeId = null;
  let generatedId = 0;
  let zCounter = 1200;

  if (containerIsBody) {
    root.classList.add("is-fixed");
  } else {
    root.classList.add("is-contained");
  }

  function getBoundsRect() {
    if (containerIsBody) {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    return { left: 0, top: 0, width: container.clientWidth, height: container.clientHeight };
  }

  function getWorkAreaRect() {
    const bounds = getBoundsRect();
    const taskbarHeight = taskbar.hidden ? 0 : taskbar.offsetHeight;
    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: Math.max(0, bounds.height - taskbarHeight),
    };
  }

  function focusWindow(id) {
    const win = windows.get(String(id || ""));
    if (!win || destroyed) {
      return false;
    }
    activeId = win.id;
    zCounter += 1;
    windows.forEach((entry) => entry.setActive(entry.id === win.id));
    win.setZIndex(zCounter);
    win.setActive(true);
    managerOptions.onActiveChange?.({ id: win.id, window: win.api, state: win.getState() });
    win.options.onFocus?.(win.getState());
    syncTaskbar();
    return true;
  }

  function syncTaskbar() {
    const taskbarWindows = getTaskbarEntries();
    const wasHidden = taskbar.hidden;
    taskbar.hidden = managerOptions.showTaskbar === false || taskbarWindows.length === 0;
    taskbar.replaceChildren();
    if (taskbar.hidden) {
      if (wasHidden !== taskbar.hidden) {
        windows.forEach((entry) => entry.syncMaximizedLayout?.());
      }
      return;
    }
    taskbarWindows.forEach((entry) => taskbar.appendChild(entry.buildTaskbarItem()));
    windows.forEach((entry) => entry.syncMaximizedLayout?.());
  }

  function getOrderedEntries() {
    const entries = Array.from(windows.values()).filter((entry) => !entry.state.destroyed && entry.state.open);
    if (managerOptions.taskbarItemOrder === "z-order") {
      return entries.sort((a, b) => a.state.zIndex - b.state.zIndex);
    }
    return entries.sort((a, b) => windowOrder.indexOf(a.id) - windowOrder.indexOf(b.id));
  }

  function getTaskbarEntries() {
    const entries = getOrderedEntries();
    if (effectiveTaskbarMode === "always") {
      return entries;
    }
    return entries.filter((entry) => entry.state.minimized);
  }

  function unregisterWindow(id) {
    const key = String(id || "");
    windows.delete(key);
    const index = windowOrder.indexOf(key);
    if (index >= 0) {
      windowOrder.splice(index, 1);
    }
    if (activeId === key) {
      activeId = null;
      const last = [...windowOrder].reverse().find((value) => windows.has(value) && windows.get(value).state.open && !windows.get(value).state.minimized);
      if (last) {
        focusWindow(last);
      }
    }
    syncTaskbar();
  }

  function registerWindow(win) {
    windows.set(win.id, win);
    windowOrder.push(win.id);
    syncTaskbar();
  }

  function closeWindow(id, meta = {}) {
    const win = windows.get(String(id || ""));
    if (!win) {
      return Promise.resolve(false);
    }
    return win.api.close(meta);
  }

  async function closeAll(meta = {}) {
    const entries = Array.from(windows.values());
    for (const entry of entries) {
      await entry.api.close(meta);
    }
  }

  function createWindow(options = {}) {
    if (destroyed) {
      throw new Error("Cannot create windows from a destroyed manager.");
    }
    const normalized = normalizeWindowOptions(options);
    const id = normalized.id || `ui-window-${++generatedId}`;
    if (windows.has(id)) {
      throw new Error(`Window id already exists: ${id}`);
    }
    const instance = createManagedWindow({
      id,
      options: normalized,
      layer,
      getBoundsRect,
      getWorkAreaRect,
      focusWindow,
      syncTaskbar,
      unregisterWindow,
      managerOptions,
      getNextZIndex() {
        zCounter += 1;
        return zCounter;
      },
    });
    registerWindow(instance);
    instance.api.open();
    if (normalized.initialState === "minimized") {
      instance.api.minimize();
    } else if (normalized.initialState === "maximized") {
      instance.api.maximize();
    }
    return instance.api;
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    Array.from(windows.values()).forEach((entry) => entry.destroy(true));
    windows.clear();
    windowOrder.length = 0;
    root.remove();
    if (!containerIsBody && previousPosition === "static") {
      container.style.position = "";
    }
  }

  return {
    refs: { root, layer, taskbar },
    createWindow,
    getWindows() {
      return Array.from(windows.values()).map((entry) => entry.api);
    },
    getTaskbarWindows() {
      return getTaskbarEntries().map((entry) => entry.api);
    },
    focusWindow,
    closeWindow,
    closeAll,
    destroy,
  };
}

function createManagedWindow(context) {
  const { id, options, layer, getBoundsRect, getWorkAreaRect, focusWindow, syncTaskbar, unregisterWindow, managerOptions, getNextZIndex } = context;

  const root = createNode("section", "ui-window");
  root.dataset.windowId = id;
  if (options.className) {
    root.classList.add(...splitClasses(options.className));
  }
  root.tabIndex = 0;

  const header = createNode("header", "ui-window-header");
  const title = createNode("div", "ui-window-title");
  title.textContent = options.title;
  const headerActions = createNode("div", "ui-window-header-actions");
  const controls = createNode("div", "ui-window-controls");
  const body = createNode("div", "ui-window-body");
  const titleWrap = createNode("div", "ui-window-title-wrap");
  titleWrap.append(title, headerActions);
  header.append(titleWrap, controls);
  root.append(header, body);

  RESIZE_DIRECTIONS.forEach((direction) => {
    const handle = createNode("div", `ui-window-resize-handle is-${direction}`);
    handle.dataset.direction = direction;
    root.appendChild(handle);
  });

  const state = {
    id,
    open: false,
    active: false,
    minimized: false,
    maximized: false,
    x: 0,
    y: 0,
    width: options.width,
    height: options.height,
    zIndex: getNextZIndex(),
    destroyed: false,
  };

  let restoreRect = null;
  let taskbarItem = null;
  let dragState = null;
  let resizeState = null;
  let animationState = "";
  let animationFrameId = 0;
  let animationTimerId = 0;

  function getState() {
    return {
      id: state.id,
      open: state.open,
      active: state.active,
      minimized: state.minimized,
      maximized: state.maximized,
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      zIndex: state.zIndex,
    };
  }

  function applyRect() {
    root.style.left = `${state.x}px`;
    root.style.top = `${state.y}px`;
    root.style.width = `${state.width}px`;
    root.style.height = `${state.height}px`;
    root.style.zIndex = String(state.zIndex);
    root.classList.toggle("is-active", state.active);
    root.classList.toggle("is-minimized", state.minimized && !animationState);
    root.classList.toggle("is-maximized", state.maximized);
    root.classList.toggle("is-animating", Boolean(animationState));
    root.classList.toggle("is-animating-minimize", animationState === "minimize");
    root.classList.toggle("is-animating-restore", animationState === "restore");
    root.hidden = !state.open || (state.minimized && !animationState);
  }

  function stopAnimation() {
    if (animationFrameId) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
    if (animationTimerId) {
      window.clearTimeout(animationTimerId);
      animationTimerId = 0;
    }
    animationState = "";
    root.style.opacity = "1";
    applyRect();
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function getTaskbarTargetRect() {
    const target = taskbarItem?.querySelector?.(".ui-window-taskbar-button") || taskbarItem;
    if (!target) {
      return null;
    }
    const targetRect = target.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    if (!targetRect || !layerRect) {
      return null;
    }
    return {
      x: Math.max(0, targetRect.left - layerRect.left),
      y: Math.max(0, targetRect.top - layerRect.top),
      width: Math.max(48, targetRect.width),
      height: Math.max(28, targetRect.height),
    };
  }

  function animateWindowRect(fromRect, toRect, kind, onComplete) {
    root.hidden = false;
    animationState = kind;
    root.style.opacity = kind === "restore" ? "0.7" : "1";
    applyRect();
    root.style.left = `${fromRect.x}px`;
    root.style.top = `${fromRect.y}px`;
    root.style.width = `${fromRect.width}px`;
    root.style.height = `${fromRect.height}px`;

    void root.offsetWidth;

    animationFrameId = window.requestAnimationFrame(() => {
      root.style.left = `${toRect.x}px`;
      root.style.top = `${toRect.y}px`;
      root.style.width = `${toRect.width}px`;
      root.style.height = `${toRect.height}px`;
      root.style.opacity = kind === "minimize" ? "0.45" : "1";
    });

    animationTimerId = window.setTimeout(() => {
      animationFrameId = 0;
      animationTimerId = 0;
      animationState = "";
      root.style.opacity = "1";
      onComplete?.();
    }, 190);
  }

  function clampRect(next) {
    const bounds = getBoundsRect();
    const minWidth = Math.max(220, options.minWidth);
    const minHeight = Math.max(160, options.minHeight);
    const width = Math.min(Math.max(minWidth, Number(next.width) || minWidth), bounds.width);
    const height = Math.min(Math.max(minHeight, Number(next.height) || minHeight), bounds.height);
    const maxX = Math.max(0, bounds.width - width);
    const maxY = Math.max(0, bounds.height - height);
    const x = Math.min(Math.max(0, Number(next.x) || 0), maxX);
    const y = Math.min(Math.max(0, Number(next.y) || 0), maxY);
    return { x, y, width, height };
  }

  function setRect(nextRect, reason) {
    const clamped = clampRect({ x: nextRect.x ?? state.x, y: nextRect.y ?? state.y, width: nextRect.width ?? state.width, height: nextRect.height ?? state.height });
    state.x = clamped.x;
    state.y = clamped.y;
    state.width = clamped.width;
    state.height = clamped.height;
    applyRect();
    if (reason === "move") {
      options.onMove?.(getState());
    }
    if (reason === "resize") {
      options.onResize?.(getState());
    }
  }

  function centerRect() {
    const bounds = getBoundsRect();
    const width = Math.min(Math.max(options.minWidth, options.width), bounds.width);
    const height = Math.min(Math.max(options.minHeight, options.height), bounds.height);
    return clampRect({
      x: Number.isFinite(options.x) ? options.x : Math.round((bounds.width - width) / 2),
      y: Number.isFinite(options.y) ? options.y : Math.round((bounds.height - height) / 2),
      width,
      height,
    });
  }

  function renderContent(contentValue) {
    body.replaceChildren();
    body.classList.remove("is-content-fill");
    const resolved = typeof contentValue === "function" ? contentValue(api) : contentValue;
    if (resolved instanceof Node) {
      if (resolved.nodeType === 1 && resolved.getAttribute?.("data-ui-window-fill") === "true") {
        body.classList.add("is-content-fill");
      }
      body.appendChild(resolved);
      return;
    }
    if (typeof resolved === "string") {
      body.innerHTML = resolved;
    }
  }

  function buildHeaderAction(action) {
    const button = createNode("button", `ui-button ui-button-${action.variant || "ghost"}`);
    button.type = "button";
    button.textContent = action.label || action.id || "Action";
    if (action.title) {
      button.title = action.title;
    }
    if (action.ariaLabel) {
      button.setAttribute("aria-label", action.ariaLabel);
    }
    button.addEventListener("click", async (event) => {
      focusWindow(id);
      const result = await action.onClick?.({ event, window: api, manager: null, state: getState() });
      if (result === false) {
        return;
      }
    });
    return button;
  }

  function renderHeaderActions() {
    headerActions.replaceChildren();
    (options.headerActions || []).forEach((action) => headerActions.appendChild(buildHeaderAction(action)));
  }

  function buildControl(type, label, text, handler) {
    const button = createNode("button", `ui-window-control is-${type}`);
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handler();
    });
    return button;
  }

  function renderControls() {
    controls.replaceChildren();
    if (options.minimizable) {
      controls.appendChild(buildControl("minimize", "Minimize window", "-", () => api.minimize()));
    }
    if (options.maximizable) {
      const label = state.maximized ? "Restore window" : "Maximize window";
      const text = state.maximized ? "▢" : "□";
      controls.appendChild(buildControl("maximize", label, text, () => state.maximized ? api.restore() : api.maximize()));
    }
    if (options.closable) {
      controls.appendChild(buildControl("close", "Close window", "×", () => api.close({ reason: "control" })));
    }
  }

  function setActive(next) {
    state.active = Boolean(next);
    applyRect();
  }

  function setZIndex(value) {
    state.zIndex = Number(value) || state.zIndex;
    applyRect();
  }
  function open() {
    if (state.destroyed) {
      return false;
    }
    if (!root.parentNode) {
      layer.appendChild(root);
    }
    if (!state.open) {
      const rect = centerRect();
      state.x = rect.x;
      state.y = rect.y;
      state.width = rect.width;
      state.height = rect.height;
      state.open = true;
      state.minimized = false;
      state.maximized = false;
      renderHeaderActions();
      renderControls();
      renderContent(options.content);
      options.onOpen?.(getState());
      managerOptions.onWindowOpen?.({ id, window: api, state: getState() });
    }
    applyRect();
    focus();
    return true;
  }

  async function close(meta = {}) {
    if (!state.open || state.destroyed) {
      return false;
    }
    stopAnimation();
    state.open = false;
    state.minimized = false;
    state.maximized = false;
    if (taskbarItem) {
      taskbarItem.remove();
      taskbarItem = null;
    }
    root.remove();
    syncTaskbar();
    options.onClose?.(meta, getState());
    managerOptions.onWindowClose?.({ id, window: api, state: getState(), meta });
    return true;
  }

  function focus() {
    if (!state.open || state.destroyed) {
      return false;
    }
    stopAnimation();
    state.minimized = false;
    applyRect();
    syncTaskbar();
    focusWindow(id);
    queueMicrotask(() => root.focus());
    return true;
  }

  function minimize() {
    if (!state.open || state.destroyed || !options.minimizable) {
      return false;
    }
    stopAnimation();
    const fromRect = { x: state.x, y: state.y, width: state.width, height: state.height };
    state.minimized = true;
    state.active = false;
    syncTaskbar();
    const targetRect = getTaskbarTargetRect();
    if (!targetRect || prefersReducedMotion()) {
      applyRect();
      options.onStateChange?.({ type: "minimize", state: getState() });
      return true;
    }
    animateWindowRect(fromRect, targetRect, "minimize", () => {
      applyRect();
      syncTaskbar();
      options.onStateChange?.({ type: "minimize", state: getState() });
    });
    return true;
  }

  function maximize() {
    if (!state.open || state.destroyed || !options.maximizable || state.maximized) {
      return false;
    }
    stopAnimation();
    restoreRect = { x: state.x, y: state.y, width: state.width, height: state.height };
    const workArea = getWorkAreaRect();
    state.maximized = true;
    state.minimized = false;
    setRect({ x: 0, y: 0, width: workArea.width, height: workArea.height }, "resize");
    renderControls();
    options.onStateChange?.({ type: "maximize", state: getState() });
    return true;
  }

  function restore() {
    if (!state.open || state.destroyed) {
      return false;
    }
    if (state.minimized) {
      stopAnimation();
      const startRect = getTaskbarTargetRect();
      const targetRect = { x: state.x, y: state.y, width: state.width, height: state.height };
      state.minimized = false;
      syncTaskbar();
      if (!startRect || prefersReducedMotion()) {
        applyRect();
        focusWindow(id);
        queueMicrotask(() => root.focus());
        options.onStateChange?.({ type: "restore", state: getState() });
        return true;
      }
      animateWindowRect(startRect, targetRect, "restore", () => {
        applyRect();
        focusWindow(id);
        queueMicrotask(() => root.focus());
        options.onStateChange?.({ type: "restore", state: getState() });
      });
      return true;
    }
    if (state.maximized) {
      stopAnimation();
      state.maximized = false;
      const rect = restoreRect || centerRect();
      setRect(rect, "resize");
      renderControls();
      options.onStateChange?.({ type: "restore", state: getState() });
      return true;
    }
    return false;
  }

  function setTitle(nextTitle) {
    options.title = String(nextTitle || "Window");
    title.textContent = options.title;
    if (taskbarItem) {
      const label = taskbarItem.querySelector(".ui-window-taskbar-label");
      if (label) {
        label.textContent = options.title;
      }
    }
  }

  function setContent(nextContent) {
    options.content = nextContent;
    renderContent(nextContent);
  }

  function setPosition(position = {}) {
    if (state.maximized) {
      return;
    }
    setRect({ x: position.x, y: position.y }, "move");
  }

  function setSize(size = {}) {
    if (state.maximized) {
      return;
    }
    setRect({ width: size.width, height: size.height }, "resize");
  }

  function syncMaximizedLayout() {
    if (!state.open || state.destroyed || state.minimized || !state.maximized) {
      return;
    }
    const workArea = getWorkAreaRect();
    setRect({ x: 0, y: 0, width: workArea.width, height: workArea.height }, "resize");
  }

  function buildTaskbarItem() {
    taskbarItem = createNode("div", "ui-window-taskbar-item");
    taskbarItem.classList.toggle("is-active", state.active && !state.minimized);
    taskbarItem.classList.toggle("is-minimized", state.minimized);
    const button = createNode("button", "ui-window-taskbar-button");
    button.type = "button";
    const label = createNode("span", "ui-window-taskbar-label");
    label.textContent = options.title;
    button.appendChild(label);
    button.addEventListener("click", () => {
      if (state.minimized) {
        api.restore();
        return;
      }
      api.focus();
    });
    taskbarItem.appendChild(button);
    if (options.closable && managerOptions.showTaskbarClose) {
      const closeButton = createNode("button", "ui-window-taskbar-close");
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", `Close ${options.title}`);
      closeButton.textContent = "×";
      closeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        api.close({ reason: "taskbar-close" });
      });
      taskbarItem.appendChild(closeButton);
    }
    return taskbarItem;
  }

  function destroy(skipUnregister = false) {
    if (state.destroyed) {
      return;
    }
    stopAnimation();
    state.destroyed = true;
    root.remove();
    taskbarItem?.remove();
    detachDocumentHandlers();
    if (!skipUnregister) {
      unregisterWindow(id);
    }
  }

  function beginDrag(event) {
    if (!options.draggable || state.maximized || event.button !== 0) {
      return;
    }
    if (isWindowHeaderInteractiveTarget(event.target)) {
      return;
    }
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      originX: state.x,
      originY: state.y,
    };
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", endDrag, { once: true });
    event.preventDefault();
  }

  function handleDragMove(event) {
    if (!dragState) {
      return;
    }
    setRect({ x: dragState.originX + (event.clientX - dragState.startX), y: dragState.originY + (event.clientY - dragState.startY) }, "move");
  }

  function endDrag() {
    dragState = null;
    document.removeEventListener("mousemove", handleDragMove);
  }

  function beginResize(event) {
    if (!options.resizable || state.maximized || event.button !== 0) {
      return;
    }
    const handle = event.currentTarget;
    resizeState = {
      direction: handle.dataset.direction,
      startX: event.clientX,
      startY: event.clientY,
      rect: { x: state.x, y: state.y, width: state.width, height: state.height },
    };
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", endResize, { once: true });
    event.preventDefault();
    event.stopPropagation();
  }

  function handleResizeMove(event) {
    if (!resizeState) {
      return;
    }
    const dx = event.clientX - resizeState.startX;
    const dy = event.clientY - resizeState.startY;
    const next = { ...resizeState.rect };
    const dir = resizeState.direction;
    if (dir.includes("e")) {
      next.width = resizeState.rect.width + dx;
    }
    if (dir.includes("s")) {
      next.height = resizeState.rect.height + dy;
    }
    if (dir.includes("w")) {
      next.x = resizeState.rect.x + dx;
      next.width = resizeState.rect.width - dx;
    }
    if (dir.includes("n")) {
      next.y = resizeState.rect.y + dy;
      next.height = resizeState.rect.height - dy;
    }
    setRect(next, "resize");
  }

  function endResize() {
    resizeState = null;
    document.removeEventListener("mousemove", handleResizeMove);
  }

  function detachDocumentHandlers() {
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mousemove", handleResizeMove);
  }

  header.addEventListener("mousedown", beginDrag);
  root.addEventListener("mousedown", () => focus());
  root.querySelectorAll(".ui-window-resize-handle").forEach((handle) => {
    handle.addEventListener("mousedown", beginResize);
  });

  const api = {
    id,
    refs: { root, header, body, title, headerActions, controls },
    open,
    close,
    focus,
    minimize,
    maximize,
    restore,
    setTitle,
    setContent,
    setPosition,
    setSize,
    getState,
    destroy,
  };

  const centered = centerRect();
  state.x = centered.x;
  state.y = centered.y;
  state.width = centered.width;
  state.height = centered.height;
  applyRect();
  renderHeaderActions();
  renderControls();
  renderContent(options.content);

  return { id, api, options, state, setActive, setZIndex, getState, syncMaximizedLayout, buildTaskbarItem, destroy };
}

function isWindowHeaderInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    ".ui-window-header-actions, .ui-window-controls, button, a, input, select, textarea, [role=\"button\"], [data-ui-window-no-drag]"
  ));
}

function normalizeManagerOptions(options = {}) {
  return {
    ...DEFAULT_MANAGER_OPTIONS,
    ...(options || {}),
    bounds: "viewport",
    taskbarMode: ["auto", "always", "minimized-only"].includes(String(options.taskbarMode || "").toLowerCase())
      ? String(options.taskbarMode || "").toLowerCase()
      : DEFAULT_MANAGER_OPTIONS.taskbarMode,
    taskbarItemOrder: ["open-order", "z-order"].includes(String(options.taskbarItemOrder || "").toLowerCase())
      ? String(options.taskbarItemOrder || "").toLowerCase()
      : DEFAULT_MANAGER_OPTIONS.taskbarItemOrder,
    showTaskbarClose: options.showTaskbarClose !== false,
    className: String(options.className || "").trim(),
  };
}

function resolveTaskbarMode(mode, containerIsBody) {
  if (mode === "always" || mode === "minimized-only") {
    return mode;
  }
  return containerIsBody ? "minimized-only" : "always";
}

function normalizeWindowOptions(options = {}) {
  const normalized = { ...DEFAULT_WINDOW_OPTIONS, ...(options || {}) };
  normalized.id = String(normalized.id || "").trim();
  normalized.title = String(normalized.title || DEFAULT_WINDOW_OPTIONS.title);
  normalized.width = toPositiveNumber(normalized.width, DEFAULT_WINDOW_OPTIONS.width);
  normalized.height = toPositiveNumber(normalized.height, DEFAULT_WINDOW_OPTIONS.height);
  normalized.minWidth = toPositiveNumber(normalized.minWidth, DEFAULT_WINDOW_OPTIONS.minWidth);
  normalized.minHeight = toPositiveNumber(normalized.minHeight, DEFAULT_WINDOW_OPTIONS.minHeight);
  normalized.x = Number.isFinite(normalized.x) ? normalized.x : null;
  normalized.y = Number.isFinite(normalized.y) ? normalized.y : null;
  normalized.className = String(normalized.className || "").trim();
  normalized.initialState = ["normal", "maximized", "minimized"].includes(String(normalized.initialState || "").toLowerCase())
    ? String(normalized.initialState || "").toLowerCase()
    : "normal";
  normalized.headerActions = Array.isArray(normalized.headerActions) ? normalized.headerActions.map(normalizeAction).filter(Boolean) : [];
  return normalized;
}

function normalizeAction(action) {
  if (!action || typeof action !== "object") {
    return null;
  }
  const label = String(action.label || action.id || "").trim();
  if (!label) {
    return null;
  }
  return {
    id: String(action.id || label).trim(),
    label,
    variant: String(action.variant || "ghost").trim(),
    title: String(action.title || "").trim(),
    ariaLabel: String(action.ariaLabel || "").trim(),
    onClick: typeof action.onClick === "function" ? action.onClick : null,
  };
}

function toPositiveNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function createNode(tagName, className) {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  return node;
}

function splitClasses(value) {
  return String(value || "").split(/\s+/).filter(Boolean);
}



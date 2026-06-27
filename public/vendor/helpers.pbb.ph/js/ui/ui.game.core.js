import { createElement, clearNode } from "./ui.dom.js";
import { createIcon } from "./ui.icons.js?v=0.21.86";

const DEFAULT_SESSION_OPTIONS = {
  title: "Game",
  ariaLabel: "Game session",
  className: "",
  fullscreen: true,
  closeLabel: "Close game",
  closeControl: null,
  closeOnEscape: true,
  width: 1280,
  height: 720,
  background: "#050b14",
  autoFocus: true,
  onBeforeClose: null,
  onClose: null,
};

const DEFAULT_LAYER_OPTIONS = {
  id: "",
  className: "",
  width: null,
  height: null,
  zIndex: 0,
  alpha: true,
  smoothing: false,
};

const DEFAULT_LOOP_OPTIONS = {
  autoStart: false,
  update: null,
  render: null,
  maxDelta: 0.08,
};

const DEFAULT_TOUCH_PAD_OPTIONS = {
  ariaLabel: "Game movement controls",
  className: "",
  disabled: false,
  visibility: "solid",
  opacity: null,
  directions: ["up", "left", "right", "down"],
  repeat: false,
  repeatDelay: 120,
  onDirection: null,
  onPress: null,
  onRelease: null,
  labels: {
    up: "Up",
    left: "Left",
    right: "Right",
    down: "Down",
  },
  icons: {
    up: "navigation.arrow-up",
    left: "navigation.arrow-left",
    right: "navigation.arrow-right",
    down: "navigation.arrow-down",
  },
};

const DEFAULT_ACTION_BUTTON_OPTIONS = {
  label: "Action",
  ariaLabel: "",
  className: "",
  buttonClassName: "",
  icon: "",
  disabled: false,
  visibility: "solid",
  opacity: null,
  repeat: false,
  repeatDelay: 120,
  holdThreshold: 0,
  onPress: null,
  onRepeat: null,
  onHold: null,
  onRelease: null,
};

const DEFAULT_ACTION_BUTTON_GROUP_OPTIONS = {
  ariaLabel: "Game action buttons",
  className: "",
  layout: "cluster",
  disabled: false,
  visibility: "solid",
  opacity: null,
  buttons: [],
  onPress: null,
  onRepeat: null,
  onHold: null,
  onRelease: null,
};

const DEFAULT_JOYSTICK_OPTIONS = {
  ariaLabel: "Virtual joystick",
  className: "",
  disabled: false,
  visibility: "solid",
  opacity: null,
  radius: 68,
  deadzone: 0.12,
  snapBack: true,
  onMove: null,
  onStart: null,
  onEnd: null,
};

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
};

export function createGameSession(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createGameSession] A container element is required.");
  }

  const events = createEmitter();
  let currentOptions = normalizeSessionOptions(options);
  let layers = [];
  let closed = false;
  let closePending = false;

  const root = createElement("section", {
    className: buildClass("ui-game-session", currentOptions.fullscreen ? "is-fullscreen" : "", currentOptions.className),
    attrs: {
      role: "dialog",
      "aria-modal": currentOptions.fullscreen ? "true" : "false",
      "aria-label": currentOptions.ariaLabel || currentOptions.title,
      tabindex: "-1",
    },
  });
  root.style.setProperty("--ui-game-background", currentOptions.background);
  root.style.setProperty("--ui-game-width", `${currentOptions.width}px`);
  root.style.setProperty("--ui-game-height", `${currentOptions.height}px`);
  root.style.setProperty("--ui-game-aspect", String(currentOptions.width / currentOptions.height));
  suppressGameControlContextMenu(root);

  const viewport = createElement("div", { className: "ui-game-viewport" });
  const stage = createElement("div", { className: "ui-game-stage" });
  const overlay = createElement("div", { className: "ui-game-overlay" });
  const closeButton = createSessionCloseButton(currentOptions);

  viewport.appendChild(stage);
  viewport.appendChild(overlay);
  root.appendChild(viewport);
  root.appendChild(closeButton);
  container.appendChild(root);

  closeButton.addEventListener("click", () => {
    void close("button");
  });
  root.addEventListener("keydown", handleKeydown);

  if (currentOptions.autoFocus) {
    requestAnimationFrame(() => root.focus({ preventScroll: true }));
  }

  function addLayer(layerOptions = {}) {
    const layer = createCanvasLayer(api, layerOptions);
    layers.push(layer);
    return layer;
  }

  function removeLayer(idOrLayer) {
    const id = typeof idOrLayer === "string" ? idOrLayer : idOrLayer?.id;
    const target = layers.find((layer) => layer === idOrLayer || layer.id === id);
    if (!target) {
      return false;
    }
    target.destroy();
    layers = layers.filter((layer) => layer !== target);
    return true;
  }

  function resize(width, height) {
    const nextWidth = normalizeDimension(width, currentOptions.width);
    const nextHeight = normalizeDimension(height, currentOptions.height);
    currentOptions = { ...currentOptions, width: nextWidth, height: nextHeight };
    root.style.setProperty("--ui-game-width", `${nextWidth}px`);
    root.style.setProperty("--ui-game-height", `${nextHeight}px`);
    root.style.setProperty("--ui-game-aspect", String(nextWidth / nextHeight));
    layers.forEach((layer) => layer.resize(nextWidth, nextHeight));
    events.emit("resize", { width: nextWidth, height: nextHeight });
  }

  async function close(reason = "api") {
    if (closed || closePending) {
      return false;
    }
    const payload = { reason };
    closePending = true;
    root.classList.add("is-close-pending");
    const shouldClose = await resolveCloseRequest(currentOptions, payload);
    if (!shouldClose) {
      closePending = false;
      root.classList.remove("is-close-pending");
      events.emit("closecancel", payload);
      return false;
    }
    closed = true;
    events.emit("close", payload);
    currentOptions.onClose?.(payload);
    destroy();
    return true;
  }

  function destroy() {
    root.removeEventListener("keydown", handleKeydown);
    layers.forEach((layer) => layer.destroy());
    layers = [];
    root.remove();
    events.clear();
  }

  function handleKeydown(event) {
    if (currentOptions.closeOnEscape && event.key === "Escape") {
      event.preventDefault();
      void close("escape");
    }
  }

  function getState() {
    return {
      closed,
      closePending,
      width: currentOptions.width,
      height: currentOptions.height,
      layerCount: layers.length,
      fullscreen: currentOptions.fullscreen,
    };
  }

  const api = {
    root,
    viewport,
    stage,
    overlay,
    closeButton,
    addLayer,
    close,
    destroy,
    getState,
    off: events.off,
    on: events.on,
    removeLayer,
    resize,
  };

  return api;
}

function createSessionCloseButton(options) {
  const control = options.closeControl;
  const isIcon = control.variant === "icon";
  const closeButton = createElement("button", {
    className: buildClass(
      "ui-game-close ui-button ui-button-quiet",
      isIcon ? "is-icon-only" : "is-text",
      control.className,
    ),
    attrs: {
      type: "button",
      "aria-label": options.closeLabel,
      title: isIcon ? options.closeLabel : null,
    },
  });

  if (isIcon) {
    closeButton.appendChild(createIcon(control.icon, { size: control.iconSize, decorative: true }));
  } else {
    closeButton.textContent = options.closeLabel;
  }

  return closeButton;
}

async function resolveCloseRequest(options, payload) {
  if (typeof options.onBeforeClose !== "function") {
    return true;
  }
  try {
    const result = await options.onBeforeClose(payload);
    return result !== false;
  } catch (error) {
    return false;
  }
}

export function createCanvasLayer(session, options = {}) {
  if (!session?.stage || session.stage.nodeType !== 1) {
    throw new Error("[createCanvasLayer] A game session with a stage is required.");
  }

  const currentOptions = normalizeLayerOptions(options);
  const width = normalizeDimension(currentOptions.width, session.getState?.().width || 1280);
  const height = normalizeDimension(currentOptions.height, session.getState?.().height || 720);
  const id = currentOptions.id || `layer-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const canvas = createElement("canvas", {
    className: buildClass("ui-game-canvas-layer", currentOptions.className),
    attrs: {
      "data-layer-id": id,
      width,
      height,
    },
  });
  canvas.style.zIndex = String(currentOptions.zIndex);
  canvas.dataset.layerId = id;
  suppressGameControlContextMenu(canvas);

  const context = canvas.getContext("2d", { alpha: currentOptions.alpha });
  if (context) {
    context.imageSmoothingEnabled = Boolean(currentOptions.smoothing);
  }
  session.stage.appendChild(canvas);

  function resize(nextWidth, nextHeight) {
    const targetWidth = normalizeDimension(nextWidth, canvas.width);
    const targetHeight = normalizeDimension(nextHeight, canvas.height);
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    if (context) {
      context.imageSmoothingEnabled = Boolean(currentOptions.smoothing);
    }
  }

  function clear() {
    context?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function destroy() {
    canvas.remove();
  }

  return {
    id,
    canvas,
    context,
    clear,
    destroy,
    resize,
  };
}

export function createGameLoop(options = {}) {
  const currentOptions = normalizeLoopOptions(options);
  let running = false;
  let frame = 0;
  let lastTime = 0;

  function start() {
    if (running) {
      return;
    }
    running = true;
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function tick(time) {
    if (!running) {
      return;
    }
    const seconds = time / 1000;
    const delta = lastTime ? Math.min(seconds - lastTime, currentOptions.maxDelta) : 0;
    lastTime = seconds;
    currentOptions.update?.({ delta, time: seconds });
    currentOptions.render?.({ delta, time: seconds });
    frame = requestAnimationFrame(tick);
  }

  if (currentOptions.autoStart) {
    start();
  }

  return {
    isRunning: () => running,
    start,
    stop,
  };
}

export function createTouchControlPad(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createTouchControlPad] A container element is required.");
  }

  let currentOptions = normalizeTouchPadOptions(options);
  let repeatTimer = 0;
  let activeDirection = "";
  const buttons = {};
  const layout = touchPadLayout(currentOptions.directions);

  clearNode(container);
  const root = createElement("div", {
    className: buildClass("ui-game-touch-pad", `is-layout-${layout}`, gameControlVisibilityClass(currentOptions.visibility), currentOptions.className),
    attrs: {
      "aria-label": currentOptions.ariaLabel,
      "data-directions": currentOptions.directions.join(" "),
    },
  });
  applyGameControlOpacity(root, currentOptions);
  suppressGameControlContextMenu(root);

  renderDirectionButtons(root, layout);
  container.appendChild(root);

  function renderDirectionButtons(target, mode) {
    if (mode === "horizontal") {
      appendDirection(target, "left");
      appendDirection(target, "right");
      return;
    }
    if (mode === "vertical") {
      appendDirection(target, "up");
      appendDirection(target, "down");
      return;
    }
    if (mode === "single") {
      currentOptions.directions.forEach((direction) => appendDirection(target, direction));
      return;
    }
    appendSpacer(target);
    appendDirectionOrSpacer(target, "up");
    appendSpacer(target);
    appendDirectionOrSpacer(target, "left");
    appendSpacer(target);
    appendDirectionOrSpacer(target, "right");
    appendSpacer(target);
    appendDirectionOrSpacer(target, "down");
    appendSpacer(target);
  }

  function appendDirectionOrSpacer(target, direction) {
    if (currentOptions.directions.includes(direction)) {
      appendDirection(target, direction);
      return;
    }
    appendSpacer(target);
  }

  function appendDirection(target, direction) {
    const button = createDirectionButton(direction);
    buttons[direction] = button;
    target.appendChild(button);
  }

  function appendSpacer(target) {
    target.appendChild(createElement("span", { className: "ui-game-touch-pad-spacer" }));
  }

  function createDirectionButton(direction) {
    const button = createElement("button", {
      className: "ui-game-touch-button",
      attrs: {
        type: "button",
        disabled: currentOptions.disabled ? "disabled" : null,
        "data-direction": direction,
        "aria-label": currentOptions.labels[direction],
      },
    });
    const iconName = currentOptions.icons[direction];
    if (iconName) {
      try {
        button.appendChild(createIcon(iconName, { size: 18, decorative: true }));
      } catch (_error) {
        button.textContent = currentOptions.labels[direction];
      }
    } else {
      button.textContent = currentOptions.labels[direction];
    }
    button.addEventListener("pointerdown", (event) => {
      if (button.disabled) {
        return;
      }
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      press(direction);
    });
    button.addEventListener("pointerup", () => release(direction));
    button.addEventListener("pointercancel", () => release(direction));
    button.addEventListener("lostpointercapture", () => release(direction));
    button.addEventListener("click", (event) => {
      event.preventDefault();
    });
    return button;
  }

  function press(direction) {
    activeDirection = direction;
    emitDirection(direction, "press");
    currentOptions.onPress?.(directionVector(direction), { direction });
    if (currentOptions.repeat) {
      clearRepeat();
      repeatTimer = window.setInterval(() => emitDirection(direction, "repeat"), currentOptions.repeatDelay);
    }
  }

  function release(direction) {
    if (activeDirection !== direction) {
      return;
    }
    clearRepeat();
    activeDirection = "";
    currentOptions.onRelease?.(directionVector(direction), { direction });
  }

  function emitDirection(direction, phase) {
    currentOptions.onDirection?.(directionVector(direction), { direction, phase });
  }

  function setDisabled(disabled) {
    currentOptions = { ...currentOptions, disabled: Boolean(disabled) };
    root.querySelectorAll("button").forEach((button) => {
      button.disabled = currentOptions.disabled;
    });
    if (currentOptions.disabled) {
      clearRepeat();
      activeDirection = "";
    }
  }

  function destroy() {
    clearRepeat();
    clearNode(container);
  }

  function clearRepeat() {
    if (repeatTimer) {
      window.clearInterval(repeatTimer);
      repeatTimer = 0;
    }
  }

  return {
    buttons,
    destroy,
    root,
    setDisabled,
  };
}

export function createGameActionButton(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createGameActionButton] A container element is required.");
  }

  let currentOptions = normalizeActionButtonOptions(options);
  let pressed = false;
  let repeatTimer = 0;
  let holdTimer = 0;
  let pressStartedAt = 0;
  let activePointerId = null;
  let repeatCount = 0;
  let holdFired = false;

  clearNode(container);
  const root = createElement("div", {
    className: buildClass("ui-game-action-button", gameControlVisibilityClass(currentOptions.visibility), currentOptions.className),
  });
  applyGameControlOpacity(root, currentOptions);
  suppressGameControlContextMenu(root);
  const button = createElement("button", {
    className: buildClass("ui-button", "ui-game-action-button__button", currentOptions.buttonClassName),
    attrs: {
      type: "button",
      disabled: currentOptions.disabled ? "disabled" : null,
      "aria-label": currentOptions.ariaLabel,
      "aria-pressed": "false",
    },
  });
  if (currentOptions.icon) {
    try {
      button.appendChild(createIcon(currentOptions.icon, { size: 18, decorative: true }));
    } catch (_error) {
      // Fall through to text-only rendering when an unknown icon id is supplied.
    }
  }
  button.appendChild(createElement("span", {
    className: "ui-game-action-button__label",
    text: currentOptions.label,
  }));
  root.appendChild(button);
  container.appendChild(root);

  button.addEventListener("pointerdown", handlePointerDown);
  button.addEventListener("pointerup", handlePointerUp);
  button.addEventListener("pointercancel", handlePointerCancel);
  button.addEventListener("lostpointercapture", handlePointerCancel);
  button.addEventListener("keydown", handleKeydown);
  button.addEventListener("keyup", handleKeyup);
  button.addEventListener("blur", () => release("blur"));
  button.addEventListener("click", (event) => {
    event.preventDefault();
  });

  function handlePointerDown(event) {
    if (currentOptions.disabled || pressed) {
      return;
    }
    event.preventDefault();
    activePointerId = event.pointerId;
    press("pointer");
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      // Synthetic pointer events may not have an active pointer capture target.
    }
  }

  function handlePointerUp(event) {
    if (event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    activePointerId = null;
    release("pointer");
  }

  function handlePointerCancel(event) {
    if (activePointerId !== null && event.pointerId !== activePointerId) {
      return;
    }
    activePointerId = null;
    release("cancel");
  }

  function handleKeydown(event) {
    if (currentOptions.disabled || pressed || !isActionButtonKey(event.key)) {
      return;
    }
    event.preventDefault();
    press("keyboard");
  }

  function handleKeyup(event) {
    if (!isActionButtonKey(event.key)) {
      return;
    }
    event.preventDefault();
    release("keyboard");
  }

  function press(inputType) {
    if (pressed || currentOptions.disabled) {
      return;
    }
    pressed = true;
    repeatCount = 0;
    holdFired = false;
    pressStartedAt = performance.now();
    button.classList.add("is-pressed");
    button.setAttribute("aria-pressed", "true");
    currentOptions.onPress?.(actionButtonMeta("press", inputType));
    if (currentOptions.holdThreshold > 0) {
      clearHold();
      holdTimer = window.setTimeout(() => {
        holdFired = true;
        currentOptions.onHold?.(actionButtonMeta("hold", inputType));
      }, currentOptions.holdThreshold);
    }
    if (currentOptions.repeat) {
      clearRepeat();
      repeatTimer = window.setInterval(() => {
        repeatCount += 1;
        currentOptions.onRepeat?.(actionButtonMeta("repeat", inputType));
      }, currentOptions.repeatDelay);
    }
  }

  function release(inputType) {
    if (!pressed) {
      return;
    }
    const heldMs = Math.max(0, Math.round(performance.now() - pressStartedAt));
    pressed = false;
    activePointerId = null;
    clearRepeat();
    clearHold();
    button.classList.remove("is-pressed");
    button.setAttribute("aria-pressed", "false");
    const meta = {
      phase: "release",
      inputType,
      pressed: false,
      repeatCount,
      heldMs,
      holdFired,
    };
    currentOptions.onRelease?.(meta);
  }

  function actionButtonMeta(phase, inputType) {
    return {
      phase,
      inputType,
      pressed,
      repeatCount,
      heldMs: pressed ? Math.max(0, Math.round(performance.now() - pressStartedAt)) : 0,
      holdFired,
    };
  }

  function clearRepeat() {
    if (repeatTimer) {
      window.clearInterval(repeatTimer);
      repeatTimer = 0;
    }
  }

  function clearHold() {
    if (holdTimer) {
      window.clearTimeout(holdTimer);
      holdTimer = 0;
    }
  }

  function setDisabled(disabled) {
    currentOptions = { ...currentOptions, disabled: Boolean(disabled) };
    button.disabled = currentOptions.disabled;
    root.classList.toggle("is-disabled", currentOptions.disabled);
    if (currentOptions.disabled) {
      release("disabled");
    }
  }

  function getState() {
    return {
      disabled: currentOptions.disabled,
      pressed,
      repeatCount,
      heldMs: pressed ? Math.max(0, Math.round(performance.now() - pressStartedAt)) : 0,
      holdFired,
    };
  }

  function destroy() {
    clearRepeat();
    clearHold();
    clearNode(container);
  }

  return {
    button,
    destroy,
    getState,
    root,
    setDisabled,
  };
}

export function createGameActionButtonGroup(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createGameActionButtonGroup] A container element is required.");
  }

  let currentOptions = normalizeActionButtonGroupOptions(options);
  const actions = {};

  clearNode(container);
  const root = createElement("div", {
    className: buildClass("ui-game-action-group", `is-layout-${currentOptions.layout}`, gameControlVisibilityClass(currentOptions.visibility), currentOptions.className),
    attrs: {
      role: "group",
      "aria-label": currentOptions.ariaLabel,
      "data-layout": currentOptions.layout,
    },
  });
  applyGameControlOpacity(root, currentOptions);
  suppressGameControlContextMenu(root);
  container.appendChild(root);

  currentOptions.buttons.forEach((buttonOptions, index) => {
    const slot = createElement("div", {
      className: buildClass("ui-game-action-group__slot", `is-slot-${buttonOptions.slot || index + 1}`),
      attrs: {
        "data-action": buttonOptions.id,
      },
    });
    const action = createGameActionButton(slot, {
      ...buttonOptions,
      disabled: currentOptions.disabled || buttonOptions.disabled,
      visibility: buttonOptions.visibility || "inherit",
      opacity: buttonOptions.opacity ?? null,
      onPress(meta) {
        buttonOptions.onPress?.(meta);
        currentOptions.onPress?.(buttonOptions.id, meta);
      },
      onRepeat(meta) {
        buttonOptions.onRepeat?.(meta);
        currentOptions.onRepeat?.(buttonOptions.id, meta);
      },
      onHold(meta) {
        buttonOptions.onHold?.(meta);
        currentOptions.onHold?.(buttonOptions.id, meta);
      },
      onRelease(meta) {
        buttonOptions.onRelease?.(meta);
        currentOptions.onRelease?.(buttonOptions.id, meta);
      },
    });
    actions[buttonOptions.id] = action;
    root.appendChild(slot);
  });

  function setDisabled(disabled) {
    currentOptions = { ...currentOptions, disabled: Boolean(disabled) };
    root.classList.toggle("is-disabled", currentOptions.disabled);
    Object.values(actions).forEach((action) => action.setDisabled(currentOptions.disabled));
  }

  function getState() {
    return {
      disabled: currentOptions.disabled,
      layout: currentOptions.layout,
      buttons: Object.fromEntries(
        Object.entries(actions).map(([id, action]) => [id, action.getState()]),
      ),
    };
  }

  function destroy() {
    Object.values(actions).forEach((action) => action.destroy());
    clearNode(container);
  }

  return {
    actions,
    destroy,
    getState,
    root,
    setDisabled,
  };
}

export function createVirtualJoystick(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("[createVirtualJoystick] A container element is required.");
  }

  let currentOptions = normalizeJoystickOptions(options);
  let activePointerId = null;
  let active = false;
  let value = neutralJoystickValue();

  clearNode(container);
  const root = createElement("div", {
    className: buildClass("ui-game-joystick", gameControlVisibilityClass(currentOptions.visibility), currentOptions.className),
    attrs: {
      role: "application",
      tabindex: "0",
      "aria-label": currentOptions.ariaLabel,
      "aria-disabled": currentOptions.disabled ? "true" : "false",
    },
  });
  applyGameControlOpacity(root, currentOptions);
  suppressGameControlContextMenu(root);
  root.style.setProperty("--ui-game-joystick-size", `${currentOptions.radius * 2}px`);
  const ring = createElement("div", { className: "ui-game-joystick-ring" });
  const thumb = createElement("div", { className: "ui-game-joystick-thumb" });
  ring.appendChild(thumb);
  root.appendChild(ring);
  container.appendChild(root);

  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("pointermove", handlePointerMove);
  root.addEventListener("pointerup", handlePointerUp);
  root.addEventListener("pointercancel", handlePointerUp);
  root.addEventListener("lostpointercapture", handlePointerUp);
  root.addEventListener("keydown", handleKeydown);
  root.addEventListener("keyup", handleKeyup);

  updateVisual();

  function handlePointerDown(event) {
    if (currentOptions.disabled || activePointerId !== null) {
      return;
    }
    event.preventDefault();
    activePointerId = event.pointerId;
    active = true;
    root.setPointerCapture?.(event.pointerId);
    root.classList.add("is-active");
    updateFromPoint(event.clientX, event.clientY, "start");
    currentOptions.onStart?.(cloneJoystickValue(value));
  }

  function handlePointerMove(event) {
    if (currentOptions.disabled || event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    updateFromPoint(event.clientX, event.clientY, "move");
  }

  function handlePointerUp(event) {
    if (event.pointerId !== activePointerId) {
      return;
    }
    event.preventDefault();
    activePointerId = null;
    active = false;
    root.classList.remove("is-active");
    if (currentOptions.snapBack) {
      value = neutralJoystickValue();
      updateVisual();
      currentOptions.onMove?.(cloneJoystickValue(value), { phase: "end" });
    }
    currentOptions.onEnd?.(cloneJoystickValue(value));
  }

  function handleKeydown(event) {
    if (currentOptions.disabled) {
      return;
    }
    const vector = vectorForJoystickKey(event.key);
    if (!vector) {
      return;
    }
    event.preventDefault();
    active = true;
    root.classList.add("is-active");
    value = valueFromVector(vector.x, vector.y);
    updateVisual();
    currentOptions.onMove?.(cloneJoystickValue(value), { phase: "keyboard" });
  }

  function handleKeyup(event) {
    if (!vectorForJoystickKey(event.key)) {
      return;
    }
    event.preventDefault();
    active = false;
    root.classList.remove("is-active");
    if (currentOptions.snapBack) {
      value = neutralJoystickValue();
      updateVisual();
      currentOptions.onMove?.(cloneJoystickValue(value), { phase: "keyboard-end" });
    }
  }

  function updateFromPoint(clientX, clientY, phase) {
    const rect = ring.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    value = valueFromVector(dx / currentOptions.radius, dy / currentOptions.radius);
    updateVisual();
    currentOptions.onMove?.(cloneJoystickValue(value), { phase });
  }

  function valueFromVector(x, y) {
    const rawForce = Math.min(1, Math.hypot(x, y));
    const force = rawForce < currentOptions.deadzone ? 0 : rawForce;
    if (!force) {
      return neutralJoystickValue();
    }
    const angle = Math.atan2(y, x);
    return {
      x: Math.cos(angle) * force,
      y: Math.sin(angle) * force,
      force,
      angle,
      active,
    };
  }

  function updateVisual() {
    thumb.style.transform = `translate3d(${Math.round(value.x * currentOptions.radius)}px, ${Math.round(value.y * currentOptions.radius)}px, 0)`;
    root.dataset.active = value.force > 0 ? "true" : "false";
  }

  function setDisabled(disabled) {
    currentOptions = { ...currentOptions, disabled: Boolean(disabled) };
    root.setAttribute("aria-disabled", currentOptions.disabled ? "true" : "false");
    root.classList.toggle("is-disabled", currentOptions.disabled);
    if (currentOptions.disabled) {
      activePointerId = null;
      active = false;
      value = neutralJoystickValue();
      root.classList.remove("is-active");
      updateVisual();
    }
  }

  function getValue() {
    return cloneJoystickValue(value);
  }

  function destroy() {
    clearNode(container);
  }

  return {
    destroy,
    getValue,
    root,
    setDisabled,
  };
}

function normalizeSessionOptions(input = {}) {
  const next = { ...DEFAULT_SESSION_OPTIONS, ...(input || {}) };
  return {
    ...next,
    title: String(next.title || DEFAULT_SESSION_OPTIONS.title),
    ariaLabel: String(next.ariaLabel || next.title || DEFAULT_SESSION_OPTIONS.ariaLabel),
    className: String(next.className || ""),
    fullscreen: next.fullscreen !== false,
    closeLabel: String(next.closeLabel || DEFAULT_SESSION_OPTIONS.closeLabel),
    closeControl: normalizeCloseControl(next.closeControl),
    closeOnEscape: next.closeOnEscape !== false,
    width: normalizeDimension(next.width, DEFAULT_SESSION_OPTIONS.width),
    height: normalizeDimension(next.height, DEFAULT_SESSION_OPTIONS.height),
    background: String(next.background || DEFAULT_SESSION_OPTIONS.background),
    autoFocus: next.autoFocus !== false,
    onBeforeClose: typeof next.onBeforeClose === "function" ? next.onBeforeClose : null,
    onClose: typeof next.onClose === "function" ? next.onClose : null,
  };
}

function normalizeCloseControl(input) {
  const source = typeof input === "string" ? { variant: input } : input && typeof input === "object" ? input : {};
  const variant = source.variant === "icon" || source.iconOnly === true ? "icon" : "text";
  return {
    variant,
    icon: String(source.icon || "actions.close"),
    iconSize: normalizeNumber(source.iconSize, 20, 12, 32),
    className: String(source.className || ""),
  };
}

function normalizeLayerOptions(input = {}) {
  const next = { ...DEFAULT_LAYER_OPTIONS, ...(input || {}) };
  return {
    ...next,
    id: String(next.id || ""),
    className: String(next.className || ""),
    zIndex: Number.isFinite(Number(next.zIndex)) ? Number(next.zIndex) : DEFAULT_LAYER_OPTIONS.zIndex,
    alpha: next.alpha !== false,
    smoothing: next.smoothing === true,
  };
}

function normalizeLoopOptions(input = {}) {
  const next = { ...DEFAULT_LOOP_OPTIONS, ...(input || {}) };
  return {
    ...next,
    autoStart: next.autoStart === true,
    update: typeof next.update === "function" ? next.update : null,
    render: typeof next.render === "function" ? next.render : null,
    maxDelta: normalizeNumber(next.maxDelta, DEFAULT_LOOP_OPTIONS.maxDelta, 0.001, 1),
  };
}

function normalizeTouchPadOptions(input = {}) {
  const next = { ...DEFAULT_TOUCH_PAD_OPTIONS, ...(input || {}) };
  return {
    ...next,
    ariaLabel: String(next.ariaLabel || DEFAULT_TOUCH_PAD_OPTIONS.ariaLabel),
    className: String(next.className || ""),
    disabled: next.disabled === true,
    visibility: normalizeGameControlVisibility(next.visibility),
    opacity: normalizeGameControlOpacity(next.opacity),
    directions: normalizeTouchPadDirections(next.directions),
    repeat: next.repeat === true,
    repeatDelay: normalizeNumber(next.repeatDelay, DEFAULT_TOUCH_PAD_OPTIONS.repeatDelay, 40, 1000),
    onDirection: typeof next.onDirection === "function" ? next.onDirection : null,
    onPress: typeof next.onPress === "function" ? next.onPress : null,
    onRelease: typeof next.onRelease === "function" ? next.onRelease : null,
    labels: {
      ...DEFAULT_TOUCH_PAD_OPTIONS.labels,
      ...(next.labels || {}),
    },
    icons: {
      ...DEFAULT_TOUCH_PAD_OPTIONS.icons,
      ...(next.icons || {}),
    },
  };
}

function normalizeTouchPadDirections(input) {
  const validDirections = Object.keys(DIRECTIONS);
  let directions = [];
  if (Array.isArray(input)) {
    directions = input;
  } else if (input && typeof input === "object") {
    const values = Object.values(input);
    const hasExplicitTrue = values.some((value) => value === true);
    directions = validDirections.filter((direction) => {
      if (hasExplicitTrue) {
        return input[direction] === true;
      }
      return input[direction] !== false;
    });
  } else {
    directions = DEFAULT_TOUCH_PAD_OPTIONS.directions;
  }
  const normalized = directions.filter((direction, index) => (
    validDirections.includes(direction) && directions.indexOf(direction) === index
  ));
  return normalized.length ? normalized : [...DEFAULT_TOUCH_PAD_OPTIONS.directions];
}

function touchPadLayout(directions) {
  if (directions.length === 1) {
    return "single";
  }
  if (directions.length === 2 && directions.includes("left") && directions.includes("right")) {
    return "horizontal";
  }
  if (directions.length === 2 && directions.includes("up") && directions.includes("down")) {
    return "vertical";
  }
  return "grid";
}

function normalizeActionButtonOptions(input = {}) {
  const next = { ...DEFAULT_ACTION_BUTTON_OPTIONS, ...(input || {}) };
  const label = String(next.label || DEFAULT_ACTION_BUTTON_OPTIONS.label);
  return {
    ...next,
    label,
    ariaLabel: String(next.ariaLabel || label),
    className: String(next.className || ""),
    buttonClassName: String(next.buttonClassName || ""),
    icon: String(next.icon || ""),
    disabled: next.disabled === true,
    visibility: normalizeGameControlVisibility(next.visibility),
    opacity: normalizeGameControlOpacity(next.opacity),
    repeat: next.repeat === true,
    repeatDelay: normalizeNumber(next.repeatDelay, DEFAULT_ACTION_BUTTON_OPTIONS.repeatDelay, 40, 1000),
    holdThreshold: normalizeNumber(next.holdThreshold, DEFAULT_ACTION_BUTTON_OPTIONS.holdThreshold, 0, 10000),
    onPress: typeof next.onPress === "function" ? next.onPress : null,
    onRepeat: typeof next.onRepeat === "function" ? next.onRepeat : null,
    onHold: typeof next.onHold === "function" ? next.onHold : null,
    onRelease: typeof next.onRelease === "function" ? next.onRelease : null,
  };
}

function normalizeActionButtonGroupOptions(input = {}) {
  const next = { ...DEFAULT_ACTION_BUTTON_GROUP_OPTIONS, ...(input || {}) };
  const buttons = Array.isArray(next.buttons) && next.buttons.length
    ? next.buttons
    : [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
  return {
    ...next,
    ariaLabel: String(next.ariaLabel || DEFAULT_ACTION_BUTTON_GROUP_OPTIONS.ariaLabel),
    className: String(next.className || ""),
    layout: normalizeActionButtonGroupLayout(next.layout),
    disabled: next.disabled === true,
    visibility: normalizeGameControlVisibility(next.visibility),
    opacity: normalizeGameControlOpacity(next.opacity),
    buttons: buttons.map((button, index) => normalizeActionButtonGroupItem(button, index)),
    onPress: typeof next.onPress === "function" ? next.onPress : null,
    onRepeat: typeof next.onRepeat === "function" ? next.onRepeat : null,
    onHold: typeof next.onHold === "function" ? next.onHold : null,
    onRelease: typeof next.onRelease === "function" ? next.onRelease : null,
  };
}

function normalizeActionButtonGroupItem(input = {}, index = 0) {
  const id = String(input.id || input.action || `action-${index + 1}`);
  return {
    ...input,
    id,
    label: String(input.label || id.toUpperCase()),
    slot: String(input.slot || id || index + 1).replace(/[^a-z0-9_-]/gi, "").toLowerCase(),
    visibility: input.visibility ? normalizeGameControlVisibility(input.visibility) : "",
    opacity: input.opacity == null ? null : normalizeGameControlOpacity(input.opacity),
  };
}

function normalizeActionButtonGroupLayout(input) {
  const layout = String(input || DEFAULT_ACTION_BUTTON_GROUP_OPTIONS.layout).toLowerCase();
  return ["row", "column", "grid", "diamond", "cluster"].includes(layout) ? layout : DEFAULT_ACTION_BUTTON_GROUP_OPTIONS.layout;
}

function normalizeGameControlVisibility(input) {
  const value = String(input || "solid").toLowerCase();
  return ["solid", "overlay", "ghost", "inherit"].includes(value) ? value : "solid";
}

function normalizeGameControlOpacity(input) {
  if (input == null || input === "") {
    return null;
  }
  return normalizeNumber(input, 1, 0.2, 1);
}

function gameControlVisibilityClass(visibility) {
  return visibility === "inherit" ? "" : `is-visibility-${visibility}`;
}

function applyGameControlOpacity(root, options) {
  if (!root || options.opacity == null) {
    return;
  }
  root.style.setProperty("--ui-game-control-opacity", String(options.opacity));
}

function suppressGameControlContextMenu(root) {
  root?.addEventListener?.("contextmenu", (event) => {
    event.preventDefault();
  });
}

function normalizeJoystickOptions(input = {}) {
  const next = { ...DEFAULT_JOYSTICK_OPTIONS, ...(input || {}) };
  return {
    ...next,
    ariaLabel: String(next.ariaLabel || DEFAULT_JOYSTICK_OPTIONS.ariaLabel),
    className: String(next.className || ""),
    disabled: next.disabled === true,
    visibility: normalizeGameControlVisibility(next.visibility),
    opacity: normalizeGameControlOpacity(next.opacity),
    radius: normalizeNumber(next.radius, DEFAULT_JOYSTICK_OPTIONS.radius, 36, 160),
    deadzone: normalizeNumber(next.deadzone, DEFAULT_JOYSTICK_OPTIONS.deadzone, 0, 0.8),
    snapBack: next.snapBack !== false,
    onMove: typeof next.onMove === "function" ? next.onMove : null,
    onStart: typeof next.onStart === "function" ? next.onStart : null,
    onEnd: typeof next.onEnd === "function" ? next.onEnd : null,
  };
}

function isActionButtonKey(key) {
  return key === " " || key === "Enter" || key === "Spacebar";
}

function directionVector(direction) {
  return { ...DIRECTIONS[direction] };
}

function neutralJoystickValue() {
  return {
    x: 0,
    y: 0,
    force: 0,
    angle: 0,
    active: false,
  };
}

function cloneJoystickValue(value) {
  return { ...value };
}

function vectorForJoystickKey(key) {
  if (key === "ArrowUp") return { x: 0, y: -1 };
  if (key === "ArrowDown") return { x: 0, y: 1 };
  if (key === "ArrowLeft") return { x: -1, y: 0 };
  if (key === "ArrowRight") return { x: 1, y: 0 };
  return null;
}

function normalizeDimension(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(numeric));
}

function normalizeNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function buildClass(...parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function createEmitter() {
  const handlers = new Map();

  function on(eventName, handler) {
    const key = String(eventName || "");
    if (!key || typeof handler !== "function") {
      return () => {};
    }
    const list = handlers.get(key) || [];
    list.push(handler);
    handlers.set(key, list);
    return () => off(key, handler);
  }

  function off(eventName, handler) {
    const key = String(eventName || "");
    const list = handlers.get(key);
    if (!list) {
      return;
    }
    handlers.set(key, list.filter((entry) => entry !== handler));
  }

  function emit(eventName, payload) {
    const key = String(eventName || "");
    (handlers.get(key) || []).forEach((handler) => handler(payload));
  }

  function clear() {
    handlers.clear();
  }

  return { clear, emit, off, on };
}

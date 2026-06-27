import { createElement, clearNode } from "./ui.dom.js";
import { createIcon } from "./ui.icons.js?v=0.21.87";

export const GAME_SESSION_STATES = Object.freeze([
  "loading",
  "splash",
  "countdown",
  "ready",
  "playing",
  "paused",
  "won",
  "gameOver",
  "exiting",
]);

const STATE_SET = new Set(GAME_SESSION_STATES);

const DEFAULT_OPTIONS = {
  initialState: "ready",
  className: "",
  controls: {
    playing: "pause",
    default: "close",
  },
  labels: {
    close: "Close game",
    pause: "Pause game",
    resume: "Resume",
    restart: "Restart",
    exit: "Exit",
    continue: "Continue",
  },
  icons: {
    close: "actions.close",
    pause: "media.pause",
  },
  overlays: {
    pause: {
      title: "Paused",
      actions: ["resume", "restart", "exit"],
    },
    result: {
      actions: ["restart", "exit"],
      restartLabel: "Play Again",
    },
    milestone: {
      actions: ["continue"],
      autoDismiss: false,
      duration: 0,
      position: "center",
      tone: "default",
    },
  },
  shortcuts: {
    enabled: false,
    pause: ["p", "P"],
    escape: "none",
  },
  onAction: null,
  onStateChange: null,
};

export function createGameStateChrome(session, options = {}) {
  if (!session || !session.root || !session.overlay) {
    throw new Error("[createGameStateChrome] A game session from createGameSession is required.");
  }

  const events = createEmitter();
  let currentOptions = normalizeOptions(options);
  let state = normalizeState(currentOptions.initialState, "ready");
  let previousState = "";
  let progress = {};
  let overlayNode = null;
  let overlayTimer = 0;
  let overlayConfig = null;
  let progressNode = null;
  let destroyed = false;
  let controlMode = "";

  const root = createElement("div", {
    className: buildClass("ui-game-state-chrome", currentOptions.className),
    attrs: {
      "data-game-state": state,
    },
  });
  const overlayHost = createElement("div", { className: "ui-game-state-chrome__overlays" });
  const progressHost = createElement("div", { className: "ui-game-state-chrome__progress" });
  const liveRegion = createElement("div", {
    className: "ui-game-state-chrome__live",
    attrs: {
      "aria-live": "polite",
      "aria-atomic": "true",
    },
  });
  root.append(progressHost, overlayHost, liveRegion);
  session.overlay.appendChild(root);

  const removeButtonCapture = bind(session.closeButton, "click", handleControlClick, { capture: true });
  const removeKeydown = bind(session.root, "keydown", handleKeydown, { capture: true });
  const removeSessionClose = typeof session.on === "function" ? session.on("close", () => destroy()) : () => {};

  updateControlForState();
  renderProgress();

  function setState(nextState, context = {}) {
    const normalized = normalizeState(nextState, state);
    if (destroyed || normalized === state) {
      return state;
    }
    previousState = state;
    state = normalized;
    root.dataset.gameState = state;
    if (state !== "paused") {
      hideOverlay();
    }
    updateControlForState();
    const payload = buildContext(context, { state, previousState });
    currentOptions.onStateChange?.(state, previousState, payload);
    events.emit("statechange", payload);
    if (state === "paused") {
      showPause();
    }
    if (state === "won" || state === "gameOver") {
      showResult({ state });
    }
    return state;
  }

  function getState() {
    return {
      state,
      previousState,
      control: controlMode,
      progress: { ...progress },
      overlay: overlayNode?.dataset?.overlayType || "",
      destroyed,
    };
  }

  function updateProgress(nextProgress = {}) {
    progress = { ...progress, ...(nextProgress || {}) };
    renderProgress();
    const payload = buildContext({ progress: { ...progress } });
    events.emit("progresschange", payload);
    return { ...progress };
  }

  function showPause(pauseOptions = {}) {
    const overlayOptions = {
      ...currentOptions.overlays.pause,
      ...(pauseOptions || {}),
      type: "pause",
      state: "paused",
      ariaLabel: pauseOptions.ariaLabel || "Game paused",
    };
    renderOverlay(overlayOptions);
  }

  function showResult(resultOptions = {}) {
    const resultState = normalizeState(resultOptions.state, state);
    const title = resultOptions.title || (resultState === "won" ? "You Win" : "Game Over");
    renderOverlay({
      ...currentOptions.overlays.result,
      ...(resultOptions || {}),
      type: "result",
      state: resultState,
      title,
      ariaLabel: resultOptions.ariaLabel || title,
    });
  }

  function showMilestone(milestoneOptions = {}) {
    renderOverlay({
      ...currentOptions.overlays.milestone,
      ...(milestoneOptions || {}),
      type: "milestone",
      state,
      title: milestoneOptions.title || "Milestone",
      ariaLabel: milestoneOptions.ariaLabel || milestoneOptions.title || "Game milestone",
    });
  }

  function hideOverlay() {
    dismissOverlay("manual", { notify: false });
  }

  function dismissOverlay(reason = "manual", options = {}) {
    if (overlayTimer) {
      window.clearTimeout(overlayTimer);
      overlayTimer = 0;
    }
    const node = overlayNode;
    const config = overlayConfig;
    overlayNode = null;
    overlayConfig = null;
    node?.remove();
    if (options.notify && typeof config?.onDismiss === "function") {
      config.onDismiss(buildContext({ reason, overlayType: config.type || "state" }));
    }
    if (options.notify) {
      events.emit("overlaydismiss", buildContext({ reason, overlayType: config?.type || "state" }));
    }
  }

  function setControl(mode) {
    controlMode = mode === "pause" ? "pause" : "close";
    updateSessionButton();
    return controlMode;
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    removeButtonCapture();
    removeKeydown();
    removeSessionClose();
    dismissOverlay("destroy", { notify: false });
    root.remove();
    events.clear();
  }

  function handleControlClick(event) {
    if (destroyed) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (controlMode === "pause") {
      performAction("pause", { source: "context-control" });
      return;
    }
    performAction("exit", { source: "context-control" });
  }

  function handleKeydown(event) {
    if (destroyed || !currentOptions.shortcuts.enabled) {
      return;
    }
    const key = event.key || "";
    const pauseKeys = currentOptions.shortcuts.pause || [];
    if (pauseKeys.includes(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      performAction(state === "playing" ? "pause" : "resume", { source: "shortcut", key });
      return;
    }
    if (key === "Escape" && currentOptions.shortcuts.escape === "pause-or-exit") {
      event.preventDefault();
      event.stopImmediatePropagation();
      performAction(state === "playing" ? "pause" : "exit", { source: "shortcut", key });
    }
  }

  function performAction(action, context = {}) {
    const normalizedAction = normalizeAction(action);
    const payload = buildContext(context, {
      action: normalizedAction,
      state,
      previousState,
    });
    const callbackResult = currentOptions.onAction?.(normalizedAction, payload);
    events.emit("action", payload);
    if (callbackResult === false) {
      return payload;
    }
    applyDefaultAction(normalizedAction, payload);
    return payload;
  }

  function applyDefaultAction(action, context) {
    if (action === "pause") {
      setState("paused", context);
      return;
    }
    if (action === "resume" || action === "continue") {
      hideOverlay();
      setState("playing", context);
      session.root?.focus?.({ preventScroll: true });
      return;
    }
    if (action === "restart") {
      hideOverlay();
      setState("playing", context);
      session.root?.focus?.({ preventScroll: true });
      return;
    }
    if (action === "exit") {
      const actionConfig = context?.actionConfig || {};
      if (actionConfig.nextState) {
        hideOverlay();
        setState(actionConfig.nextState, context);
        session.root?.focus?.({ preventScroll: true });
        if (actionConfig.closeSession === false) {
          return;
        }
      } else if (actionConfig.closeSession === false) {
        hideOverlay();
        session.root?.focus?.({ preventScroll: true });
        return;
      }
      setState("exiting", context);
      void session.close?.("state-chrome-exit");
    }
  }

  function updateControlForState() {
    const configuredMode = currentOptions.controls[state] || currentOptions.controls.default;
    setControl(configuredMode === "pause" ? "pause" : "close");
  }

  function updateSessionButton() {
    const button = session.closeButton;
    if (!button) {
      return;
    }
    const isPause = controlMode === "pause";
    const label = isPause ? currentOptions.labels.pause : currentOptions.labels.close;
    const icon = isPause ? currentOptions.icons.pause : currentOptions.icons.close;
    clearNode(button);
    button.appendChild(createIcon(icon, { size: 20, decorative: true }));
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.gameControl = controlMode;
  }

  function renderProgress() {
    clearNode(progressHost);
    const entries = Object.entries(progress).filter(([, value]) => value != null && value !== "");
    if (!entries.length) {
      progressHost.hidden = true;
      progressNode = null;
      return;
    }
    progressHost.hidden = false;
    progressNode = createElement("dl", { className: "ui-game-state-progress" });
    entries.forEach(([key, value]) => {
      const item = createElement("div", { className: "ui-game-state-progress__item" });
      const label = createElement("dt", { text: humanizeKey(key) });
      const output = createElement("dd", { text: String(value) });
      item.append(label, output);
      progressNode.appendChild(item);
    });
    progressHost.appendChild(progressNode);
  }

  function renderOverlay(overlayOptions) {
    dismissOverlay("replace", { notify: false });
    const type = String(overlayOptions.type || "state");
    const position = normalizePosition(overlayOptions.position);
    const tone = normalizeTone(overlayOptions.tone);
    const isStatusMilestone = type === "milestone" && !hasActions(overlayOptions.actions);
    const overlayAttrs = {
      role: isStatusMilestone ? "status" : "dialog",
      "aria-label": overlayOptions.ariaLabel || overlayOptions.title || "Game state",
      "data-overlay-type": type,
      "data-overlay-position": position,
      "data-overlay-tone": tone,
    };
    if (!isStatusMilestone) {
      overlayAttrs["aria-modal"] = "false";
    }
    const panel = createElement("section", {
      className: buildClass(
        "ui-game-state-overlay",
        `is-${type}`,
        `is-position-${position}`,
        `is-tone-${tone}`,
        overlayOptions.className,
      ),
      attrs: overlayAttrs,
    });
    panel.dataset.overlayType = type;
    panel.dataset.overlayPosition = position;
    panel.dataset.overlayTone = tone;

    if (overlayOptions.title) {
      panel.appendChild(createElement("h2", {
        className: "ui-game-state-overlay__title ui-title",
        text: overlayOptions.title,
      }));
    }
    if (overlayOptions.detail) {
      panel.appendChild(createElement("p", {
        className: "ui-game-state-overlay__detail",
        text: overlayOptions.detail,
      }));
    }

    const actions = normalizeActions(overlayOptions.actions, overlayOptions, currentOptions.labels);
    if (actions.length) {
      const actionRow = createElement("div", { className: "ui-game-state-overlay__actions" });
      actions.forEach((action, index) => {
        const button = createElement("button", {
          className: buildClass("ui-button", action.primary ? "ui-button-primary" : "ui-button-quiet"),
          attrs: {
            type: "button",
            "data-game-action": action.id,
          },
          text: action.label,
        });
        button.addEventListener("click", () => performAction(action.id, {
          actionConfig: action,
          source: `${type}-overlay`,
          overlayType: type,
        }));
        actionRow.appendChild(button);
        if (index === 0) {
          requestAnimationFrame(() => button.focus({ preventScroll: true }));
        }
      });
      panel.appendChild(actionRow);
    }

    overlayHost.appendChild(panel);
    overlayNode = panel;
    overlayConfig = overlayOptions;
    announceOverlay(overlayOptions);
    scheduleOverlayDismiss(overlayOptions, type);
  }

  function announceOverlay(overlayOptions) {
    if (overlayOptions.type !== "milestone") {
      return;
    }
    const message = [overlayOptions.title, overlayOptions.detail]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(". ");
    liveRegion.textContent = "";
    if (message) {
      window.requestAnimationFrame(() => {
        if (!destroyed) {
          liveRegion.textContent = message;
        }
      });
    }
  }

  function scheduleOverlayDismiss(overlayOptions, type) {
    const duration = normalizeDuration(overlayOptions.duration || (overlayOptions.autoDismiss === true ? 1200 : 0));
    const shouldAutoDismiss = overlayOptions.autoDismiss === true || duration > 0;
    if (type !== "milestone" || !shouldAutoDismiss || duration <= 0) {
      return;
    }
    overlayTimer = window.setTimeout(() => {
      dismissOverlay("timeout", { notify: true });
    }, duration);
  }

  function buildContext(context = {}, extra = {}) {
    return {
      ...context,
      ...extra,
      session,
      chrome: api,
    };
  }

  const api = {
    root,
    overlayHost,
    progressHost,
    destroy,
    getState,
    hideOverlay,
    off: events.off,
    on: events.on,
    setControl,
    setState,
    showMilestone,
    showPause,
    showResult,
    updateProgress,
  };

  return api;
}

function hasActions(actions) {
  return Array.isArray(actions) && actions.length > 0;
}

function normalizePosition(input) {
  const value = String(input || "center").trim();
  return ["center", "top", "top-center", "bottom", "bottom-center"].includes(value) ? value : "center";
}

function normalizeTone(input) {
  const value = String(input || "default").trim();
  return ["default", "success", "info", "warning", "danger"].includes(value) ? value : "default";
}

function normalizeDuration(input) {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? Math.max(0, Math.round(value)) : 0;
}

function normalizeOptions(input = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(input || {}),
    className: String(input.className || ""),
    controls: {
      ...DEFAULT_OPTIONS.controls,
      ...(input.controls || {}),
    },
    labels: {
      ...DEFAULT_OPTIONS.labels,
      ...(input.labels || {}),
    },
    icons: {
      ...DEFAULT_OPTIONS.icons,
      ...(input.icons || {}),
    },
    overlays: {
      pause: {
        ...DEFAULT_OPTIONS.overlays.pause,
        ...(input.overlays?.pause || {}),
      },
      result: {
        ...DEFAULT_OPTIONS.overlays.result,
        ...(input.overlays?.result || {}),
      },
      milestone: {
        ...DEFAULT_OPTIONS.overlays.milestone,
        ...(input.overlays?.milestone || {}),
      },
    },
    shortcuts: {
      ...DEFAULT_OPTIONS.shortcuts,
      ...(input.shortcuts || {}),
      pause: Array.isArray(input.shortcuts?.pause) ? input.shortcuts.pause.map(String) : DEFAULT_OPTIONS.shortcuts.pause,
    },
    onAction: typeof input.onAction === "function" ? input.onAction : null,
    onStateChange: typeof input.onStateChange === "function" ? input.onStateChange : null,
  };
}

function normalizeState(input, fallback) {
  const value = String(input || "");
  return STATE_SET.has(value) ? value : fallback;
}

function normalizeAction(input) {
  const value = String(input || "").trim();
  return value === "playAgain" ? "restart" : value;
}

function normalizeActions(actions, overlayOptions, labels = {}) {
  if (!Array.isArray(actions)) {
    return [];
  }
  return actions.map((action, index) => {
    if (action && typeof action === "object") {
      const id = normalizeAction(action.id || action.action);
      return {
        id,
        label: String(action.label || labelForAction(id, overlayOptions, labels)),
        primary: action.primary !== false && index === 0,
        closeSession: action.closeSession !== false,
        nextState: action.nextState ? normalizeState(action.nextState, "") : "",
      };
    }
    const id = normalizeAction(action);
    return {
      id,
      label: labelForAction(id, overlayOptions, labels),
      primary: index === 0,
    };
  }).filter((action) => action.id);
}

function labelForAction(action, overlayOptions = {}, labels = {}) {
  if (action === "restart" && overlayOptions.type === "result") {
    return overlayOptions.restartLabel || labels.playAgain || labels.restart || "Play Again";
  }
  if (action === "resume") return labels.resume || "Resume";
  if (action === "restart") return labels.restart || "Restart";
  if (action === "exit") return labels.exit || "Exit";
  if (action === "continue") return labels.continue || "Continue";
  if (action === "pause") return labels.pause || "Pause";
  return humanizeKey(action);
}

function humanizeKey(input) {
  return String(input || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bind(target, eventName, handler, options) {
  target?.addEventListener?.(eventName, handler, options);
  return () => target?.removeEventListener?.(eventName, handler, options);
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

import { createElement, clearNode } from "./ui.dom.js";
import { getSemanticStatusIcon } from "./ui.semantic.icons.js";
import { createWorkspaceToastDelegate } from "./ui.workspace.bridge.js";

const DEFAULT_OPTIONS = {
  className: "",
  position: "top-right", // top-right | top-left | bottom-right | bottom-left
  max: 5,
  defaultDuration: 3200,
  pauseOnHover: true,
  speak: false,
  speakTypes: ["error", "warn"],
  speakRate: 1,
  speakPitch: 1,
  speakVolume: 1,
  voiceName: "",
  speakFormatter: null, // (toast) => string
  speakCooldownMs: 0,
  waitForSpeechBeforeDismiss: true,
  workspaceBridge: "auto",
  workspaceBridgeTimeoutMs: 900,
  workspaceBridgeTargetOrigin: "*",
};

const TOAST_TYPES = ["neutral", "success", "info", "warn", "error"];

export function createToastStack(options = {}) {
  const currentOptions = normalizeOptions(options);
  const root = createElement("section", {
    className: [
      "ui-toast-stack",
      `ui-toast-stack--${normalizePosition(currentOptions.position)}`,
      currentOptions.className || "",
    ].filter(Boolean).join(" "),
    attrs: { "aria-live": "polite", "aria-atomic": "false" },
  });
  const timers = new Map();
  const states = [];
  let destroyed = false;
  let lastSpokenAt = 0;
  const workspaceToastDelegate = createWorkspaceToastDelegate(currentOptions);

  document.body.appendChild(root);

  function show(message, toastOptions = {}) {
    if (destroyed) {
      return null;
    }
    const delegatedId = workspaceToastDelegate?.show(message, toastOptions);
    if (delegatedId) {
      const remoteState = {
        id: delegatedId,
        type: normalizeType(toastOptions.type || toastOptions.variant),
        message: String(message ?? ""),
        title: toastOptions.title == null ? "" : String(toastOptions.title),
        createdAt: Date.now(),
        remote: true,
      };
      remoteState.handle = createToastHandle(remoteState);
      states.push(remoteState);
      trimToMax();
      return remoteState.handle;
    }
    const initialOptions = normalizeToastOptions(message, toastOptions);
    const id = initialOptions.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const row = createElement("article", {
      className: `ui-toast ui-toast--${initialOptions.type}`,
      attrs: { role: "status", "data-toast-id": id },
    });

    const iconSlot = createElement("div", {
      className: "ui-toast-icon",
      attrs: { "aria-hidden": "true" },
    });
    const content = createElement("div", { className: "ui-toast-content" });
    const titleEl = createElement("h4", { className: "ui-toast-title" });
    const messageEl = createElement("p", {
      className: "ui-toast-message",
    });
    content.append(titleEl, messageEl);
    const close = createElement("button", {
      className: "ui-toast-close",
      attrs: { type: "button", "aria-label": "Close notification", title: "Close" },
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    });
    close.addEventListener("click", () => dismiss(id));
    row.append(iconSlot, content, close);

    root.appendChild(row);
    const toast = {
      id,
      type: initialOptions.type,
      message: initialOptions.message,
      title: initialOptions.title,
      createdAt: Date.now(),
      persistent: initialOptions.persistent,
      busy: initialOptions.busy,
      dismissible: initialOptions.dismissible,
      duration: initialOptions.duration,
      row,
      iconSlot,
      titleEl,
      messageEl,
      close,
      toastOptions: initialOptions.rawOptions,
      isHovering: false,
      autoDismissReady: !shouldWaitForSpeech(initialOptions.rawOptions, initialOptions.persistent),
      remaining: initialOptions.duration,
      start: 0,
    };
    toast.handle = createToastHandle(toast);
    states.push(toast);
    trimToMax();

    renderToast(toast, initialOptions.rawOptions);

    if (currentOptions.pauseOnHover) {
      const onEnter = () => {
        toast.isHovering = true;
        const timer = timers.get(id);
        if (timer) {
          clearTimeout(timer);
          timers.delete(id);
          toast.remaining = Math.max(0, toast.remaining - (Date.now() - toast.start));
        }
      };
      const onLeave = () => {
        toast.isHovering = false;
        startAutoDismiss(toast);
      };
      row.addEventListener("mouseenter", onEnter);
      row.addEventListener("mouseleave", onLeave);
      toast.cleanupHover = () => {
        row.removeEventListener("mouseenter", onEnter);
        row.removeEventListener("mouseleave", onLeave);
      };
    }

    speakAndSchedule(toast, initialOptions.rawOptions);
    return toast.handle;
  }

  function dismiss(id) {
    const key = getToastId(id);
    const remoteStateIndex = states.findIndex((item) => String(item.id) === key && item.remote);
    if (remoteStateIndex >= 0) {
      states.splice(remoteStateIndex, 1);
      workspaceToastDelegate?.dismiss(key);
      return;
    }
    const timer = timers.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.delete(key);
    }
    const row = root.querySelector(`[data-toast-id="${cssEscape(key)}"]`);
    if (row && row.parentNode) {
      row.classList.add("is-closing");
      const cleanup = () => {
        row.removeEventListener("transitionend", cleanup);
        if (row.parentNode) {
          row.parentNode.removeChild(row);
        }
      };
      row.addEventListener("transitionend", cleanup);
      setTimeout(cleanup, 220);
    }
    const index = states.findIndex((item) => String(item.id) === key);
    if (index >= 0) {
      states[index].cleanupHover?.();
      states.splice(index, 1);
    }
  }

  function update(id, nextMessageOrOptions = {}, maybeOptions = {}) {
    const key = getToastId(id);
    const toast = states.find((item) => String(item.id) === key);
    if (!toast) {
      return null;
    }
    const nextOptions = normalizeUpdateOptions(toast, nextMessageOrOptions, maybeOptions);
    if (toast.remote) {
      const remoteUpdate = workspaceToastDelegate?.update?.(key, nextOptions.message, nextOptions.rawOptions);
      toast.message = nextOptions.message;
      toast.title = nextOptions.title;
      toast.type = nextOptions.type;
      toast.persistent = nextOptions.persistent;
      toast.busy = nextOptions.busy;
      toast.dismissible = nextOptions.dismissible;
      toast.duration = nextOptions.duration;
      return remoteUpdate || toast.handle;
    }
    const existingTimer = timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timers.delete(key);
    }
    toast.type = nextOptions.type;
    toast.message = nextOptions.message;
    toast.title = nextOptions.title;
    toast.persistent = nextOptions.persistent;
    toast.busy = nextOptions.busy;
    toast.dismissible = nextOptions.dismissible;
    toast.duration = nextOptions.duration;
    toast.toastOptions = nextOptions.rawOptions;
    toast.remaining = nextOptions.duration;
    toast.autoDismissReady = !shouldWaitForSpeech(nextOptions.rawOptions, nextOptions.persistent);
    renderToast(toast, nextOptions.rawOptions);
    speakAndSchedule(toast, nextOptions.rawOptions);
    return toast.handle;
  }

  function trimToMax() {
    const max = Math.max(1, Number(currentOptions.max) || 5);
    while (states.length > max) {
      const oldest = states[0];
      if (oldest) {
        dismiss(oldest.id);
      } else {
        break;
      }
    }
  }

  function clear() {
    states
      .filter((item) => item.remote)
      .forEach((item) => workspaceToastDelegate?.dismiss(item.id));
    Array.from(states).forEach((item) => dismiss(item.id));
    states.length = 0;
    clearNode(root);
    workspaceToastDelegate?.clear();
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    states.length = 0;
    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
  }

  function getState() {
    return {
      options: { ...currentOptions },
      items: states.map((item) => cloneToastState(item)),
    };
  }

  function createToastHandle(toast) {
    const handle = {
      id: toast.id,
      update(nextMessageOrOptions = {}, maybeOptions = {}) {
        return update(toast.id, nextMessageOrOptions, maybeOptions);
      },
      close() {
        dismiss(toast.id);
      },
      dismiss() {
        dismiss(toast.id);
      },
      resolve(message = toast.message, options = {}) {
        return update(toast.id, message, {
          type: "success",
          busy: false,
          persistent: false,
          dismissible: true,
          duration: currentOptions.defaultDuration,
          ...options,
        });
      },
      toString() {
        return String(toast.id);
      },
      valueOf() {
        return String(toast.id);
      },
      [Symbol.toPrimitive]() {
        return String(toast.id);
      },
    };
    return handle;
  }

  function renderToast(toast, toastOptions = {}) {
    TOAST_TYPES.forEach((type) => toast.row.classList.remove(`ui-toast--${type}`));
    toast.row.classList.add(`ui-toast--${toast.type}`);
    toast.row.classList.toggle("is-busy", Boolean(toast.busy));
    toast.row.classList.toggle("is-persistent", Boolean(toast.persistent));
    toast.row.classList.toggle("is-not-dismissible", !toast.dismissible);
    toast.titleEl.hidden = !toast.title;
    toast.titleEl.textContent = toast.title;
    toast.messageEl.textContent = toast.message;
    toast.close.hidden = !toast.dismissible;
    const iconMarkup = toast.busy
      ? '<span class="ui-toast-spinner"></span>'
      : resolveVariantIcon(currentOptions, toastOptions, toast.type);
    toast.iconSlot.innerHTML = iconMarkup || "";
    toast.iconSlot.hidden = !iconMarkup;
  }

  function startAutoDismiss(toast) {
    if (destroyed || !toast || toast.persistent || !toast.autoDismissReady || toast.isHovering || toast.remaining <= 0) {
      return;
    }
    const existingTimer = timers.get(toast.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    toast.start = Date.now();
    const timer = setTimeout(() => dismiss(toast.id), toast.remaining);
    timers.set(toast.id, timer);
  }

  function speakAndSchedule(toast, toastOptions = {}) {
    if (toast.persistent || toast.duration <= 0) {
      speakToast(toast, toastOptions);
      return;
    }
    if (shouldWaitForSpeech(toastOptions, toast.persistent)) {
      speakToast(toast, toastOptions).finally(() => {
        if (destroyed) {
          return;
        }
        const current = states.find((item) => String(item.id) === String(toast.id));
        if (!current || current !== toast) {
          return;
        }
        toast.autoDismissReady = true;
        startAutoDismiss(toast);
      });
      return;
    }
    speakToast(toast, toastOptions);
    startAutoDismiss(toast);
  }

  function shouldWaitForSpeech(toastOptions = {}, persistent = false) {
    return !persistent &&
      resolveSpeakEnabled(currentOptions, toastOptions) &&
      Boolean(currentOptions.waitForSpeechBeforeDismiss);
  }

  function normalizeToastOptions(message, toastOptions = {}) {
    const rawOptions = { ...(toastOptions || {}) };
    const persistent = Boolean(rawOptions.persistent);
    return {
      id: typeof rawOptions.id === "string" && rawOptions.id.trim() ? rawOptions.id.trim() : "",
      type: normalizeType(rawOptions.type || rawOptions.variant),
      message: String(message == null ? "" : message),
      title: rawOptions.title == null ? "" : String(rawOptions.title),
      persistent,
      busy: Boolean(rawOptions.busy),
      dismissible: rawOptions.dismissible === false ? false : true,
      duration: persistent ? 0 : resolveDuration(rawOptions.duration, currentOptions.defaultDuration),
      rawOptions,
    };
  }

  function normalizeUpdateOptions(toast, nextMessageOrOptions = {}, maybeOptions = {}) {
    const hasMessageObject = isPlainObject(nextMessageOrOptions);
    const source = hasMessageObject
      ? { ...nextMessageOrOptions }
      : { ...(maybeOptions || {}), message: nextMessageOrOptions };
    const message = Object.prototype.hasOwnProperty.call(source, "message")
      ? source.message
      : toast.message;
    return normalizeToastOptions(message, {
      type: toast.type,
      title: toast.title,
      persistent: toast.persistent,
      busy: toast.busy,
      dismissible: toast.dismissible,
      duration: toast.duration,
      ...(source || {}),
    });
  }

  function speakToast(toast, toastOptions = {}) {
    const canSpeak = resolveSpeakEnabled(currentOptions, toastOptions);
    if (!canSpeak) {
      return Promise.resolve(false);
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      return Promise.resolve(false);
    }
    const allowTypes = Array.isArray(currentOptions.speakTypes) ? currentOptions.speakTypes.map((item) => String(item).toLowerCase()) : [];
    if (allowTypes.length && !allowTypes.includes(String(toast.type).toLowerCase())) {
      return Promise.resolve(false);
    }
    const now = Date.now();
    const cooldown = Math.max(0, Number(currentOptions.speakCooldownMs) || 0);
    if (cooldown > 0 && now - lastSpokenAt < cooldown) {
      return Promise.resolve(false);
    }
    lastSpokenAt = now;

    const formatter = typeof currentOptions.speakFormatter === "function"
      ? currentOptions.speakFormatter
      : defaultSpeakFormatter;
    const text = String(formatter(toast) || "").trim();
    if (!text) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = clampNumber(currentOptions.speakRate, 0.5, 2, 1);
      utterance.pitch = clampNumber(currentOptions.speakPitch, 0, 2, 1);
      utterance.volume = clampNumber(currentOptions.speakVolume, 0, 1, 1);
      const voiceName = resolveVoiceName(currentOptions, toastOptions);
      if (voiceName) {
        const voice = window.speechSynthesis.getVoices().find((entry) => entry?.name === voiceName);
        if (voice) {
          utterance.voice = voice;
        }
      }
      let settled = false;
      const done = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };
      utterance.onend = () => done(true);
      utterance.onerror = () => done(false);
      window.speechSynthesis.speak(utterance);
    });
  }

  return {
    show,
    success(message, options = {}) {
      return show(message, { ...options, type: "success" });
    },
    info(message, options = {}) {
      return show(message, { ...options, type: "info" });
    },
    warn(message, options = {}) {
      return show(message, { ...options, type: "warn" });
    },
    error(message, options = {}) {
      return show(message, { ...options, type: "error" });
    },
    dismiss,
    update,
    clear,
    destroy,
    getState,
    getVoices,
  };
}

function getVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices().map((voice) => ({
    name: voice?.name || "",
    lang: voice?.lang || "",
    default: Boolean(voice?.default),
    localService: Boolean(voice?.localService),
    voiceURI: voice?.voiceURI || "",
  }));
}

function resolveVoiceName(stackOptions, toastOptions) {
  if (toastOptions && typeof toastOptions.voiceName === "string" && toastOptions.voiceName.trim()) {
    return toastOptions.voiceName.trim();
  }
  return String(stackOptions.voiceName || "").trim();
}

function resolveSpeakEnabled(stackOptions, toastOptions) {
  if (toastOptions && Object.prototype.hasOwnProperty.call(toastOptions, "speak")) {
    return Boolean(toastOptions.speak);
  }
  return Boolean(stackOptions.speak);
}

function defaultSpeakFormatter(toast) {
  const title = String(toast?.title || "").trim();
  const message = String(toast?.message || "").trim();
  if (title && message) {
    return `${title}. ${message}`;
  }
  return title || message;
}

function resolveVariantIcon(stackOptions, toastOptions, type) {
  if (toastOptions && Object.prototype.hasOwnProperty.call(toastOptions, "showVariantIcon")) {
    if (!toastOptions.showVariantIcon) {
      return "";
    }
  } else if (stackOptions && Object.prototype.hasOwnProperty.call(stackOptions, "showVariantIcon")) {
    if (!stackOptions.showVariantIcon) {
      return "";
    }
  }
  if (toastOptions && toastOptions.variantIcon) {
    return String(toastOptions.variantIcon);
  }
  if (stackOptions && stackOptions.variantIcon) {
    return String(stackOptions.variantIcon);
  }
  return getSemanticStatusIcon(type);
}

function clampNumber(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, next));
}

function normalizeOptions(options) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
}

function normalizePosition(position) {
  const value = String(position || "").toLowerCase();
  const allowed = ["top-right", "top-left", "bottom-right", "bottom-left"];
  return allowed.includes(value) ? value : "top-right";
}

function normalizeType(type) {
  const value = String(type || "").toLowerCase();
  const allowed = ["neutral", "success", "info", "warn", "error"];
  return allowed.includes(value) ? value : "neutral";
}

function resolveDuration(duration, fallback) {
  const value = Number(duration);
  if (Number.isFinite(value) && value >= 0) {
    return value;
  }
  const nextFallback = Number(fallback);
  return Number.isFinite(nextFallback) && nextFallback >= 0 ? nextFallback : 3200;
}

function getToastId(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "id")) {
    return String(value.id || "");
  }
  return String(value || "");
}

function cloneToastState(item) {
  return {
    id: item.id,
    type: item.type,
    message: item.message,
    title: item.title,
    createdAt: item.createdAt,
    persistent: Boolean(item.persistent),
    busy: Boolean(item.busy),
    dismissible: item.dismissible !== false,
    duration: Number(item.duration) || 0,
    remote: Boolean(item.remote),
  };
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

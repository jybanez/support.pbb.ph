import { createElement } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  text: "",
  visible: true,
  fullscreen: null,
  backdrop: true,
  blockInteraction: true,
  lockScroll: true,
  zIndex: "",
  ariaLabel: "Busy",
  cancel: null,
};

const bodyLockState = new WeakMap();

export function createBusyOverlay(targetOrOptions = {}, options = {}) {
  const resolved = resolveTargetAndOptions(targetOrOptions, options);
  const target = resolved.target;
  const events = createEventBag();
  let currentOptions = normalizeOptions(resolved.options, target);
  let visible = currentOptions.visible;
  let destroyed = false;
  let activeDocument = resolveDocument(target);
  let mountParent = null;
  let lastFocusedElement = null;
  let cancelPending = false;
  let restoreTargetPosition = "";
  let targetPositionManaged = false;
  let targetAriaBusy = null;
  let targetHadAriaBusy = false;
  let targetBusyManaged = false;

  const root = createElement("div", {
    className: "ui-busy-overlay",
    attrs: {
      hidden: "hidden",
      "aria-hidden": "true",
      tabindex: "-1",
    },
  });
  const backdrop = createElement("div", { className: "ui-busy-overlay-backdrop" });
  const content = createElement("div", { className: "ui-busy-overlay-content" });
  const spinner = createElement("span", {
    className: "ui-busy-overlay-spinner",
    attrs: { "aria-hidden": "true" },
    html: `
      <svg class="ui-busy-overlay-spinner-svg" viewBox="0 0 50 50" aria-hidden="true">
        <circle class="ui-busy-overlay-spinner-track" cx="25" cy="25" r="20" fill="none"></circle>
        <circle class="ui-busy-overlay-spinner-indicator" cx="25" cy="25" r="20" fill="none"></circle>
      </svg>
    `,
  });
  const message = createElement("div", {
    className: "ui-busy-overlay-message",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const actions = createElement("div", {
    className: "ui-busy-overlay-actions",
    attrs: { hidden: "hidden" },
  });
  const cancelButton = createElement("button", {
    className: "ui-button ui-busy-overlay-cancel",
    text: "Cancel",
    attrs: { type: "button", hidden: "hidden" },
  });

  actions.appendChild(cancelButton);
  content.append(spinner, message, actions);
  root.append(backdrop, content);

  events.on(cancelButton, "click", (event) => {
    void handleCancel(event);
  });
  events.on(root, "click", (event) => {
    if (currentOptions.blockInteraction) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  events.on(root, "mousedown", (event) => {
    if (currentOptions.blockInteraction) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  events.on(root, "wheel", (event) => {
    if (visible && currentOptions.blockInteraction) {
      event.preventDefault();
    }
  }, { passive: false });
  events.on(root, "touchmove", (event) => {
    if (visible && currentOptions.blockInteraction) {
      event.preventDefault();
    }
  }, { passive: false });
  events.on(activeDocument, "focusin", (event) => {
    if (!visible || destroyed || currentOptions.blockInteraction === false) {
      return;
    }
    if (root.contains(event.target)) {
      return;
    }
    focusOverlay();
  }, true);

  mount();
  sync();

  return {
    show,
    hide,
    update,
    setText,
    destroy,
    isVisible,
    getState,
    getElement,
  };

  function mount() {
    if (destroyed) {
      return;
    }
    activeDocument = resolveDocument(target);
    mountParent = resolveMountParent(target, activeDocument, currentOptions);
    if (!root.isConnected) {
      mountParent.appendChild(root);
    }
    if (!currentOptions.fullscreen) {
      ensureScopedTarget();
    }
  }

  function show(nextOptions = {}) {
    if (destroyed) {
      return;
    }
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) }, target);
    visible = true;
    sync(true);
  }

  function hide() {
    if (destroyed) {
      return;
    }
    visible = false;
    sync();
  }

  function update(nextOptions = {}) {
    if (destroyed) {
      return;
    }
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) }, target);
    if (Object.prototype.hasOwnProperty.call(nextOptions || {}, "visible")) {
      visible = currentOptions.visible;
    }
    sync();
  }

  function setText(nextText) {
    update({ text: nextText == null ? "" : String(nextText) });
  }

  function isVisible() {
    return visible;
  }

  function getState() {
    return {
      visible,
      target,
      options: {
        ...currentOptions,
        cancel: normalizeCancel(currentOptions.cancel),
      },
    };
  }

  function getElement() {
    return root;
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    hide();
    destroyed = true;
    events.clear();
    if (root.parentNode) {
      root.parentNode.removeChild(root);
    }
    cleanupScopedTarget();
  }

  async function handleCancel(event) {
    const cancelConfig = normalizeCancel(currentOptions.cancel);
    if (!cancelConfig?.onCancel || cancelPending) {
      return;
    }
    cancelPending = true;
    cancelButton.disabled = true;
    try {
      const result = await cancelConfig.onCancel({
        overlay: api(),
        event,
        hide,
        show,
        destroy,
      });
      if (result !== false) {
        hide();
      }
    } finally {
      cancelPending = false;
      cancelButton.disabled = false;
    }
  }

  function sync(shouldFocus = false) {
    mount();
    root.className = buildRootClassName(currentOptions);
    root.style.zIndex = currentOptions.zIndex ? String(currentOptions.zIndex) : "";
    root.hidden = !visible;
    root.setAttribute("aria-hidden", visible ? "false" : "true");
    root.setAttribute("aria-label", currentOptions.ariaLabel);
    backdrop.hidden = currentOptions.backdrop === false;
    message.textContent = currentOptions.text;
    message.hidden = !currentOptions.text;
    syncCancelButton();
    syncTargetBusy();
    syncBodyScroll();

    if (visible) {
      root.classList.add("is-visible");
      if (currentOptions.blockInteraction) {
        if (!lastFocusedElement && activeDocument?.activeElement instanceof HTMLElement) {
          lastFocusedElement = activeDocument.activeElement;
        }
        if (shouldFocus) {
          queueMicrotask(() => focusOverlay());
        }
      }
    } else {
      root.classList.remove("is-visible");
      restoreFocus();
    }
  }

  function syncCancelButton() {
    const cancelConfig = normalizeCancel(currentOptions.cancel);
    if (!cancelConfig?.onCancel) {
      actions.hidden = true;
      cancelButton.hidden = true;
      cancelButton.textContent = "Cancel";
      return;
    }
    actions.hidden = false;
    cancelButton.hidden = false;
    cancelButton.textContent = cancelConfig.label;
  }

  function syncTargetBusy() {
    if (!target || target.nodeType !== 1) {
      return;
    }
    if (visible) {
      if (!targetBusyManaged) {
        targetHadAriaBusy = target.hasAttribute("aria-busy");
        targetAriaBusy = target.getAttribute("aria-busy");
        targetBusyManaged = true;
      }
      target.setAttribute("aria-busy", "true");
      return;
    }
    if (!targetBusyManaged) {
      return;
    }
    if (targetHadAriaBusy) {
      target.setAttribute("aria-busy", targetAriaBusy ?? "false");
    } else {
      target.removeAttribute("aria-busy");
    }
    targetBusyManaged = false;
    targetHadAriaBusy = false;
    targetAriaBusy = null;
  }

  function syncBodyScroll() {
    if (!currentOptions.fullscreen || !activeDocument?.body) {
      return;
    }
    if (visible && currentOptions.lockScroll) {
      lockBodyScroll(activeDocument.body);
    } else {
      unlockBodyScroll(activeDocument.body);
    }
  }

  function ensureScopedTarget() {
    if (!target || target.nodeType !== 1 || targetPositionManaged) {
      return;
    }
    const computed = activeDocument?.defaultView?.getComputedStyle(target);
    if (computed?.position === "static") {
      restoreTargetPosition = target.style.position || "";
      target.style.position = "relative";
      targetPositionManaged = true;
    }
  }

  function cleanupScopedTarget() {
    if (!target || target.nodeType !== 1) {
      return;
    }
    if (targetPositionManaged) {
      target.style.position = restoreTargetPosition;
      targetPositionManaged = false;
      restoreTargetPosition = "";
    }
  }

  function focusOverlay() {
    if (!visible || destroyed) {
      return;
    }
    const focusTarget = !cancelButton.hidden ? cancelButton : root;
    focusTarget.focus?.({ preventScroll: true });
  }

  function restoreFocus() {
    if (!lastFocusedElement || !lastFocusedElement.isConnected) {
      lastFocusedElement = null;
      return;
    }
    try {
      lastFocusedElement.focus({ preventScroll: true });
    } catch (_error) {
      // Ignore focus restore failures.
    }
    lastFocusedElement = null;
  }

  function api() {
    return {
      show,
      hide,
      update,
      setText,
      destroy,
      isVisible,
      getState,
      getElement,
    };
  }
}

function buildRootClassName(options) {
  return [
    "ui-busy-overlay",
    options.fullscreen ? "is-fullscreen" : "is-scoped",
    options.backdrop === false ? "is-backdropless" : "",
    options.className || "",
  ].filter(Boolean).join(" ");
}

function resolveTargetAndOptions(targetOrOptions, options) {
  if (isElement(targetOrOptions)) {
    return {
      target: targetOrOptions,
      options: options && typeof options === "object" ? options : {},
    };
  }
  if (targetOrOptions && typeof targetOrOptions === "object" && isElement(targetOrOptions.target)) {
    return {
      target: targetOrOptions.target,
      options: targetOrOptions,
    };
  }
  return {
    target: null,
    options: targetOrOptions && typeof targetOrOptions === "object" ? targetOrOptions : {},
  };
}

function normalizeOptions(options, target) {
  const next = {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
  next.text = next.text == null ? "" : String(next.text);
  next.className = String(next.className || "");
  next.ariaLabel = String(next.ariaLabel || "Busy");
  next.visible = next.visible !== false;
  next.backdrop = next.backdrop !== false;
  next.blockInteraction = next.blockInteraction !== false;
  next.lockScroll = next.lockScroll !== false;
  next.fullscreen = target ? false : next.fullscreen !== false;
  next.cancel = normalizeCancel(next.cancel);
  return next;
}

function normalizeCancel(cancel) {
  if (typeof cancel === "function") {
    return {
      label: "Cancel",
      onCancel: cancel,
    };
  }
  if (!cancel || typeof cancel !== "object" || typeof cancel.onCancel !== "function") {
    return null;
  }
  return {
    label: cancel.label ? String(cancel.label) : "Cancel",
    onCancel: cancel.onCancel,
  };
}

function resolveMountParent(target, activeDocument, options) {
  if (!options.fullscreen && target && target.nodeType === 1) {
    return target;
  }
  return activeDocument?.body || document.body;
}

function resolveDocument(target) {
  return target?.ownerDocument || document;
}

function isElement(value) {
  return Boolean(value && typeof value === "object" && value.nodeType === 1);
}

function lockBodyScroll(body) {
  if (!body) {
    return;
  }
  const current = bodyLockState.get(body);
  if (current) {
    current.count += 1;
    return;
  }
  bodyLockState.set(body, {
    count: 1,
    overflow: body.style.overflow || "",
  });
  body.style.overflow = "hidden";
}

function unlockBodyScroll(body) {
  if (!body) {
    return;
  }
  const current = bodyLockState.get(body);
  if (!current) {
    return;
  }
  current.count -= 1;
  if (current.count > 0) {
    return;
  }
  body.style.overflow = current.overflow;
  bodyLockState.delete(body);
}

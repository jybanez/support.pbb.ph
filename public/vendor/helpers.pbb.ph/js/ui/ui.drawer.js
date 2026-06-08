import { createElement } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createIcon } from "./ui.icons.js?v=0.21.84";

export function createDrawer(options = {}) {
  const events = createEventBag();
  const documentEvents = createEventBag();
  const headerActionEvents = createEventBag();
  const animationMs = Math.max(0, Number(options.animationMs) || 220);
  const position = normalizePosition(options.position);
  const titleId = `ui-drawer-title-${Math.random().toString(36).slice(2, 10)}`;
  let lastFocusedElement = null;
  const backdrop = createElement("div", {
    className: joinClassNames("ui-drawer-backdrop", options.backdropClass),
  });
  const panel = createElement("aside", {
    className: joinClassNames("ui-drawer", options.panelClass, `ui-drawer-pos-${position}`),
    attrs: {
      role: "dialog",
      "aria-modal": "true",
      tabindex: "-1",
    },
  });
  const header = createElement("div", {
    className: joinClassNames("ui-drawer-header", options.headerClass),
  });
  const title = createElement("h4", {
    className: joinClassNames("ui-title", options.titleClass),
    text: options.title || "",
  });
  title.id = titleId;
  const headerControls = createElement("div", {
    className: joinClassNames("ui-drawer-header-controls", options.headerControlsClass),
  });
  const headerActions = createElement("div", {
    className: joinClassNames("ui-drawer-header-actions", options.headerActionsClass),
    attrs: {
      role: "group",
      "aria-label": options.headerActionsLabel || "Drawer actions",
    },
  });
  const closeButton = createElement("button", {
    className: joinClassNames("ui-drawer-close", options.closeClass),
    html: '<span aria-hidden="true">\u2715</span>',
    attrs: {
      type: "button",
      "aria-label": options.closeLabel || "Close drawer",
    },
  });
  const body = createElement("div", {
    className: joinClassNames("ui-drawer-body", options.bodyClass),
  });
  if (options.title) {
    panel.setAttribute("aria-labelledby", titleId);
  } else {
    panel.setAttribute("aria-label", String(options.ariaLabel || options.title || "Drawer"));
  }

  headerControls.append(headerActions, closeButton);
  header.append(title, headerControls);
  panel.append(header, body);

  let isOpen = false;
  let closeNotified = false;
  let closeTimer = null;
  let currentHeaderActions = normalizeHeaderActions(options.headerActions);
  const headerActionButtons = new Map();
  let drawerApi = null;

  backdrop.style.setProperty("--ui-drawer-animation-ms", `${animationMs}ms`);
  panel.style.setProperty("--ui-drawer-animation-ms", `${animationMs}ms`);
  renderHeaderActions();

  function notifyClose() {
    if (!closeNotified) {
      closeNotified = true;
      options.onClose?.();
    }
  }

  function close() {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    events.clear();
    documentEvents.clear();
    backdrop.classList.remove("is-open");
    panel.classList.remove("is-open");
    backdrop.classList.add("is-closing");
    panel.classList.add("is-closing");

    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    closeTimer = setTimeout(() => {
      if (backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
      backdrop.classList.remove("is-closing");
      panel.classList.remove("is-closing");
      closeTimer = null;
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        try {
          lastFocusedElement.focus();
        } catch (_error) {
          // Ignore focus restore failures.
        }
      }
      lastFocusedElement = null;
      notifyClose();
    }, animationMs + 24);
  }

  function open(parent = document.body) {
    if (isOpen) {
      return;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    closeNotified = false;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backdrop.classList.remove("is-open", "is-closing");
    panel.classList.remove("is-open", "is-closing");
    parent.append(backdrop, panel);
    isOpen = true;

    events.on(backdrop, "click", close);
    events.on(closeButton, "click", close);
    documentEvents.on(document, "keydown", (event) => {
      if (!isOpen) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    requestAnimationFrame(() => {
      if (!isOpen) {
        return;
      }
      backdrop.classList.add("is-open");
      panel.classList.add("is-open");
      closeButton.focus();
    });
  }

  function updateHeaderActions(nextActions = []) {
    currentHeaderActions = normalizeHeaderActions(nextActions);
    renderHeaderActions();
  }

  function setHeaderActionState(id, patch = {}) {
    const key = String(id || "").trim();
    if (!key) {
      return false;
    }
    let changed = false;
    currentHeaderActions = currentHeaderActions.map((action) => {
      if (action.id !== key) {
        return action;
      }
      changed = true;
      return normalizeHeaderAction({ ...action, ...patch }, action.index);
    });
    if (changed) {
      renderHeaderActions();
    }
    return changed;
  }

  function getHeaderAction(id) {
    return headerActionButtons.get(String(id || "").trim()) || null;
  }

  function destroy() {
    headerActionEvents.clear();
    close();
  }

  function renderHeaderActions() {
    headerActionEvents.clear();
    headerActions.innerHTML = "";
    headerActionButtons.clear();
    headerActions.hidden = currentHeaderActions.length === 0;

    currentHeaderActions.forEach((action) => {
      const button = createHeaderActionButton(action);
      headerActionButtons.set(action.id, button);
      headerActions.appendChild(button);
    });
  }

  function createHeaderActionButton(action) {
    const button = createElement("button", {
      className: joinClassNames(
        "ui-drawer-action",
        `ui-drawer-action-${action.tone}`,
        (!action.icon || action.showLabel === true) ? "ui-drawer-action-with-label" : "",
        action.busy ? "is-busy" : "",
        action.className,
      ),
      attrs: {
        type: "button",
        "data-action-id": action.id,
        "aria-label": action.label,
        title: action.title || action.label,
      },
    });
    button.disabled = action.disabled || action.busy;
    if (action.busy) {
      button.setAttribute("aria-busy", "true");
    }

    const icon = createActionIcon(action);
    if (icon) {
      button.appendChild(icon);
    }
    if (!icon || action.showLabel === true) {
      button.appendChild(createElement("span", {
        className: "ui-drawer-action-label",
        text: action.label,
      }));
    }

    headerActionEvents.on(button, "click", (event) => {
      if (button.disabled || action.disabled || action.busy) {
        event.preventDefault();
        return;
      }
      action.onClick?.(action, event, drawerApi);
    });

    return button;
  }

  function createActionIcon(action) {
    if (!action.icon) {
      return null;
    }
    if (action.icon instanceof Node) {
      return action.icon.cloneNode(true);
    }
    const iconName = String(action.icon || "").trim();
    if (!iconName) {
      return null;
    }
    try {
      return createIcon(iconName, { size: 16, className: "ui-drawer-action-icon" });
    } catch (_error) {
      return createElement("span", {
        className: "ui-drawer-action-icon",
        text: iconName,
        attrs: { "aria-hidden": "true" },
      });
    }
  }

  drawerApi = {
    panel,
    body,
    header,
    title,
    headerControls,
    headerActions,
    closeButton,
    backdrop,
    getHeaderAction,
    setHeaderActionState,
    updateHeaderActions,
    open,
    close,
    destroy,
    isOpen: () => isOpen,
  };

  return drawerApi;
}

export const createBottomDrawer = createDrawer;

function normalizeHeaderActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .map((action, index) => normalizeHeaderAction(action, index))
    .filter(Boolean);
}

function normalizeHeaderAction(action, index = 0) {
  if (!action || typeof action !== "object") {
    return null;
  }
  const label = String(action.label || action.title || action.id || "").trim();
  if (!label) {
    return null;
  }
  const id = String(action.id || label.toLowerCase().replace(/\s+/g, "-") || `action-${index}`).trim();
  return {
    ...action,
    id,
    index,
    label,
    title: String(action.title || label).trim(),
    tone: normalizeTone(action.tone),
    disabled: Boolean(action.disabled),
    busy: Boolean(action.busy),
    showLabel: action.showLabel === true,
  };
}

function normalizeTone(value) {
  const tone = String(value || "default").toLowerCase();
  if (tone === "primary" || tone === "danger" || tone === "quiet" || tone === "ghost") {
    return tone;
  }
  return "default";
}

function normalizePosition(value) {
  const next = String(value || "bottom").toLowerCase();
  if (next === "top" || next === "left" || next === "right") {
    return next;
  }
  return "bottom";
}

function joinClassNames(...parts) {
  return parts
    .filter((value) => value != null && String(value).trim() !== "")
    .map((value) => String(value).trim())
    .join(" ");
}

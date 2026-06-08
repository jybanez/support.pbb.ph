import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  id: "",
  label: "",
  pressed: false,
  icon: "",
  ariaLabel: "",
  variant: "pill",
  tone: "neutral",
  size: "md",
  quiet: false,
  disabled: false,
  leadingDot: false,
  iconPosition: "start",
  count: null,
  loading: false,
  tooltip: "",
  className: "",
  onChange: null,
};

export function createToggleButton(container, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let root = null;

  function normalizeOptions(nextOptions) {
    return {
      ...DEFAULT_OPTIONS,
      ...(nextOptions || {}),
      id: String(nextOptions?.id ?? DEFAULT_OPTIONS.id),
      label: nextOptions?.label == null ? "" : String(nextOptions.label),
      pressed: Boolean(nextOptions?.pressed),
      disabled: Boolean(nextOptions?.disabled),
      loading: Boolean(nextOptions?.loading),
      quiet: Boolean(nextOptions?.quiet),
      leadingDot: Boolean(nextOptions?.leadingDot),
      ariaLabel: nextOptions?.ariaLabel == null ? "" : String(nextOptions.ariaLabel),
      tooltip: nextOptions?.tooltip == null ? "" : String(nextOptions.tooltip),
      className: nextOptions?.className == null ? "" : String(nextOptions.className),
      variant: normalizeVariant(nextOptions?.variant),
      tone: normalizeTone(nextOptions?.tone),
      size: normalizeSize(nextOptions?.size),
      iconPosition: normalizeIconPosition(nextOptions?.iconPosition),
    };
  }

  function validate() {
    const hasLabel = Boolean(currentOptions.label.trim());
    const hasIcon = Boolean(currentOptions.icon);
    if (!hasLabel && hasIcon && !currentOptions.ariaLabel.trim()) {
      console.error('createToggleButton: "ariaLabel" is required for icon-only toggle buttons.', {
        id: currentOptions.id,
      });
      return false;
    }
    return true;
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }

    events.clear();
    clearNode(container);

    if (!validate()) {
      return;
    }

    const disabled = currentOptions.disabled || currentOptions.loading;
    root = createElement("button", {
      className: buildClassName(disabled),
      attrs: {
        type: "button",
        "aria-pressed": currentOptions.pressed ? "true" : "false",
        "aria-label": currentOptions.ariaLabel || null,
        title: currentOptions.tooltip || null,
        disabled: disabled ? "disabled" : null,
      },
      dataset: {
        toggleId: currentOptions.id || null,
        pressed: currentOptions.pressed ? "true" : "false",
      },
    });

    if (currentOptions.leadingDot) {
      root.appendChild(createElement("span", { className: "ui-toggle-button__dot", attrs: { "aria-hidden": "true" } }));
    }

    const icon = createIconNode();
    const label = createLabelNode();
    if (currentOptions.iconPosition === "end") {
      if (label) root.appendChild(label);
      if (icon) root.appendChild(icon);
    } else {
      if (icon) root.appendChild(icon);
      if (label) root.appendChild(label);
    }

    if (currentOptions.count != null && currentOptions.count !== "") {
      root.appendChild(createElement("span", {
        className: "ui-toggle-button__badge",
        text: String(currentOptions.count),
      }));
    }

    events.on(root, "click", (event) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      const nextPressed = !currentOptions.pressed;
      currentOptions.pressed = nextPressed;
      syncPressedState();
      emitChange(event);
    });

    container.appendChild(root);
  }

  function createIconNode() {
    if (!currentOptions.icon && !currentOptions.loading) {
      return null;
    }
    const icon = createElement("span", {
      className: "ui-toggle-button__icon",
      attrs: { "aria-hidden": "true" },
    });
    if (currentOptions.loading) {
      icon.appendChild(createElement("span", { className: "ui-toggle-button__spinner" }));
    } else if (currentOptions.icon instanceof HTMLElement) {
      icon.appendChild(currentOptions.icon.cloneNode(true));
    } else {
      icon.innerHTML = String(currentOptions.icon);
    }
    return icon;
  }

  function createLabelNode() {
    if (!currentOptions.label) {
      return null;
    }
    return createElement("span", {
      className: "ui-toggle-button__label",
      text: currentOptions.label,
    });
  }

  function buildClassName(disabled) {
    const parts = [
      "ui-toggle-button",
      `ui-toggle-button--${currentOptions.variant}`,
      `ui-toggle-button--${currentOptions.tone}`,
      `ui-toggle-button--${currentOptions.size}`,
      currentOptions.pressed ? "is-pressed" : "",
      disabled ? "is-disabled" : "",
      currentOptions.loading ? "is-loading" : "",
      currentOptions.quiet ? "is-quiet" : "",
      !currentOptions.label ? "is-icon-only" : "",
      currentOptions.className || "",
    ];
    return parts.filter(Boolean).join(" ");
  }

  function syncPressedState() {
    if (!root) {
      render();
      return;
    }
    root.classList.toggle("is-pressed", currentOptions.pressed);
    root.setAttribute("aria-pressed", currentOptions.pressed ? "true" : "false");
    if (root.dataset) {
      root.dataset.pressed = currentOptions.pressed ? "true" : "false";
    }
  }

  function emitChange(event) {
    if (typeof currentOptions.onChange === "function") {
      currentOptions.onChange({
        id: currentOptions.id,
        pressed: currentOptions.pressed,
        button: api,
        event: event || null,
      });
    }
  }

  const api = {
    setPressed(nextPressed, emit = false) {
      currentOptions.pressed = Boolean(nextPressed);
      syncPressedState();
      if (emit) {
        emitChange(null);
      }
    },
    getPressed() {
      return Boolean(currentOptions.pressed);
    },
    setDisabled(nextDisabled) {
      currentOptions.disabled = Boolean(nextDisabled);
      render();
    },
    setLabel(nextLabel) {
      currentOptions.label = nextLabel == null ? "" : String(nextLabel);
      render();
    },
    update(nextOptions = {}) {
      currentOptions = normalizeOptions({
        ...currentOptions,
        ...(nextOptions || {}),
      });
      render();
    },
    getState() {
      return { ...currentOptions };
    },
    destroy() {
      events.clear();
      clearNode(container);
      root = null;
    },
  };

  render();
  return api;
}

function normalizeVariant(value) {
  const candidate = String(value || "pill").trim().toLowerCase();
  return ["pill", "chip", "icon", "ghost", "segmented"].includes(candidate) ? candidate : "pill";
}

function normalizeTone(value) {
  const candidate = String(value || "neutral").trim().toLowerCase();
  return ["neutral", "success", "info", "warning", "danger"].includes(candidate) ? candidate : "neutral";
}

function normalizeSize(value) {
  const candidate = String(value || "md").trim().toLowerCase();
  return ["sm", "md", "lg"].includes(candidate) ? candidate : "md";
}

function normalizeIconPosition(value) {
  return String(value || "start").trim().toLowerCase() === "end" ? "end" : "start";
}

import { createElement, clearNode } from "./ui.dom.js";
import { createIcon } from "./ui.icons.js?v=0.21.64";

const DEFAULT_OPTIONS = {
  value: "",
  visible: false,
  placeholder: "",
  name: "",
  id: "",
  autocomplete: "",
  required: false,
  disabled: false,
  readonly: false,
  ariaLabel: "Password",
  showLabel: "Show password",
  hideLabel: "Hide password",
  onChange: null,
  onToggle: null,
  describedBy: "",
};

export function createPasswordField(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error("createPasswordField(container, options) requires a valid container element.");
  }

  let currentOptions = normalizeOptions(options);

  const root = createElement("div", { className: "ui-password" });
  const input = createElement("input", {
    className: "ui-input ui-password-input",
    attrs: {
      type: currentOptions.visible ? "text" : "password",
      value: currentOptions.value,
      ...(currentOptions.id ? { id: currentOptions.id } : {}),
      ...(currentOptions.name ? { name: currentOptions.name } : {}),
      ...(currentOptions.placeholder ? { placeholder: currentOptions.placeholder } : {}),
      ...(currentOptions.autocomplete ? { autocomplete: currentOptions.autocomplete } : {}),
      ...(currentOptions.required ? { required: "required" } : {}),
      ...(currentOptions.disabled ? { disabled: "disabled" } : {}),
      ...(currentOptions.readonly ? { readonly: "readonly" } : {}),
      ...(currentOptions.ariaLabel ? { "aria-label": currentOptions.ariaLabel } : {}),
      ...(currentOptions.describedBy ? { "aria-describedby": currentOptions.describedBy } : {}),
    },
  });
  const toggle = createElement("button", {
    className: "ui-password-toggle",
    attrs: {
      type: "button",
      "aria-label": currentOptions.visible ? currentOptions.hideLabel : currentOptions.showLabel,
      "aria-pressed": currentOptions.visible ? "true" : "false",
    },
  });

  function syncVisualState() {
    const toggleLabel = currentOptions.visible ? currentOptions.hideLabel : currentOptions.showLabel;
    input.type = currentOptions.visible ? "text" : "password";
    input.value = currentOptions.value;
    input.disabled = currentOptions.disabled;
    input.readOnly = currentOptions.readonly;
    clearNode(toggle);
    toggle.appendChild(createToggleIcon(currentOptions.visible));
    toggle.setAttribute("aria-label", toggleLabel);
    toggle.setAttribute("aria-pressed", currentOptions.visible ? "true" : "false");
    toggle.setAttribute("title", toggleLabel);
    toggle.disabled = currentOptions.disabled;
    root.classList.toggle("is-visible", currentOptions.visible);
    root.classList.toggle("is-disabled", currentOptions.disabled);
  }

  function setValue(nextValue) {
    currentOptions.value = nextValue == null ? "" : String(nextValue);
    input.value = currentOptions.value;
  }

  function getValue() {
    return input.value;
  }

  function setVisible(nextVisible) {
    currentOptions.visible = Boolean(nextVisible);
    syncVisualState();
    currentOptions.onToggle?.(currentOptions.visible, api);
  }

  function isVisible() {
    return Boolean(currentOptions.visible);
  }

  function focus() {
    input.focus();
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({
      ...currentOptions,
      ...(nextOptions || {}),
      value: Object.prototype.hasOwnProperty.call(nextOptions, "value") ? nextOptions.value : currentOptions.value,
      visible: Object.prototype.hasOwnProperty.call(nextOptions, "visible") ? nextOptions.visible : currentOptions.visible,
    });
    applyStaticOptions();
    syncVisualState();
  }

  function applyStaticOptions() {
    if (currentOptions.id) {
      input.id = currentOptions.id;
    }
    if (currentOptions.name) {
      input.name = currentOptions.name;
    }
    input.placeholder = currentOptions.placeholder;
    if (currentOptions.autocomplete) {
      input.setAttribute("autocomplete", currentOptions.autocomplete);
    } else {
      input.removeAttribute("autocomplete");
    }
    if (currentOptions.describedBy) {
      input.setAttribute("aria-describedby", currentOptions.describedBy);
    } else {
      input.removeAttribute("aria-describedby");
    }
    if (currentOptions.ariaLabel) {
      input.setAttribute("aria-label", currentOptions.ariaLabel);
    } else {
      input.removeAttribute("aria-label");
    }
    if (currentOptions.required) {
      input.setAttribute("required", "required");
    } else {
      input.removeAttribute("required");
    }
    if (currentOptions.readonly) {
      input.setAttribute("readonly", "readonly");
    } else {
      input.removeAttribute("readonly");
    }
  }

  function destroy() {
    input.removeEventListener("input", handleInput);
    input.removeEventListener("change", handleInput);
    toggle.removeEventListener("click", handleToggle);
    clearNode(container);
  }

  function handleInput() {
    currentOptions.value = input.value;
    currentOptions.onChange?.(currentOptions.value, api);
  }

  function handleToggle() {
    setVisible(!currentOptions.visible);
    input.focus();
  }

  input.addEventListener("input", handleInput);
  input.addEventListener("change", handleInput);
  toggle.addEventListener("click", handleToggle);

  applyStaticOptions();
  syncVisualState();
  root.append(input, toggle);
  clearNode(container);
  container.appendChild(root);

  const api = {
    root,
    input,
    toggle,
    getValue,
    setValue,
    isVisible,
    setVisible,
    focus,
    update,
    destroy,
  };

  container.__uiPasswordInstance = api;
  return api;
}

function createToggleIcon(visible) {
  return createIcon(visible ? "actions.hide" : "actions.view", {
    size: 18,
    decorative: true,
    className: "ui-password-toggle-icon",
  });
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    value: options.value == null ? "" : String(options.value),
    visible: Boolean(options.visible),
    placeholder: String(options.placeholder || ""),
    name: String(options.name || ""),
    id: String(options.id || ""),
    autocomplete: String(options.autocomplete || ""),
    ariaLabel: String(options.ariaLabel || DEFAULT_OPTIONS.ariaLabel),
    showLabel: String(options.showLabel || DEFAULT_OPTIONS.showLabel),
    hideLabel: String(options.hideLabel || DEFAULT_OPTIONS.hideLabel),
    describedBy: String(options.describedBy || ""),
  };
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  id: "",
  name: "",
  label: "",
  checked: false,
  checkedValue: undefined,
  uncheckedValue: undefined,
  disabled: false,
  readonly: false,
  required: false,
  help: "",
  className: "",
  ariaLabel: "",
  onChange: null,
};

export function createCheckbox(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("createCheckbox(container, options) requires a host container.");
  }

  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let refs = {};
  let api = null;

  function render() {
    events.clear();
    clearNode(container);

    const id = currentOptions.id || `ui-checkbox-${currentOptions.name || Math.random().toString(36).slice(2)}`;
    const root = createElement("label", {
      className: buildClassName(currentOptions),
      attrs: {
        for: id,
        "aria-disabled": currentOptions.disabled ? "true" : null,
      },
    });
    const input = createElement("input", {
      className: "ui-checkbox-input",
      attrs: {
        id,
        name: currentOptions.name || null,
        type: "checkbox",
        checked: currentOptions.checked ? "checked" : null,
        disabled: currentOptions.disabled ? "disabled" : null,
        required: currentOptions.required ? "required" : null,
        "aria-label": currentOptions.ariaLabel || null,
      },
    });
    input.checked = currentOptions.checked;

    const box = createElement("span", { className: "ui-checkbox-box", attrs: { "aria-hidden": "true" } });
    box.innerHTML = '<svg viewBox="0 0 16 16" focusable="false"><path d="M3.5 8.2l2.7 2.7 6.3-6.8" /></svg>';

    const textWrap = createElement("span", { className: "ui-checkbox-text" });
    if (currentOptions.label) {
      textWrap.appendChild(createElement("span", {
        className: "ui-checkbox-label",
        text: currentOptions.label,
      }));
    }
    if (currentOptions.help) {
      textWrap.appendChild(createElement("span", {
        className: "ui-checkbox-help",
        text: currentOptions.help,
      }));
    }

    root.append(input, box, textWrap);
    events.on(root, "click", (event) => {
      if (!currentOptions.readonly) {
        return;
      }
      event.preventDefault();
    });
    events.on(input, "change", (event) => {
      if (currentOptions.readonly) {
        input.checked = currentOptions.checked;
        event.preventDefault();
        return;
      }
      currentOptions.checked = Boolean(input.checked);
      syncState();
      emitChange(event);
    });

    container.appendChild(root);
    refs = { root, input, box, textWrap };
    if (api) {
      api.refs = refs;
    }
    syncState();
  }

  function syncState() {
    if (!refs.root || !refs.input) {
      return;
    }
    refs.input.checked = currentOptions.checked;
    refs.root.classList.toggle("is-checked", currentOptions.checked);
    refs.root.classList.toggle("is-disabled", currentOptions.disabled);
    refs.root.classList.toggle("is-readonly", currentOptions.readonly);
    refs.root.dataset.checked = currentOptions.checked ? "true" : "false";
  }

  function emitChange(event) {
    currentOptions.onChange?.({
      checked: currentOptions.checked,
      value: resolveValue(currentOptions),
      checkbox: api,
      event: event || null,
    });
  }

  api = {
    refs,
    getChecked() {
      return Boolean(currentOptions.checked);
    },
    setChecked(checked, meta = {}) {
      currentOptions.checked = Boolean(checked);
      syncState();
      if (meta.emit) {
        emitChange(null);
      }
    },
    getValue() {
      return resolveValue(currentOptions);
    },
    setValue(value, meta = {}) {
      currentOptions.checked = valueToChecked(value, currentOptions);
      syncState();
      if (meta.emit) {
        emitChange(null);
      }
    },
    setDisabled(disabled) {
      currentOptions.disabled = Boolean(disabled);
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
      return {
        ...currentOptions,
        value: resolveValue(currentOptions),
      };
    },
    destroy() {
      events.clear();
      clearNode(container);
      refs = {};
      api.refs = refs;
    },
  };

  render();
  api.refs = refs;
  return api;
}

function normalizeOptions(options = {}) {
  const hasExplicitValue = Object.prototype.hasOwnProperty.call(options, "checkedValue")
    || Object.prototype.hasOwnProperty.call(options, "uncheckedValue");
  const checkedValue = Object.prototype.hasOwnProperty.call(options, "checkedValue")
    ? options.checkedValue
    : undefined;
  const uncheckedValue = Object.prototype.hasOwnProperty.call(options, "uncheckedValue")
    ? options.uncheckedValue
    : undefined;
  const checked = Object.prototype.hasOwnProperty.call(options, "value")
    ? valueToChecked(options.value, { checkedValue, uncheckedValue, hasExplicitValue })
    : Boolean(options.checked);

  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    id: String(options.id || ""),
    name: String(options.name || ""),
    label: String(options.label || ""),
    checked,
    checkedValue,
    uncheckedValue,
    hasExplicitValue,
    disabled: Boolean(options.disabled),
    readonly: Boolean(options.readonly),
    required: Boolean(options.required),
    help: String(options.help || ""),
    className: String(options.className || ""),
    ariaLabel: String(options.ariaLabel || ""),
  };
}

function buildClassName(options) {
  return [
    "ui-checkbox",
    options.className,
  ].filter(Boolean).join(" ");
}

function resolveValue(options) {
  if (!options.hasExplicitValue) {
    return Boolean(options.checked);
  }
  return options.checked ? options.checkedValue : options.uncheckedValue;
}

function valueToChecked(value, options) {
  if (!options.hasExplicitValue) {
    return Boolean(value);
  }
  return isSameValue(value, options.checkedValue);
}

function isSameValue(left, right) {
  return String(left ?? "") === String(right ?? "");
}

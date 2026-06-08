import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createCheckbox } from "./ui.checkbox.js";

const DEFAULT_OPTIONS = {
  name: "",
  label: "",
  values: [],
  options: [],
  min: null,
  max: null,
  disabled: false,
  readonly: false,
  help: "",
  className: "",
  onChange: null,
};

export function createCheckboxGroup(container, options = {}) {
  if (!container || container.nodeType !== 1) {
    throw new Error("createCheckboxGroup(container, options) requires a host container.");
  }

  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let selectedValues = normalizeValues(currentOptions.values);
  const childInstances = [];
  let refs = {};
  let api = null;

  function render() {
    events.clear();
    childInstances.splice(0).forEach((instance) => instance.destroy?.());
    clearNode(container);

    const root = createElement("div", {
      className: buildClassName(currentOptions),
      attrs: {
        role: "group",
        "aria-label": currentOptions.label || currentOptions.name || "Checkbox group",
      },
    });
    const labelRow = createElement("div", { className: "ui-checkbox-group-label-row" });
    const label = createElement("div", {
      className: "ui-label ui-checkbox-group-label",
      text: currentOptions.label,
    });
    labelRow.appendChild(label);
    labelRow.hidden = !currentOptions.label;

    const optionsEl = createElement("div", { className: "ui-checkbox-group-options" });
    currentOptions.options.forEach((option, index) => {
      const host = createElement("div", { className: "ui-checkbox-group-option" });
      const checkbox = createCheckbox(host, {
        id: `${currentOptions.name || "checkbox-group"}-${toSafeIdPart(option.value)}-${index}`,
        name: currentOptions.name,
        label: option.label,
        checked: selectedValues.includes(option.value),
        disabled: currentOptions.disabled || option.disabled,
        readonly: currentOptions.readonly,
        help: option.help || "",
        onChange(payload) {
          setOptionSelected(option.value, payload.checked, { emit: true });
        },
      });
      childInstances.push(checkbox);
      optionsEl.appendChild(host);
    });

    const help = createElement("p", {
      className: "ui-checkbox-group-help",
      text: currentOptions.help,
    });
    help.hidden = !currentOptions.help;

    root.append(labelRow, optionsEl, help);
    container.appendChild(root);
    refs = { root, labelRow, label, options: optionsEl, help };
    if (api) {
      api.refs = refs;
    }
    syncState();
  }

  function setOptionSelected(value, checked, meta = {}) {
    const normalized = String(value);
    const set = new Set(selectedValues.map(String));
    if (checked) {
      set.add(normalized);
    } else {
      set.delete(normalized);
    }
    selectedValues = Array.from(set).filter((item) => currentOptions.options.some((option) => option.value === item));
    syncState();
    if (meta.emit) {
      emitChange();
    }
  }

  function syncState() {
    childInstances.forEach((instance, index) => {
      const option = currentOptions.options[index];
      instance.setChecked(selectedValues.includes(option?.value), { emit: false });
    });
    if (refs.root) {
      refs.root.dataset.count = String(selectedValues.length);
      refs.root.classList.toggle("is-disabled", currentOptions.disabled);
      refs.root.classList.toggle("is-readonly", currentOptions.readonly);
    }
  }

  function emitChange() {
    currentOptions.onChange?.(cloneValues(selectedValues), {
      name: currentOptions.name,
      checkboxGroup: api,
      validation: validateGroup(currentOptions, selectedValues),
    });
  }

  api = {
    refs,
    getValue() {
      return cloneValues(selectedValues);
    },
    setValue(values, meta = {}) {
      selectedValues = normalizeValues(values).filter((value) => currentOptions.options.some((option) => option.value === value));
      syncState();
      if (meta.emit) {
        emitChange();
      }
    },
    selectAll(meta = {}) {
      selectedValues = currentOptions.options.filter((option) => !option.disabled).map((option) => option.value);
      syncState();
      if (meta.emit) {
        emitChange();
      }
    },
    clear(meta = {}) {
      selectedValues = [];
      syncState();
      if (meta.emit) {
        emitChange();
      }
    },
    validate() {
      return validateGroup(currentOptions, selectedValues);
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
      if (Object.prototype.hasOwnProperty.call(nextOptions || {}, "values")) {
        selectedValues = normalizeValues(nextOptions.values);
      }
      selectedValues = selectedValues.filter((value) => currentOptions.options.some((option) => option.value === value));
      render();
    },
    getState() {
      return {
        ...currentOptions,
        values: cloneValues(selectedValues),
        validation: validateGroup(currentOptions, selectedValues),
      };
    },
    destroy() {
      events.clear();
      childInstances.splice(0).forEach((instance) => instance.destroy?.());
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
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    name: String(options.name || ""),
    label: String(options.label || ""),
    values: normalizeValues(options.values ?? options.value),
    options: normalizeOptionsList(options.options),
    min: normalizeNumberOrNull(options.min),
    max: normalizeNumberOrNull(options.max),
    disabled: Boolean(options.disabled),
    readonly: Boolean(options.readonly),
    help: String(options.help || ""),
    className: String(options.className || ""),
  };
}

function normalizeOptionsList(options) {
  return (Array.isArray(options) ? options : []).map((option) => {
    if (option == null) {
      return null;
    }
    if (typeof option === "string" || typeof option === "number") {
      const value = String(option);
      return { label: value, value, disabled: false, help: "" };
    }
    const label = String(option.label ?? option.value ?? "").trim();
    const value = String(option.value ?? option.label ?? "").trim();
    if (!label && !value) {
      return null;
    }
    return {
      label: label || value,
      value: value || label,
      disabled: Boolean(option.disabled),
      help: String(option.help || ""),
    };
  }).filter(Boolean);
}

function normalizeValues(values) {
  if (Array.isArray(values)) {
    return values.map((value) => String(value)).filter(Boolean);
  }
  if (values == null || values === "") {
    return [];
  }
  return String(values).split(",").map((value) => value.trim()).filter(Boolean);
}

function validateGroup(options, values) {
  const errors = [];
  const count = values.length;
  if (options.min !== null && count < options.min) {
    errors.push({ field_key: options.name, error: `Select at least ${options.min}` });
  }
  if (options.max !== null && count > options.max) {
    errors.push({ field_key: options.name, error: `Select no more than ${options.max}` });
  }
  return {
    status: errors.length === 0,
    errors,
  };
}

function normalizeNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildClassName(options) {
  return ["ui-checkbox-group", options.className].filter(Boolean).join(" ");
}

function cloneValues(values) {
  return values.slice();
}

function toSafeIdPart(value) {
  return String(value || "option").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "option";
}

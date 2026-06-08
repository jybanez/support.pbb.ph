import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  value: 0,
  min: null,
  max: null,
  step: 1,
  decimals: null,
  placeholder: "",
  name: "",
  id: "",
  required: false,
  disabled: false,
  readonly: false,
  ariaLabel: "Number input",
  decrementLabel: "Decrease value",
  incrementLabel: "Increase value",
  prefixText: "",
  suffixText: "",
  allowEmpty: false,
  onChange: null,
  onInput: null,
};

export function createNumberStepper(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error("createNumberStepper(container, options) requires a valid container element.");
  }

  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let currentValue = normalizeValue(currentOptions.value, currentOptions);
  let draftValue = formatValue(currentValue, currentOptions);

  const root = createElement("div", { className: "ui-number-stepper" });
  const decrementButton = createElement("button", {
    className: "ui-button ui-number-stepper-button ui-number-stepper-button-decrement",
    text: "−",
    attrs: {
      type: "button",
      "aria-label": currentOptions.decrementLabel,
    },
  });
  const valueWrap = createElement("div", { className: "ui-number-stepper-value-wrap" });
  const prefixEl = createElement("span", { className: "ui-number-stepper-prefix" });
  const input = createElement("input", {
    className: "ui-input ui-number-stepper-input",
    attrs: {
      type: "text",
      inputmode: resolveInputMode(currentOptions.step, currentOptions.decimals),
      role: "spinbutton",
      value: draftValue,
      ...(currentOptions.id ? { id: currentOptions.id } : {}),
      ...(currentOptions.name ? { name: currentOptions.name } : {}),
      ...(currentOptions.placeholder ? { placeholder: currentOptions.placeholder } : {}),
      ...(currentOptions.required ? { required: "required" } : {}),
      ...(currentOptions.ariaLabel ? { "aria-label": currentOptions.ariaLabel } : {}),
    },
  });
  const suffixEl = createElement("span", { className: "ui-number-stepper-suffix" });
  const incrementButton = createElement("button", {
    className: "ui-button ui-number-stepper-button ui-number-stepper-button-increment",
    text: "+",
    attrs: {
      type: "button",
      "aria-label": currentOptions.incrementLabel,
    },
  });

  valueWrap.append(prefixEl, input, suffixEl);
  root.append(decrementButton, valueWrap, incrementButton);
  container.appendChild(root);

  applyStaticOptions();
  syncState();

  events.on(decrementButton, "click", () => stepBy(-1));
  events.on(incrementButton, "click", () => stepBy(1));
  events.on(input, "input", () => {
    draftValue = input.value;
    currentOptions.onInput?.(draftValue, api);
  });
  events.on(input, "blur", () => {
    commitDraft();
  });
  events.on(input, "keydown", (event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepBy(1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      stepBy(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      draftValue = formatValue(currentValue, currentOptions);
      input.value = draftValue;
    }
  });

  function applyStaticOptions() {
    if (currentOptions.id) {
      input.id = currentOptions.id;
    } else {
      input.removeAttribute("id");
    }
    if (currentOptions.name) {
      input.name = currentOptions.name;
    } else {
      input.removeAttribute("name");
    }
    input.placeholder = currentOptions.placeholder || "";
    input.required = Boolean(currentOptions.required);
    if (currentOptions.ariaLabel) {
      input.setAttribute("aria-label", currentOptions.ariaLabel);
    } else {
      input.removeAttribute("aria-label");
    }
    decrementButton.setAttribute("aria-label", currentOptions.decrementLabel);
    incrementButton.setAttribute("aria-label", currentOptions.incrementLabel);
    input.inputMode = resolveInputMode(currentOptions.step, currentOptions.decimals);
  }

  function syncState() {
    root.classList.toggle("is-disabled", currentOptions.disabled);
    root.classList.toggle("is-readonly", currentOptions.readonly);
    root.classList.toggle("has-prefix", Boolean(currentOptions.prefixText));
    root.classList.toggle("has-suffix", Boolean(currentOptions.suffixText));
    input.disabled = Boolean(currentOptions.disabled);
    input.readOnly = Boolean(currentOptions.readonly);
    decrementButton.disabled = Boolean(currentOptions.disabled || currentOptions.readonly || !canStep(-1));
    incrementButton.disabled = Boolean(currentOptions.disabled || currentOptions.readonly || !canStep(1));
    prefixEl.hidden = !currentOptions.prefixText;
    suffixEl.hidden = !currentOptions.suffixText;
    prefixEl.textContent = currentOptions.prefixText || "";
    suffixEl.textContent = currentOptions.suffixText || "";
    input.value = draftValue;
    setSpinbuttonAttributes();
  }

  function setSpinbuttonAttributes() {
    if (currentOptions.min == null) {
      input.removeAttribute("aria-valuemin");
    } else {
      input.setAttribute("aria-valuemin", String(currentOptions.min));
    }
    if (currentOptions.max == null) {
      input.removeAttribute("aria-valuemax");
    } else {
      input.setAttribute("aria-valuemax", String(currentOptions.max));
    }
    if (currentValue == null && currentOptions.allowEmpty) {
      input.removeAttribute("aria-valuenow");
      input.removeAttribute("aria-valuetext");
      return;
    }
    if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
      input.setAttribute("aria-valuenow", String(currentValue));
      input.setAttribute("aria-valuetext", formatValue(currentValue, currentOptions));
    } else {
      input.removeAttribute("aria-valuenow");
      input.removeAttribute("aria-valuetext");
    }
  }

  function canStep(direction) {
    if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
      return currentOptions.allowEmpty ? true : true;
    }
    const next = clampValue(applyStep(currentValue, currentOptions.step * direction), currentOptions);
    return next !== currentValue;
  }

  function stepBy(direction) {
    if (currentOptions.disabled || currentOptions.readonly) {
      return;
    }
    const baseValue = typeof currentValue === "number" && Number.isFinite(currentValue)
      ? currentValue
      : currentOptions.min != null
        ? currentOptions.min
        : 0;
    setValueInternal(applyStep(baseValue, currentOptions.step * direction), { notify: true });
  }

  function commitDraft() {
    if (currentOptions.disabled || currentOptions.readonly) {
      draftValue = formatValue(currentValue, currentOptions);
      syncState();
      return;
    }
    const parsed = parseDraftValue(draftValue, currentOptions);
    if (parsed === null && currentOptions.allowEmpty) {
      const changed = currentValue !== null;
      currentValue = null;
      draftValue = "";
      syncState();
      if (changed) {
        currentOptions.onChange?.(currentValue, api);
      }
      return;
    }
    if (parsed == null) {
      draftValue = formatValue(currentValue, currentOptions);
      syncState();
      return;
    }
    setValueInternal(parsed, { notify: true });
  }

  function setValueInternal(nextValue, { notify = false } = {}) {
    const normalized = normalizeValue(nextValue, currentOptions);
    const changed = normalized !== currentValue;
    currentValue = normalized;
    draftValue = formatValue(currentValue, currentOptions);
    syncState();
    if (notify && changed) {
      currentOptions.onChange?.(currentValue, api);
    }
  }

  function getValue() {
    return currentValue;
  }

  function setValue(nextValue) {
    setValueInternal(nextValue, { notify: false });
  }

  function focus() {
    input.focus();
  }

  function update(nextOptions = {}) {
    const hasValue = Object.prototype.hasOwnProperty.call(nextOptions, "value");
    currentOptions = normalizeOptions({
      ...currentOptions,
      ...(nextOptions || {}),
    });
    if (hasValue) {
      currentValue = normalizeValue(nextOptions.value, currentOptions);
      draftValue = formatValue(currentValue, currentOptions);
    } else {
      currentValue = normalizeValue(currentValue, currentOptions);
      if (document.activeElement !== input) {
        draftValue = formatValue(currentValue, currentOptions);
      }
    }
    applyStaticOptions();
    syncState();
  }

  const api = {
    root,
    input,
    decrementButton,
    incrementButton,
    getValue,
    setValue,
    stepUp() {
      stepBy(1);
    },
    stepDown() {
      stepBy(-1);
    },
    focus,
    update,
    destroy() {
      events.clear();
      clearNode(container);
    },
  };

  return api;
}

function normalizeOptions(options = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.step = normalizeStep(next.step);
  next.min = normalizeNullableNumber(next.min);
  next.max = normalizeNullableNumber(next.max);
  if (next.min != null && next.max != null && next.max < next.min) {
    next.max = next.min;
  }
  next.decimals = next.decimals == null ? null : Math.max(0, Math.floor(Number(next.decimals) || 0));
  next.allowEmpty = Boolean(next.allowEmpty);
  next.required = Boolean(next.required);
  next.disabled = Boolean(next.disabled);
  next.readonly = Boolean(next.readonly);
  next.prefixText = String(next.prefixText || "");
  next.suffixText = String(next.suffixText || "");
  return next;
}

function normalizeNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStep(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function normalizeValue(value, options) {
  if (value == null || value === "") {
    return options.allowEmpty ? null : clampValue(0, options);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return options.allowEmpty ? null : clampValue(0, options);
  }
  return clampValue(number, options);
}

function clampValue(value, options) {
  if (!Number.isFinite(value)) {
    return options.allowEmpty ? null : 0;
  }
  let next = value;
  if (options.min != null) {
    next = Math.max(options.min, next);
  }
  if (options.max != null) {
    next = Math.min(options.max, next);
  }
  return roundToStepPrecision(next, options);
}

function roundToStepPrecision(value, options) {
  const decimals = options.decimals != null
    ? options.decimals
    : inferStepDecimals(options.step);
  if (decimals <= 0) {
    return Math.round(value);
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function inferStepDecimals(step) {
  const stringValue = String(step);
  const dotIndex = stringValue.indexOf(".");
  return dotIndex === -1 ? 0 : stringValue.length - dotIndex - 1;
}

function applyStep(value, delta) {
  return Number(value) + Number(delta);
}

function parseDraftValue(value, options) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return options.allowEmpty ? null : normalizeValue(0, options);
  }
  const sanitized = normalized.replace(/,/g, "");
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return clampValue(parsed, options);
}

function formatValue(value, options) {
  if (value == null) {
    return "";
  }
  if (options.decimals != null) {
    return Number(value).toFixed(options.decimals);
  }
  return String(value);
}

function resolveInputMode(step, decimals) {
  return (Number(step) % 1 !== 0 || (decimals != null && decimals > 0)) ? "decimal" : "numeric";
}

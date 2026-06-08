import { createElement, clearNode } from "./ui.dom.js";
import { createSelect as createHostedUiSelect } from "./ui.select.js";
import { createPasswordField } from "./ui.password.js?v=0.21.64";
import { createToggleButton } from "./ui.toggle.button.js";

const DEFAULT_OPTIONS = {
  className: "",
  showSelectionLabel: true,
  selectionLabelPlaceholder: "No selection",
  labelWidth: null,
  dense: false,
  showSectionDescriptions: true,
  showPropertyHelp: true,
  mixedLabel: "Mixed",
  readOnlyValueFallback: "—",
  onPropertyChange: null,
  onAction: null,
};

export function createPropertyEditor(container, data = {}, options = {}) {
  let currentData = normalizeData(data);
  let currentOptions = normalizeOptions(options);
  let currentErrors = {};
  let root = null;
  let toggleApis = [];
  let selectApis = [];
  let passwordApis = [];

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }

    destroyToggleApis();
    destroySelectApis();
    destroyPasswordApis();
    clearNode(container);

    root = createElement("div", {
      className: [
        "ui-property-editor",
        currentOptions.dense ? "is-dense" : "",
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
    });
    applyRootVars();

    if (currentOptions.showSelectionLabel) {
      root.appendChild(createSelectionRow());
    }

    currentData.sections.forEach((section) => {
      root.appendChild(createSectionNode(section));
    });

    container.appendChild(root);
  }

  function applyRootVars() {
    if (!root) {
      return;
    }
    if (currentOptions.labelWidth == null || currentOptions.labelWidth === "") {
      root.style.removeProperty("--ui-property-editor-label-width");
      return;
    }
    const labelWidth = typeof currentOptions.labelWidth === "number"
      ? `${currentOptions.labelWidth}px`
      : String(currentOptions.labelWidth);
    root.style.setProperty("--ui-property-editor-label-width", labelWidth);
  }

  function createSelectionRow() {
    const row = createElement("div", { className: "ui-property-editor-selection" });
    row.appendChild(createElement("div", {
      className: "ui-property-editor-selection-label",
      text: "Selection",
    }));
    row.appendChild(createElement("div", {
      className: "ui-property-editor-selection-value",
      text: currentData.selectionLabel || currentOptions.selectionLabelPlaceholder,
    }));
    return row;
  }

  function createSectionNode(section) {
    const node = createElement("section", {
      className: "ui-property-editor-section",
      dataset: { sectionId: section.id },
    });

    const header = createElement("div", { className: "ui-property-editor-section-header" });
    header.appendChild(createElement("div", {
      className: "ui-property-editor-section-title",
      text: section.title,
    }));
    if (currentOptions.showSectionDescriptions && section.description) {
      header.appendChild(createElement("div", {
        className: "ui-property-editor-section-description",
        text: section.description,
      }));
    }
    node.appendChild(header);

    const body = createElement("div", { className: "ui-property-editor-section-body" });
    section.properties.forEach((property) => {
      body.appendChild(createPropertyRow(section, property));
    });
    node.appendChild(body);
    return node;
  }

  function createPropertyRow(section, property) {
    if (property.kind === "divider") {
      return createElement("div", { className: "ui-property-editor-divider" });
    }

    const row = createElement("div", {
      className: [
        "ui-property-editor-row",
        property.readOnly ? "is-readonly" : "",
        property.mixed ? "is-mixed" : "",
        getPropertyError(property.id) ? "is-invalid" : "",
      ].filter(Boolean).join(" "),
      dataset: { propertyId: property.id, propertyKind: property.kind },
    });

    row.appendChild(createElement("label", {
      className: "ui-property-editor-label",
      text: property.label,
      attrs: { for: getEditorId(section.id, property.id) },
    }));

    const valueCell = createElement("div", { className: "ui-property-editor-value" });
    valueCell.appendChild(createEditorNode(section, property));

    if (property.mixed) {
      valueCell.appendChild(createElement("div", {
        className: "ui-property-editor-mixed",
        text: currentOptions.mixedLabel,
      }));
    }

    if (currentOptions.showPropertyHelp && property.help) {
      valueCell.appendChild(createElement("div", {
        className: "ui-property-editor-help",
        text: property.help,
      }));
    }

    const errorText = getPropertyError(property.id);
    if (errorText) {
      valueCell.appendChild(createElement("div", {
        className: "ui-property-editor-error",
        text: errorText,
      }));
    }

    row.appendChild(valueCell);
    row.appendChild(createActionCell(section, property));
    return row;
  }

  function createActionCell(section, property) {
    const cell = createElement("div", { className: "ui-property-editor-actions" });
    if (!Array.isArray(property.actions) || !property.actions.length) {
      return cell;
    }
    property.actions.forEach((action) => {
      const button = createElement("button", {
        className: ["ui-button", action.danger ? "ui-button-danger" : "ui-button-quiet"].join(" "),
        text: action.label,
        attrs: { type: "button" },
      });
      button.addEventListener("click", () => emitAction(section, property, action));
      cell.appendChild(button);
    });
    return cell;
  }

  function createEditorNode(section, property) {
    const editorId = getEditorId(section.id, property.id);
    switch (property.kind) {
      case "display":
        return createReadOnlyValue(property);
      case "text":
        return createTextInput(section, property, editorId, "text");
      case "password":
        return createPassword(section, property, editorId);
      case "textarea":
        return createTextarea(section, property, editorId);
      case "number":
        return createNumberInput(section, property, editorId);
      case "checkbox":
        return createCheckbox(section, property, editorId);
      case "toggle":
        return createToggle(section, property, editorId);
      case "ui.select":
        return createHostedSelect(section, property, editorId);
      case "select":
        return createSelect(section, property, editorId);
      case "color":
        return createColor(section, property, editorId);
      case "color-select":
        return createColorSelect(section, property, editorId);
      case "action":
        return createActionButton(section, property, editorId);
      default:
        return createReadOnlyValue(property);
    }
  }

  function createReadOnlyValue(property) {
    if (property.kind === "password") {
      return createElement("div", {
        className: "ui-property-editor-display",
        text: property.value == null || property.value === "" ? currentOptions.readOnlyValueFallback : "••••••••",
      });
    }
    const text = property.mixed
      ? currentOptions.mixedLabel
      : formatDisplayValue(property.value, currentOptions.readOnlyValueFallback);
    return createElement("div", {
      className: "ui-property-editor-display",
      text,
    });
  }

  function createTextInput(section, property, editorId, inputType) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const input = createElement("input", {
      className: "ui-input ui-property-editor-input",
      attrs: {
        id: editorId,
        type: inputType,
        placeholder: property.mixed ? currentOptions.mixedLabel : (property.placeholder || null),
        disabled: property.disabled ? "disabled" : null,
        "aria-invalid": getPropertyError(property.id) ? "true" : null,
      },
    });
    input.value = property.mixed ? "" : normalizeInputValue(property.value);
    input.addEventListener("input", () => {
      updatePropertyValue(section.id, property.id, input.value, { source: input, previousValue: property.value });
    });
    return input;
  }

  function createTextarea(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const input = createElement("textarea", {
      className: "ui-input ui-property-editor-input ui-property-editor-textarea",
      attrs: {
        id: editorId,
        placeholder: property.mixed ? currentOptions.mixedLabel : (property.placeholder || null),
        disabled: property.disabled ? "disabled" : null,
        rows: "3",
        "aria-invalid": getPropertyError(property.id) ? "true" : null,
      },
    });
    input.value = property.mixed ? "" : normalizeInputValue(property.value);
    input.addEventListener("input", () => {
      updatePropertyValue(section.id, property.id, input.value, { source: input, previousValue: property.value });
    });
    return input;
  }

  function createPassword(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const host = createElement("div", {
      className: "ui-property-editor-password-host",
    });
    const passwordApi = createPasswordField(host, {
      id: editorId,
      name: property.id,
      value: property.mixed ? "" : normalizeInputValue(property.value),
      placeholder: property.mixed ? currentOptions.mixedLabel : (property.placeholder || ""),
      autocomplete: property.autocomplete || "",
      disabled: property.disabled,
      readonly: property.readOnly,
      ariaLabel: property.ariaLabel || property.label || property.id,
      onChange(nextValue) {
        updatePropertyValue(section.id, property.id, nextValue, {
          source: passwordApi.input,
          previousValue: property.value,
          mixedCleared: property.mixed,
        });
      },
    });
    if (getPropertyError(property.id)) {
      passwordApi.input.setAttribute("aria-invalid", "true");
    }
    passwordApis.push(passwordApi);
    return host;
  }

  function createNumberInput(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const input = createElement("input", {
      className: "ui-input ui-property-editor-input",
      attrs: {
        id: editorId,
        type: "number",
        placeholder: property.mixed ? currentOptions.mixedLabel : (property.placeholder || null),
        disabled: property.disabled ? "disabled" : null,
        min: property.min ?? null,
        max: property.max ?? null,
        step: property.step ?? null,
        "aria-invalid": getPropertyError(property.id) ? "true" : null,
      },
    });
    input.value = property.mixed || property.value == null ? "" : String(property.value);
    input.addEventListener("input", () => {
      updatePropertyValue(section.id, property.id, input.value === "" ? "" : Number(input.value), { source: input, previousValue: property.value });
    });
    return input;
  }

  function createCheckbox(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue({ ...property, value: formatBoolean(property.value) });
    }
    const wrap = createElement("div", { className: "ui-property-editor-boolean" });
    const input = createElement("input", {
      className: "ui-property-editor-checkbox",
      attrs: {
        id: editorId,
        type: "checkbox",
        disabled: property.disabled ? "disabled" : null,
        "aria-invalid": getPropertyError(property.id) ? "true" : null,
      },
    });
    input.checked = Boolean(property.value);
    input.indeterminate = Boolean(property.mixed);
    input.addEventListener("change", () => {
      label.textContent = formatBoolean(input.checked);
      updatePropertyValue(section.id, property.id, Boolean(input.checked), { source: input, previousValue: property.value, mixedCleared: property.mixed });
    });
    wrap.appendChild(input);
    const label = createElement("span", {
      className: "ui-property-editor-boolean-label",
      text: property.mixed ? currentOptions.mixedLabel : formatBoolean(input.checked),
    });
    wrap.appendChild(label);
    return wrap;
  }

  function createToggle(section, property) {
    if (property.readOnly) {
      return createReadOnlyValue({ ...property, value: formatBoolean(property.value) });
    }
    const host = createElement("div", { className: "ui-property-editor-toggle-host" });
    const toggleApi = createToggleButton(host, {
      id: property.id,
      label: property.mixed ? currentOptions.mixedLabel : getToggleLabel(property, Boolean(property.value)),
      ariaLabel: property.label,
      pressed: Boolean(property.value),
      disabled: property.disabled,
      variant: "pill",
      quiet: !property.value,
      onChange(payload) {
        const nextPressed = Boolean(payload.pressed);
        payload.button?.update?.({
          pressed: nextPressed,
          label: getToggleLabel(property, nextPressed),
          quiet: !nextPressed,
        });
        updatePropertyValue(section.id, property.id, nextPressed, { source: host, previousValue: property.value, mixedCleared: property.mixed });
      },
    });
    toggleApis.push(toggleApi);
    return host;
  }

  function createSelect(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const select = createElement("select", {
      className: "ui-input ui-property-editor-select",
      attrs: {
        id: editorId,
        disabled: property.disabled ? "disabled" : null,
        "aria-invalid": getPropertyError(property.id) ? "true" : null,
      },
    });
    if (property.mixed) {
      const mixed = createElement("option", { text: currentOptions.mixedLabel, attrs: { value: "" }, dataset: { mixed: "true" } });
      select.appendChild(mixed);
      select.value = "";
    }
    property.options.forEach((option) => {
      const node = createElement("option", {
        text: option.label,
        attrs: { value: option.value },
      });
      select.appendChild(node);
    });
    if (!property.mixed && property.value != null) {
      select.value = String(property.value);
    }
    select.addEventListener("change", () => {
      const mixedOption = select.querySelector('[data-mixed="true"]');
      if (mixedOption) {
        mixedOption.remove();
      }
      updatePropertyValue(section.id, property.id, select.value, { source: select, previousValue: property.value, mixedCleared: property.mixed });
    });
    return select;
  }

  function createHostedSelect(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const selectItems = Array.isArray(property.items) && property.items.length
      ? property.items
      : (Array.isArray(property.options) ? property.options : []);
    const host = createElement("div", {
      className: "ui-property-editor-select-host",
      attrs: { id: editorId },
    });
    const selectApi = createHostedUiSelect(host, selectItems, {
      ariaLabel: property.ariaLabel || property.label || property.id,
      placeholder: property.mixed ? currentOptions.mixedLabel : (property.placeholder || "Select..."),
      emptyText: property.emptyText || "No options found.",
      searchable: property.searchable !== false,
      multiple: Boolean(property.multiple),
      closeOnSelect: property.closeOnSelect !== false,
      selectOnTab: Boolean(property.selectOnTab),
      clearable: property.clearable !== false,
      selected: property.mixed ? [] : property.value,
      onChange(nextValue) {
        updatePropertyValue(section.id, property.id, nextValue, { source: host, previousValue: property.value, mixedCleared: property.mixed });
      },
    });
    host.__uiSelectInstance = selectApi;
    selectApis.push(selectApi);
    return host;
  }

  function createColor(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const wrap = createElement("div", { className: "ui-property-editor-color" });
    const input = createElement("input", {
      className: "ui-property-editor-color-input",
      attrs: {
        id: editorId,
        type: "color",
        disabled: property.disabled ? "disabled" : null,
        value: normalizeColorValue(property.value),
        "aria-invalid": getPropertyError(property.id) ? "true" : null,
      },
    });
    const value = createElement("span", {
      className: "ui-property-editor-color-value",
      text: property.mixed ? currentOptions.mixedLabel : normalizeColorValue(property.value),
    });
    input.addEventListener("input", () => {
      value.textContent = input.value;
      updatePropertyValue(section.id, property.id, input.value, { source: input, previousValue: property.value, mixedCleared: property.mixed });
    });
    wrap.appendChild(input);
    wrap.appendChild(value);
    return wrap;
  }

  function createColorSelect(section, property, editorId) {
    if (property.readOnly) {
      return createReadOnlyValue(property);
    }
    const wrap = createElement("div", { className: "ui-property-editor-color-select" });
    const swatch = createElement("span", { className: "ui-property-editor-color-swatch" });
    const select = createSelect(section, property, editorId);
    const currentValue = property.mixed ? "" : String(property.value || "");
    applySwatchColor(swatch, currentValue);
    select.addEventListener("change", () => applySwatchColor(swatch, select.value));
    wrap.appendChild(swatch);
    wrap.appendChild(select);
    return wrap;
  }

  function createActionButton(section, property, editorId) {
    const button = createElement("button", {
      className: "ui-button ui-button-primary ui-property-editor-action",
      text: property.value == null || property.value === "" ? property.label : String(property.value),
      attrs: {
        id: editorId,
        type: "button",
        disabled: property.disabled ? "disabled" : null,
      },
    });
    button.addEventListener("click", () => {
      emitAction(section, property, property.actions?.[0] || { id: property.id, label: button.textContent || property.label });
    });
    return button;
  }

  function findPropertyRow(propertyId) {
    if (!root) {
      return null;
    }
    const rows = root.querySelectorAll(".ui-property-editor-row");
    for (const row of rows) {
      if (row?.dataset?.propertyId === propertyId) {
        return row;
      }
    }
    return null;
  }

  function updatePropertyRowUi(property) {
    const row = findPropertyRow(property.id);
    if (!row) {
      return;
    }
    row.classList.toggle("is-mixed", Boolean(property.mixed));
    row.classList.toggle("is-invalid", Boolean(getPropertyError(property.id)));

    const mixedNode = row.querySelector(".ui-property-editor-mixed");
    if (property.mixed) {
      if (!mixedNode) {
        const valueCell = row.querySelector(".ui-property-editor-value");
        if (valueCell) {
          valueCell.appendChild(createElement("div", {
            className: "ui-property-editor-mixed",
            text: currentOptions.mixedLabel,
          }));
        }
      }
    } else if (mixedNode) {
      mixedNode.remove();
    }

    const errorText = getPropertyError(property.id);
    const errorNode = row.querySelector(".ui-property-editor-error");
    if (errorText) {
      if (errorNode) {
        errorNode.textContent = errorText;
      } else {
        const valueCell = row.querySelector(".ui-property-editor-value");
        if (valueCell) {
          valueCell.appendChild(createElement("div", {
            className: "ui-property-editor-error",
            text: errorText,
          }));
        }
      }
    } else if (errorNode) {
      errorNode.remove();
    }

    if (!errorText) {
      row.querySelectorAll("[aria-invalid=\"true\"]").forEach((node) => node.removeAttribute("aria-invalid"));
    }

    if (!property.mixed) {
      row.querySelectorAll(".ui-property-editor-input, .ui-property-editor-textarea").forEach((input) => {
        if (property.placeholder) {
          input.setAttribute("placeholder", property.placeholder);
        } else {
          input.removeAttribute("placeholder");
        }
      });
    }
  }

  function updatePropertyValue(sectionId, propertyId, value, meta = {}) {
    const property = findProperty(sectionId, propertyId);
    if (!property) {
      return;
    }
    const previousValue = property.value;
    property.value = value;
    property.mixed = false;
    delete currentErrors[propertyId];
    currentOptions.onPropertyChange?.({
      sectionId,
      propertyId,
      kind: property.kind,
      value,
    }, {
      source: meta.source || null,
      previousValue,
      mixedCleared: Boolean(meta.mixedCleared),
    });
    updatePropertyRowUi(property);
  }

  function emitAction(section, property, action) {
    currentOptions.onAction?.(cloneProperty(property), action ? { ...action } : null, {
      sectionId: section.id,
      source: property.id,
    });
  }

  function findProperty(sectionId, propertyId) {
    const section = currentData.sections.find((item) => item.id === sectionId);
    return section?.properties?.find((item) => item.id === propertyId) || null;
  }

  function getPropertyError(propertyId) {
    return currentErrors[propertyId] || "";
  }

  function update(nextData = {}, nextOptions = {}) {
    if (Object.prototype.hasOwnProperty.call(nextData || {}, "selectionLabel")) {
      currentData.selectionLabel = nextData.selectionLabel == null ? "" : String(nextData.selectionLabel);
    }
    if (Object.prototype.hasOwnProperty.call(nextData || {}, "sections")) {
      currentData.sections = normalizeSections(nextData.sections || []);
      currentErrors = filterErrorsForSections(currentErrors, currentData.sections);
    }
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function setSections(sections = []) {
    currentData.sections = normalizeSections(sections);
    currentErrors = filterErrorsForSections(currentErrors, currentData.sections);
    render();
  }

  function setSelectionLabel(label) {
    currentData.selectionLabel = label == null ? "" : String(label);
    render();
  }

  function setErrors(errors = {}) {
    currentErrors = normalizeErrors(errors);
    render();
  }

  function clearErrors() {
    currentErrors = {};
    render();
  }

  function getState() {
    return {
      selectionLabel: currentData.selectionLabel,
      sections: currentData.sections.map(cloneSection),
      options: { ...currentOptions },
      errors: { ...currentErrors },
    };
  }

  function destroy() {
    destroyToggleApis();
    destroySelectApis();
    destroyPasswordApis();
    clearNode(container);
    root = null;
  }

  function destroyToggleApis() {
    toggleApis.forEach((api) => api?.destroy?.());
    toggleApis = [];
  }

  function destroySelectApis() {
    selectApis.forEach((api) => api?.destroy?.());
    selectApis = [];
  }

  function destroyPasswordApis() {
    passwordApis.forEach((api) => api?.destroy?.());
    passwordApis = [];
  }

  render();
  return {
    update,
    setSections,
    setSelectionLabel,
    getState,
    setErrors,
    clearErrors,
    destroy,
  };
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    className: options?.className == null ? DEFAULT_OPTIONS.className : String(options.className),
    showSelectionLabel: options?.showSelectionLabel == null ? DEFAULT_OPTIONS.showSelectionLabel : Boolean(options.showSelectionLabel),
    selectionLabelPlaceholder: options?.selectionLabelPlaceholder == null ? DEFAULT_OPTIONS.selectionLabelPlaceholder : String(options.selectionLabelPlaceholder),
    dense: options?.dense == null ? DEFAULT_OPTIONS.dense : Boolean(options.dense),
    showSectionDescriptions: options?.showSectionDescriptions == null ? DEFAULT_OPTIONS.showSectionDescriptions : Boolean(options.showSectionDescriptions),
    showPropertyHelp: options?.showPropertyHelp == null ? DEFAULT_OPTIONS.showPropertyHelp : Boolean(options.showPropertyHelp),
    mixedLabel: options?.mixedLabel == null ? DEFAULT_OPTIONS.mixedLabel : String(options.mixedLabel),
    readOnlyValueFallback: options?.readOnlyValueFallback == null ? DEFAULT_OPTIONS.readOnlyValueFallback : String(options.readOnlyValueFallback),
    labelWidth: options?.labelWidth ?? DEFAULT_OPTIONS.labelWidth,
  };
}

function normalizeData(data = {}) {
  return {
    selectionLabel: data?.selectionLabel == null ? "" : String(data.selectionLabel),
    sections: normalizeSections(data?.sections || []),
  };
}

function normalizeSections(sections = []) {
  return Array.isArray(sections) ? sections.map((section, index) => ({
    id: section?.id == null ? `section-${index + 1}` : String(section.id),
    title: section?.title == null ? `Section ${index + 1}` : String(section.title),
    description: section?.description == null ? "" : String(section.description),
    properties: normalizeProperties(section?.properties || []),
  })) : [];
}

function normalizeProperties(properties = []) {
  return Array.isArray(properties) ? properties.map((property, index) => ({
    id: property?.id == null ? `property-${index + 1}` : String(property.id),
    label: property?.label == null ? "" : String(property.label),
    kind: normalizePropertyKind(property?.kind),
    value: property?.value,
    placeholder: property?.placeholder == null ? "" : String(property.placeholder),
    help: property?.help == null ? "" : String(property.help),
    autocomplete: property?.autocomplete == null ? "" : String(property.autocomplete),
    readOnly: Boolean(property?.readOnly),
    disabled: Boolean(property?.disabled),
    mixed: Boolean(property?.mixed),
    required: Boolean(property?.required),
    options: normalizeSelectOptions(property?.options || []),
    items: normalizeSelectOptions(property?.items || []),
    ariaLabel: property?.ariaLabel == null ? "" : String(property.ariaLabel),
    multiple: Boolean(property?.multiple),
    searchable: property?.searchable,
    closeOnSelect: property?.closeOnSelect,
    selectOnTab: property?.selectOnTab,
    clearable: property?.clearable,
    emptyText: property?.emptyText == null ? "" : String(property.emptyText),
    min: property?.min,
    max: property?.max,
    step: property?.step,
    actions: normalizeActions(property?.actions || []),
    errorText: property?.errorText == null ? "" : String(property.errorText),
    onLabel: property?.onLabel == null ? "" : String(property.onLabel),
    offLabel: property?.offLabel == null ? "" : String(property.offLabel),
  })) : [];
}

function normalizeSelectOptions(options = []) {
  return Array.isArray(options) ? options.map((option) => ({
    value: option?.value == null ? "" : option.value,
    label: option?.label == null ? String(option?.value ?? "") : String(option.label),
  })) : [];
}

function normalizeActions(actions = []) {
  return Array.isArray(actions) ? actions.map((action, index) => ({
    id: action?.id == null ? `action-${index + 1}` : String(action.id),
    label: action?.label == null ? `Action ${index + 1}` : String(action.label),
    danger: Boolean(action?.danger),
  })) : [];
}

function normalizeErrors(errors = {}) {
  const output = {};
  if (!errors || typeof errors !== "object") {
    return output;
  }
  Object.keys(errors).forEach((key) => {
    if (errors[key] != null && errors[key] !== "") {
      output[String(key)] = String(errors[key]);
    }
  });
  return output;
}

function filterErrorsForSections(errors, sections) {
  const allowedIds = new Set();
  sections.forEach((section) => section.properties.forEach((property) => allowedIds.add(property.id)));
  return Object.fromEntries(Object.entries(errors || {}).filter(([key]) => allowedIds.has(key)));
}

function normalizePropertyKind(kind) {
  const candidate = String(kind || "display").trim().toLowerCase();
  return ["display", "text", "password", "textarea", "number", "checkbox", "toggle", "select", "ui.select", "color", "color-select", "action", "divider"].includes(candidate)
    ? candidate
    : "display";
}

function normalizeInputValue(value) {
  return value == null ? "" : String(value);
}

function normalizeColorValue(value) {
  const candidate = String(value || "#7198e5").trim();
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : "#7198e5";
}

function applySwatchColor(node, value) {
  if (!node) {
    return;
  }
  node.style.background = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "transparent";
}

function formatDisplayValue(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return formatBoolean(value);
  }
  return String(value);
}

function formatBoolean(value) {
  return value ? "Yes" : "No";
}

function getToggleLabel(property, pressed) {
  if (pressed) {
    return property?.onLabel || "On";
  }
  return property?.offLabel || "Off";
}

function getEditorId(sectionId, propertyId) {
  return `ui-property-editor-${sectionId}-${propertyId}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

function cloneSection(section) {
  return {
    ...section,
    properties: Array.isArray(section.properties) ? section.properties.map(cloneProperty) : [],
  };
}

function cloneProperty(property) {
  return {
    ...property,
    options: Array.isArray(property.options) ? property.options.map((option) => ({ ...option })) : [],
    items: Array.isArray(property.items) ? property.items.map((item) => ({ ...item })) : [],
    actions: Array.isArray(property.actions) ? property.actions.map((action) => ({ ...action })) : [],
  };
}

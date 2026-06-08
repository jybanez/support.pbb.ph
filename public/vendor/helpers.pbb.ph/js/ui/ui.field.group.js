import { createCheckbox } from "./ui.checkbox.js";
import { createCheckboxGroup } from "./ui.checkbox.group.js";
import { createCombobox } from "./ui.combobox.js";
import { fieldGroupPresets } from "./ui.field.group.presets.js";
import { createIcon } from "./ui.icons.js";
import { createNumberStepper } from "./ui.number.stepper.js";

const DEFAULT_OPTIONS = {
  name: "",
  label: "",
  value: null,
  repeatable: false,
  required: false,
  chrome: true,
  autoValidate: true,
  fields: [],
  validations: [],
  addLabel: "",
  removeLabel: "Remove",
  emptyItem: null,
  onChange: null,
};

export function createFieldGroup(container, options = {}) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("createFieldGroup(container, options) requires a host container.");
  }

  let currentOptions = normalizeOptions(options);
  let value = normalizeValue(currentOptions.value, currentOptions);
  let renderedValidation = { status: true, errors: [], warnings: [] };
  const listeners = [];
  const expandedBreakdowns = new Set();
  const collapsedBreakdowns = new Set();

  const refs = {
    root: document.createElement("div"),
    labelRow: document.createElement("div"),
    label: document.createElement("div"),
    required: document.createElement("span"),
    body: document.createElement("div"),
  };

  refs.root.className = "ui-field-group";
  refs.labelRow.className = "ui-field-group-label-row";
  refs.label.className = "ui-label ui-field-group-label";
  refs.required.className = "ui-field-group-required";
  refs.required.textContent = "Required";
  refs.body.className = "ui-field-group-body";
  refs.labelRow.append(refs.label, refs.required);
  refs.root.append(refs.labelRow, refs.body);
  container.appendChild(refs.root);

  render();

  return {
    root: refs.root,
    getValue() {
      return cloneValue(value);
    },
    setValue(nextValue, meta = {}) {
      value = normalizeValue(nextValue, currentOptions);
      render();
      if (meta.emit !== false) {
        emitChange();
      }
    },
    update(nextOptions = {}) {
      const mergedOptions = { ...currentOptions, ...(nextOptions || {}) };
      const shouldRefreshFields = ["fields", "preset", "field_preset", "config", "field_config", "config_json", "configJson"].some((key) =>
        Object.prototype.hasOwnProperty.call(nextOptions || {}, key)
      );
      if (shouldRefreshFields) {
        delete mergedOptions.rawFields;
        if (!Object.prototype.hasOwnProperty.call(nextOptions || {}, "fields")) {
          delete mergedOptions.fields;
        }
      }
      currentOptions = normalizeOptions(mergedOptions);
      value = normalizeValue(
        Object.prototype.hasOwnProperty.call(nextOptions || {}, "value") ? nextOptions.value : value,
        currentOptions
      );
      render();
    },
    validate() {
      return getCurrentValidation();
    },
    destroy() {
      clearListeners();
      refs.root.remove();
    },
  };

  function render() {
    clearListeners();
    renderedValidation = getCurrentValidation();
    refs.root.className = [
      "ui-field-group",
      currentOptions.chrome ? "" : "is-chrome-less",
    ].filter(Boolean).join(" ");
    refs.root.dataset.repeatable = currentOptions.repeatable ? "true" : "false";
    refs.root.dataset.chrome = currentOptions.chrome ? "true" : "false";
    refs.label.textContent = currentOptions.label || currentOptions.name || "Group";
    refs.labelRow.hidden = !currentOptions.chrome || (!refs.label.textContent && !currentOptions.required);
    refs.required.hidden = !currentOptions.required;
    clearNode(refs.body);

    const items = currentOptions.repeatable ? value : [value && typeof value === "object" ? value : {}];
    const renderItems = currentOptions.repeatable && !items.length ? [createEmptyItem(currentOptions)] : items;

    renderItems.forEach((item, index) => {
      refs.body.appendChild(renderItem(item, index, renderItems.length));
    });

    if (currentOptions.repeatable) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "ui-field-group-add";
      add.textContent = currentOptions.addLabel || `Add ${currentOptions.label || "Entry"}`;
      on(add, "click", () => {
        value = [...safeArray(value), createEmptyItem(currentOptions)];
        render();
        emitChange();
      });
      refs.body.appendChild(add);
    }
  }

  function renderItem(item, index, itemCount) {
    const itemEl = document.createElement("div");
    itemEl.className = "ui-field-group-item";

    if (currentOptions.repeatable) {
      const header = document.createElement("div");
      header.className = "ui-field-group-item-header";

      const title = document.createElement("span");
      title.className = "ui-field-group-item-title";
      title.textContent = `#${index + 1}`;

      const itemIssues = getItemIssues(index);
      const warning = document.createElement("span");
      const itemErrorCount = itemIssues.filter((issue) => issue.severity === "error").length;
      const itemWarningCount = itemIssues.filter((issue) => issue.severity !== "error").length;
      warning.className = [
        "ui-field-group-item-warning",
        itemErrorCount ? "is-error" : "",
      ].filter(Boolean).join(" ");
      warning.hidden = itemIssues.length === 0;
      warning.textContent = itemErrorCount
        ? `${itemErrorCount} ${itemErrorCount === 1 ? "error" : "errors"}`
        : `${itemWarningCount} ${itemWarningCount === 1 ? "warning" : "warnings"}`;
      warning.title = itemIssues.map((item) => item.message || item.warning || item.error).filter(Boolean).join("\n");

      header.append(title, warning);
      if (index > 0) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ui-field-group-remove";
        remove.setAttribute("aria-label", `${currentOptions.removeLabel} #${index + 1}`);
        remove.title = `${currentOptions.removeLabel} #${index + 1}`;
        remove.appendChild(createIcon("actions.delete", { size: 16 }));
        on(remove, "click", () => {
          value = safeArray(value).filter((_, itemIndex) => itemIndex !== index);
          render();
          emitChange();
        });
        header.appendChild(remove);
      }
      itemEl.appendChild(header);
    }

    const rows = document.createElement("div");
    rows.className = "ui-field-group-rows";
    currentOptions.fieldRows.forEach((fieldRow) => {
      const renderRow = safeArray(fieldRow).filter((field) => !field || isFieldVisibleForItem(field, item));
      if (!renderRow.some((field) => field && getFieldKey(field))) {
        return;
      }
      const row = document.createElement("div");
      row.className = "ui-field-group-row";
      row.style.setProperty("--ui-field-group-columns", String(Math.max(renderRow.length, 1)));
      renderRow.forEach((field) => {
        const childKey = getFieldKey(field);
        if (!childKey) {
          row.appendChild(renderFieldPlaceholder());
          return;
        }
        row.appendChild(renderChildField(field, item, index));
        const breakdown = normalizeBreakdown(field);
        const breakdownKey = `${index}:${childKey}`;
        if (breakdown && isBreakdownOpen(breakdownKey, breakdown)) {
          row.appendChild(renderBreakdown(field, item, index, breakdown));
        }
      });
      if (row.childElementCount) {
        rows.appendChild(row);
      }
    });
    itemEl.appendChild(rows);
    return itemEl;
  }

  function isBreakdownOpen(key, breakdown) {
    if (!breakdown) {
      return false;
    }
    if (expandedBreakdowns.has(key)) {
      return true;
    }
    if (collapsedBreakdowns.has(key)) {
      return false;
    }
    return Boolean(breakdown.defaultOpen);
  }

  function renderChildField(field, item, index) {
    const childKey = getFieldKey(field);
    const type = getFieldType(field);
    const breakdown = normalizeBreakdown(field);
    const breakdownKey = `${index}:${childKey}`;
    const breakdownOpen = isBreakdownOpen(breakdownKey, breakdown);
    const issueKeys = breakdown ? [childKey, ...getBreakdownFieldKeys(breakdown)] : [childKey];
    const fieldIssues = getFieldIssues(index, issueKeys);
    const hasErrors = fieldIssues.some((issue) => issue.severity === "error");
    const row = document.createElement("div");
    row.className = [
      "ui-field ui-field-group-child",
      fieldIssues.length ? "has-warning" : "",
      hasErrors ? "has-error" : "",
    ].filter(Boolean).join(" ");
    row.dataset.fieldKey = childKey;

    const label = document.createElement("label");
    label.className = type === "checkbox" ? "ui-field-group-checkbox" : "ui-label";
    label.textContent = getFieldLabel(field, childKey);

    const warningBadge = renderIssueBadge(fieldIssues);

    let labelNode = label;
    if (breakdown) {
      labelNode = document.createElement("div");
      labelNode.className = "ui-field-group-child-label-row";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ui-field-group-breakdown-toggle";
      toggle.setAttribute("aria-expanded", breakdownOpen ? "true" : "false");
      toggle.setAttribute("aria-label", `${breakdownOpen ? "Hide" : "Show"} ${breakdown.label}`);
      toggle.title = `${breakdownOpen ? "Hide" : "Show"} ${breakdown.label}`;
      toggle.appendChild(createIcon(breakdownOpen ? "navigation.chevron-up" : "navigation.chevron-down", { size: 14 }));
      on(toggle, "click", () => {
        if (isBreakdownOpen(breakdownKey, breakdown)) {
          expandedBreakdowns.delete(breakdownKey);
          collapsedBreakdowns.add(breakdownKey);
        } else {
          collapsedBreakdowns.delete(breakdownKey);
          expandedBreakdowns.add(breakdownKey);
        }
        render();
      });
      const controls = document.createElement("span");
      controls.className = "ui-field-group-child-label-controls";
      if (warningBadge) {
        controls.appendChild(warningBadge);
      }
      controls.appendChild(toggle);
      labelNode.append(label, controls);
    } else if (warningBadge) {
      label.appendChild(warningBadge);
    }

    const control = createControl(field, item?.[childKey] ?? field?.default_value ?? "");
    if (!control) {
      return row;
    }

    if (type === "checkbox" || type === "checkbox-group") {
      row.appendChild(control);
    } else {
      row.append(labelNode, control);
    }

    const updateValue = () => {
      const previousItem = currentOptions.repeatable
        ? { ...(safeArray(value)[index] || {}) }
        : { ...(value && typeof value === "object" ? value : {}) };
      const nextItems = currentOptions.repeatable
        ? safeArray(value).map((sourceItem) => ({ ...(sourceItem || {}) }))
        : [{ ...(value && typeof value === "object" ? value : {}) }];
      if (!nextItems[index]) {
        nextItems[index] = {};
      }
      nextItems[index][childKey] = getControlValue(control, field);
      const shouldRender = applyComputedValues(nextItems[index], currentOptions.fields, childKey);
      const shouldRefreshVisibility = visibilitySignature(previousItem, currentOptions.fieldRows) !== visibilitySignature(nextItems[index], currentOptions.fieldRows);
      value = currentOptions.repeatable ? nextItems : nextItems[0];
      const nextValidation = getCurrentValidation();
      const shouldRefreshValidationUi = currentOptions.autoValidate && validationIssueSignature(renderedValidation) !== validationIssueSignature(nextValidation);
      emitChange(nextValidation);
      if (shouldRender || shouldRefreshVisibility || shouldRefreshValidationUi) {
        if (shouldRender || shouldRefreshVisibility) {
          renderedValidation = nextValidation;
          render();
        } else {
          updateValidationUi(nextValidation);
        }
      }
    };

    on(control, "change", updateValue);
    if (!["select", "multiselect", "checkbox", "number-stepper", "number_stepper"].includes(type)) {
      on(control, "input", updateValue);
    }

    return row;
  }

  function renderFieldPlaceholder() {
    const placeholder = document.createElement("div");
    placeholder.className = "ui-field-group-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  function renderBreakdown(field, item, index, breakdown) {
    const wrap = document.createElement("div");
    wrap.className = "ui-field-group-breakdown";
    wrap.dataset.breakdownFor = getFieldKey(field);
    wrap.style.setProperty("--ui-field-group-column-span", String(Math.max(Number(field?.breakdown?.columns || 0), 1)));

    const title = document.createElement("div");
    title.className = "ui-field-group-breakdown-title";
    title.textContent = breakdown.label;
    wrap.appendChild(title);

    const validationLines = getBreakdownValidationLines(index, item, breakdown);
    if (validationLines.length) {
      const warningList = document.createElement("div");
      warningList.className = "ui-field-group-breakdown-warnings";
      validationLines.forEach((warning) => {
        const line = document.createElement("div");
        line.className = [
          "ui-field-group-breakdown-warning",
          warning.invalid ? "is-invalid" : "is-valid",
        ].filter(Boolean).join(" ");
        line.textContent = warning.message || "Check this breakdown.";
        warningList.appendChild(line);
      });
      wrap.appendChild(warningList);
    }

    normalizeChildFieldRows({ fields: breakdown.fields }).forEach((fieldRow) => {
      const renderRow = safeArray(fieldRow).filter((field) => !field || isFieldVisibleForItem(field, item));
      if (!renderRow.some((field) => field && getFieldKey(field))) {
        return;
      }
      const row = document.createElement("div");
      row.className = "ui-field-group-breakdown-row";
      row.style.setProperty("--ui-field-group-columns", String(Math.max(renderRow.length, 1)));
      renderRow.forEach((child) => {
        const key = getFieldKey(child);
        if (key) {
          row.appendChild(renderChildField(child, item, index));
        } else {
          row.appendChild(renderFieldPlaceholder());
        }
      });
      if (row.childElementCount) {
        wrap.appendChild(row);
      }
    });

    return wrap;
  }

  function createControl(field, rawValue) {
    const type = getFieldType(field);
    if (type === "notice" || type === "message") {
      const notice = document.createElement("div");
      notice.className = [
        "ui-field-group-notice",
        `is-${String(field?.tone || field?.severity || "info").toLowerCase()}`,
      ].join(" ");
      notice.textContent = String(field?.message ?? field?.text ?? field?.help_text ?? field?.help ?? "");
      notice.setAttribute("role", String(field?.role || "note"));
      return notice;
    }

    if (type === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.className = "ui-input";
      textarea.value = rawValue == null ? "" : String(rawValue);
      applyCommonAttrs(textarea, field);
      return textarea;
    }

    if (type === "select") {
      const select = document.createElement("select");
      select.className = "ui-input";
      applyCommonAttrs(select, field);
      if (field?.placeholder !== false) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = String(field?.placeholder || "Select");
        select.appendChild(placeholder);
      }
      normalizeOptionsList(field?.options).forEach((option) => {
        const optionEl = document.createElement("option");
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        select.appendChild(optionEl);
      });
      select.value = rawValue == null ? "" : String(rawValue);
      return select;
    }

    if (type === "multiselect") {
      const wrap = document.createElement("div");
      wrap.className = "ui-field-group-multiselect";
      const selected = new Set(
        (Array.isArray(rawValue) ? rawValue : String(rawValue || "").split(","))
          .map((item) => String(item).trim())
          .filter(Boolean)
      );
      normalizeOptionsList(field?.options).forEach((option) => {
        const optionLabel = document.createElement("label");
        optionLabel.className = "ui-field-group-multiselect-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = option.value;
        checkbox.checked = selected.has(option.value);
        const text = document.createElement("span");
        text.textContent = option.label;
        optionLabel.append(checkbox, text);
        wrap.appendChild(optionLabel);
      });
      return wrap;
    }

    if (type === "checkbox-group") {
      const host = document.createElement("div");
      host.className = "ui-field-group-checkbox-group-host";
      const checkboxGroup = createCheckboxGroup(host, {
        name: getFieldKey(field),
        label: getFieldLabel(field, getFieldKey(field)),
        values: rawValue,
        options: field?.options,
        min: field?.min,
        max: field?.max,
        disabled: Boolean(field?.disabled),
        readonly: Boolean(field?.readonly),
        help: field?.help || "",
      });
      host.__uiCheckboxGroupInstance = checkboxGroup;
      return host;
    }

    if (type === "combobox" || type === "suggest" || type === "local-history") {
      const host = document.createElement("div");
      host.className = "ui-field-group-combobox-host";
      const combobox = createCombobox(host, {
        name: getFieldKey(field),
        id: field?.id || "",
        value: rawValue,
        placeholder: field?.placeholder || "",
        required: isRequiredField(field),
        disabled: Boolean(field?.disabled),
        readonly: Boolean(field?.readonly),
        ariaLabel: getFieldLabel(field, getFieldKey(field)),
        suggestions: field?.suggestions || field?.options || [],
        storageKey: field?.storageKey || field?.historyStorageKey || field?.history_storage_key || "",
        maxSuggestions: field?.maxSuggestions ?? field?.max_suggestions ?? 20,
        minChars: field?.minChars ?? field?.min_chars ?? 0,
        noResultsText: field?.noResultsText || field?.no_results_text || "No saved entries",
        onInput() {
          host.dispatchEvent(new Event("input", { bubbles: true }));
        },
        onChange() {
          host.dispatchEvent(new Event("change", { bubbles: true }));
        },
      });
      host.__uiComboboxInstance = combobox;
      return host;
    }

    if (type === "number-stepper" || type === "number_stepper") {
      const host = document.createElement("div");
      host.className = "ui-field-group-number-stepper-host";
      const numberStepper = createNumberStepper(host, {
        name: getFieldKey(field),
        value: rawValue,
        min: field?.min ?? 0,
        max: field?.max,
        step: field?.step ?? 1,
        decimals: field?.decimals ?? 0,
        required: isRequiredField(field),
        disabled: Boolean(field?.disabled),
        readonly: Boolean(field?.readonly),
        placeholder: field?.placeholder || "",
        ariaLabel: getFieldLabel(field, getFieldKey(field)),
        allowEmpty: field?.allowEmpty ?? !isRequiredField(field),
        onInput() {
          host.dispatchEvent(new Event("input", { bubbles: true }));
        },
        onChange() {
          host.dispatchEvent(new Event("change", { bubbles: true }));
        },
      });
      host.__uiNumberStepperInstance = numberStepper;
      return host;
    }

    const input = document.createElement("input");
    input.className = "ui-input";
    if (type === "checkbox") {
      const host = document.createElement("div");
      host.className = "ui-field-group-checkbox-host";
      const checkbox = createCheckbox(host, {
        name: getFieldKey(field),
        label: getFieldLabel(field, getFieldKey(field)),
        checked: Boolean(rawValue),
        value: rawValue,
        ...(Object.prototype.hasOwnProperty.call(field, "checkedValue") ? { checkedValue: field.checkedValue } : {}),
        ...(Object.prototype.hasOwnProperty.call(field, "uncheckedValue") ? { uncheckedValue: field.uncheckedValue } : {}),
        required: isRequiredField(field),
        disabled: Boolean(field?.disabled),
        readonly: Boolean(field?.readonly),
        help: field?.help || "",
      });
      host.__uiCheckboxInstance = checkbox;
      return host;
    }
    input.type = type === "number" ? "number" : "text";
    input.value = rawValue == null ? "" : String(rawValue);
    applyCommonAttrs(input, field);
    return input;
  }

  function emitChange(validation = getCurrentValidation()) {
    currentOptions.onChange?.(cloneValue(value), {
      name: currentOptions.name,
      validation,
    });
  }

  function on(el, event, handler) {
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  }

  function clearListeners() {
    listeners.splice(0).forEach((off) => off());
  }

  function getCurrentValidation() {
    return validateGroup({
      ...currentOptions,
      enabledBreakdowns: expandedBreakdowns,
      collapsedBreakdowns,
    }, value);
  }

  function getItemIssues(index) {
    const prefix = getItemPathPrefix(currentOptions, index);
    return normalizeValidationIssues(renderedValidation)
      .filter((issue) => String(issue?.field_key || "").startsWith(prefix));
  }

  function getFieldIssues(index, keys) {
    const keySet = new Set(safeArray(keys).filter(Boolean));
    return getItemIssues(index).filter((warning) => {
      const warningKey = getLastPathSegment(warning?.field_key);
      const related = safeArray(warning?.related_fields);
      return keySet.has(warningKey) || related.some((key) => keySet.has(key));
    });
  }

  function getBreakdownValidationLines(index, item, breakdown) {
    const breakdownKeys = getBreakdownFieldKeys(breakdown);
    const options = {
      ...currentOptions,
      enabledBreakdowns: expandedBreakdowns,
      collapsedBreakdowns,
    };
    return safeArray(currentOptions.validations).map((rule) => {
      const context = getRuleBreakdownContext(rule, currentOptions);
      if (!context || !context.keys.some((key) => breakdownKeys.includes(key))) {
        return null;
      }
      const result = evaluateValidationRule(rule, item, options, index);
      return {
        invalid: Boolean(result),
        message: result?.message || getValidationRuleMessage(rule, currentOptions),
      };
    }).filter(Boolean);
  }

  function updateValidationUi(nextValidation) {
    renderedValidation = nextValidation;
    const itemEls = currentOptions.repeatable
      ? Array.from(refs.body.querySelectorAll(":scope > .ui-field-group-item"))
      : Array.from(refs.body.children).filter((node) => node?.classList?.contains("ui-field-group-item"));

    itemEls.forEach((itemEl, index) => {
      const item = currentOptions.repeatable
        ? safeArray(value)[index]
        : value;
      const itemIssues = getItemIssues(index);
      const itemErrorCount = itemIssues.filter((issue) => issue.severity === "error").length;
      const itemWarningCount = itemIssues.filter((issue) => issue.severity !== "error").length;
      const itemBadge = itemEl.querySelector(":scope > .ui-field-group-item-header .ui-field-group-item-warning");
      if (itemBadge) {
        itemBadge.classList.toggle("is-error", itemErrorCount > 0);
        itemBadge.hidden = itemIssues.length === 0;
        itemBadge.textContent = itemErrorCount
          ? `${itemErrorCount} ${itemErrorCount === 1 ? "error" : "errors"}`
          : `${itemWarningCount} ${itemWarningCount === 1 ? "warning" : "warnings"}`;
        itemBadge.title = itemIssues.map((item) => item.message || item.warning || item.error).filter(Boolean).join("\n");
      }

      safeArray(currentOptions.fields).forEach((field) => {
        const childKey = getFieldKey(field);
        if (!childKey) {
          return;
        }
        const breakdown = normalizeBreakdown(field);
        const issueKeys = breakdown ? [childKey, ...getBreakdownFieldKeys(breakdown)] : [childKey];
        updateFieldIssueUi(itemEl, index, childKey, issueKeys);
        if (breakdown) {
          updateBreakdownValidationUi(itemEl, index, item, childKey, breakdown);
        }
      });
    });
  }

  function updateFieldIssueUi(itemEl, index, childKey, issueKeys) {
    const fieldIssues = getFieldIssues(index, issueKeys);
    const hasIssues = fieldIssues.length > 0;
    const hasErrors = fieldIssues.some((issue) => issue.severity === "error");
    itemEl.querySelectorAll(`[data-field-key="${cssEscape(childKey)}"]`).forEach((row) => {
      row.classList.toggle("has-warning", hasIssues);
      row.classList.toggle("has-error", hasErrors);
      row.querySelectorAll(":scope .ui-field-group-warning-badge").forEach((badge) => badge.remove());
      const badge = renderIssueBadge(fieldIssues);
      if (!badge) {
        return;
      }
      const controls = row.querySelector(":scope > .ui-field-group-child-label-row .ui-field-group-child-label-controls");
      if (controls) {
        controls.prepend(badge);
        return;
      }
      const label = row.querySelector(":scope > .ui-label");
      label?.appendChild(badge);
    });
  }

  function updateBreakdownValidationUi(itemEl, index, item, childKey, breakdown) {
    const wrap = itemEl.querySelector(`.ui-field-group-breakdown[data-breakdown-for="${cssEscape(childKey)}"]`);
    if (!wrap) {
      return;
    }
    const validationLines = getBreakdownValidationLines(index, item, breakdown);
    let list = wrap.querySelector(":scope > .ui-field-group-breakdown-warnings");
    if (!validationLines.length) {
      list?.remove();
      return;
    }
    if (!list) {
      list = document.createElement("div");
      list.className = "ui-field-group-breakdown-warnings";
      const title = wrap.querySelector(":scope > .ui-field-group-breakdown-title");
      if (title?.nextSibling) {
        wrap.insertBefore(list, title.nextSibling);
      } else {
        wrap.appendChild(list);
      }
    }
    clearNode(list);
    validationLines.forEach((warning) => {
      const line = document.createElement("div");
      line.className = [
        "ui-field-group-breakdown-warning",
        warning.invalid ? "is-invalid" : "is-valid",
      ].filter(Boolean).join(" ");
      line.textContent = warning.message || "Check this breakdown.";
      list.appendChild(line);
    });
  }
}

export function normalizeFieldGroupValue(field, rawValue) {
  return normalizeValue(rawValue, normalizeOptions(field));
}

export function validateFieldGroup(field, rawValue) {
  const options = normalizeOptions(field);
  return validateGroup(options, normalizeValue(rawValue, options));
}

export function serializeFieldGroupValue(field, rawValue) {
  return JSON.stringify(normalizeFieldGroupValue(field, rawValue));
}

export function parseFieldGroupValue(field, rawValue) {
  const options = normalizeOptions(field);
  if (!rawValue) {
    return normalizeValue(null, options);
  }
  if (typeof rawValue === "object") {
    return normalizeValue(rawValue, options);
  }
  try {
    return normalizeValue(JSON.parse(String(rawValue)), options);
  } catch (_) {
    return normalizeValue(null, options);
  }
}

export function resolveFieldGroupFields(field = {}) {
  return cloneFieldDefinitions(normalizeOptions(field).fields);
}

export function resolveFieldGroupRows(field = {}) {
  return cloneFieldDefinitions(normalizeOptions(field).rawFields);
}

export function isRepeatableFieldGroup(field = {}) {
  return normalizeOptions(field).repeatable;
}

function validateGroup(options, rawValue) {
  const errors = [];
  const warnings = [];
  const items = options.repeatable ? safeArray(rawValue) : [rawValue && typeof rawValue === "object" ? rawValue : {}];

  if (options.required && (!items.length || items.every((item) => isEmptyItem(item, options.fields)))) {
    errors.push({ field_key: options.name, error: "Required group entry is missing" });
  }

  items.forEach((item, index) => {
    options.fields.forEach((field) => {
      if (!isFieldVisibleForItem(field, item)) {
        return;
      }
      const childKey = getFieldKey(field);
      const childValue = item && typeof item === "object" ? item[childKey] : "";
      const trimmed = String(childValue ?? "").trim();
      const nestedKey = options.repeatable ? `${options.name}.${index}.${childKey}` : `${options.name}.${childKey}`;

      if (isRequiredField(field) && !trimmed) {
        errors.push({ field_key: nestedKey, error: "Required value is missing" });
      }

      if (isNumberFieldType(field) && trimmed) {
        const numeric = Number(trimmed);
        if (!Number.isFinite(numeric)) {
          errors.push({ field_key: nestedKey, error: "Value must be a valid number" });
        } else {
          if (field?.min !== null && field?.min !== undefined && field?.min !== "" && numeric < Number(field.min)) {
            errors.push({ field_key: nestedKey, error: `Value must be >= ${field.min}` });
          }
          if (field?.max !== null && field?.max !== undefined && field?.max !== "" && numeric > Number(field.max)) {
            errors.push({ field_key: nestedKey, error: `Value must be <= ${field.max}` });
          }
        }
      }
    });
    safeArray(options.validations).forEach((rule) => {
      if (!shouldEvaluateValidationRule(rule, item, options, index)) {
        return;
      }
      const result = evaluateValidationRule(rule, item, options, index);
      if (!result) {
        return;
      }
      if (result.severity === "error") {
        errors.push({ field_key: result.field_key, error: result.message, related_fields: result.related_fields });
      } else {
        warnings.push({ field_key: result.field_key, message: result.message, related_fields: result.related_fields });
      }
    });
  });

  return {
    status: errors.length === 0,
    errors,
    warnings,
  };
}

function normalizeOptions(options = {}) {
  const name = getFieldKey(options) || String(options.name || "");
  const config = getFieldConfig(options);
  const preset = resolvePresetOptions(options, config);
  const candidateFields = Object.prototype.hasOwnProperty.call(options, "rawFields") ? options.rawFields : options.fields;
  const rawFields = hasUsableFields(candidateFields) ? candidateFields : preset?.fields ?? candidateFields;
  const fieldRows = normalizeChildFieldRows({ fields: rawFields });
  const fields = flattenFieldRows(fieldRows);
  return {
    ...DEFAULT_OPTIONS,
    ...(preset || {}),
    ...(options || {}),
    name,
    label: getFieldLabel(options, config?.preset_label ?? preset?.label ?? (name || "Group")),
    repeatable: Boolean(options?.repeatable ?? options?.multiple ?? config?.repeatable ?? preset?.repeatable),
    required: isRequiredField(options),
    chrome: options?.chrome !== false,
    autoValidate: parseBoolean(options?.autoValidate ?? options?.validateOnChange ?? config?.autoValidate ?? config?.validateOnChange ?? preset?.autoValidate ?? true),
    rawFields: cloneFieldDefinitions(rawFields),
    fieldRows,
    fields: flattenFieldDefinitions(fields),
    validations: cloneValidations(options?.validations ?? preset?.validations ?? config?.validations ?? []),
  };
}

function evaluateValidationRule(rule, item, options, index) {
  if (!rule || typeof rule !== "object") {
    return null;
  }
  const type = String(rule.type || "").toLowerCase();
  const relatedFields = safeArray(rule.related_fields ?? rule.relatedFields);
  const field = String(rule.field || rule.key || "").trim();
  const fields = safeArray(rule.fields).map((key) => String(key || "").trim()).filter(Boolean);
  const targetField = field || fields[0] || String(rule.maxField || rule.max_field || "").trim();
  const fieldKey = buildNestedFieldKey(options, index, targetField || options.name);
  const severity = String(rule.severity || "warning").toLowerCase() === "error" ? "error" : "warning";
  const when = rule.when ?? rule.visibleWhen ?? rule.visible_when;
  if (when && !matchesVisibleWhen(when, item)) {
    return null;
  }

  if (type === "required" || type === "required_when") {
    const value = getItemValue(item, field);
    if (!field || !isEmptyFieldValue(value)) {
      return null;
    }
    return {
      field_key: fieldKey,
      message: rule.message || `${getHumanFieldLabel(options, field)} is required.`,
      related_fields: [...new Set([field, ...Object.keys(when || {}), ...relatedFields].filter(Boolean))],
      severity,
    };
  }

  if (type === "empty" || type === "empty_when" || type === "forbidden_when") {
    const value = getItemValue(item, field);
    if (!field || isEmptyFieldValue(value)) {
      return null;
    }
    return {
      field_key: fieldKey,
      message: rule.message || `${getHumanFieldLabel(options, field)} should be empty.`,
      related_fields: [...new Set([field, ...Object.keys(when || {}), ...relatedFields].filter(Boolean))],
      severity,
    };
  }

  if (type === "lte" || type === "max") {
    const value = getNumericItemValue(item, field);
    const max = getRuleMax(rule, item);
    if (!field || max == null || value <= max) {
      return null;
    }
    return {
      field_key: fieldKey,
      message: rule.message || `${getHumanFieldLabel(options, field)} should not exceed ${getRuleMaxLabel(rule, options)}.`,
      related_fields: [...new Set([field, String(rule.maxField || rule.max_field || "").trim(), ...relatedFields].filter(Boolean))],
      severity,
    };
  }

  if (type === "sum_lte" || type === "sum_max") {
    const sum = fields.reduce((total, key) => total + getNumericItemValue(item, key), 0);
    const max = getRuleMax(rule, item);
    if (!fields.length || max == null || sum <= max) {
      return null;
    }
    return {
      field_key: fieldKey,
      message: rule.message || `${fields.map((key) => getHumanFieldLabel(options, key)).join(" + ")} should not exceed ${getRuleMaxLabel(rule, options)}.`,
      related_fields: [...new Set([...fields, String(rule.maxField || rule.max_field || "").trim(), ...relatedFields].filter(Boolean))],
      severity,
    };
  }

  if (type === "sum_eq" || type === "sum_equals") {
    const sum = fields.reduce((total, key) => total + getNumericItemValue(item, key), 0);
    const max = getRuleMax(rule, item);
    if (!fields.length || max == null || sum === max) {
      return null;
    }
    return {
      field_key: fieldKey,
      message: rule.message || `${fields.map((key) => getHumanFieldLabel(options, key)).join(" + ")} should equal ${getRuleMaxLabel(rule, options)}.`,
      related_fields: [...new Set([...fields, String(rule.maxField || rule.max_field || "").trim(), ...relatedFields].filter(Boolean))],
      severity,
    };
  }

  return null;
}

function getValidationRuleMessage(rule, options) {
  if (rule?.message) {
    return String(rule.message);
  }
  const type = String(rule?.type || "").toLowerCase();
  const field = String(rule?.field || rule?.key || "").trim();
  const fields = safeArray(rule?.fields).map((key) => String(key || "").trim()).filter(Boolean);
  if (type === "lte" || type === "max") {
    return `${getHumanFieldLabel(options, field)} should not exceed ${getRuleMaxLabel(rule, options)}.`;
  }
  if (type === "required" || type === "required_when") {
    return `${getHumanFieldLabel(options, field)} is required.`;
  }
  if (type === "empty" || type === "empty_when" || type === "forbidden_when") {
    return `${getHumanFieldLabel(options, field)} should be empty.`;
  }
  if (type === "sum_eq" || type === "sum_equals") {
    return `${fields.map((key) => getHumanFieldLabel(options, key)).join(" + ")} should equal ${getRuleMaxLabel(rule, options)}.`;
  }
  if (type === "sum_lte" || type === "sum_max") {
    return `${fields.map((key) => getHumanFieldLabel(options, key)).join(" + ")} should not exceed ${getRuleMaxLabel(rule, options)}.`;
  }
  return "Check this breakdown.";
}

function shouldEvaluateValidationRule(rule, item, options, index) {
  const breakdown = getRuleBreakdownContext(rule, options);
  if (!breakdown) {
    return true;
  }
  const stateKey = `${index}:${breakdown.parentKey}`;
  if (options.enabledBreakdowns?.has?.(stateKey)) {
    return true;
  }
  if (breakdown.defaultOpen && !options.collapsedBreakdowns?.has?.(stateKey)) {
    return true;
  }
  return false;
}

function getRuleBreakdownContext(rule, options) {
  const keys = getValidationRuleKeys(rule);
  if (!keys.length) {
    return null;
  }
  for (const field of safeArray(options.fieldRows).flatMap((row) => safeArray(row))) {
    const parentKey = getFieldKey(field);
    const breakdown = normalizeBreakdown(field);
    if (!parentKey || !breakdown) {
      continue;
    }
    const breakdownKeys = getBreakdownFieldKeys(breakdown);
    const matchedKeys = keys.filter((key) => breakdownKeys.includes(key));
    if (matchedKeys.length) {
      return {
        parentKey,
        defaultOpen: Boolean(breakdown.defaultOpen),
        keys: matchedKeys,
      };
    }
  }
  return null;
}

function getValidationRuleKeys(rule) {
  return [
    String(rule?.field || rule?.key || "").trim(),
    ...safeArray(rule?.fields).map((key) => String(key || "").trim()),
    String(rule?.maxField || rule?.max_field || "").trim(),
    ...safeArray(rule?.related_fields ?? rule?.relatedFields).map((key) => String(key || "").trim()),
  ].filter(Boolean);
}

function getRuleMax(rule, item) {
  const maxField = String(rule.maxField || rule.max_field || "").trim();
  if (maxField) {
    return getNumericItemValue(item, maxField);
  }
  if (rule.max !== null && rule.max !== undefined && rule.max !== "") {
    const max = Number(rule.max);
    return Number.isFinite(max) ? max : null;
  }
  return null;
}

function getRuleMaxLabel(rule, options) {
  const maxField = String(rule.maxField || rule.max_field || "").trim();
  return maxField ? getHumanFieldLabel(options, maxField) : String(rule.max);
}

function getNumericItemValue(item, key) {
  const number = Number(item && typeof item === "object" ? item[key] ?? 0 : 0);
  return Number.isFinite(number) ? number : 0;
}

function getItemValue(item, key) {
  if (!item || typeof item !== "object") {
    return "";
  }
  return item[key];
}

function isEmptyFieldValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return String(value ?? "").trim() === "";
}

function getHumanFieldLabel(options, key) {
  const field = safeArray(options.fields).find((candidate) => getFieldKey(candidate) === key);
  return field ? getFieldLabel(field, key) : String(key || "value").replace(/_/g, " ");
}

function buildNestedFieldKey(options, index, key) {
  if (!options.name) {
    return options.repeatable ? `${index}.${key}` : String(key);
  }
  return options.repeatable ? `${options.name}.${index}.${key}` : `${options.name}.${key}`;
}

function getItemPathPrefix(options, index) {
  if (!options.name) {
    return options.repeatable ? `${index}.` : "";
  }
  return options.repeatable ? `${options.name}.${index}.` : `${options.name}.`;
}

function getLastPathSegment(path) {
  const parts = String(path || "").split(".");
  return parts[parts.length - 1] || "";
}

function cssEscape(value) {
  if (globalThis.CSS && typeof globalThis.CSS.escape === "function") {
    return globalThis.CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

function getBreakdownFieldKeys(breakdown) {
  return flattenFieldDefinitions(flattenFieldRows(normalizeChildFieldRows({ fields: breakdown?.fields }))).map(getFieldKey).filter(Boolean);
}

function renderIssueBadge(issues) {
  if (!safeArray(issues).length) {
    return null;
  }
  const hasErrors = safeArray(issues).some((issue) => issue.severity === "error");
  const badge = document.createElement("span");
  badge.className = [
    "ui-field-group-warning-badge",
    hasErrors ? "is-error" : "",
  ].filter(Boolean).join(" ");
  badge.textContent = "!";
  badge.title = safeArray(issues).map((warning) => warning.message || warning.warning || warning.error).filter(Boolean).join("\n");
  return badge;
}

function cloneValidations(validations) {
  return safeArray(validations).map((rule) => (rule && typeof rule === "object" && !Array.isArray(rule) ? { ...rule } : null)).filter(Boolean);
}

function validationIssueSignature(validation) {
  return JSON.stringify({
    errors: safeArray(validation?.errors).map((item) => ({
      field_key: item?.field_key || "",
      message: item?.message || item?.error || "",
      related_fields: safeArray(item?.related_fields).join("|"),
    })),
    warnings: safeArray(validation?.warnings).map((item) => ({
      field_key: item?.field_key || "",
      message: item?.message || item?.warning || "",
      related_fields: safeArray(item?.related_fields).join("|"),
    })),
  });
}

function normalizeValidationIssues(validation) {
  return [
    ...safeArray(validation?.errors).map((item) => ({
      ...item,
      message: item?.message || item?.error || "",
      severity: "error",
    })),
    ...safeArray(validation?.warnings).map((item) => ({
      ...item,
      message: item?.message || item?.warning || "",
      severity: "warning",
    })),
  ];
}

function resolvePresetOptions(options = {}, config = {}) {
  const presetName = String(options?.preset ?? options?.field_preset ?? config?.preset ?? "").trim();
  const presetFactory = presetName ? fieldGroupPresets[presetName] : null;
  if (typeof presetFactory !== "function") {
    return null;
  }

  const overrides = {};
  if (config?.preset_label && !Object.prototype.hasOwnProperty.call(options, "label") && !Object.prototype.hasOwnProperty.call(options, "field_label")) {
    overrides.label = config.preset_label;
  }
  if (
    Object.prototype.hasOwnProperty.call(config, "repeatable")
    && !Object.prototype.hasOwnProperty.call(options, "repeatable")
    && !Object.prototype.hasOwnProperty.call(options, "multiple")
  ) {
    overrides.repeatable = parseBoolean(config.repeatable);
  }

  return presetFactory(overrides);
}

function getFieldConfig(field = {}) {
  const directConfig = field?.config ?? field?.field_config;
  if (directConfig && typeof directConfig === "object" && !Array.isArray(directConfig)) {
    return directConfig;
  }

  const rawConfig = field?.config_json ?? field?.configJson;
  if (rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)) {
    return rawConfig;
  }
  if (typeof rawConfig === "string" && rawConfig.trim()) {
    try {
      const parsed = JSON.parse(rawConfig);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  return {};
}

function hasUsableFields(fields) {
  return safeArray(fields).some((field) => {
    if (Array.isArray(field)) {
      return field.some((child) => child && typeof child === "object" && !Array.isArray(child));
    }
    return field && typeof field === "object";
  });
}

function parseBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  return Boolean(value);
}

function normalizeValue(rawValue, options) {
  if (options.repeatable) {
    if (Array.isArray(rawValue)) {
      return rawValue.map((item) => normalizeItem(item, options));
    }
    if (rawValue && typeof rawValue === "object") {
      return [normalizeItem(rawValue, options)];
    }
    return [];
  }
  return normalizeItem(rawValue, options);
}

function normalizeItem(rawValue, options) {
  const source = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue : {};
  const item = options.fields.reduce((acc, field) => {
    const key = getFieldKey(field);
    if (key && !isComputedField(field)) {
      acc[key] = normalizeFieldValue(field, source[key] ?? field?.default_value ?? "");
    }
    return acc;
  }, {});
  applyComputedValues(item, options.fields, "", source);
  return item;
}

function normalizeFieldValue(field, value) {
  const type = getFieldType(field);
  if (type === "number-stepper" || type === "number_stepper") {
    if (value == null || value === "") {
      return field?.allowEmpty === false || isRequiredField(field) ? Number(field?.min ?? 0) : null;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return field?.allowEmpty === false || isRequiredField(field) ? Number(field?.min ?? 0) : null;
    }
    let next = number;
    if (field?.min !== null && field?.min !== undefined && field?.min !== "") {
      next = Math.max(next, Number(field.min));
    }
    if (field?.max !== null && field?.max !== undefined && field?.max !== "") {
      next = Math.min(next, Number(field.max));
    }
    return next;
  }
  return value;
}

function applyComputedValues(item, fields, changedKey = "", source = null) {
  if (!item || typeof item !== "object") {
    return false;
  }
  let visibleChanged = false;
  safeArray(fields).filter(isComputedField).forEach((field) => {
    const key = getFieldKey(field);
    if (!key) {
      return;
    }
    const computedKeys = getComputedFieldKeys(field);
    if (changedKey && !computedKeys.includes(changedKey)) {
      return;
    }
    const next = computeFieldValue(field, item, source);
    if (item[key] !== next) {
      item[key] = next;
      if (!isHiddenField(field)) {
        visibleChanged = true;
      }
    }
  });
  return visibleChanged;
}

function isComputedField(field) {
  return Boolean(field?.computed);
}

function isHiddenField(field) {
  return parseBoolean(field?.hidden ?? field?.is_hidden ?? false);
}

function isFieldVisibleForItem(field, item) {
  if (isHiddenField(field)) {
    return false;
  }
  return matchesVisibleWhen(field?.visibleWhen ?? field?.visible_when, item);
}

function matchesVisibleWhen(rule, item) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return true;
  }
  return Object.keys(rule).every((key) => {
    const expected = rule[key];
    const actual = item && typeof item === "object" ? item[key] : undefined;
    if (Array.isArray(expected)) {
      return expected.map(String).includes(String(actual ?? ""));
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, "not")) {
        const denied = Array.isArray(expected.not) ? expected.not.map(String) : [String(expected.not)];
        return !denied.includes(String(actual ?? ""));
      }
      if (Object.prototype.hasOwnProperty.call(expected, "in")) {
        return safeArray(expected.in).map(String).includes(String(actual ?? ""));
      }
    }
    return String(actual ?? "") === String(expected);
  });
}

function visibilitySignature(item, fieldRows) {
  return safeArray(fieldRows).flatMap((row) => safeArray(row))
    .filter((field) => field && getFieldKey(field))
    .map((field) => `${getFieldKey(field)}:${isFieldVisibleForItem(field, item) ? "1" : "0"}`)
    .join("|");
}

function getComputedFieldKeys(field) {
  const computed = field?.computed;
  const expression = typeof computed === "string" ? computed : computed?.expression;
  const template = typeof computed === "object" && computed ? computed.template : "";
  return String(expression || template || "").match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
}

function computeFieldValue(field, item, source = null) {
  const computed = field?.computed;
  const expression = typeof computed === "string" ? computed : computed?.expression;
  const template = typeof computed === "object" && computed ? computed.template : "";
  if (template) {
    const rendered = String(template).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) => String(item[key] ?? "").trim());
    const normalized = normalizeComputedTemplateValue(rendered);
    if (normalized) {
      return normalizeFieldValue(field, normalized);
    }
    const fallbackKey = String(computed.fallbackKey ?? computed.fallback_key ?? "").trim();
    if (fallbackKey && source && typeof source === "object") {
      return normalizeFieldValue(field, source[fallbackKey] ?? "");
    }
    return normalizeFieldValue(field, "");
  }
  if (!expression) {
    return normalizeFieldValue(field, field?.default_value ?? "");
  }
  const total = String(expression).split("+").reduce((sum, token) => {
    const key = token.trim();
    if (!key) {
      return sum;
    }
    const literal = Number(key);
    if (Number.isFinite(literal)) {
      return sum + literal;
    }
    const value = Number(item[key] ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  return normalizeFieldValue(field, total);
}

function normalizeComputedTemplateValue(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

function createEmptyItem(options) {
  if (options.emptyItem && typeof options.emptyItem === "object" && !Array.isArray(options.emptyItem)) {
    return normalizeItem(options.emptyItem, options);
  }
  return normalizeItem({}, options);
}

function getFieldKey(field) {
  return String(field?.field_key ?? field?.key ?? field?.name ?? "");
}

function getFieldLabel(field, fallback = "Field") {
  return String(field?.field_label ?? field?.label ?? fallback);
}

function getFieldType(field) {
  return String(field?.input_type ?? field?.type ?? field?.input ?? "text").toLowerCase();
}

function isRequiredField(field) {
  return Boolean(field?.is_required ?? field?.required);
}

function normalizeChildFieldRows(field) {
  const rawFields = safeArray(field?.fields);
  const allSingleRows = rawFields.every((child) => !Array.isArray(child));
  const rows = rawFields.map((child, rowIndex) => {
    const sourceFields = Array.isArray(child) ? child : [child];
    return sourceFields
      .map((sourceField) => {
        if (!sourceField || typeof sourceField !== "object" || Array.isArray(sourceField)) {
          return null;
        }
        return sourceField;
      })
      .map((sourceField, columnIndex) => ({
        ...(sourceField || {}),
        sort_order: sourceField?.sort_order ?? rowIndex + 1,
        column_order: sourceField?.column_order ?? columnIndex + 1,
      }))
      .sort((a, b) => Number(a?.column_order || 0) - Number(b?.column_order || 0))
      .map((sourceField) => (getFieldKey(sourceField) ? sourceField : null));
  }).filter((row) => row.some((sourceField) => sourceField && typeof sourceField === "object"));

  if (allSingleRows) {
    return rows.sort((a, b) => Number(a?.find(Boolean)?.sort_order || 0) - Number(b?.find(Boolean)?.sort_order || 0));
  }

  return rows;
}

function flattenFieldRows(rows) {
  return safeArray(rows).flatMap((row) => safeArray(row));
}

function flattenFieldDefinitions(fields) {
  const result = [];
  safeArray(fields).forEach((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      return;
    }
    result.push(field);
    const breakdown = normalizeBreakdown(field);
    if (breakdown) {
      result.push(...flattenFieldDefinitions(flattenFieldRows(normalizeChildFieldRows({ fields: breakdown.fields }))));
    }
  });
  return result;
}

function normalizeBreakdown(field) {
  const source = field?.breakdown;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const fields = source.fields;
  if (!hasUsableFields(fields)) {
    return null;
  }
  return {
    ...source,
    label: String(source.label || `${getFieldLabel(field, getFieldKey(field))} breakdown`),
    fields,
    defaultOpen: Boolean(source.defaultOpen),
  };
}

function cloneFieldDefinitions(fields) {
  return safeArray(fields)
    .map((field) => {
      if (Array.isArray(field)) {
        const cloned = field
          .map((child) => (child && typeof child === "object" && !Array.isArray(child) ? { ...child } : null));
        return cloned.some(Boolean) ? cloned : null;
      }
      return field && typeof field === "object" ? { ...field } : null;
    })
    .filter(Boolean);
}

function normalizeOptionsList(options) {
  return safeArray(options).map((option) => {
    if (option == null) {
      return null;
    }
    if (typeof option === "string" || typeof option === "number") {
      const value = String(option);
      return { label: value, value };
    }
    const label = String(option.label ?? option.value ?? "").trim();
    const value = String(option.value ?? option.label ?? "").trim();
    if (!label && !value) {
      return null;
    }
    return { label: label || value, value: value || label };
  }).filter(Boolean);
}

function getControlValue(control, field) {
  if (getFieldType(field) === "multiselect") {
    return safeArray(control.querySelectorAll('input[type="checkbox"]:checked'))
      .map((checkbox) => checkbox.value)
      .join(",");
  }
  if (getFieldType(field) === "checkbox-group") {
    return control.__uiCheckboxGroupInstance?.getValue?.() ?? [];
  }
  if (getFieldType(field) === "checkbox") {
    return control.__uiCheckboxInstance?.getValue?.() ?? false;
  }
  if (["combobox", "suggest", "local-history"].includes(getFieldType(field))) {
    return control.__uiComboboxInstance?.getValue?.() ?? "";
  }
  if (getFieldType(field) === "number-stepper" || getFieldType(field) === "number_stepper") {
    return control.__uiNumberStepperInstance?.getValue?.() ?? "";
  }
  return control.value ?? "";
}

function isNumberFieldType(field) {
  const type = getFieldType(field);
  return type === "number" || type === "number-stepper" || type === "number_stepper";
}

function applyCommonAttrs(control, field) {
  if (isRequiredField(field)) {
    control.required = true;
  }
  if (field?.disabled) {
    control.disabled = true;
  }
  if (field?.readonly) {
    control.readOnly = true;
  }
  if (field?.placeholder && "placeholder" in control) {
    control.placeholder = String(field.placeholder);
  }
  ["min", "max", "step", "autocomplete", "inputmode", "pattern"].forEach((attr) => {
    if (field?.[attr] !== null && field?.[attr] !== undefined && field?.[attr] !== "") {
      control.setAttribute(attr, String(field[attr]));
    }
  });
}

function isEmptyItem(item, fields) {
  if (!item || typeof item !== "object") {
    return true;
  }
  return fields.filter((field) => isFieldVisibleForItem(field, item)).every((field) => !String(item[getFieldKey(field)] ?? "").trim());
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneValue(value) {
  try {
    return structuredClone(value);
  } catch (_) {
    return JSON.parse(JSON.stringify(value));
  }
}

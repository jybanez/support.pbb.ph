import { createElement, clearNode } from "./ui.dom.js";
import { createActionModal } from "./ui.modal.js?v=0.21.61";
import { createPasswordField } from "./ui.password.js?v=0.21.64";
import { createSelect } from "./ui.select.js";
import { createTreeSelect } from "./ui.tree.select.js";

const FORM_MODAL_STYLE_PATHS = [
  "../../css/ui/ui.tokens.css",
  "../../css/ui/ui.components.css",
  "../../css/ui/ui.modal.css",
  "../../css/ui/ui.form.modal.css",
  "../../css/ui/ui.select.css",
  "../../css/ui/ui.tree.select.css",
  "../../css/ui/ui.password.css",
];
const FORM_MODAL_STYLE_HREFS = FORM_MODAL_STYLE_PATHS.map((path) => new URL(path, import.meta.url).href);

const DEFAULT_OPTIONS = {
  title: "",
  size: "sm",
  className: "",
  ariaLabel: "Form dialog",
  context: null,
  rows: [],
  initialValues: null,
  mode: "",
  extraActions: [],
  extraActionsPlacement: "end",
  submitLabel: "Submit",
  cancelLabel: "Cancel",
  submitVariant: "primary",
  submitIcon: "",
  cancelIcon: "",
  closeOnSuccess: true,
  busyMessage: "Saving...",
  manageBusyOnSubmit: true,
  onSubmit: null,
  onChange: null,
  onClose: null,
};

export function createFormModal(options = {}) {
  const currentOptions = normalizeOptions(options);
  ensureFormModalStyles(resolveTargetDocument(currentOptions.parent));
  const refs = {
    shell: createElement("div", { className: "ui-form-modal" }),
    form: createElement("form", {
      className: "ui-form-modal-form",
      attrs: { novalidate: "novalidate" },
    }),
    context: createElement("div", {
      className: "ui-form-modal-context",
      attrs: { hidden: "hidden" },
    }),
    rows: createElement("div", { className: "ui-form-modal-rows" }),
    hiddenFields: createElement("div", {
      className: "ui-form-modal-hidden-fields",
      attrs: { hidden: "hidden", "aria-hidden": "true" },
    }),
    formError: createElement("p", {
      className: "ui-form-error ui-form-modal-form-error",
      attrs: { hidden: "hidden" },
    }),
    submitProxy: createElement("button", {
      className: "ui-form-modal-submit-proxy",
      text: "Submit",
      attrs: { type: "submit", tabindex: "-1", "aria-hidden": "true" },
    }),
  };
  refs.form.append(refs.context, refs.rows, refs.hiddenFields, refs.formError, refs.submitProxy);
  refs.shell.appendChild(refs.form);

  const fields = new Map();
  const displays = new Map();
  const valueStore = {};
  let destroyed = false;
  let modal = null;
  let lastVisibilitySignature = "";

  seedStoredValuesFromInitialOptions();

  function destroyHostedFieldInstances() {
    fields.forEach((field) => {
      if (field?.type === "ui.select") {
        field.control?.__uiSelectInstance?.destroy?.();
      } else if (field?.type === "ui.treeselect") {
        field.control?.__uiTreeSelectInstance?.destroy?.();
      } else if (field?.type === "avatar") {
        field.control?.__uiAvatarFieldInstance?.destroy?.();
      } else if (field?.type === "input") {
        field.control?.__uiPasswordInstance?.destroy?.();
      }
    });
  }

  function resolveItemConfig(item, values = valueStore) {
    if (!item || typeof item !== "object") {
      return item;
    }
    const next = { ...item };
    const mode = currentOptions.mode;
    next.type = normalizeItemType(next.type);
    next.span = normalizeSpan(next.span);
    next._initialValues = currentOptions.initialValues || {};
    next.required = Boolean(next.required) || resolveModeFlag(next.requiredOn, mode);
    if (resolveModeFlag(next.optionalOn, mode)) {
      next.required = false;
    }
    next.readonly = Boolean(next.readonly) || resolveModeFlag(next.readonlyOn, mode);
    next._values = values;
    next._hiddenByRule = resolveModeFlag(next.hiddenOn, mode) || !matchesVisibleWhen(next.visibleWhen, values);
    return next;
  }

  function render(syncBeforeRender = true) {
    if (syncBeforeRender) {
      syncValueStoreFromRenderedFields();
    }
    destroyHostedFieldInstances();
    renderContext();
    clearNode(refs.rows);
    clearNode(refs.hiddenFields);
    fields.clear();
    displays.clear();

    normalizeRows(currentOptions.rows).forEach((row, rowIndex) => {
      const resolvedRow = row.map((item) => resolveItemConfig(item, valueStore));
      const visibleItems = resolvedRow.filter((item) => isVisibleRenderableItem(item));
      if (!visibleItems.length) {
        resolvedRow.forEach((item, itemIndex) => {
          if (!item || item._hiddenByRule || item.type !== "hidden") {
            return;
          }
          const hiddenEl = renderItem(item, rowIndex, itemIndex);
          if (hiddenEl) {
            refs.hiddenFields.appendChild(hiddenEl);
          }
        });
        return;
      }
      const rowEl = createElement("div", {
        className: `ui-form-modal-row is-items-${Math.min(visibleItems.length, 2) || 1}`,
      });
      let warned = false;
      let renderedVisibleCount = 0;

      resolvedRow.forEach((item, itemIndex) => {
        if (!item || item._hiddenByRule) {
          return;
        }
        if (item.type === "hidden") {
          const hiddenEl = renderItem(item, rowIndex, itemIndex);
          if (hiddenEl) {
            refs.hiddenFields.appendChild(hiddenEl);
          }
          return;
        }
        const isVisible = true;
        if (isVisible) {
          renderedVisibleCount += 1;
          if (renderedVisibleCount > 2) {
            if (!warned) {
              console.warn(`[createFormModal] Row ${rowIndex + 1} has ${visibleItems.length} visible items; current implementation supports at most 2. Rendering first 2 visible items only.`);
              warned = true;
            }
            return;
          }
        }
        const itemEl = renderItem(item, rowIndex, itemIndex);
        if (itemEl) {
          rowEl.appendChild(itemEl);
        }
      });

      if (rowEl.childNodes.length) {
        refs.rows.appendChild(rowEl);
      }
    });
    lastVisibilitySignature = computeVisibilitySignature();
  }

  function renderItem(item, rowIndex, itemIndex) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const type = String(item.type || "").trim().toLowerCase();
    if (type === "text") {
      return createElement("p", {
        className: getItemClassName("ui-form-modal-text", item),
        text: String(item.content || ""),
      });
    }
    if (type === "alert") {
      return createElement("div", {
        className: getItemClassName(`ui-form-modal-alert is-${normalizeTone(item.tone)}`, item),
        text: String(item.content || ""),
        attrs: { role: "alert" },
      });
    }
    if (type === "divider") {
      return createElement("hr", {
        className: getItemClassName("ui-form-modal-divider", item),
      });
    }
    if (type === "display") {
      return renderDisplayItem(item);
    }
    if (type === "hidden" || type === "input" || type === "textarea" || type === "select" || type === "checkbox" || type === "ui.select" || type === "ui.treeselect" || type === "avatar") {
      return renderField(item, type, rowIndex, itemIndex);
    }
    console.warn(`[createFormModal] Unsupported item type "${type}".`);
    return null;
  }

  function renderDisplayItem(item) {
    const wrapper = createElement("div", {
      className: getItemClassName(`ui-field ui-form-modal-field is-${normalizeTypeClass("display")}`, item),
    });
    const name = String(item.name || "").trim();
    const labelText = String(item.label || "").trim();
    const helpText = String(item.help || "").trim();
    const displayValue = resolveItemValue(item);
    if (labelText) {
      wrapper.appendChild(createElement("label", {
        className: "ui-label",
        text: labelText,
      }));
    }
    const valueEl = createElement("div", {
      className: "ui-form-modal-display-value",
      text: displayValue == null || displayValue === "" ? String(item.emptyText || "-") : String(displayValue),
    });
    wrapper.appendChild(valueEl);
    if (helpText) {
      wrapper.appendChild(createElement("p", {
        className: "ui-form-modal-help",
        text: helpText,
      }));
    }
    if (name) {
      displays.set(name, {
        name,
        valueEl,
        config: { ...item },
      });
    }
    return wrapper;
  }

  function renderContext() {
    clearNode(refs.context);
    const context = normalizeContext(currentOptions.context);
    if (!context) {
      refs.context.hidden = true;
      return;
    }
    refs.context.hidden = false;
    refs.context.className = `ui-form-modal-context is-${context.kind}`;
    if (context.badge) {
      refs.context.appendChild(createElement("span", {
        className: "ui-form-modal-context-badge",
        text: context.badge,
      }));
    }
    if (context.summary) {
      refs.context.appendChild(createElement("span", {
        className: "ui-form-modal-context-summary",
        text: context.summary,
      }));
    }
  }

  function renderField(item, type, rowIndex, itemIndex) {
    const name = String(item.name || "").trim();
    if (!name) {
      console.warn(`[createFormModal] Field item at row ${rowIndex + 1}, index ${itemIndex + 1} is missing "name".`);
      return null;
    }
    const id = `ui-form-modal-${name}-${rowIndex}-${itemIndex}`;
    const wrapper = createElement("div", {
      className: getItemClassName(`ui-field ui-form-modal-field is-${normalizeTypeClass(type)}`, item),
      attrs: type === "hidden" ? { hidden: "hidden" } : {},
    });
    const label = createElement("label", {
      className: type === "checkbox" ? "ui-form-modal-checkbox" : "ui-label",
      attrs: type === "checkbox" || type === "hidden" ? {} : { for: id },
    });
    const labelText = String(item.label || "").trim();
    const helpText = String(item.help || "").trim();
    const errorEl = type === "hidden"
      ? null
      : createElement("p", {
        className: "ui-form-error ui-form-modal-field-error",
        attrs: { hidden: "hidden", id: `${id}-error` },
      });

    const value = resolveItemValue(item);
    const control = createControl(type, id, name, item, value, errorEl);
    if (!control) {
      return null;
    }

    if (type === "hidden") {
      fields.set(name, {
        name,
        type,
        config: { ...item },
        wrapper: null,
        control,
        errorEl: null,
      });
      return control;
    } else if (type === "ui.select" || type === "ui.treeselect") {
      if (labelText) {
        label.textContent = labelText;
        wrapper.appendChild(label);
      }
      wrapper.appendChild(control);
    } else if (type === "avatar") {
      wrapper.appendChild(control);
    } else if (type === "checkbox") {
      label.append(control, createElement("span", {
        className: "ui-form-modal-checkbox-label",
        text: labelText,
      }));
      wrapper.appendChild(label);
    } else {
      if (labelText) {
        label.textContent = labelText;
        wrapper.appendChild(label);
      }
      wrapper.appendChild(control);
    }

    if (helpText && type !== "hidden") {
      const helpEl = createElement("p", {
        className: "ui-form-modal-help",
        text: helpText,
        attrs: { id: `${id}-help` },
      });
      wrapper.appendChild(helpEl);
      appendDescribedBy(getFieldAriaTarget({ type, control }), helpEl.id);
    }

    if ((type === "ui.select" || type === "ui.treeselect") && errorEl) {
      appendDescribedBy(getFieldAriaTarget({ type, control }), errorEl.id);
    }

    if (errorEl) {
      wrapper.appendChild(errorEl);
    }

    fields.set(name, {
      name,
      type,
      config: { ...item },
      wrapper,
      control,
      errorEl,
    });
    return wrapper;
  }

  function createControl(type, id, name, item, value, errorEl) {
    const describedBy = errorEl?.id || null;
    const commonAttrs = {
      id,
      name,
      ...(item.required ? { required: "required" } : {}),
      ...(item.disabled ? { disabled: "disabled" } : {}),
      ...(item.autocomplete ? { autocomplete: String(item.autocomplete) } : {}),
      ...(item.min != null ? { min: String(item.min) } : {}),
      ...(item.max != null ? { max: String(item.max) } : {}),
      ...(item.step != null ? { step: String(item.step) } : {}),
      ...(item.pattern ? { pattern: String(item.pattern) } : {}),
      ...(item.inputmode ? { inputmode: String(item.inputmode) } : {}),
      ...(describedBy ? { "aria-describedby": describedBy } : {}),
    };
    let control = null;

    if (type === "hidden") {
      control = createElement("input", {
        attrs: {
          id,
          name,
          type: "hidden",
          value: value == null ? "" : String(value),
        },
      });
      return control;
    }

    if (type === "ui.select") {
      const host = createElement("div", {
        className: "ui-form-modal-select-host",
        attrs: { id },
      });
      const selectInstance = createSelect(host, item.items || item.options || [], {
        ariaLabel: item.ariaLabel || item.label || name,
        placeholder: item.placeholder || "Select...",
        emptyText: item.emptyText || "No options found.",
        searchable: item.searchable !== false,
        multiple: Boolean(item.multiple),
        closeOnSelect: item.closeOnSelect !== false,
        selectOnTab: Boolean(item.selectOnTab),
        clearable: item.clearable !== false,
        selected: value,
        onChange() {
          handleFieldChange(name);
        },
      });
      host.__uiSelectInstance = selectInstance;
      control = host;
      return control;
    }

    if (type === "ui.treeselect") {
      const host = createElement("div", {
        className: "ui-form-modal-select-host",
        attrs: { id },
      });
      const treeSelectInstance = createTreeSelect(host, item.items || item.options || [], {
        ariaLabel: item.ariaLabel || item.label || name,
        placeholder: item.placeholder || "Select...",
        emptyText: item.emptyText || "No options found.",
        searchable: item.searchable !== false,
        closeOnSelect: item.closeOnSelect !== false,
        selectOnTab: Boolean(item.selectOnTab),
        clearable: item.clearable !== false,
        defaultExpanded: Boolean(item.defaultExpanded),
        selected: value,
        onChange() {
          handleFieldChange(name);
        },
      });
      host.__uiTreeSelectInstance = treeSelectInstance;
      control = host;
      return control;
    }

    if (type === "avatar") {
      const host = createElement("div", {
        className: "ui-form-modal-avatar-host",
      });
      const trigger = createElement("button", {
        className: "ui-form-modal-avatar-picker",
        attrs: {
          id,
          type: "button",
          ...(item.disabled ? { disabled: "disabled" } : {}),
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
          "aria-label": String(item.ariaLabel || item.label || "Choose profile photo"),
        },
      });
      const circle = createElement("span", {
        className: "ui-form-modal-avatar-circle",
      });
      const image = createElement("img", {
        className: "ui-form-modal-avatar-image",
        attrs: {
          alt: String(item.previewAlt || item.label || "Selected profile photo"),
          hidden: "hidden",
        },
      });
      const placeholder = createElement("span", {
        className: "ui-form-modal-avatar-placeholder",
        text: String(item.placeholderText || "Photo"),
      });
      const caption = createElement("span", {
        className: "ui-form-modal-avatar-caption",
      });
      const meta = createElement("span", {
        className: "ui-form-modal-avatar-meta",
      });
      const input = createElement("input", {
        className: "ui-form-modal-avatar-input",
        attrs: {
          type: "file",
          tabindex: "-1",
          hidden: "hidden",
          ...(item.accept ? { accept: String(item.accept) } : { accept: "image/*" }),
          ...(item.capture ? { capture: String(item.capture) } : {}),
        },
      });

      let currentFile = value instanceof File ? value : null;
      let currentPreviewUrl = currentFile ? "" : normalizeAvatarPreviewUrl(item.previewUrl || item.src || "");
      let objectUrl = "";
      let pendingPreviewSrc = "";

      circle.append(image, placeholder);
      trigger.append(circle, caption, meta);
      host.append(trigger, input);

      function revokeObjectUrl() {
        if (!objectUrl) {
          return;
        }
        URL.revokeObjectURL(objectUrl);
        objectUrl = "";
      }

      function showLoadedImage() {
        if (!pendingPreviewSrc) {
          return;
        }
        image.hidden = false;
        placeholder.hidden = true;
        caption.textContent = String(item.changeLabel || "Change photo");
        meta.textContent = currentFile?.name || String(item.previewText || "Current profile photo");
        trigger.dataset.state = currentFile ? "selected" : "preview";
      }

      function showPlaceholderState() {
        image.removeAttribute("src");
        image.hidden = true;
        placeholder.hidden = false;
        caption.textContent = String(item.selectLabel || "Choose photo");
        meta.textContent = String(item.emptyText || "Click to choose a profile photo.");
        trigger.dataset.state = "empty";
      }

      function syncPreview() {
        revokeObjectUrl();
        pendingPreviewSrc = "";
        let previewSrc = "";
        if (currentFile instanceof File) {
          objectUrl = URL.createObjectURL(currentFile);
          previewSrc = objectUrl;
        } else if (currentPreviewUrl) {
          previewSrc = currentPreviewUrl;
        }
        if (previewSrc) {
          pendingPreviewSrc = previewSrc;
          image.src = previewSrc;
          image.hidden = true;
          placeholder.hidden = false;
          caption.textContent = currentFile?.name ? String(item.changeLabel || "Change photo") : String(item.previewLoadingText || "Loading photo...");
          meta.textContent = currentFile?.name || String(item.previewText || "Current profile photo");
          trigger.dataset.state = "loading";
        } else {
          showPlaceholderState();
        }
      }

      const avatarInstance = {
        input,
        trigger,
        getValue() {
          return currentFile;
        },
        setValue(nextValue) {
          if (nextValue instanceof File) {
            currentFile = nextValue;
          } else {
            currentFile = null;
            if (typeof nextValue === "string") {
              currentPreviewUrl = normalizeAvatarPreviewUrl(nextValue);
            }
          }
          input.value = "";
          syncPreview();
        },
        hasPreview() {
          return Boolean(currentFile || currentPreviewUrl);
        },
        destroy() {
          revokeObjectUrl();
          input.value = "";
        },
      };

      trigger.addEventListener("click", () => {
        if (item.disabled || item.readonly) {
          return;
        }
        input.value = "";
        input.click();
      });
      image.addEventListener("load", () => {
        showLoadedImage();
      });
      image.addEventListener("error", () => {
        pendingPreviewSrc = "";
        if (!(currentFile instanceof File)) {
          currentPreviewUrl = "";
        }
        showPlaceholderState();
      });
      input.addEventListener("change", () => {
        currentFile = input.files?.[0] || null;
        syncPreview();
        handleFieldChange(name);
      });

      host.__uiAvatarFieldInstance = avatarInstance;
      syncPreview();
      return host;
    }

    if (type === "input") {
      if (normalizeInputType(item.input) === "password") {
        const host = createElement("div", {
          className: "ui-form-modal-password-host",
        });
        const passwordInstance = createPasswordField(host, {
          id,
          name,
          value: value == null ? "" : String(value),
          placeholder: item.placeholder ? String(item.placeholder) : "",
          autocomplete: item.autocomplete ? String(item.autocomplete) : "",
          required: Boolean(item.required),
          disabled: Boolean(item.disabled),
          readonly: Boolean(item.readonly),
          ariaLabel: item.ariaLabel || item.label || name,
          describedBy,
          onChange() {
            handleFieldChange(name);
          },
        });
        host.__uiPasswordInstance = passwordInstance;
        control = host;
        return control;
      }
      control = createElement("input", {
        className: "ui-input",
        attrs: {
          ...commonAttrs,
          ...(item.readonly ? { readonly: "readonly" } : {}),
          type: normalizeInputType(item.input),
          value: value == null ? "" : String(value),
          ...(item.placeholder ? { placeholder: String(item.placeholder) } : {}),
        },
      });
    } else if (type === "textarea") {
      control = createElement("textarea", {
        className: "ui-input",
        text: value == null ? "" : String(value),
        attrs: {
          ...commonAttrs,
          ...(item.readonly ? { readonly: "readonly" } : {}),
          ...(item.placeholder ? { placeholder: String(item.placeholder) } : {}),
        },
      });
    } else if (type === "select") {
      control = createElement("select", {
        className: "ui-input",
        attrs: {
          ...commonAttrs,
          ...(item.readonly ? { disabled: "disabled" } : {}),
        },
      });
      normalizeOptionsList(item.options).forEach((option) => {
        const optionEl = createElement("option", {
          text: option.label,
          attrs: { value: option.value },
        });
        if (String(option.value) === String(value ?? "")) {
          optionEl.selected = true;
        }
        control.appendChild(optionEl);
      });
    } else if (type === "checkbox") {
      control = createElement("input", {
        className: "ui-form-modal-checkbox-input",
        attrs: {
          ...commonAttrs,
          type: "checkbox",
          ...(item.readonly ? { disabled: "disabled" } : {}),
          ...(value ? { checked: "checked" } : {}),
        },
      });
      control.checked = Boolean(value);
    }

    if (!control) {
      return null;
    }
    control.addEventListener("input", () => handleFieldChange(name));
    control.addEventListener("change", () => handleFieldChange(name));
    return control;
  }

  function handleFieldChange(name) {
    syncValueStoreFromRenderedFields();
    const nextVisibilitySignature = computeVisibilitySignature();
    if (nextVisibilitySignature !== lastVisibilitySignature) {
      render(false);
    }
    clearFieldError(name);
    if (refs.formError.textContent) {
      clearFormError();
    }
    if (typeof currentOptions.onChange === "function") {
      currentOptions.onChange(getValues(), createContext(name));
    }
  }

  async function handleSubmit(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (destroyed || modal.isBusy()) {
      return false;
    }
    clearErrors();
    clearFormError();
    const validation = validate();
    if (!validation.valid) {
      applyErrors(validation.errors);
      focusFirstInvalid(validation.firstInvalidField);
      return false;
    }
    if (typeof currentOptions.onSubmit !== "function") {
      return true;
    }
    if (currentOptions.manageBusyOnSubmit !== false) {
      modal.setBusy(true, { message: currentOptions.busyMessage });
    }
    try {
      const result = await currentOptions.onSubmit(getValues(), createContext(null));
      if (result) {
        return currentOptions.closeOnSuccess !== false;
      }
      return false;
    } catch (_error) {
      return false;
    } finally {
      if (currentOptions.manageBusyOnSubmit !== false && modal.getState().open) {
        modal.setBusy(false);
      }
    }
  }

  function validate() {
    const errors = {};
    let firstInvalidField = null;
    fields.forEach((field, name) => {
      if (field.type === "hidden") {
        return;
      }
      const control = field.control;
      if (!(control instanceof HTMLElement)) {
        return;
      }
      let message = "";
      if (field.type === "checkbox") {
        if (field.config.required && !control.checked) {
          message = "This field is required.";
        }
      } else if (field.type === "ui.select" || field.type === "ui.treeselect") {
        const value = getFieldValue(field);
        const isEmpty = Array.isArray(value) ? value.length === 0 : value == null || value === "";
        if (field.config.required && isEmpty) {
          message = "This field is required.";
        }
      } else if (field.type === "avatar") {
        const value = getFieldValue(field);
        const hasPreview = field.control?.__uiAvatarFieldInstance?.hasPreview?.() === true;
        if (field.config.required && !value && !hasPreview) {
          message = "Please choose a photo.";
        }
      } else if (field.config.required && !getFieldValue(field)) {
        message = "This field is required.";
      } else {
        const validationTarget = getFieldAriaTarget(field);
        if (typeof validationTarget?.checkValidity === "function" && !validationTarget.checkValidity()) {
          message = validationTarget.validationMessage || "Invalid value.";
        }
      }
      if (message) {
        errors[name] = message;
        if (!firstInvalidField) {
          firstInvalidField = name;
        }
      }
    });
    return {
      valid: !Object.keys(errors).length,
      errors,
      firstInvalidField,
    };
  }

  function resolveErrorField(name) {
    if (!name || typeof name !== "string") {
      return null;
    }
    const direct = fields.get(name);
    if (direct) {
      return direct;
    }
    if (!name.includes(".")) {
      return null;
    }
    return fields.get(name.split(".")[0]) || null;
  }

  function focusFirstInvalid(name) {
    if (!name) {
      return;
    }
    const field = fields.get(name);
    if (field?.type === "hidden") {
      return;
    }
    const focusTarget = field?.type === "ui.select" || field?.type === "ui.treeselect" || field?.type === "avatar"
      ? getFieldAriaTarget(field)
      : getFieldAriaTarget(field) || field?.control;
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }

  function applyErrors(errors = {}) {
    Object.keys(errors || {}).forEach((name) => {
      const field = resolveErrorField(name);
      if (!field || !field.errorEl) {
        return;
      }
      field.errorEl.hidden = false;
      field.errorEl.textContent = String(errors[name] || "");
      const ariaTarget = getFieldAriaTarget(field);
      ariaTarget?.setAttribute?.("aria-invalid", "true");
    });
  }

  function clearFieldError(name) {
    const field = resolveErrorField(name);
    if (!field || !field.errorEl) {
      return;
    }
    field.errorEl.hidden = true;
    field.errorEl.textContent = "";
    const ariaTarget = getFieldAriaTarget(field);
    ariaTarget?.removeAttribute?.("aria-invalid");
  }

  function clearErrors() {
    fields.forEach((_field, name) => clearFieldError(name));
  }

  function setFormError(message) {
    const text = String(message || "").trim();
    refs.formError.textContent = text;
    refs.formError.hidden = !text;
  }

  function clearFormError() {
    setFormError("");
  }

  function getValues() {
    syncValueStoreFromRenderedFields();
    const values = {};
    fields.forEach((_field, name) => {
      if (Object.prototype.hasOwnProperty.call(valueStore, name)) {
        values[name] = valueStore[name];
      }
    });
    return values;
  }

  function setValues(nextValues = {}) {
    syncValueStoreFromRenderedFields();
    const nextStoredValues = {
      ...valueStore,
      ...(nextValues && typeof nextValues === "object" ? nextValues : {}),
    };
    replaceStoredValues(nextStoredValues);
    const nextVisibilitySignature = computeVisibilitySignature();
    if (nextVisibilitySignature !== lastVisibilitySignature) {
      render(false);
    }
    Object.keys(nextValues || {}).forEach((name) => {
      const field = fields.get(name);
      if (field) {
        setFieldValue(field, nextValues[name]);
      }
      const display = displays.get(name);
      if (display) {
        display.valueEl.textContent = nextValues[name] == null || nextValues[name] === ""
          ? String(display.config.emptyText || "-")
          : String(nextValues[name]);
      }
    });
    syncValueStoreFromRenderedFields();
  }

  function applyApiErrors(response) {
    const mapped = normalizeApiErrors(response);
    if (Object.keys(mapped.fieldErrors).length) {
      setErrors(mapped.fieldErrors);
    } else {
      clearErrors();
    }
    if (mapped.formError) {
      setFormError(mapped.formError);
    }
    return mapped;
  }

  function createContext(changedFieldName) {
    return {
      modal,
      mode: currentOptions.mode,
      setErrors,
      clearErrors,
      setFormError,
      clearFormError,
      applyApiErrors,
      setBusy: (...args) => modal.setBusy(...args),
      isBusy: () => modal.isBusy(),
      changedFieldName,
    };
  }

  function createActionContext(action, event) {
    return {
      ...createContext(null),
      action,
      actionId: action?.id || "",
      event: event || null,
      getValues,
      setValues,
      getState,
    };
  }

  function setErrors(fieldErrors = {}) {
    clearErrors();
    applyErrors(fieldErrors);
  }

  function buildModalConfig() {
    const extraActions = currentOptions.extraActions.map((action, index, list) => {
      const isSplitStart = currentOptions.extraActionsPlacement === "start" && index === list.length - 1;
      return {
        ...action,
        className: [action.className || "", isSplitStart ? "is-footer-split-start" : ""].filter(Boolean).join(" "),
        closeOnClick: action.closeOnClick === true,
        async onClick(eventContext) {
          if (typeof action.onClick !== "function") {
            return false;
          }
          return action.onClick(getValues(), createActionContext(action, eventContext?.event), action.id || "");
        },
      };
    });

    return {
      ...currentOptions,
      className: ["ui-form-modal-shell", currentOptions.className || ""].filter(Boolean).join(" "),
      content: refs.shell,
      autoBusy: false,
      actions: [
        ...extraActions,
        {
          id: "cancel",
          label: currentOptions.cancelLabel,
          variant: "ghost",
          icon: currentOptions.cancelIcon || "",
        },
        {
          id: "submit",
          label: currentOptions.submitLabel,
          variant: currentOptions.submitVariant,
          icon: currentOptions.submitIcon || "",
          autoFocus: true,
          closeOnClick: false,
          async onClick(eventContext) {
            const shouldClose = await handleSubmit(eventContext.event);
            if (shouldClose) {
              await modal.close({
                reason: "submit",
                actionId: "submit",
                result: true,
              });
            }
            return false;
          },
        },
      ],
    };
  }

  function update(nextOptions = {}) {
    syncValueStoreFromRenderedFields();
    const previousValues = { ...valueStore };
    const merged = normalizeOptions({
      ...currentOptions,
      ...(nextOptions || {}),
      rows: Object.prototype.hasOwnProperty.call(nextOptions, "rows") ? nextOptions.rows : currentOptions.rows,
      initialValues: Object.prototype.hasOwnProperty.call(nextOptions, "initialValues") ? nextOptions.initialValues : currentOptions.initialValues,
    });
    Object.assign(currentOptions, merged);
    if (Object.prototype.hasOwnProperty.call(nextOptions, "initialValues")) {
      seedStoredValuesFromInitialOptions();
    }
    ensureFormModalStyles(resolveTargetDocument(currentOptions.parent));
    replaceStoredValues({
      ...(currentOptions.initialValues || {}),
      ...previousValues,
      ...((nextOptions.initialValues && typeof nextOptions.initialValues === "object") ? nextOptions.initialValues : {}),
    });
    render(false);
    syncValueStoreFromRenderedFields();
    modal.update(buildModalConfig());
  }

  function getState() {
    return {
      ...modal.getState(),
      mode: currentOptions.mode,
      values: getValues(),
    };
  }

  function destroy() {
    destroyed = true;
    destroyHostedFieldInstances();
    modal.destroy();
  }

  refs.form.addEventListener("submit", async (event) => {
      const shouldClose = await handleSubmit(event);
      if (shouldClose) {
        await modal.close({
          reason: "submit",
          actionId: "submit",
          result: true,
        });
      }
    });
  render();

  modal = createActionModal({
    ...buildModalConfig(),
    onClose(meta) {
      currentOptions.onClose?.(meta);
      destroy();
    },
  });

  syncValueStoreFromRenderedFields();

  return {
    ...modal,
    update,
    getState,
    getValues,
    setValues,
    setErrors,
    clearErrors,
    setFormError,
    clearFormError,
    applyApiErrors,
    refs: {
      ...modal.refs,
      shell: refs.shell,
      form: refs.form,
      rows: refs.rows,
      hiddenFields: refs.hiddenFields,
      formError: refs.formError,
      fields,
      displays,
    },
  };

  function syncValueStoreFromRenderedFields() {
    fields.forEach((field, name) => {
      valueStore[name] = getFieldValue(field);
    });
  }

  function replaceStoredValues(nextValues = {}) {
    Object.keys(valueStore).forEach((name) => {
      delete valueStore[name];
    });
    Object.keys(nextValues || {}).forEach((name) => {
      valueStore[name] = nextValues[name];
    });
  }

  function seedStoredValuesFromInitialOptions() {
    normalizeRows(currentOptions.rows).forEach((row) => {
      row.forEach((item) => {
        if (!item || typeof item !== "object") {
          return;
        }
        const name = String(item.name || "").trim();
        if (!name || Object.prototype.hasOwnProperty.call(valueStore, name)) {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(item, "value")) {
          valueStore[name] = item.value;
        }
      });
    });
    Object.assign(valueStore, currentOptions.initialValues || {});
  }

  function computeVisibilitySignature() {
    return normalizeRows(currentOptions.rows)
      .flatMap((row, rowIndex) => row.map((item, itemIndex) => {
        const resolved = resolveItemConfig(item, valueStore);
        return `${rowIndex}:${itemIndex}:${resolved && !resolved._hiddenByRule ? "1" : "0"}`;
      }))
      .join("|");
  }
}

function resolveTargetDocument(parent) {
  if (parent && typeof parent === "object" && parent.ownerDocument) {
    return parent.ownerDocument;
  }
  return document;
}

function ensureFormModalStyles(targetDocument) {
  const doc = targetDocument && typeof targetDocument.querySelector === "function" ? targetDocument : document;
  const head = doc.head || doc.documentElement;
  if (!head) {
    return;
  }
  if (doc.querySelector('link[data-ui-bundle="ui"]')) {
    return;
  }
  FORM_MODAL_STYLE_HREFS.forEach((href) => {
    if (doc.querySelector(`link[data-ui-loader-href="${escapeCssAttribute(href)}"]`)) {
      return;
    }
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.uiLoaderHref = href;
    head.appendChild(link);
  });
}

function escapeCssAttribute(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    rows: normalizeRows(options.rows),
    initialValues: options.initialValues && typeof options.initialValues === "object" ? { ...options.initialValues } : null,
    context: options.context ?? null,
    mode: String(options.mode || "").trim(),
    extraActions: normalizeExtraActions(options.extraActions),
    extraActionsPlacement: normalizeExtraActionsPlacement(options.extraActionsPlacement),
    submitLabel: String(options.submitLabel || DEFAULT_OPTIONS.submitLabel),
    cancelLabel: String(options.cancelLabel || DEFAULT_OPTIONS.cancelLabel),
    submitVariant: normalizeSubmitVariant(options.submitVariant),
    busyMessage: String(options.busyMessage || DEFAULT_OPTIONS.busyMessage),
    manageBusyOnSubmit: options.manageBusyOnSubmit !== false,
  };
}

function normalizeExtraActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }
  return actions
    .map((action, index) => {
      if (!action || typeof action !== "object") {
        return null;
      }
      const label = String(action.label ?? "").trim();
      if (!label) {
        return null;
      }
      const id = String(action.id ?? `extra-action-${index}`);
      if (id === "cancel" || id === "submit") {
        console.warn(`[createFormModal] extraActions does not allow reserved id "${id}". Use helper-owned cancel/submit options instead.`);
        return null;
      }
      return {
        id,
        label,
        variant: String(action.variant || "default"),
        className: String(action.className || "").trim(),
        icon: action.icon ? String(action.icon) : "",
        iconPosition: String(action.iconPosition || "start").toLowerCase() === "end" ? "end" : "start",
        iconOnly: Boolean(action.iconOnly),
        ariaLabel: String(action.ariaLabel || "").trim(),
        busyMessage: String(action.busyMessage || "").trim(),
        onClick: typeof action.onClick === "function" ? action.onClick : null,
        closeOnClick: action.closeOnClick === true,
        disabled: Boolean(action.disabled),
        autoFocus: Boolean(action.autoFocus),
      };
    })
    .filter(Boolean);
}

function normalizeExtraActionsPlacement(value) {
  const normalized = String(value || DEFAULT_OPTIONS.extraActionsPlacement).trim().toLowerCase();
  return normalized === "start" ? "start" : "end";
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => (Array.isArray(row) ? row.filter(Boolean) : []))
    .filter((row) => row.length);
}

function normalizeOptionsList(options) {
  if (!Array.isArray(options)) {
    return [];
  }
  return options
    .map((option) => {
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
    })
    .filter(Boolean);
}

function normalizeContext(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const kind = String(value.kind || "badge-summary").trim().toLowerCase();
  const badge = String(value.badge || "").trim();
  const summary = String(value.summary || "").trim();
  if (!badge && !summary) {
    return null;
  }
  return {
    kind,
    badge,
    summary,
  };
}

function normalizeSubmitVariant(value) {
  const variant = String(value || "primary").trim().toLowerCase();
  return variant === "danger" ? "danger" : "primary";
}

function normalizeInputType(value) {
  const input = String(value || "text").trim().toLowerCase();
  if (["text", "email", "password", "number", "date", "url", "search"].includes(input)) {
    return input;
  }
  return "text";
}

function normalizeAvatarPreviewUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTone(value) {
  const tone = String(value || "info").trim().toLowerCase();
  if (tone === "danger" || tone === "warning" || tone === "success" || tone === "info") {
    return tone;
  }
  return "info";
}

function normalizeSpan(value) {
  return Number(value) === 2 ? 2 : 1;
}

function normalizeTypeClass(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function normalizeModeList(value) {
  if (value == null) {
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function resolveModeFlag(list, mode) {
  const normalized = normalizeModeList(list);
  if (!normalized.length) {
    return false;
  }
  return normalized.includes(String(mode || "").trim());
}

function isVisibleRenderableItem(item) {
  return Boolean(item && !item._hiddenByRule && item.type !== "hidden");
}

function getItemClassName(baseClassName, item) {
  const classes = [baseClassName];
  if (normalizeSpan(item?.span) === 2) {
    classes.push("is-span-2");
  }
  if (item?.rowClassName) {
    classes.push(String(item.rowClassName).trim());
  }
  return classes.filter(Boolean).join(" ");
}

function resolveItemValue(item) {
  const values = item?._values;
  if (values && typeof values === "object" && Object.prototype.hasOwnProperty.call(values, item.name)) {
    return values[item.name];
  }
  if (Object.prototype.hasOwnProperty.call(item, "value")) {
    return item.value;
  }
  const initialValues = item?._initialValues;
  if (initialValues && typeof initialValues === "object" && Object.prototype.hasOwnProperty.call(initialValues, item.name)) {
    return initialValues[item.name];
  }
  return item.type === "checkbox" ? false : "";
}

function appendDescribedBy(control, id) {
  if (!control) {
    return;
  }
  const current = String(control.getAttribute("aria-describedby") || "").trim();
  const next = [current, id].filter(Boolean).join(" ");
  control.setAttribute("aria-describedby", next);
}

function normalizeItemType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "ui.treeselect" || value === "ui.tree.select") {
    return "ui.treeselect";
  }
  return value;
}

function matchesVisibleWhen(rule, values) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return true;
  }
  return Object.entries(rule).every(([name, expected]) => matchesVisibleWhenEntry(values?.[name], expected));
}

function matchesVisibleWhenEntry(actualValue, expectedValue) {
  if (Array.isArray(expectedValue)) {
    return expectedValue.some((item) => isSameValue(actualValue, item));
  }
  return isSameValue(actualValue, expectedValue);
}

function getFieldValue(field) {
  if (field.type === "ui.select") {
    return field.control?.__uiSelectInstance?.getValue?.() ?? (field.config.multiple ? [] : null);
  }
  if (field.type === "ui.treeselect") {
    return field.control?.__uiTreeSelectInstance?.getValue?.() ?? null;
  }
  if (field.type === "avatar") {
    return field.control?.__uiAvatarFieldInstance?.getValue?.() ?? null;
  }
  if (field.type === "input" && field.control?.__uiPasswordInstance) {
    return field.control.__uiPasswordInstance.getValue();
  }
  if (field.type === "checkbox") {
    return Boolean(field.control.checked);
  }
  return field.control.value;
}

function setFieldValue(field, value) {
  if (field.type === "ui.select") {
    const currentValue = field.control?.__uiSelectInstance?.getValue?.();
    if (isSameValue(currentValue, value)) {
      return;
    }
    field.control?.__uiSelectInstance?.setValue?.(value);
    return;
  }
  if (field.type === "ui.treeselect") {
    const currentValue = field.control?.__uiTreeSelectInstance?.getValue?.();
    if (isSameValue(currentValue, value)) {
      return;
    }
    field.control?.__uiTreeSelectInstance?.setValue?.(value);
    return;
  }
  if (field.type === "avatar") {
    field.control?.__uiAvatarFieldInstance?.setValue?.(value);
    return;
  }
  if (field.type === "input" && field.control?.__uiPasswordInstance) {
    field.control.__uiPasswordInstance.setValue(value == null ? "" : String(value));
    return;
  }
  if (field.type === "checkbox") {
    field.control.checked = Boolean(value);
    return;
  }
  field.control.value = value == null ? "" : String(value);
}

function getFieldAriaTarget(field) {
  if (!field) {
    return null;
  }
  if (field.type === "ui.select") {
    return field.control?.querySelector?.(".ui-select-trigger") || null;
  }
  if (field.type === "ui.treeselect") {
    return field.control?.querySelector?.(".ui-tree-select-trigger") || null;
  }
  if (field.type === "avatar") {
    return field.control?.querySelector?.(".ui-form-modal-avatar-picker") || null;
  }
  if (field.type === "input" && field.control?.__uiPasswordInstance) {
    return field.control.__uiPasswordInstance.input || null;
  }
  return field.control || null;
}

function isSameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left.map(String) : [];
    const b = Array.isArray(right) ? right.map(String) : [];
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => value === b[index]);
  }
  return String(left ?? "") === String(right ?? "");
}

function normalizeApiErrors(response) {
  const source = response?.data && typeof response.data === "object" ? response.data : response;
  const fieldErrors = {};
  let formError = "";

  const candidates = [
    source?.errors,
    source?.fieldErrors,
    source?.validation?.errors,
  ];

  candidates.forEach((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return;
    }
    Object.keys(candidate).forEach((key) => {
      const value = candidate[key];
      const message = Array.isArray(value) ? String(value[0] || "").trim() : String(value || "").trim();
      if (!message) {
        return;
      }
      if (key === "_form" || key === "form" || key === "non_field_errors") {
        if (!formError) {
          formError = message;
        }
        return;
      }
      fieldErrors[key] = message;
    });
  });

  if (!formError && source && typeof source === "object") {
    formError = String(source.formError || source.error || source.message || "").trim();
  } else if (!formError && typeof source === "string") {
    formError = source.trim();
  }

  return { fieldErrors, formError };
}






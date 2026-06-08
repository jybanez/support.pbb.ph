import { createRoot, normalizeIncidentOptions, safeArray } from "./incident.base.js";
import { createNumberStepper } from "../ui/ui.number.stepper.js";
import {
  createFieldGroup,
  parseFieldGroupValue,
  serializeFieldGroupValue,
  validateFieldGroup,
} from "../ui/ui.field.group.js";

export function incidentTypesDetailsEditor(container, data, options = {}) {
  let currentData = normalizeIncidentTypeData(data);
  let currentOptions = normalizeIncidentOptions(options);
  const listeners = [];
  const hostedInstances = [];
  let missingRequired = false;

  function bind(el, event, handler) {
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  }

  function cleanupListeners() {
    listeners.splice(0).forEach((off) => off());
    hostedInstances.splice(0).forEach((instance) => instance?.destroy?.());
  }

  function validateRequired() {
    const missing = [];
    if (!currentData || typeof currentData !== "object") {
      missing.push("data");
    }
    if (typeof currentOptions.removeIncidentType !== "function") {
      missing.push("options.removeIncidentType");
    }
    if (!currentData?.incident_type_id && !currentData?.id) {
      missing.push("data.incident_type_id");
    }
    if (missing.length) {
      console.error(`[incident.types.details.editor] Missing required input: ${missing.join(", ")}`);
      return false;
    }
    return true;
  }

  function getFieldValue(field) {
    const match = currentData.detail_entries.find((item) => item?.field_key === getFieldKey(field));
    if (!match) {
      if (field?.default_value !== null && field?.default_value !== undefined && field?.default_value !== "") {
        return String(field.default_value);
      }
      return "";
    }
    return String(match?.field_value ?? "");
  }

  function setFieldValue(field, value) {
    const fieldKey = getFieldKey(field);
    if (!fieldKey) {
      return;
    }
    const entryIndex = currentData.detail_entries.findIndex((item) => item?.field_key === fieldKey);
    if (entryIndex >= 0) {
      currentData.detail_entries[entryIndex] = {
        ...currentData.detail_entries[entryIndex],
        field_key: fieldKey,
        field_label: getFieldLabel(field, currentData.detail_entries[entryIndex]?.field_label || fieldKey),
        field_value: value,
      };
      return;
    }
    currentData.detail_entries.push({
      incident_id: currentData.incident_id,
      incident_type_id: currentData.incident_type_id,
      field_key: fieldKey,
      field_label: getFieldLabel(field, fieldKey),
      field_value: value,
    });
  }

  function getResourceQuantity(resourceTypeId) {
    const match = currentData.resources_needed.find(
      (item) => String(item?.resource_type_id) === String(resourceTypeId)
    );
    if (!match) {
      return 0;
    }
    const value = Number(match?.quantity_needed);
    return Number.isFinite(value) ? value : 0;
  }

  function setResourceQuantity(resourceTypeId, quantityNeeded) {
    const idx = currentData.resources_needed.findIndex(
      (item) => String(item?.resource_type_id) === String(resourceTypeId)
    );
    if (idx >= 0) {
      currentData.resources_needed[idx] = {
        ...currentData.resources_needed[idx],
        resource_type_id: resourceTypeId,
        quantity_needed: quantityNeeded,
      };
      return;
    }
    currentData.resources_needed.push({
      incident_id: currentData.incident_id,
      incident_type_id: currentData.incident_type_id,
      resource_type_id: resourceTypeId,
      quantity_needed: quantityNeeded,
    });
  }

  function emitItemChange(reason, meta = {}) {
    currentOptions.onItemChange?.(cloneData(currentData), {
      reason,
      localStateChanged: true,
      ...meta,
    });
  }

  function createFieldInput(field, value) {
    const inputType = getFieldType(field);
    if (inputType === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.className = "hh-input ui-input";
      textarea.value = value;
      return textarea;
    }

    if (inputType === "select") {
      const select = document.createElement("select");
      select.className = "hh-input ui-input";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select";
      select.appendChild(placeholder);
      safeArray(field?.options).forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt);
        option.textContent = String(opt);
        select.appendChild(option);
      });
      select.value = value;
      return select;
    }

    if (inputType === "multiselect") {
      const wrap = document.createElement("div");
      wrap.className = "hh-multiselect";
      const selected = new Set(
        String(value || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      );
      safeArray(field?.options).forEach((opt) => {
        const optionWrap = document.createElement("label");
        optionWrap.className = "hh-multiselect-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "hh-multiselect-checkbox";
        checkbox.value = String(opt);
        checkbox.checked = selected.has(String(opt));

        const text = document.createElement("span");
        text.textContent = String(opt);

        optionWrap.append(checkbox, text);
        wrap.appendChild(optionWrap);
      });
      return wrap;
    }

    const input = document.createElement("input");
    input.className = "hh-input ui-input";
    input.type = inputType === "number" ? "number" : "text";
    input.value = value;
    if (field?.placeholder) {
      input.placeholder = String(field.placeholder);
    }
    if (input.type === "number") {
      if (field?.min !== null && field?.min !== undefined && field?.min !== "") {
        input.min = String(field.min);
      }
      if (field?.max !== null && field?.max !== undefined && field?.max !== "") {
        input.max = String(field.max);
      }
      if (field?.step !== null && field?.step !== undefined && field?.step !== "") {
        input.step = String(field.step);
      }
    }
    return input;
  }

  function getInputValue(input, field) {
    const inputType = getFieldType(field);
    if (inputType === "multiselect") {
      return safeArray(input?.querySelectorAll('input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.value)
        .join(",");
    }
    return input?.value ?? "";
  }

  function renderGroupField(row, field) {
    const groupHost = document.createElement("div");
    groupHost.className = "hh-field-group-host";
    const instance = createFieldGroup(groupHost, {
      ...field,
      name: getFieldKey(field),
      chrome: false,
      value: parseFieldGroupValue(field, getFieldValue(field)),
      onChange(nextValue) {
        const serialized = serializeFieldGroupValue(field, nextValue);
        setFieldValue(field, serialized);
        currentOptions.onFieldChange?.(currentData.incident_type_id, getFieldKey(field), serialized);
        emitItemChange("field", {
          fieldKey: getFieldKey(field),
          value: serialized,
        });
      },
    });
    hostedInstances.push(instance);
    row.appendChild(groupHost);
  }

  function createFieldLabelWrap(field) {
    const labelWrap = document.createElement("div");
    labelWrap.className = "hh-field-label-wrap";

    const label = document.createElement("label");
    label.className = "hh-field-label";
    label.textContent = getFieldLabel(field, getFieldKey(field) || "Field");
    labelWrap.appendChild(label);

    const controls = document.createElement("span");
    controls.className = "hh-field-label-controls";

    if (isRequiredField(field)) {
      const required = document.createElement("span");
      required.className = "hh-required";
      required.textContent = "Required";
      controls.appendChild(required);
    }

    const warning = document.createElement("span");
    warning.className = "hh-field-warning-badge";
    warning.textContent = "!";
    warning.hidden = true;
    warning.setAttribute("aria-hidden", "true");
    controls.appendChild(warning);

    if (controls.childElementCount) {
      labelWrap.appendChild(controls);
    }

    return labelWrap;
  }

  function renderHeader(root) {
    const header = document.createElement("header");
    header.className = "hh-type-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "hh-type-title-wrap";
    const title = document.createElement("h4");
    title.className = "hh-title ui-title";
    title.textContent = currentData.name || `Incident Type #${currentData.incident_type_id ?? currentData.id ?? "-"}`;
    titleWrap.appendChild(title);

    if (currentData.incident_type_category_name) {
      const subtitle = document.createElement("p");
      subtitle.className = "hh-meta";
      subtitle.textContent = currentData.incident_type_category_name;
      titleWrap.appendChild(subtitle);
    }

    if (currentData.description) {
      const description = document.createElement("p");
      description.className = "hh-description";
      description.textContent = currentData.description;
      titleWrap.appendChild(description);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "hh-remove";
    removeBtn.setAttribute("aria-label", "Remove incident type");
    removeBtn.innerHTML = '<span aria-hidden="true">\u2715</span>';
    bind(removeBtn, "click", () => {
      currentOptions.removeIncidentType?.(cloneData(currentData));
      currentOptions.onItemChange?.(cloneData(currentData), {
        reason: "remove",
        localStateChanged: false,
      });
    });

    header.append(titleWrap, removeBtn);
    root.appendChild(header);
  }

  function renderFieldsSection(root) {
    const fields = [...safeArray(currentData.fields)].sort(
      (a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
    );
    if (!fields.length) {
      return;
    }

    const section = document.createElement("section");
    section.className = "hh-type-section";

    const sectionTitle = document.createElement("h5");
    sectionTitle.className = "hh-title ui-title";
    sectionTitle.textContent = "Fields";
    section.appendChild(sectionTitle);

    const grid = document.createElement("div");
    grid.className = "hh-field-grid";
    fields.forEach((field) => {
      const row = document.createElement("div");
      row.className = "hh-field-row";
      row.dataset.fieldKey = getFieldKey(field);

      if (getFieldType(field) === "group") {
        row.appendChild(createFieldLabelWrap(field));
        renderGroupField(row, field);
        grid.appendChild(row);
        return;
      }

      const labelWrap = createFieldLabelWrap(field);

      const input = createFieldInput(field, getFieldValue(field));
      if (isRequiredField(field) && getFieldType(field) !== "multiselect") {
        input.required = true;
      }

      const refreshValidation = () => {
        applyFieldValidationState(row, input, field, getInputValue(input, field));
      };

      bind(input, "change", () => {
        const value = getInputValue(input, field);
        setFieldValue(field, value);
        currentOptions.onFieldChange?.(currentData.incident_type_id, getFieldKey(field), value);
        emitItemChange("field", {
          fieldKey: getFieldKey(field),
          value,
        });
        refreshValidation();
      });
      if (!["select", "multiselect"].includes(getFieldType(field))) {
        bind(input, "input", () => {
          const value = getInputValue(input, field);
          setFieldValue(field, value);
          currentOptions.onFieldChange?.(currentData.incident_type_id, getFieldKey(field), value);
          emitItemChange("field", {
            fieldKey: getFieldKey(field),
            value,
          });
          refreshValidation();
        });
      }

      row.append(labelWrap, input);
      refreshValidation();
      grid.appendChild(row);
    });

    section.appendChild(grid);
    root.appendChild(section);
  }

  function renderResourcesSection(root) {
    const resources = safeArray(currentData.resources);
    if (!resources.length) {
      return;
    }

    const section = document.createElement("section");
    section.className = "hh-type-section";

    const title = document.createElement("h5");
    title.className = "hh-title ui-title";
    title.textContent = "Resources Needed";
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "hh-resource-grid";

    resources.forEach((resource) => {
      const resourceTypeId = resource?.id ?? resource?.resource_type_id;
      const row = document.createElement("div");
      row.className = "hh-resource-row";

      const label = document.createElement("label");
      label.className = "hh-field-label";
      label.textContent = resource?.name || resource?.resource_type?.name || `Resource #${resourceTypeId ?? "-"}`;

      const stepperHost = document.createElement("div");
      stepperHost.className = "hh-resource-stepper";
      createNumberStepper(stepperHost, {
        value: getResourceQuantity(resourceTypeId),
        min: 0,
        step: 1,
        decimals: 0,
        ariaLabel: `${label.textContent} quantity needed`,
        decrementLabel: `Decrease ${label.textContent}`,
        incrementLabel: `Increase ${label.textContent}`,
        onChange(value) {
          const next = Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
          setResourceQuantity(resourceTypeId, next);
          currentOptions.onResourceChange?.(currentData.incident_type_id, resourceTypeId, next);
          emitItemChange("resource", {
            resourceTypeId,
            quantityNeeded: next,
          });
        },
      });

      row.append(label, stepperHost);
      grid.appendChild(row);
    });

    section.appendChild(grid);
    root.appendChild(section);
  }

  function render() {
    const root = createRoot(container, "hh-incident-types-details-editor", currentOptions);
    if (!root) {
      return;
    }

    cleanupListeners();
    missingRequired = !validateRequired();
    if (missingRequired) {
      return;
    }

    renderHeader(root);
    renderFieldsSection(root);
    renderResourcesSection(root);
  }

  function validate() {
    if (missingRequired) {
      return {
        status: false,
        errors: [{ field_key: "_instance", error: "Missing required data/options" }],
      };
    }

    const errors = [];
    const fields = safeArray(currentData.fields);
    const entryMap = safeArray(currentData.detail_entries).reduce((acc, entry) => {
      acc[String(entry?.field_key || "")] = String(entry?.field_value ?? "");
      return acc;
    }, {});

    fields.forEach((field) => {
      const fieldKey = getFieldKey(field);
      const value = entryMap[fieldKey] ?? "";
      const inputType = getFieldType(field);
      if (inputType === "group") {
        errors.push(...validateFieldGroup({ ...field, name: fieldKey }, parseFieldGroupValue(field, value)).errors);
        return;
      }

      const fieldError = getScalarFieldValidationMessage(field, value);
      if (fieldError) {
        errors.push({ field_key: fieldKey, error: fieldError });
        const row = findFieldRow(container, fieldKey);
        const input = row?.querySelector?.(".hh-input, .hh-multiselect");
        if (row && input) {
          applyFieldValidationState(row, input, field, value);
        }
      }
    });

    safeArray(currentData.resources_needed).forEach((resource) => {
      const qty = Number(resource?.quantity_needed);
      if (!Number.isFinite(qty) || qty < 0) {
        errors.push({
          field_key: `resource:${resource?.resource_type_id ?? "unknown"}`,
          error: "quantity_needed must be a number >= 0",
        });
      }
    });

    return {
      status: errors.length === 0,
      errors,
    };
  }

  render();

  return {
    destroy() {
      cleanupListeners();
      if (container && container.nodeType === 1) {
        container.innerHTML = "";
      }
    },
    update(nextData, nextOptions = {}) {
      currentData = normalizeIncidentTypeData(nextData);
      currentOptions = normalizeIncidentOptions({ ...currentOptions, ...nextOptions });
      render();
    },
    getData() {
      return cloneData(currentData);
    },
    validate,
    isValid() {
      return validate().status;
    },
  };
}

function normalizeIncidentTypeData(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    id: source.id ?? null,
    _client_key: source._client_key ?? source.client_key ?? null,
    incident_id: source.incident_id ?? null,
    incident_type_id: source.incident_type_id ?? source.id ?? null,
    incident_type_category_id: source.incident_type_category_id ?? null,
    incident_type_category_name: source.incident_type_category_name ?? source.category_name ?? "",
    name: source.name ?? "",
    description: source.description ?? "",
    fields: safeArray(source.fields),
    detail_entries: safeArray(source.detail_entries).map((item) => ({ ...item })),
    resources: safeArray(source.resources).map((item) => ({ ...item })),
    resources_needed: safeArray(source.resources_needed).map((item) => ({ ...item })),
  };
}

function cloneData(value) {
  try {
    return structuredClone(value);
  } catch (_) {
    return JSON.parse(JSON.stringify(value));
  }
}

function getFieldKey(field) {
  return String(field?.field_key ?? field?.key ?? "");
}

function getFieldLabel(field, fallback = "Field") {
  return String(field?.field_label ?? field?.label ?? fallback);
}

function getFieldType(field) {
  return String(field?.input_type ?? field?.type ?? "text").toLowerCase();
}

function isRequiredField(field) {
  return Boolean(field?.is_required ?? field?.required);
}

function getScalarFieldValidationMessage(field, value) {
  const inputType = getFieldType(field);
  if (inputType === "group") {
    return "";
  }
  const trimmed = String(value ?? "").trim();
  if (isRequiredField(field) && !trimmed) {
    return "Required value is missing";
  }
  if (inputType === "number" && trimmed) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return "Value must be a valid number";
    }
    if (field?.min !== null && field?.min !== undefined && field?.min !== "" && numeric < Number(field.min)) {
      return `Value must be >= ${field.min}`;
    }
    if (field?.max !== null && field?.max !== undefined && field?.max !== "" && numeric > Number(field.max)) {
      return `Value must be <= ${field.max}`;
    }
  }
  return "";
}

function applyFieldValidationState(row, input, field, value) {
  if (!row || !input) {
    return;
  }
  const message = getScalarFieldValidationMessage(field, value);
  row.classList.toggle("has-warning", Boolean(message));
  if (message) {
    row.dataset.validationState = "warning";
    input.setAttribute("aria-invalid", "true");
  } else {
    delete row.dataset.validationState;
    input.removeAttribute("aria-invalid");
  }

  const badge = row.querySelector(".hh-field-warning-badge");
  if (badge) {
    badge.hidden = !message;
    badge.title = message;
    badge.setAttribute("aria-label", message || "");
  }
}

function findFieldRow(root, fieldKey) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return null;
  }
  return Array.from(root.querySelectorAll("[data-field-key]")).find(
    (row) => row.getAttribute("data-field-key") === fieldKey
  ) || null;
}

function isRepeatableGroup(field) {
  return Boolean(field?.repeatable ?? field?.multiple);
}

function normalizeChildFields(field) {
  return safeArray(field?.fields).map((child, index) => ({
    sort_order: index + 1,
    ...child,
  })).sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
}

function isEmptyGroupItem(item, childFields) {
  if (!item || typeof item !== "object") {
    return true;
  }
  return childFields.every((child) => !String(item[getFieldKey(child)] ?? "").trim());
}

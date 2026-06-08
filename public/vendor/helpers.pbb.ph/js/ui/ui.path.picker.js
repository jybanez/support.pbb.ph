import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  value: "",
  mode: "file",
  label: "",
  help: "",
  placeholder: "",
  name: "",
  id: "",
  className: "",
  accept: "",
  extensions: [],
  required: false,
  disabled: false,
  readonly: false,
  browseLabel: "",
  clearLabel: "Clear path",
  showClear: true,
  validateOnChange: true,
  validationTone: "warning",
  browseUnavailableText: "No path picker adapter is configured.",
  requiredMessage: "Path is required.",
  extensionMessage: "",
  ariaLabel: "Path",
  describedBy: "",
  pickPath: null,
  pickFile: null,
  pickFolder: null,
  validatePath: null,
  onBrowse: null,
  onChange: null,
  onValidate: null,
  onError: null,
};

export function createPathPicker(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error("createPathPicker(container, options) requires a valid container element.");
  }

  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let validationToken = 0;
  let lastValidation = { status: true, tone: "", message: "" };
  let root = null;
  let labelEl = null;
  let input = null;
  let browseButton = null;
  let clearButton = null;
  let statusEl = null;
  let helpEl = null;

  function render() {
    events.clear();
    clearNode(container);

    root = createElement("div", {
      className: ["ui-path-picker", currentOptions.className].filter(Boolean).join(" "),
    });
    root.dataset.mode = currentOptions.mode;

    if (currentOptions.label || currentOptions.required) {
      const labelRow = createElement("div", { className: "ui-path-picker-label-row" });
      labelEl = createElement("label", {
        className: "ui-label ui-path-picker-label",
        text: currentOptions.label || currentOptions.ariaLabel,
      });
      if (currentOptions.id) {
        labelEl.setAttribute("for", currentOptions.id);
      }
      labelRow.appendChild(labelEl);
      if (currentOptions.required) {
        labelRow.appendChild(createElement("span", {
          className: "ui-path-picker-required",
          text: "Required",
        }));
      }
      root.appendChild(labelRow);
    }

    const control = createElement("div", { className: "ui-path-picker-control" });
    input = createElement("input", {
      className: "ui-input ui-path-picker-input",
      attrs: {
        type: "text",
        value: currentOptions.value,
        spellcheck: "false",
        ...(currentOptions.id ? { id: currentOptions.id } : {}),
        ...(currentOptions.name ? { name: currentOptions.name } : {}),
        ...(currentOptions.placeholder ? { placeholder: currentOptions.placeholder } : {}),
        ...(currentOptions.required ? { required: "required" } : {}),
        ...(currentOptions.disabled ? { disabled: "disabled" } : {}),
        ...(currentOptions.readonly ? { readonly: "readonly" } : {}),
        ...(currentOptions.ariaLabel ? { "aria-label": currentOptions.ariaLabel } : {}),
      },
    });

    browseButton = createElement("button", {
      className: "ui-button ui-path-picker-browse",
      text: getBrowseLabel(),
      attrs: {
        type: "button",
        "aria-label": getBrowseLabel(),
        ...(currentOptions.disabled || currentOptions.readonly ? { disabled: "disabled" } : {}),
      },
    });

    clearButton = createElement("button", {
      className: "ui-button ui-button-ghost ui-path-picker-clear",
      text: "Clear",
      attrs: {
        type: "button",
        "aria-label": currentOptions.clearLabel,
        ...(currentOptions.disabled || currentOptions.readonly ? { disabled: "disabled" } : {}),
      },
    });

    control.append(input, browseButton);
    if (currentOptions.showClear) {
      control.appendChild(clearButton);
    }
    root.appendChild(control);

    statusEl = createElement("p", {
      className: "ui-path-picker-status",
      attrs: {
        role: "status",
        "aria-live": "polite",
      },
    });
    statusEl.hidden = true;
    root.appendChild(statusEl);

    if (currentOptions.help) {
      helpEl = createElement("p", {
        className: "ui-path-picker-help",
        text: currentOptions.help,
      });
      root.appendChild(helpEl);
    }

    applyDescribedBy();
    bindEvents();
    syncClearButton();
    container.appendChild(root);
    void validate({ source: "render", silent: true });
  }

  function bindEvents() {
    events.on(input, "input", () => {
      currentOptions.value = input.value;
      currentOptions.onChange?.(currentOptions.value, { source: "input", api });
      syncClearButton();
      if (currentOptions.validateOnChange) {
        void validate({ source: "input" });
      }
    });
    events.on(input, "change", () => {
      currentOptions.value = input.value;
      currentOptions.onChange?.(currentOptions.value, { source: "change", api });
      syncClearButton();
      if (currentOptions.validateOnChange) {
        void validate({ source: "change" });
      }
    });
    events.on(browseButton, "click", () => void browse());
    if (clearButton) {
      events.on(clearButton, "click", () => {
        setValue("", { source: "clear" });
        input.focus();
      });
    }
  }

  async function browse() {
    if (currentOptions.disabled || currentOptions.readonly) {
      return null;
    }
    const picker = getPicker();
    if (!picker) {
      const result = setStatus(currentOptions.browseUnavailableText, currentOptions.validationTone);
      currentOptions.onError?.(new Error(currentOptions.browseUnavailableText), { source: "browse", api });
      return result;
    }

    browseButton.disabled = true;
    root?.classList.add("is-browsing");
    try {
      const picked = await picker({
        mode: currentOptions.mode,
        value: currentOptions.value,
        accept: currentOptions.accept,
        extensions: [...currentOptions.extensions],
        api,
      });
      const nextPath = normalizePickerResult(picked);
      currentOptions.onBrowse?.(nextPath, { source: "browse", raw: picked, api });
      if (!nextPath) {
        return null;
      }
      setValue(nextPath, { source: "browse" });
      return nextPath;
    } catch (error) {
      const message = String(error?.message || error || "Unable to choose path.");
      setStatus(message, "error");
      currentOptions.onError?.(error, { source: "browse", api });
      return null;
    } finally {
      root?.classList.remove("is-browsing");
      browseButton.disabled = currentOptions.disabled || currentOptions.readonly;
    }
  }

  async function validate(meta = {}) {
    const token = ++validationToken;
    const result = await getValidationResult(currentOptions.value, meta);
    if (token !== validationToken) {
      return lastValidation;
    }
    lastValidation = result;
    applyValidation(result, meta);
    currentOptions.onValidate?.(result, { ...meta, api });
    return result;
  }

  async function getValidationResult(value, meta = {}) {
    const local = getLocalValidation(value);
    if (!local.status) {
      return local;
    }
    if (typeof currentOptions.validatePath !== "function" || !String(value || "").trim()) {
      return local;
    }
    try {
      return normalizeValidationResult(await currentOptions.validatePath(value, {
        mode: currentOptions.mode,
        source: meta.source || "validate",
        api,
      }));
    } catch (error) {
      return {
        status: false,
        tone: "error",
        message: String(error?.message || error || "Path validation failed."),
      };
    }
  }

  function getLocalValidation(value) {
    const trimmed = String(value || "").trim();
    if (currentOptions.required && !trimmed) {
      return { status: false, tone: currentOptions.validationTone, message: currentOptions.requiredMessage };
    }
    if (trimmed && currentOptions.mode !== "folder" && currentOptions.extensions.length && !matchesExtension(trimmed, currentOptions.extensions)) {
      return {
        status: false,
        tone: currentOptions.validationTone,
        message: currentOptions.extensionMessage || `Expected ${formatExtensions(currentOptions.extensions)}.`,
      };
    }
    return { status: true, tone: "", message: "" };
  }

  function applyValidation(result, meta = {}) {
    const invalid = !result.status;
    root?.classList.toggle("is-invalid", invalid);
    root?.classList.toggle("is-warning", invalid && result.tone === "warning");
    root?.classList.toggle("is-error", invalid && result.tone === "error");
    root?.classList.toggle("is-valid", Boolean(result.status && result.message));
    if (invalid) {
      input?.setAttribute("aria-invalid", "true");
    } else {
      input?.removeAttribute("aria-invalid");
    }
    if (!statusEl) {
      return;
    }
    statusEl.hidden = Boolean(meta.silent && !result.message) || !result.message;
    statusEl.textContent = result.message || "";
    statusEl.dataset.tone = result.tone || (result.status ? "success" : "warning");
  }

  function setStatus(message, tone = "info") {
    validationToken += 1;
    const result = { status: tone !== "error" && tone !== "warning", tone: normalizeTone(tone), message: String(message || "") };
    lastValidation = result;
    applyValidation(result);
    return result;
  }

  function clearStatus() {
    validationToken += 1;
    lastValidation = { status: true, tone: "", message: "" };
    applyValidation(lastValidation, { silent: true });
  }

  function setValue(value, meta = {}) {
    currentOptions.value = value == null ? "" : String(value);
    if (input) {
      input.value = currentOptions.value;
    }
    currentOptions.onChange?.(currentOptions.value, { source: meta.source || "setValue", api });
    syncClearButton();
    if (currentOptions.validateOnChange || meta.validate) {
      void validate({ source: meta.source || "setValue" });
    }
  }

  function getValue() {
    return input?.value ?? currentOptions.value;
  }

  function focus() {
    input?.focus();
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({
      ...currentOptions,
      ...(nextOptions || {}),
      value: Object.prototype.hasOwnProperty.call(nextOptions, "value") ? nextOptions.value : currentOptions.value,
    });
    render();
  }

  function destroy() {
    events.clear();
    clearNode(container);
  }

  function getPicker() {
    if (currentOptions.mode === "folder" && typeof currentOptions.pickFolder === "function") {
      return currentOptions.pickFolder;
    }
    if ((currentOptions.mode === "file" || currentOptions.mode === "save-file") && typeof currentOptions.pickFile === "function") {
      return currentOptions.pickFile;
    }
    if (typeof currentOptions.pickPath === "function") {
      return currentOptions.pickPath;
    }
    return null;
  }

  function getBrowseLabel() {
    if (currentOptions.browseLabel) {
      return currentOptions.browseLabel;
    }
    if (currentOptions.mode === "folder") {
      return "Choose folder";
    }
    if (currentOptions.mode === "save-file") {
      return "Choose output file";
    }
    return "Choose file";
  }

  function syncClearButton() {
    if (clearButton) {
      clearButton.hidden = !currentOptions.showClear || !String(currentOptions.value || "").length;
    }
  }

  function applyDescribedBy() {
    const ids = [currentOptions.describedBy];
    if (helpEl) {
      helpEl.id = helpEl.id || `${currentOptions.id || "ui-path-picker"}-help-${Math.random().toString(36).slice(2, 8)}`;
      ids.push(helpEl.id);
    }
    if (statusEl) {
      statusEl.id = statusEl.id || `${currentOptions.id || "ui-path-picker"}-status-${Math.random().toString(36).slice(2, 8)}`;
      ids.push(statusEl.id);
    }
    const describedBy = ids.map((item) => String(item || "").trim()).filter(Boolean).join(" ");
    if (describedBy) {
      input?.setAttribute("aria-describedby", describedBy);
    } else {
      input?.removeAttribute("aria-describedby");
    }
  }

  const api = {
    get root() { return root; },
    get input() { return input; },
    get browseButton() { return browseButton; },
    get clearButton() { return clearButton; },
    get statusEl() { return statusEl; },
    getValue,
    setValue,
    browse,
    validate,
    setStatus,
    clearStatus,
    focus,
    update,
    destroy,
  };

  render();
  container.__uiPathPickerInstance = api;
  return api;
}

function normalizeOptions(options = {}) {
  const mode = normalizeMode(options.mode);
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    mode,
    value: options.value == null ? "" : String(options.value),
    label: String(options.label || ""),
    help: String(options.help || ""),
    placeholder: String(options.placeholder || ""),
    name: String(options.name || ""),
    id: String(options.id || ""),
    className: String(options.className || ""),
    accept: String(options.accept || ""),
    extensions: normalizeExtensions(options.extensions, options.accept),
    browseLabel: String(options.browseLabel || ""),
    clearLabel: String(options.clearLabel || DEFAULT_OPTIONS.clearLabel),
    validationTone: normalizeTone(options.validationTone || DEFAULT_OPTIONS.validationTone),
    browseUnavailableText: String(options.browseUnavailableText || DEFAULT_OPTIONS.browseUnavailableText),
    requiredMessage: String(options.requiredMessage || DEFAULT_OPTIONS.requiredMessage),
    extensionMessage: String(options.extensionMessage || ""),
    ariaLabel: String(options.ariaLabel || options.label || DEFAULT_OPTIONS.ariaLabel),
    describedBy: String(options.describedBy || ""),
    required: Boolean(options.required),
    disabled: Boolean(options.disabled),
    readonly: Boolean(options.readonly),
    showClear: options.showClear !== false,
    validateOnChange: options.validateOnChange !== false,
  };
}

function normalizeMode(value) {
  const mode = String(value || DEFAULT_OPTIONS.mode).toLowerCase();
  if (mode === "folder" || mode === "directory") {
    return "folder";
  }
  if (mode === "save-file" || mode === "save_file" || mode === "save") {
    return "save-file";
  }
  return "file";
}

function normalizeExtensions(extensions, accept) {
  const values = Array.isArray(extensions) && extensions.length
    ? extensions
    : String(accept || "").split(",");
  return values
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => item.startsWith("."))
    .map((item) => item.replace(/^\.+/, "."));
}

function matchesExtension(path, extensions) {
  const normalized = String(path || "").toLowerCase();
  return extensions.some((extension) => normalized.endsWith(extension));
}

function formatExtensions(extensions) {
  return extensions.join(", ");
}

function normalizeTone(value) {
  const tone = String(value || "").toLowerCase();
  return ["info", "success", "warning", "error"].includes(tone) ? tone : "info";
}

function normalizeValidationResult(result) {
  if (result === true || result == null) {
    return { status: true, tone: "", message: "" };
  }
  if (result === false) {
    return { status: false, tone: "warning", message: "Path validation failed." };
  }
  if (typeof result === "string") {
    return { status: false, tone: "warning", message: result };
  }
  if (typeof result === "object") {
    const explicitStatus = result.status ?? result.valid ?? true;
    const status = typeof explicitStatus === "string"
      ? !["false", "invalid", "error", "warning"].includes(explicitStatus.toLowerCase())
      : Boolean(explicitStatus);
    return {
      status,
      tone: normalizeTone(result.tone || result.variant || (status ? "success" : "warning")),
      message: String(result.message || result.error || result.warning || ""),
    };
  }
  return { status: true, tone: "", message: "" };
}

function normalizePickerResult(result) {
  if (result == null || result === false) {
    return "";
  }
  if (typeof result === "string") {
    return result;
  }
  if (typeof result === "object") {
    return String(result.path ?? result.value ?? result.filePath ?? result.folderPath ?? "");
  }
  return String(result);
}

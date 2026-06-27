import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createIcon } from "./ui.icons.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "File input",
  label: "",
  buttonLabel: "Choose file",
  clearLabel: "Clear",
  emptyText: "No file selected",
  helperText: "",
  dropText: "Drop files here",
  pasteText: "Paste files while this control is focused.",
  accept: "",
  allowedTypes: null,
  multiple: false,
  capture: null,
  disabled: false,
  required: false,
  maxFiles: 20,
  maxFileSize: 25 * 1024 * 1024,
  showClear: true,
  enableDrop: true,
  enablePaste: true,
  preview: "none",
  previewUrl: "",
  previewAlt: "Selected file preview",
  icon: "data.upload",
  onChange: null,
  onError: null,
  onClear: null,
};

export function createFileInput(container, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let files = [];
  let objectUrl = "";
  let refs = {};

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    revokeObjectUrl();
    events.clear();
    clearNode(container);
    refs = {};

    const root = createElement("div", {
      className: [
        "ui-file-input",
        currentOptions.className,
        currentOptions.disabled ? "is-disabled" : "",
        currentOptions.enableDrop ? "has-drop" : "",
        files.length ? "has-files" : "",
      ].filter(Boolean).join(" "),
      attrs: {
        "aria-label": currentOptions.ariaLabel,
        ...(currentOptions.enablePaste ? { tabindex: "0" } : {}),
      },
    });

    if (currentOptions.enablePaste) {
      events.on(root, "paste", handlePaste);
    }

    const input = createElement("input", {
      className: "ui-file-input-native",
      attrs: buildInputAttrs(),
    });
    events.on(input, "change", () => {
      selectFiles(Array.from(input.files || []), "picker");
      input.value = "";
    });
    refs.input = input;
    root.appendChild(input);

    if (currentOptions.label) {
      root.appendChild(createElement("div", {
        className: "ui-file-input-label",
        text: currentOptions.label,
      }));
    }

    const body = createElement("div", {
      className: "ui-file-input-body",
      attrs: {
        ...(currentOptions.enableDrop ? { role: "button", "aria-label": currentOptions.dropText } : {}),
      },
    });
    if (currentOptions.enableDrop) {
      body.setAttribute("tabindex", currentOptions.disabled ? "-1" : "0");
      events.on(body, "click", () => open());
      events.on(body, "keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        open();
      });
      events.on(body, "dragover", handleDragOver);
      events.on(body, "dragleave", handleDragLeave);
      events.on(body, "drop", handleDrop);
    }

    const preview = buildPreview();
    if (preview) {
      body.appendChild(preview);
    }

    const content = createElement("div", { className: "ui-file-input-content" });
    content.appendChild(createElement("div", {
      className: "ui-file-input-summary",
      text: summarizeFiles(),
    }));
    if (currentOptions.enableDrop || currentOptions.enablePaste) {
      content.appendChild(createElement("div", {
        className: "ui-file-input-hint",
        text: [
          currentOptions.enableDrop ? currentOptions.dropText : "",
          currentOptions.enablePaste ? currentOptions.pasteText : "",
        ].filter(Boolean).join(" "),
      }));
    }
    body.appendChild(content);

    const actions = createElement("div", { className: "ui-file-input-actions" });
    const choose = createElement("button", {
      className: "ui-button ui-file-input-button",
      attrs: {
        type: "button",
        ...(currentOptions.disabled ? { disabled: "disabled" } : {}),
      },
    });
    appendIcon(choose, currentOptions.icon);
    choose.appendChild(createElement("span", { text: currentOptions.buttonLabel }));
    events.on(choose, "click", () => open());
    refs.button = choose;
    actions.appendChild(choose);

    if (currentOptions.showClear) {
      const clearButton = createElement("button", {
        className: "ui-button ui-button-ghost ui-file-input-clear",
        text: currentOptions.clearLabel,
        attrs: {
          type: "button",
          ...(currentOptions.disabled || !files.length ? { disabled: "disabled" } : {}),
        },
      });
      events.on(clearButton, "click", () => clear({ source: "clear" }));
      refs.clearButton = clearButton;
      actions.appendChild(clearButton);
    }

    root.append(body, actions);

    if (currentOptions.helperText) {
      root.appendChild(createElement("div", {
        className: "ui-file-input-helper",
        text: currentOptions.helperText,
      }));
    }

    container.appendChild(root);
    refs.root = root;
    refs.body = body;
  }

  function buildInputAttrs() {
    return {
      type: "file",
      tabindex: "-1",
      "aria-hidden": "true",
      ...(currentOptions.accept ? { accept: currentOptions.accept } : {}),
      ...(currentOptions.multiple ? { multiple: "multiple" } : {}),
      ...(currentOptions.capture ? { capture: currentOptions.capture } : {}),
      ...(currentOptions.disabled ? { disabled: "disabled" } : {}),
    };
  }

  function buildPreview() {
    const mode = String(currentOptions.preview || "none");
    if (mode === "none") {
      return null;
    }
    const wrap = createElement("div", {
      className: [
        "ui-file-input-preview",
        `is-${mode}`,
      ].join(" "),
    });
    const previewUrl = resolvePreviewUrl();
    if (previewUrl) {
      wrap.appendChild(createElement("img", {
        attrs: {
          src: previewUrl,
          alt: currentOptions.previewAlt,
          draggable: "false",
        },
      }));
      return wrap;
    }
    const iconName = mode === "avatar" ? "people.user" : mode === "image" ? "media.image" : currentOptions.icon;
    appendIcon(wrap, iconName, "ui-file-input-preview-icon");
    return wrap;
  }

  function resolvePreviewUrl() {
    const selected = files[0];
    if (selected && String(selected.type || "").startsWith("image/") && typeof URL !== "undefined" && URL.createObjectURL) {
      objectUrl = URL.createObjectURL(selected);
      return objectUrl;
    }
    return currentOptions.previewUrl;
  }

  function summarizeFiles() {
    if (!files.length) {
      return currentOptions.emptyText;
    }
    if (files.length === 1) {
      return files[0].name || "Selected file";
    }
    return `${files.length} files selected`;
  }

  function open() {
    if (currentOptions.disabled) {
      return;
    }
    refs.input?.click?.();
  }

  function selectFiles(nextFiles, source) {
    if (currentOptions.disabled) {
      return;
    }
    const result = normalizeSelectedFiles(nextFiles, currentOptions);
    if (result.errors.length) {
      currentOptions.onError?.(result.errors, { source, files: result.files });
    }
    if (!result.files.length) {
      return;
    }
    files = result.files;
    currentOptions.onChange?.(getFiles(), { source, state: getState(), errors: result.errors });
    render();
  }

  function handleDragOver(event) {
    if (currentOptions.disabled) {
      return;
    }
    event.preventDefault();
    refs.body?.classList.add("is-dragover");
  }

  function handleDragLeave() {
    refs.body?.classList.remove("is-dragover");
  }

  function handleDrop(event) {
    if (currentOptions.disabled) {
      return;
    }
    event.preventDefault();
    refs.body?.classList.remove("is-dragover");
    selectFiles(Array.from(event.dataTransfer?.files || []), "drop");
  }

  function handlePaste(event) {
    if (currentOptions.disabled) {
      return;
    }
    const pasted = getClipboardFiles(event.clipboardData);
    if (!pasted.length) {
      return;
    }
    const result = normalizeSelectedFiles(pasted, currentOptions);
    if (result.errors.length) {
      currentOptions.onError?.(result.errors, { source: "paste", files: result.files });
    }
    if (!result.files.length) {
      return;
    }
    event.preventDefault();
    files = result.files;
    currentOptions.onChange?.(getFiles(), { source: "paste", state: getState(), errors: result.errors });
    render();
  }

  function clear(meta = {}) {
    files = [];
    currentOptions.onClear?.({ source: meta.source || "clear", state: getState() });
    currentOptions.onChange?.(getFiles(), { source: meta.source || "clear", state: getState(), errors: [] });
    render();
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function destroy() {
    revokeObjectUrl();
    events.clear();
    clearNode(container);
    refs = {};
    files = [];
  }

  function getFiles() {
    return [...files];
  }

  function getState() {
    return {
      files: files.map((file) => ({
        name: file.name || "",
        size: Number(file.size || 0),
        type: file.type || "",
      })),
      options: { ...currentOptions },
    };
  }

  function revokeObjectUrl() {
    if (objectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      URL.revokeObjectURL(objectUrl);
    }
    objectUrl = "";
  }

  render();

  return {
    open,
    clear,
    update,
    destroy,
    getFiles,
    getState,
    get input() {
      return refs.input;
    },
    get root() {
      return refs.root;
    },
  };
}

function appendIcon(parent, iconName, className = "ui-file-input-icon") {
  const icon = createIcon(iconName, { className });
  if (icon) {
    parent.appendChild(icon);
  }
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    maxFiles: Math.max(1, Number(options?.maxFiles ?? DEFAULT_OPTIONS.maxFiles) || DEFAULT_OPTIONS.maxFiles),
    maxFileSize: Math.max(1, Number(options?.maxFileSize ?? DEFAULT_OPTIONS.maxFileSize) || DEFAULT_OPTIONS.maxFileSize),
  };
}

function normalizeSelectedFiles(fileList, options) {
  const errors = [];
  const incoming = Array.from(fileList || []).filter(Boolean);
  const limit = options.multiple ? options.maxFiles : 1;
  const files = [];
  incoming.slice(0, limit).forEach((file) => {
    const validation = validateFile(file, options);
    if (validation.ok) {
      files.push(file);
    } else {
      errors.push({ file, message: validation.error });
    }
  });
  if (incoming.length > limit) {
    errors.push({ file: null, message: `Only ${limit} file${limit === 1 ? "" : "s"} can be selected.` });
  }
  return { files, errors };
}

function validateFile(file, options) {
  if (!file) {
    return { ok: false, error: "Invalid file." };
  }
  if (file.size > options.maxFileSize) {
    return { ok: false, error: `File is larger than ${formatBytes(options.maxFileSize)}.` };
  }
  if (!matchesAccept(file, options.accept)) {
    return { ok: false, error: "File type is not accepted." };
  }
  if (Array.isArray(options.allowedTypes) && options.allowedTypes.length) {
    const matched = options.allowedTypes.some((rule) => matchType(file, rule));
    if (!matched) {
      return { ok: false, error: "File type is not allowed." };
    }
  }
  return { ok: true, error: "" };
}

function getClipboardFiles(clipboardData) {
  const files = [];
  const items = Array.from(clipboardData?.items || []);
  items.forEach((item) => {
    if (item?.kind !== "file" || typeof item.getAsFile !== "function") {
      return;
    }
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  });
  return files.length ? files : Array.from(clipboardData?.files || []).filter(Boolean);
}

function matchesAccept(file, accept) {
  const tokens = String(accept || "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  return tokens.some((token) => matchType(file, token));
}

function matchType(file, rule) {
  const fileType = String(file.type || "").toLowerCase();
  const fileName = String(file.name || "").toLowerCase();
  const needle = String(rule || "").toLowerCase();
  if (!needle) {
    return false;
  }
  if (needle.endsWith("/*")) {
    return Boolean(fileType) && fileType.startsWith(needle.slice(0, -1));
  }
  if (needle.endsWith("/")) {
    return Boolean(fileType) && fileType.startsWith(needle);
  }
  if (needle.startsWith(".")) {
    return fileName.endsWith(needle);
  }
  return Boolean(fileType) && fileType === needle;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && size >= 1024; i += 1) {
    size /= 1024;
    unit = units[i];
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${unit}`;
}

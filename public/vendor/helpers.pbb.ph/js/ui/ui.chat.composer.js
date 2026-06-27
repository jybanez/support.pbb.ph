import { createElement, clearNode } from "./ui.dom.js";
import { createIcon } from "./ui.icons.js";

const DEFAULT_OPTIONS = {
  className: "",
  placeholder: "Type a message...",
  helperText: "",
  disabled: false,
  busy: false,
  sendLabel: "Send",
  attachmentLabel: "Attach",
  showAttachmentButton: true,
  accept: "",
  multiple: true,
  capture: null,
  maxLength: null,
  multiline: true,
  submitOnEnter: true,
  onChange: null,
  onSend: null,
  onFilesSelected: null,
};

export function createChatComposer(container, data = {}, options = {}) {
  let currentValue = String(data?.value || "");
  let currentOptions = { ...DEFAULT_OPTIONS, ...(options || {}) };
  let refs = {};

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }

    clearNode(container);
    refs = {};

    const root = createElement("div", {
      className: [
        "ui-chat-composer",
        currentOptions.className || "",
        currentOptions.busy ? "is-busy" : "",
        currentOptions.disabled ? "is-disabled" : "",
      ].filter(Boolean).join(" "),
    });
    root.addEventListener("paste", handlePaste);

    const controls = createElement("div", {
      className: [
        "ui-chat-composer-controls",
        currentOptions.showAttachmentButton ? "" : "is-no-attachment",
      ].filter(Boolean).join(" "),
    });
    const inputWrap = createElement("div", { className: "ui-chat-composer-input-wrap" });
    const input = currentOptions.multiline !== false
      ? createElement("textarea", {
          className: "ui-chat-composer-input",
          attrs: buildInputAttrs(),
        })
      : createElement("input", {
          className: "ui-chat-composer-input",
          attrs: { ...buildInputAttrs(), type: "text" },
        });

    input.value = currentValue;
    input.addEventListener("input", () => {
      currentValue = String(input.value || "");
      currentOptions.onChange?.(currentValue);
      syncButtons();
    });
    input.addEventListener("keydown", handleKeydown);

    inputWrap.appendChild(input);
    refs.input = input;

    if (currentOptions.showAttachmentButton) {
      const fileInput = createElement("input", {
        className: "ui-chat-composer-file-input",
        attrs: buildFileInputAttrs(),
      });
      fileInput.addEventListener("change", () => {
        const files = Array.from(fileInput.files || []);
        if (files.length) {
          emitFilesSelected(files, "picker");
        }
        fileInput.value = "";
      });
      refs.fileInput = fileInput;
      root.appendChild(fileInput);

      const attach = createElement("button", {
        className: "ui-chat-composer-attach",
        attrs: {
          type: "button",
          title: currentOptions.attachmentLabel,
          "aria-label": currentOptions.attachmentLabel,
          ...(isInteractionBlocked() ? { disabled: "disabled" } : {}),
        },
      });
      const attachIcon = createIcon("data.upload", { className: "ui-chat-composer-attach-icon" });
      if (attachIcon) {
        attach.appendChild(attachIcon);
      } else {
        attach.textContent = currentOptions.attachmentLabel;
      }
      attach.addEventListener("click", () => refs.fileInput?.click?.());
      controls.appendChild(attach);
      refs.attach = attach;
    }

    controls.appendChild(inputWrap);

    const send = createElement("button", {
      className: "ui-chat-composer-send",
      text: currentOptions.sendLabel,
      attrs: {
        type: "button",
        ...(isSendDisabled() ? { disabled: "disabled" } : {}),
      },
    });
    send.addEventListener("click", () => void submit());
    controls.appendChild(send);
    refs.send = send;

    root.appendChild(controls);

    if (String(currentOptions.helperText || "").trim()) {
      root.appendChild(createElement("div", {
        className: "ui-chat-composer-helper",
        text: String(currentOptions.helperText).trim(),
      }));
    }

    container.appendChild(root);
  }

  function buildInputAttrs() {
    const attrs = {
      placeholder: currentOptions.placeholder,
      ...(currentOptions.maxLength != null ? { maxlength: String(currentOptions.maxLength) } : {}),
      ...(isInteractionBlocked() ? { disabled: "disabled" } : {}),
    };
    return attrs;
  }

  function buildFileInputAttrs() {
    return {
      type: "file",
      tabindex: "-1",
      hidden: "hidden",
      ...(currentOptions.accept ? { accept: String(currentOptions.accept) } : {}),
      ...(currentOptions.multiple !== false ? { multiple: "multiple" } : {}),
      ...(currentOptions.capture ? { capture: String(currentOptions.capture) } : {}),
      ...(isInteractionBlocked() ? { disabled: "disabled" } : {}),
    };
  }

  function handleKeydown(event) {
    if (currentOptions.multiline === false) {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
      return;
    }

    if (currentOptions.submitOnEnter !== false && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function handlePaste(event) {
    if (!currentOptions.showAttachmentButton || isInteractionBlocked()) {
      return;
    }
    const files = getClipboardFiles(event.clipboardData);
    if (!files.length) {
      return;
    }
    const acceptedFiles = normalizeSelectedFiles(files, currentOptions);
    if (!acceptedFiles.length) {
      return;
    }
    event.preventDefault();
    emitFilesSelected(acceptedFiles, "paste");
  }

  function emitFilesSelected(files, source) {
    const selectedFiles = normalizeSelectedFiles(files, currentOptions);
    if (!selectedFiles.length) {
      return;
    }
    currentOptions.onFilesSelected?.(selectedFiles, { source });
  }

  async function submit() {
    if (isSendDisabled()) {
      return;
    }
    const text = String(currentValue || "");
    if (!text.trim()) {
      syncButtons();
      return;
    }
    await currentOptions.onSend?.({ text });
  }

  function update(nextData = {}, nextOptions = {}) {
    if (Object.prototype.hasOwnProperty.call(nextData || {}, "value")) {
      currentValue = String(nextData.value || "");
    }
    currentOptions = { ...currentOptions, ...(nextOptions || {}) };
    render();
  }

  function destroy() {
    refs = {};
    clearNode(container);
  }

  function setValue(value) {
    currentValue = String(value || "");
    if (refs.input) {
      refs.input.value = currentValue;
    }
    syncButtons();
  }

  function getValue() {
    return String(currentValue || "");
  }

  function clear() {
    setValue("");
  }

  function focus() {
    refs.input?.focus?.();
  }

  function setBusy(busy) {
    currentOptions = { ...currentOptions, busy: Boolean(busy) };
    render();
  }

  function getState() {
    return {
      value: getValue(),
      options: { ...currentOptions },
    };
  }

  function syncButtons() {
    if (refs.send) {
      refs.send.disabled = isSendDisabled();
    }
    if (refs.attach) {
      refs.attach.disabled = isInteractionBlocked();
    }
    if (refs.fileInput) {
      refs.fileInput.disabled = isInteractionBlocked();
    }
  }

  function isInteractionBlocked() {
    return Boolean(currentOptions.disabled || currentOptions.busy);
  }

  function isSendDisabled() {
    return isInteractionBlocked() || !String(currentValue || "").trim();
  }

  render();
  return { update, destroy, setValue, getValue, clear, focus, setBusy, getState };
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
  if (files.length) {
    return files;
  }
  return Array.from(clipboardData?.files || []).filter(Boolean);
}

function normalizeSelectedFiles(files, currentOptions = {}) {
  return Array.from(files || [])
    .filter(Boolean)
    .filter((file) => matchesAccept(file, currentOptions?.accept))
    .slice(0, currentOptions?.multiple === false ? 1 : undefined);
}

function matchesAccept(file, accept) {
  const tokens = String(accept || "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return tokens.some((token) => {
    if (token.endsWith("/*")) {
      return Boolean(type) && type.startsWith(token.slice(0, -1));
    }
    if (token.startsWith(".")) {
      return name.endsWith(token);
    }
    return Boolean(type) && type === token;
  });
}

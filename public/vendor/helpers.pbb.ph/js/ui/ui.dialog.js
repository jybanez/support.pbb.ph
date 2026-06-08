import { createElement } from "./ui.dom.js";
import { createActionModal } from "./ui.modal.js?v=0.21.61";
import { getSemanticStatusIcon } from "./ui.semantic.icons.js";
import { maybeDelegateWorkspaceDialog } from "./ui.workspace.bridge.js?v=0.21.61";

export function uiAlert(message, options = {}) {
  return new Promise((resolve) => {
    if (hasLocalAsyncDialogHandler(options, "alert")) {
      openLocalAlert(resolve, message, options);
      return;
    }
    maybeDelegateWorkspaceDialog("alert", message, options).then((bridgeResult) => {
      if (bridgeResult.delegated) {
        resolve(Boolean(bridgeResult.result));
        return;
      }
      openLocalAlert(resolve, message, options);
    }).catch(() => {
      openLocalAlert(resolve, message, options);
    });
  });
}

export function uiConfirm(message, options = {}) {
  return new Promise((resolve) => {
    if (hasLocalAsyncDialogHandler(options, "confirm")) {
      openLocalConfirm(resolve, message, options);
      return;
    }
    maybeDelegateWorkspaceDialog("confirm", message, options).then((bridgeResult) => {
      if (bridgeResult.delegated) {
        resolve(Boolean(bridgeResult.result));
        return;
      }
      openLocalConfirm(resolve, message, options);
    }).catch(() => {
      openLocalConfirm(resolve, message, options);
    });
  });
}

export function uiPrompt(message, options = {}) {
  return new Promise((resolve) => {
    if (hasLocalAsyncDialogHandler(options, "prompt")) {
      openLocalPrompt(resolve, message, options);
      return;
    }
    maybeDelegateWorkspaceDialog("prompt", message, options).then((bridgeResult) => {
      if (bridgeResult.delegated) {
        resolve(bridgeResult.result == null ? null : String(bridgeResult.result));
        return;
      }
      openLocalPrompt(resolve, message, options);
    }).catch(() => {
      openLocalPrompt(resolve, message, options);
    });
  });
}

function openLocalAlert(resolve, message, options = {}) {
  let settled = false;
  const dialogVariant = normalizeDialogVariant(options.variant);
  const { content, setError, clearError } = createDialogContent(message, options, dialogVariant);

  const modal = createActionModal({
    title: options.title || "Notice",
    content,
    autoBusy: true,
    actions: [
      {
        id: "ok",
        label: options.okText || "OK",
        variant: options.okVariant || getDefaultActionVariant(dialogVariant, "primary"),
        icon: options.okIcon || "",
        iconPosition: options.okIconPosition || "start",
        iconOnly: Boolean(options.okIconOnly),
        ariaLabel: options.okAriaLabel || "",
        autoFocus: true,
        busyMessage: options.okBusyMessage || options.busyMessage || "",
        onClick() {
          if (settled) {
            return false;
          }
          clearError();
          return runDialogPrimaryAction({
            options,
            kind: "alert",
            value: true,
            setError,
            onSuccess() {
              settled = true;
              resolve(true);
            },
          });
        },
      },
    ],
    headerActions: Array.isArray(options.headerActions) ? options.headerActions : [],
    size: options.size || "sm",
    closeOnBackdrop: Boolean(options.allowBackdropClose),
    closeOnEscape: options.allowEscClose !== false,
    parent: options.parent || null,
    className: buildDialogClassName(options.className, dialogVariant),
    showCloseButton: Boolean(options.showCloseButton),
    onClose() {
      if (settled) {
        modal.destroy();
        return;
      }
      settled = true;
      resolve(true);
      modal.destroy();
    },
  });
  modal.open();
  speakDialog(options, {
    title: options.title || "Notice",
    message,
    description: options.description || "",
  });
}

function openLocalConfirm(resolve, message, options = {}) {
  let settled = false;
  const dialogVariant = normalizeDialogVariant(options.variant);
  const { content, setError, clearError } = createDialogContent(message, options, dialogVariant);

  const modal = createActionModal({
    title: options.title || "Confirm",
    autoBusy: true,
    content,
    actions: [
      {
        id: "cancel",
        label: options.cancelText || "Cancel",
        variant: "default",
        icon: options.cancelIcon || "",
        iconPosition: options.cancelIconPosition || "start",
        iconOnly: Boolean(options.cancelIconOnly),
        ariaLabel: options.cancelAriaLabel || "",
        onClick() {
          if (settled) {
            return false;
          }
          clearError();
          settled = true;
          resolve(false);
        },
      },
      {
        id: "confirm",
        label: options.confirmText || "Confirm",
        variant: options.confirmVariant || getDefaultActionVariant(dialogVariant, "primary"),
        icon: options.confirmIcon || "",
        iconPosition: options.confirmIconPosition || "start",
        iconOnly: Boolean(options.confirmIconOnly),
        ariaLabel: options.confirmAriaLabel || "",
        autoFocus: true,
        busyMessage: options.confirmBusyMessage || options.busyMessage || "",
        onClick() {
          if (settled) {
            return false;
          }
          clearError();
          return runDialogPrimaryAction({
            options,
            kind: "confirm",
            value: true,
            setError,
            onSuccess() {
              settled = true;
              resolve(true);
            },
          });
        },
      },
    ],
    headerActions: Array.isArray(options.headerActions) ? options.headerActions : [],
    size: options.size || "sm",
    closeOnBackdrop: Boolean(options.allowBackdropClose),
    closeOnEscape: options.allowEscClose !== false,
    parent: options.parent || null,
    className: buildDialogClassName(options.className, dialogVariant),
    showCloseButton: Boolean(options.showCloseButton),
    onClose() {
      if (settled) {
        modal.destroy();
        return;
      }
      settled = true;
      resolve(false);
      modal.destroy();
    },
  });
  modal.open();
  speakDialog(options, {
    title: options.title || "Confirm",
    message,
    description: options.description || "",
  });
}

function openLocalPrompt(resolve, message, options = {}) {
  let settled = false;
  let submitButton = null;
  const dialogVariant = normalizeDialogVariant(options.variant);
  const input = createElement("input", {
    className: "ui-input",
    attrs: { type: "text", placeholder: options.placeholder || "" },
  });
  input.value = String(options.defaultValue || "");
  const { content, setError, clearError } = createDialogContent(message, options, dialogVariant, input);

  const modal = createActionModal({
    title: options.title || "Input",
    autoBusy: true,
    content,
    actions: [
      {
        id: "cancel",
        label: options.cancelText || "Cancel",
        variant: "default",
        icon: options.cancelIcon || "",
        iconPosition: options.cancelIconPosition || "start",
        iconOnly: Boolean(options.cancelIconOnly),
        ariaLabel: options.cancelAriaLabel || "",
        onClick() {
          if (settled) {
            return false;
          }
          clearError();
          settled = true;
          resolve(null);
        },
      },
      {
        id: "submit",
        label: options.submitText || "Submit",
        variant: options.submitVariant || getDefaultActionVariant(dialogVariant, "primary"),
        icon: options.submitIcon || "",
        iconPosition: options.submitIconPosition || "start",
        iconOnly: Boolean(options.submitIconOnly),
        ariaLabel: options.submitAriaLabel || "",
        busyMessage: options.submitBusyMessage || options.busyMessage || "",
        onClick() {
          if (settled) {
            return false;
          }
          clearError();
          return runDialogPrimaryAction({
            options,
            kind: "prompt",
            value: input.value,
            setError,
            onSuccess() {
              settled = true;
              resolve(input.value);
            },
          });
        },
      },
    ],
    headerActions: Array.isArray(options.headerActions) ? options.headerActions : [],
    size: options.size || "sm",
    closeOnBackdrop: Boolean(options.allowBackdropClose),
    closeOnEscape: options.allowEscClose !== false,
    parent: options.parent || null,
    className: buildDialogClassName(options.className, dialogVariant),
    showCloseButton: Boolean(options.showCloseButton),
    initialFocus: input,
    onClose() {
      if (settled) {
        modal.destroy();
        return;
      }
      settled = true;
      resolve(null);
      modal.destroy();
    },
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (settled || modal.isBusy()) {
        return;
      }
      if (!submitButton) {
        submitButton = input.closest(".ui-modal")?.querySelector(".ui-dialog-footer-actions button:last-child, .ui-modal-footer button:last-child");
      }
      if (submitButton) {
        submitButton.click();
      }
    }
  });
  input.addEventListener("input", () => clearError());
  modal.open();
  submitButton = input.closest(".ui-modal")?.querySelector(".ui-dialog-footer-actions button:last-child, .ui-modal-footer button:last-child");
  speakDialog(options, {
    title: options.title || "Input",
    message,
    description: options.description || "",
  });
  input.focus();
  input.select();
}

function hasLocalAsyncDialogHandler(options = {}, kind) {
  if (!options || typeof options !== "object") {
    return false;
  }
  if (kind === "alert") {
    return typeof options.onAcknowledge === "function";
  }
  if (kind === "confirm") {
    return typeof options.onConfirm === "function";
  }
  if (kind === "prompt") {
    return typeof options.onSubmit === "function";
  }
  return false;
}

function runDialogPrimaryAction({ options, kind, value, setError, onSuccess }) {
  const handler = resolvePrimaryHandler(options, kind);
  if (typeof handler !== "function") {
    onSuccess?.();
    return true;
  }
  return Promise.resolve()
    .then(() => handler(value, { kind }))
    .then((result) => {
      if (result === false) {
        return false;
      }
      onSuccess?.();
      return true;
    })
    .catch((error) => {
      setError(resolveDialogActionErrorMessage(error, options));
      return false;
    });
}

function resolvePrimaryHandler(options = {}, kind) {
  if (kind === "alert") {
    return typeof options.onAcknowledge === "function" ? options.onAcknowledge : null;
  }
  if (kind === "confirm") {
    return typeof options.onConfirm === "function" ? options.onConfirm : null;
  }
  if (kind === "prompt") {
    return typeof options.onSubmit === "function" ? options.onSubmit : null;
  }
  return null;
}

function resolveDialogActionErrorMessage(error, options = {}) {
  const fallback = String(options.errorText || "The action could not be completed. Please try again.");
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  const message = String(error?.message || "").trim();
  return message || fallback;
}

function normalizeDialogVariant(variant) {
  const value = String(variant || "default").toLowerCase();
  if (value === "success" || value === "info" || value === "warning" || value === "error" || value === "default") {
    return value;
  }
  return "default";
}

function buildDialogClassName(className, variant) {
  const classes = ["ui-dialog"];
  if (variant && variant !== "default") {
    classes.push(`ui-dialog--${variant}`);
  }
  if (className) {
    classes.push(String(className).trim());
  }
  return classes.join(" ").trim();
}

function getDefaultActionVariant(dialogVariant, fallback = "primary") {
  if (dialogVariant === "error" || dialogVariant === "warning") {
    return "danger";
  }
  if (dialogVariant === "success" || dialogVariant === "info") {
    return "primary";
  }
  return fallback;
}

function createDialogContent(message, options, variant, extraContent = null) {
  const description = String(options.description || "").trim();
  const isCompact = !description && !extraContent;
  const content = createElement("div", {
    className: `ui-dialog-body${extraContent ? " ui-dialog-prompt-body" : ""}${isCompact ? " ui-dialog-body--compact" : ""}`,
  });
  const iconMarkup = resolveVariantIcon(options, variant);
  const textStack = createElement("div", { className: "ui-dialog-text" });
  const errorEl = createElement("p", {
    className: "ui-dialog-error",
    attrs: { hidden: "hidden", role: "alert", "aria-live": "polite" },
  });
  if (iconMarkup) {
    const iconEl = createElement("div", {
      className: "ui-dialog-variant-icon",
      attrs: { "aria-hidden": "true" },
      html: iconMarkup,
    });
    content.appendChild(iconEl);
  }
  const messageEl = createElement("p", { className: "ui-dialog-message", text: String(message || "") });
  textStack.appendChild(messageEl);
  if (description) {
    const descriptionEl = createElement("p", {
      className: "ui-dialog-description",
      text: description,
    });
    textStack.appendChild(descriptionEl);
  }
  textStack.appendChild(errorEl);
  content.appendChild(textStack);
  if (extraContent) {
    content.appendChild(extraContent);
  }
  function syncCompactLayout(hasError) {
    if (!isCompact) {
      return;
    }
    content.classList.toggle("ui-dialog-body--compact", !hasError);
  }
  return {
    content,
    setError(messageText) {
      const value = String(messageText || "").trim();
      errorEl.textContent = value;
      errorEl.hidden = !value;
      syncCompactLayout(Boolean(value));
    },
    clearError() {
      errorEl.textContent = "";
      errorEl.hidden = true;
      syncCompactLayout(false);
    },
  };
}

function resolveVariantIcon(options, variant) {
  if (options.showVariantIcon === false) {
    return "";
  }
  if (options.variantIcon) {
    return String(options.variantIcon);
  }
  if (!variant || variant === "default") {
    return "";
  }
  return getSemanticStatusIcon(variant);
}

function speakDialog(options, payload) {
  if (!options || !options.speak) {
    return;
  }
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
    return;
  }
  const text = String(options.speakText || defaultDialogSpeakText(payload)).trim();
  if (!text) {
    return;
  }
  const utterance = new window.SpeechSynthesisUtterance(text);
  const voiceName = String(options.voiceName || "").trim();
  if (voiceName) {
    const voice = window.speechSynthesis.getVoices().find((entry) => entry?.name === voiceName);
    if (voice) {
      utterance.voice = voice;
    }
  }
  if (Number.isFinite(Number(options.speakRate))) {
    utterance.rate = Math.max(0.5, Math.min(2, Number(options.speakRate)));
  }
  if (Number.isFinite(Number(options.speakPitch))) {
    utterance.pitch = Math.max(0, Math.min(2, Number(options.speakPitch)));
  }
  if (Number.isFinite(Number(options.speakVolume))) {
    utterance.volume = Math.max(0, Math.min(1, Number(options.speakVolume)));
  }
  window.setTimeout(() => {
    try {
      window.speechSynthesis.speak(utterance);
    } catch (_error) {
      // Intentionally ignore speech synthesis failures.
    }
  }, 0);
}

function defaultDialogSpeakText(payload) {
  const parts = [
    String(payload?.title || "").trim(),
    String(payload?.message || "").trim(),
    String(payload?.description || "").trim(),
  ].filter(Boolean);
  return parts.join(". ");
}

const BRIDGE_NAMESPACE_V1 = "pbb.workspace.ui.bridge.v1";
const BRIDGE_NAMESPACE_V2 = "pbb.workspace.ui.bridge.v2";
const BRIDGE_NAMESPACES = [BRIDGE_NAMESPACE_V1, BRIDGE_NAMESPACE_V2];
const DEFAULT_TIMEOUT_MS = 900;
const HOST_METHODS = [
  "toast.show",
  "toast.dismiss",
  "toast.clear",
  "dialog.alert",
  "dialog.confirm",
  "dialog.prompt",
  "modal.action",
  "modal.form.open",
  "modal.form.session.open",
  "modal.form.update",
  "modal.form.close",
];

let cachedAvailabilityPromise = null;

export function installWorkspaceUiBridgeHost(options = {}) {
  if (typeof window === "undefined") {
    throw new Error("Workspace UI bridge host requires a browser window.");
  }
  if (window.__uiWorkspaceBridgeHost) {
    return window.__uiWorkspaceBridgeHost;
  }

  const trustedOrigins = normalizeTrustedOrigins(options.trustedOrigins);
  let toastStack = null;
  const modalParent = options.parent instanceof HTMLElement ? options.parent : document.body;
  const formSessions = new Map();
  let destroyed = false;

  async function onMessage(event) {
    if (destroyed || !isTrustedOrigin(event.origin, trustedOrigins)) {
      return;
    }
    const message = event.data;
    if (!isBridgeRequest(message)) {
      return;
    }
    try {
      const result = await handleRequest(message.method, message.payload || {}, modalParent, {
        namespace: normalizeBridgeNamespace(message.namespace),
        sourceWindow: event.source,
        sourceOrigin: event.origin,
        formSessions,
        getToastStack: async () => {
          if (toastStack) {
            return toastStack;
          }
          const { createToastStack } = await import("./ui.toast.js");
          toastStack = createToastStack({ ...(options.toastOptions || {}), workspaceBridge: false });
          return toastStack;
        },
      });
      event.source?.postMessage({
        namespace: normalizeBridgeNamespace(message.namespace),
        phase: "response",
        id: message.id,
        ok: true,
        result,
        error: null,
      }, event.origin === "null" ? "*" : event.origin);
    } catch (error) {
      event.source?.postMessage({
        namespace: normalizeBridgeNamespace(message.namespace),
        phase: "response",
        id: message.id,
        ok: false,
        result: null,
        error: {
          code: "bridge-request-failed",
          message: String(error?.message || error || "Workspace UI bridge request failed."),
        },
      }, event.origin === "null" ? "*" : event.origin);
    }
  }

  window.addEventListener("message", onMessage);

  const api = {
    getOverlayParent() {
      return modalParent;
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      window.removeEventListener("message", onMessage);
      toastStack?.destroy?.();
      delete window.__uiWorkspaceBridgeHost;
    },
    getState() {
      return {
        installed: !destroyed,
        trustedOrigins: [...trustedOrigins],
        methods: [...HOST_METHODS],
      };
    },
  };

  window.__uiWorkspaceBridgeHost = api;
  return api;
}

export function getWorkspaceUiBridge(options = {}) {
  const requestOptions = {
    timeoutMs: resolveTimeout(options.timeoutMs),
    targetOrigin: typeof options.targetOrigin === "string" && options.targetOrigin.trim() ? options.targetOrigin.trim() : "*",
  };

  return {
    async isAvailable() {
      return probeWorkspaceUiBridge(requestOptions);
    },
    async showToast(payload = {}) {
      return requestWorkspaceUi("toast.show", payload, requestOptions);
    },
    async dismissToast(id) {
      return requestWorkspaceUi("toast.dismiss", { id }, requestOptions);
    },
    async clearToasts() {
      return requestWorkspaceUi("toast.clear", {}, requestOptions);
    },
    async alert(payload = {}) {
      return requestInteractiveWorkspaceUi("dialog.alert", payload, requestOptions);
    },
    async confirm(payload = {}) {
      return requestInteractiveWorkspaceUi("dialog.confirm", payload, requestOptions);
    },
    async prompt(payload = {}) {
      return requestInteractiveWorkspaceUi("dialog.prompt", payload, requestOptions);
    },
    async showActionModal(payload = {}) {
      return requestInteractiveWorkspaceUi("modal.action", payload, requestOptions);
    },
    async showFormModal(payload = {}) {
      return requestInteractiveWorkspaceUi("modal.form.open", payload, {
        ...requestOptions,
        namespace: BRIDGE_NAMESPACE_V2,
      });
    },
    async openFormSession(payload = {}) {
      return createWorkspaceFormSession(payload, requestOptions);
    },
  };
}

export function resolveWorkspaceOverlayParent(options = {}) {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return null;
  }
  if (!shouldUseWorkspacePortal(options)) {
    return null;
  }
  try {
    const host = window.parent.__uiWorkspaceBridgeHost;
    const overlayParent = typeof host?.getOverlayParent === "function" ? host.getOverlayParent() : null;
    return isElementNode(overlayParent) ? overlayParent : null;
  } catch {
    return null;
  }
}

export async function showWorkspaceActionModal(payload = {}, options = {}) {
  const bridge = getWorkspaceUiBridge(options);
  return bridge.showActionModal(payload);
}

export async function showWorkspaceFormModal(payload = {}, options = {}) {
  const bridge = getWorkspaceUiBridge(options);
  return bridge.showFormModal(normalizeOutgoingWorkspaceFormPayload(payload));
}

export async function maybeDelegateWorkspaceDialog(kind, message, options = {}) {
  if (!shouldUseWorkspaceBridge(options)) {
    return { delegated: false, result: null };
  }
  try {
    const bridge = getWorkspaceUiBridge({
      timeoutMs: options.workspaceBridgeTimeoutMs,
      targetOrigin: options.workspaceBridgeTargetOrigin,
    });
    const available = await bridge.isAvailable();
    if (!available) {
      return { delegated: false, result: null };
    }
    const payload = { message, options: sanitizeDialogOptions(options) };
    try {
      let result = null;
      if (kind === "alert") {
        result = await bridge.alert(payload);
      } else if (kind === "confirm") {
        result = await bridge.confirm(payload);
      } else if (kind === "prompt") {
        result = await bridge.prompt(payload);
      } else {
        return { delegated: false, result: null };
      }
      return { delegated: true, result };
    } catch {
      return { delegated: true, result: getDelegatedDialogFallbackResult(kind) };
    }
  } catch {
    return { delegated: false, result: null };
  }
}

export function createWorkspaceToastDelegate(options = {}) {
  if (!shouldUseWorkspaceBridge(options)) {
    return null;
  }
  const bridge = getWorkspaceUiBridge({
    timeoutMs: options.workspaceBridgeTimeoutMs,
    targetOrigin: options.workspaceBridgeTargetOrigin,
  });
  let availability = "unknown";
  probeWorkspaceUiBridge({
    timeoutMs: resolveTimeout(options.workspaceBridgeTimeoutMs),
    targetOrigin: typeof options.workspaceBridgeTargetOrigin === "string" && options.workspaceBridgeTargetOrigin.trim()
      ? options.workspaceBridgeTargetOrigin.trim()
      : "*",
  }).then((available) => {
    availability = available ? "available" : "unavailable";
  }).catch(() => {
    availability = "unavailable";
  });

  const remoteIds = new Map();

  return {
    isAvailable() {
      return availability === "available";
    },
    show(message, toastOptions = {}) {
      if (availability !== "available") {
        return null;
      }
      const localId = `workspace-toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const pending = bridge.showToast({
        message,
        options: sanitizeToastOptions(toastOptions),
      });
      remoteIds.set(localId, pending);
      return localId;
    },
    update(id, message, toastOptions = {}) {
      const key = String(id || "");
      const remote = remoteIds.get(key);
      if (!remote) {
        return null;
      }
      const pending = remote
        .then(async (remoteId) => {
          await bridge.dismissToast(remoteId);
          return bridge.showToast({
            message,
            options: sanitizeToastOptions(toastOptions),
          });
        })
        .catch(() => null);
      remoteIds.set(key, pending);
      return key;
    },
    async dismiss(id) {
      const remote = remoteIds.get(String(id || ""));
      if (!remote) {
        return false;
      }
      try {
        const remoteId = await remote;
        await bridge.dismissToast(remoteId);
      } catch {
        return false;
      }
      remoteIds.delete(String(id || ""));
      return true;
    },
    async clear() {
      if (availability !== "available") {
        return false;
      }
      remoteIds.clear();
      await bridge.clearToasts();
      return true;
    },
  };
}

function requestWorkspaceUi(method, payload, options) {
  if (typeof window === "undefined" || window.parent === window || !window.parent) {
    return Promise.reject(new Error("Workspace UI bridge is unavailable outside an iframe child context."));
  }
  const timeoutMs = resolveTimeout(options?.timeoutMs);
  const targetOrigin = typeof options?.targetOrigin === "string" && options.targetOrigin.trim() ? options.targetOrigin.trim() : "*";
  const namespace = normalizeBridgeNamespace(options?.namespace);
  const requestId = `workspace-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    let timer = 0;

    function cleanup() {
      window.removeEventListener("message", onMessage);
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    }

    function onMessage(event) {
      const message = event.data;
      if (!isBridgeResponse(message) || message.id !== requestId) {
        return;
      }
      cleanup();
      if (!message.ok) {
        reject(new Error(String(message.error?.message || "Workspace UI bridge request failed.")));
        return;
      }
      resolve(message.result);
    }

    window.addEventListener("message", onMessage);
    if (timeoutMs > 0) {
      timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Workspace UI bridge request timed out."));
      }, timeoutMs);
    }

    window.parent.postMessage({
      namespace,
      phase: "request",
      id: requestId,
      method,
      payload,
    }, targetOrigin);
  });
}

async function requestInteractiveWorkspaceUi(method, payload, options = {}) {
  const available = await probeWorkspaceUiBridge(options);
  if (!available) {
    throw new Error("Workspace UI bridge is unavailable.");
  }
  return requestWorkspaceUi(method, payload, {
    ...options,
    timeoutMs: 0,
  });
}

function probeWorkspaceUiBridge(options = {}) {
  if (cachedAvailabilityPromise) {
    return cachedAvailabilityPromise;
  }
  if (typeof window === "undefined" || window.parent === window || !window.parent) {
    return Promise.resolve(false);
  }
  cachedAvailabilityPromise = requestWorkspaceUi("bridge.ping", {}, {
    ...options,
    namespace: BRIDGE_NAMESPACE_V1,
  })
    .then((result) => Array.isArray(result?.methods))
    .catch(() => false);
  return cachedAvailabilityPromise;
}

async function handleRequest(method, payload, modalParent, context) {
  switch (String(method || "")) {
    case "bridge.ping":
      return { methods: [...HOST_METHODS] };
    case "toast.show": {
      const toastStack = await context.getToastStack();
      const result = toastStack.show(String(payload.message ?? ""), payload.options || {});
      return result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "id")
        ? String(result.id)
        : result;
    }
    case "toast.dismiss":
      (await context.getToastStack()).dismiss(String(payload.id || ""));
      return true;
    case "toast.clear":
      (await context.getToastStack()).clear();
      return true;
    case "dialog.alert": {
      const { uiAlert } = await import("./ui.dialog.js?v=0.21.61");
      return uiAlert(String(payload.message ?? ""), {
        ...(payload.options || {}),
        parent: modalParent,
        workspaceBridge: false,
      });
    }
    case "dialog.confirm": {
      const { uiConfirm } = await import("./ui.dialog.js?v=0.21.61");
      return uiConfirm(String(payload.message ?? ""), {
        ...(payload.options || {}),
        parent: modalParent,
        workspaceBridge: false,
      });
    }
    case "dialog.prompt": {
      const { uiPrompt } = await import("./ui.dialog.js?v=0.21.61");
      return uiPrompt(String(payload.message ?? ""), {
        ...(payload.options || {}),
        parent: modalParent,
        workspaceBridge: false,
      });
    }
    case "modal.action":
      return openWorkspaceActionModal(payload, modalParent);
    case "modal.form.open":
      return openWorkspaceFormModal(payload, modalParent);
    case "modal.form.session.open":
      return openWorkspaceFormSession(payload, modalParent, context);
    case "modal.form.update":
      return updateWorkspaceFormSession(payload, context);
    case "modal.form.close":
      return closeWorkspaceFormSession(payload, context);
    default:
      throw new Error(`Unsupported workspace bridge method: ${String(method || "")}`);
  }
}

function openWorkspaceActionModal(payload = {}, parent) {
  return new Promise((resolve) => {
    let settled = false;
    let modal = null;
    import("./ui.modal.js?v=0.21.61").then(({ createActionModal }) => {
      modal = createActionModal({
      title: String(payload.title || "Notice"),
      content: buildActionModalContent(payload),
      actions: normalizeBridgeActions(payload.actions),
      size: normalizeBridgeModalSize(payload.size),
      closeOnBackdrop: payload.closeOnBackdrop !== false,
      closeOnEscape: payload.closeOnEscape !== false,
      parent,
      onClose(meta = {}) {
        if (settled) {
          modal.destroy();
          return;
        }
        settled = true;
        resolve({
          reason: meta.reason || "close",
          actionId: meta.actionId || null,
          actionLabel: meta.actionLabel || null,
        });
        modal.destroy();
      },
      });

      modal.setActions((modal.getState().options.actions || []).map((action) => ({
      ...action,
      onClick() {
        if (settled) {
          return false;
        }
        settled = true;
        resolve({
          reason: "action",
          actionId: action.id,
          actionLabel: action.label,
        });
        return true;
      },
      })));

      modal.open();
    }).catch((error) => {
      settled = true;
      resolve({
        reason: "error",
        actionId: null,
        actionLabel: String(error?.message || "Workspace action modal failed to load."),
      });
    });
  });
}

function openWorkspaceFormModal(payload = {}, parent) {
  const normalized = normalizeBridgeFormPayload(payload);
  return new Promise((resolve, reject) => {
    let settled = false;
    let modal = null;

    import("./ui.form.modal.js?v=0.21.61").then(({ createFormModal }) => {
      const formConfig = {
        title: normalized.title,
        ownerTitle: normalized.ownerTitle,
        size: normalized.size,
        submitLabel: normalized.submitLabel,
        cancelLabel: normalized.cancelLabel,
        busyMessage: normalized.busyMessage,
        closeOnBackdrop: normalized.closeOnBackdrop,
        closeOnEscape: normalized.closeOnEscape,
        mode: normalized.mode,
        context: normalized.context,
        rows: normalized.rows,
        extraActionsPlacement: normalized.extraActionsPlacement,
        extraActions: normalized.extraActions.map((action) => ({
          ...action,
          closeOnClick: true,
          async onClick() {
            if (settled) {
              return true;
            }
            settled = true;
            resolve({
              reason: "action",
              actionId: action.id,
              values: modal?.getValues?.() || null,
            });
            modal?.destroy?.();
            return true;
          },
        })),
        initialValues: normalized.initialValues,
        parent,
        workspaceBridge: false,
        async onSubmit(values) {
          return values;
        },
        onClose(meta = {}) {
          if (settled) {
            modal?.destroy?.();
            return;
          }
          settled = true;
          resolve({
            reason: normalizeBridgeFormCloseReason(meta),
            values: meta?.reason === "submit" ? modal?.getValues?.() || null : null,
          });
          modal?.destroy?.();
        },
      };

      modal = createFormModal(formConfig);
      if (normalized.fieldErrors && Object.keys(normalized.fieldErrors).length) {
        modal.setErrors(normalized.fieldErrors);
      }
      if (normalized.formError) {
        modal.setFormError(normalized.formError);
      }
      modal.open();
    }).catch((error) => {
      reject(error);
    });
  });
}

function openWorkspaceFormSession(payload = {}, parent, context) {
  const normalized = normalizeBridgeFormPayload(payload);
  const modalId = `workspace-form-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const session = {
    id: modalId,
    namespace: context.namespace,
    sourceWindow: context.sourceWindow,
    sourceOrigin: context.sourceOrigin === "null" ? "*" : context.sourceOrigin,
    modal: null,
    terminal: false,
  };
  context.formSessions.set(modalId, session);

  return import("./ui.form.modal.js?v=0.21.61").then(({ createFormModal }) => {
    session.modal = createFormModal({
      title: normalized.title,
      ownerTitle: normalized.ownerTitle,
      size: normalized.size,
      submitLabel: normalized.submitLabel,
      cancelLabel: normalized.cancelLabel,
      busyMessage: normalized.busyMessage,
      manageBusyOnSubmit: false,
      closeOnBackdrop: normalized.closeOnBackdrop,
      closeOnEscape: normalized.closeOnEscape,
      mode: normalized.mode,
      context: normalized.context,
      rows: normalized.rows,
      extraActionsPlacement: normalized.extraActionsPlacement,
      extraActions: normalized.extraActions.map((action) => ({
        ...action,
        async onClick() {
          if (action.closeOnClick === true) {
            return true;
          }
          postWorkspaceBridgeEvent(session, "action", {
            actionId: action.id,
            values: session.modal?.getValues?.() || null,
          });
          return false;
        },
      })),
      initialValues: normalized.initialValues,
      parent,
      workspaceBridge: false,
      async onSubmit() {
        postWorkspaceBridgeEvent(session, "submit", {
          values: session.modal?.getValues?.() || null,
        });
        return false;
      },
      onClose(meta = {}) {
        context.formSessions.delete(modalId);
        if (session.terminal) {
          session.modal?.destroy?.();
          return;
        }
        session.terminal = true;
        const values = meta?.reason === "action" ? session.modal?.getValues?.() || null : null;
        postWorkspaceBridgeEvent(session, normalizeBridgeSessionEventType(meta), {
          reason: normalizeBridgeFormCloseReason(meta),
          actionId: meta?.actionId || null,
          values,
        });
        session.modal?.destroy?.();
      },
    });

    if (normalized.fieldErrors && Object.keys(normalized.fieldErrors).length) {
      session.modal.setErrors(normalized.fieldErrors);
    }
    if (normalized.formError) {
      session.modal.setFormError(normalized.formError);
    }
    session.modal.open();
    return { modalId };
  }).catch((error) => {
    context.formSessions.delete(modalId);
    throw error;
  });
}

function updateWorkspaceFormSession(payload = {}, context) {
  const modalId = String(payload?.modalId || "").trim();
  const session = modalId ? context.formSessions.get(modalId) : null;
  if (!session?.modal) {
    throw new Error("Unknown workspace form session.");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "busyMessage")) {
    session.modal.update({
      busyMessage: String(payload.busyMessage || "").trim() || session.modal.getState().options.busyMessage,
    });
  }
  if (Object.prototype.hasOwnProperty.call(payload, "values") && payload.values && typeof payload.values === "object") {
    session.modal.setValues(payload.values);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "fieldErrors")) {
    if (payload.fieldErrors && typeof payload.fieldErrors === "object") {
      session.modal.setErrors(payload.fieldErrors);
    } else {
      session.modal.clearErrors();
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "formError")) {
    const message = String(payload.formError || "").trim();
    if (message) {
      session.modal.setFormError(message);
    } else {
      session.modal.clearFormError();
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "busy")) {
    session.modal.setBusy(payload.busy === true);
  }
  return true;
}

async function closeWorkspaceFormSession(payload = {}, context) {
  const modalId = String(payload?.modalId || "").trim();
  const session = modalId ? context.formSessions.get(modalId) : null;
  if (!session?.modal) {
    throw new Error("Unknown workspace form session.");
  }
  session.terminal = true;
  context.formSessions.delete(modalId);
  await session.modal.close({
    reason: payload?.reason === "submit" ? "submit" : "dismiss",
    actionId: payload?.actionId || null,
    result: true,
  });
  session.modal.destroy?.();
  return true;
}

function buildActionModalContent(payload = {}) {
  if (typeof payload.html === "string" && payload.html.trim()) {
    const wrapper = document.createElement("div");
    wrapper.className = "ui-workspace-bridge-modal-content";
    wrapper.innerHTML = payload.html;
    return wrapper;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "ui-workspace-bridge-modal-content";
  const message = document.createElement("p");
  message.className = "ui-workspace-bridge-modal-message";
  message.textContent = String(payload.message || "");
  wrapper.appendChild(message);
  if (payload.description) {
    const description = document.createElement("p");
    description.className = "ui-workspace-bridge-modal-description";
    description.textContent = String(payload.description);
    wrapper.appendChild(description);
  }
  return wrapper;
}

function normalizeBridgeActions(actions) {
  if (!Array.isArray(actions) || !actions.length) {
    return [{ id: "ok", label: "OK", variant: "primary", autoFocus: true }];
  }
  return actions
    .map((action, index) => {
      if (!action || typeof action !== "object") {
        return null;
      }
      const label = String(action.label || "").trim();
      if (!label) {
        return null;
      }
      return {
        id: String(action.id || `action-${index}`),
        label,
        variant: normalizeActionVariant(action.variant),
        autoFocus: Boolean(action.autoFocus),
      };
    })
    .filter(Boolean);
}

function normalizeBridgeModalSize(size) {
  const value = String(size || "md").toLowerCase();
  return ["sm", "md", "lg", "xl", "full"].includes(value) ? value : "md";
}

function normalizeActionVariant(variant) {
  const value = String(variant || "default").toLowerCase();
  return ["default", "primary", "danger", "ghost"].includes(value) ? value : "default";
}

function sanitizeDialogOptions(options = {}) {
  const copy = { ...(options || {}) };
  delete copy.parent;
  delete copy.renderTarget;
  delete copy.workspaceBridge;
  delete copy.workspaceBridgeTimeoutMs;
  delete copy.workspaceBridgeTargetOrigin;
  return copy;
}

function sanitizeToastOptions(options = {}) {
  const copy = { ...(options || {}) };
  delete copy.renderTarget;
  delete copy.workspaceBridge;
  delete copy.workspaceBridgeTimeoutMs;
  delete copy.workspaceBridgeTargetOrigin;
  return copy;
}

function normalizeBridgeFormPayload(payload = {}) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  if (!source) {
    throw new Error("Form bridge payload must be an object.");
  }

  const intent = normalizeBridgeFormIntent(source.intent || source.variant);
  if (!intent) {
    throw new Error("Form bridge payload requires a supported intent.");
  }

  const rows = normalizeBridgeRows(source.rows);
  const initialValues = normalizePlainObject(source.initialValues);
  const fieldErrors = normalizeErrorMap(source.fieldErrors);

  return {
    intent,
    title: String(source.title || getDefaultBridgeFormTitle(intent)).trim(),
    ownerTitle: String(source.ownerTitle || "").trim(),
    size: normalizeBridgeModalSize(source.size || "sm"),
    submitLabel: String(source.submitLabel || getDefaultBridgeFormSubmitLabel(intent)).trim(),
    cancelLabel: String(source.cancelLabel || "Cancel").trim(),
    busyMessage: String(source.busyMessage || getDefaultBridgeFormBusyMessage(intent)).trim(),
    closeOnBackdrop: source.closeOnBackdrop !== false,
    closeOnEscape: source.closeOnEscape !== false,
    mode: String(source.mode || "").trim(),
    context: normalizeBridgeContext(source.context),
    extraActionsPlacement: normalizeBridgeExtraActionsPlacement(source.extraActionsPlacement),
    extraActions: normalizeBridgeExtraActions(source.extraActions),
    initialValues,
    rows,
    fieldErrors,
    formError: String(source.formError || "").trim(),
  };
}

function normalizeOutgoingWorkspaceFormPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const ownerTitle = String(payload.ownerTitle || "").trim();
  if (ownerTitle) {
    return payload;
  }
  const fallbackOwnerTitle = typeof document !== "undefined" ? String(document.title || "").trim() : "";
  if (!fallbackOwnerTitle) {
    return payload;
  }
  return {
    ...payload,
    ownerTitle: fallbackOwnerTitle,
  };
}

function normalizeBridgeExtraActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }
  return actions.map((action, index) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      return null;
    }
    const label = String(action.label || "").trim();
    const id = String(action.id || `extra-action-${index}`).trim();
    if (!label || !id || id === "cancel" || id === "submit") {
      return null;
    }
    return {
      id,
      label,
      variant: normalizeActionVariant(action.variant || "ghost"),
      icon: String(action.icon || "").trim(),
      className: String(action.className || "").trim(),
      closeOnClick: action.closeOnClick === true,
    };
  }).filter(Boolean);
}

function normalizeBridgeExtraActionsPlacement(value) {
  const normalized = String(value || "end").trim().toLowerCase();
  return normalized === "start" ? "start" : "end";
}

function normalizeBridgeFormIntent(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "login" || normalized === "reauth" || normalized === "account" || normalized === "change-password" || normalized === "change_password" || normalized === "generic-form" || normalized === "generic_form") {
    if (normalized === "change_password") {
      return "change-password";
    }
    if (normalized === "generic_form") {
      return "generic-form";
    }
    return normalized;
  }
  return "";
}

function getDefaultBridgeFormTitle(intent) {
  switch (intent) {
    case "reauth":
      return "Session Expired";
    case "account":
      return "Account";
    case "change-password":
      return "Change Password";
    case "generic-form":
      return "Form";
    case "login":
    default:
      return "Login";
  }
}

function getDefaultBridgeFormSubmitLabel(intent) {
  switch (intent) {
    case "reauth":
      return "Continue";
    case "account":
      return "Save";
    case "change-password":
      return "Update Password";
    case "generic-form":
      return "Submit";
    case "login":
    default:
      return "Login";
  }
}

function getDefaultBridgeFormBusyMessage(intent) {
  switch (intent) {
    case "reauth":
      return "Re-authenticating...";
    case "account":
      return "Saving account...";
    case "change-password":
      return "Updating password...";
    case "generic-form":
      return "Saving...";
    case "login":
    default:
      return "Signing in...";
  }
}

function normalizeBridgeContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return {
    kind: value.kind ? String(value.kind).trim() : "",
    badge: value.badge ? String(value.badge).trim() : "",
    summary: value.summary ? String(value.summary).trim() : "",
  };
}

function normalizePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const copy = {};
  Object.keys(value).forEach((key) => {
    const next = value[key];
    if (isJsonSafeValue(next)) {
      copy[key] = next;
    }
  });
  return copy;
}

function normalizeErrorMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const copy = {};
  Object.keys(value).forEach((key) => {
    const message = Array.isArray(value[key]) ? String(value[key][0] || "").trim() : String(value[key] || "").trim();
    if (message) {
      copy[key] = message;
    }
  });
  return copy;
}

function normalizeBridgeRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Form bridge payload.rows must be an array.");
  }
  return rows.map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(`Form bridge row ${rowIndex + 1} must be an array.`);
    }
    return row.map((item, itemIndex) => normalizeBridgeRowItem(item, rowIndex, itemIndex));
  });
}

function normalizeBridgeRowItem(item, rowIndex, itemIndex) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Form bridge row item ${rowIndex + 1}:${itemIndex + 1} must be an object.`);
  }
  const type = String(item.type || "").trim().toLowerCase();
  if (!BRIDGE_FORM_SUPPORTED_TYPES[type]) {
    throw new Error(`Unsupported row type: ${type || "(missing type)"}`);
  }
  const next = {};
  Object.keys(item).forEach((key) => {
    if (!BRIDGE_FORM_SUPPORTED_TYPES[type].includes(key)) {
      return;
    }
    const value = item[key];
    if (key === "items" || key === "options") {
      next[key] = normalizeBridgeSelectItems(value);
      return;
    }
    if (isJsonSafeValue(value)) {
      next[key] = value;
    }
  });
  next.type = type;
  return next;
}

function normalizeBridgeSelectItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        label: String(item.label || item.value || "").trim(),
        value: String(item.value || item.label || "").trim(),
      };
    }
    const value = String(item || "").trim();
    return { label: value, value };
  }).filter((item) => item.label && item.value);
}

function normalizeBridgeFormCloseReason(meta = {}) {
  if (meta.reason === "submit") {
    return "submit";
  }
  if (meta.reason === "action" && meta.actionId && meta.actionId !== "cancel") {
    return "action";
  }
  if (meta.reason === "action" && meta.actionId === "cancel") {
    return "cancel";
  }
  return "dismiss";
}

function normalizeBridgeSessionEventType(meta = {}) {
  const reason = normalizeBridgeFormCloseReason(meta);
  if (reason === "action") {
    return "action";
  }
  if (reason === "cancel") {
    return "cancel";
  }
  if (reason === "submit") {
    return "submit";
  }
  return "dismiss";
}

function shouldUseWorkspaceBridge(options = {}) {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return false;
  }
  if (normalizeRenderTarget(options?.renderTarget) === "local") {
    return false;
  }
  const mode = options?.workspaceBridge;
  if (mode === false) {
    return false;
  }
  return true;
}

function shouldUseWorkspacePortal(options = {}) {
  if (normalizeRenderTarget(options?.renderTarget) === "local") {
    return false;
  }
  const mode = options?.workspaceBridge;
  if (mode === false) {
    return false;
  }
  return true;
}

function isBridgeRequest(message) {
  return Boolean(
    message
    && typeof message === "object"
    && BRIDGE_NAMESPACES.includes(String(message.namespace || ""))
    && message.phase === "request"
    && typeof message.id === "string"
    && typeof message.method === "string"
  );
}

function isBridgeResponse(message) {
  return Boolean(
    message
    && typeof message === "object"
    && BRIDGE_NAMESPACES.includes(String(message.namespace || ""))
    && message.phase === "response"
    && typeof message.id === "string"
  );
}

function isBridgeEvent(message) {
  return Boolean(
    message
    && typeof message === "object"
    && BRIDGE_NAMESPACES.includes(String(message.namespace || ""))
    && message.phase === "event"
    && typeof message.modalId === "string"
    && typeof message.eventType === "string"
  );
}

function normalizeBridgeNamespace(value) {
  const namespace = String(value || "").trim();
  if (BRIDGE_NAMESPACES.includes(namespace)) {
    return namespace;
  }
  return BRIDGE_NAMESPACE_V1;
}

function normalizeTrustedOrigins(origins) {
  if (Array.isArray(origins) && origins.length) {
    return origins.map((item) => String(item)).filter(Boolean);
  }
  const currentOrigin = typeof window !== "undefined" ? String(window.location.origin || "") : "";
  return [currentOrigin, "null"].filter(Boolean);
}

function isTrustedOrigin(origin, trustedOrigins) {
  const current = String(origin || "");
  return trustedOrigins.includes("*") || trustedOrigins.includes(current);
}

function postWorkspaceBridgeEvent(session, eventType, payload = {}) {
  if (!session?.sourceWindow || typeof session.sourceWindow.postMessage !== "function") {
    return;
  }
  session.sourceWindow.postMessage({
    namespace: session.namespace,
    phase: "event",
    modalId: session.id,
    eventType: String(eventType || ""),
    payload,
  }, session.sourceOrigin || "*");
}

async function createWorkspaceFormSession(payload = {}, options = {}) {
  const available = await probeWorkspaceUiBridge(options);
  if (!available) {
    throw new Error("Workspace UI bridge is unavailable.");
  }
  const opened = await requestWorkspaceUi("modal.form.session.open", payload, {
    ...options,
    namespace: BRIDGE_NAMESPACE_V2,
  });
  const modalId = String(opened?.modalId || "").trim();
  if (!modalId) {
    throw new Error("Workspace form session did not return a modalId.");
  }

  const targetOrigin = typeof options?.targetOrigin === "string" && options.targetOrigin.trim() ? options.targetOrigin.trim() : "*";
  const queue = [];
  const waiters = [];
  let destroyed = false;

  function onMessage(event) {
    if (destroyed) {
      return;
    }
    if (targetOrigin !== "*" && event.origin !== targetOrigin) {
      return;
    }
    const message = event.data;
    if (!isBridgeEvent(message) || message.modalId !== modalId) {
      return;
    }
    const next = {
      type: String(message.eventType || ""),
      ...(message.payload && typeof message.payload === "object" ? message.payload : {}),
    };
    const waiter = waiters.shift();
    if (waiter) {
      window.clearTimeout(waiter.timer);
      waiter.resolve(next);
      return;
    }
    queue.push(next);
  }

  window.addEventListener("message", onMessage);

  function cleanup() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    window.removeEventListener("message", onMessage);
    while (waiters.length) {
      const waiter = waiters.shift();
      window.clearTimeout(waiter.timer);
      waiter.reject(new Error("Workspace form session was destroyed."));
    }
  }

  return {
    modalId,
    nextEvent(timeoutMs = 0) {
      if (queue.length) {
        return Promise.resolve(queue.shift());
      }
      return new Promise((resolve, reject) => {
        let timer = 0;
        if (timeoutMs > 0) {
          timer = window.setTimeout(() => {
            const index = waiters.findIndex((item) => item.resolve === resolve);
            if (index >= 0) {
              waiters.splice(index, 1);
            }
            reject(new Error("Workspace form session event timed out."));
          }, timeoutMs);
        }
        waiters.push({ resolve, reject, timer });
      });
    },
    update(nextPayload = {}) {
      return requestWorkspaceUi("modal.form.update", {
        modalId,
        ...nextPayload,
      }, {
        ...options,
        namespace: BRIDGE_NAMESPACE_V2,
      });
    },
    async close(nextPayload = {}) {
      try {
        await requestWorkspaceUi("modal.form.close", {
          modalId,
          ...nextPayload,
        }, {
          ...options,
          namespace: BRIDGE_NAMESPACE_V2,
        });
      } finally {
        cleanup();
      }
    },
    destroy() {
      cleanup();
    },
  };
}

function resolveTimeout(value) {
  if (value === 0 || value === false || value == null) {
    return 0;
  }
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : DEFAULT_TIMEOUT_MS;
}

function normalizeRenderTarget(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  if (normalized === "local" || normalized === "parent" || normalized === "auto") {
    return normalized;
  }
  return "auto";
}

function isElementNode(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value.nodeType === 1
    && typeof value.appendChild === "function"
    && value.ownerDocument
  );
}

function isJsonSafeValue(value) {
  if (value == null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonSafeValue(item));
  }
  if (typeof value === "object") {
    return Object.values(value).every((item) => isJsonSafeValue(item));
  }
  return false;
}

const BRIDGE_FORM_SUPPORTED_TYPES = {
  input: ["type", "input", "name", "label", "value", "placeholder", "autocomplete", "required", "readonly", "disabled", "help", "span", "pattern", "min", "max", "step", "inputmode"],
  textarea: ["type", "name", "label", "value", "placeholder", "required", "readonly", "disabled", "help", "span"],
  select: ["type", "name", "label", "value", "required", "disabled", "help", "span", "options"],
  checkbox: ["type", "name", "label", "value", "required", "disabled", "help", "span"],
  "ui.select": ["type", "name", "label", "value", "required", "disabled", "help", "span", "items", "placeholder", "searchable", "multiple", "closeOnSelect", "selectOnTab", "clearable", "emptyText"],
  hidden: ["type", "name", "value"],
  text: ["type", "content", "className", "span"],
  alert: ["type", "content", "tone", "className", "span"],
  divider: ["type", "className", "span"],
  display: ["type", "name", "label", "value", "help", "emptyText", "span"],
};

function getDelegatedDialogFallbackResult(kind) {
  switch (String(kind || "")) {
    case "alert":
      return true;
    case "confirm":
      return false;
    case "prompt":
      return null;
    default:
      return null;
  }
}


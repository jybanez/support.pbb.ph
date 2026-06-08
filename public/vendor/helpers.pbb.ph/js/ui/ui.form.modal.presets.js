import { createFormModal } from "./ui.form.modal.js?v=0.21.64";
import { resolveWorkspaceOverlayParent, getWorkspaceUiBridge } from "./ui.workspace.bridge.js?v=0.21.64";

export function createLoginFormModal(options = {}) {
  if (shouldUseCrossOriginFormBridge(options)) {
    return createDelegatedPresetFormModal("login", options, buildLoginBridgePayload);
  }
  const fields = normalizeFieldMap(options.fields, {
    identifier: "email",
    password: "password",
  });
  const identifierKind = normalizeIdentifierKind(options.identifierKind);
  const identifierLabel = String(options.identifierLabel || (identifierKind === "username" ? "Username" : "Email address"));
  const identifierPlaceholder = String(options.identifierPlaceholder || (identifierKind === "username" ? "Enter username" : "name@agency.gov.ph"));
  const identifierInput = identifierKind === "username" ? "text" : "email";
  const identifierAutocomplete = String(options.identifierAutocomplete || (identifierKind === "username" ? "username" : "username"));
  const passwordLabel = String(options.passwordLabel || "Password");
  const passwordPlaceholder = String(options.passwordPlaceholder || "Enter password");
  const message = String(options.message || "Please sign in to continue.");

  return createFormModal({
    ...options,
    title: options.title || "Operator Login",
    size: options.size || "sm",
    busyMessage: options.busyMessage || "Signing in...",
    submitLabel: options.submitLabel || "Login",
    rows: [
      [{ type: "text", content: message }],
      [{
        type: "input",
        input: identifierInput,
        name: fields.identifier,
        label: identifierLabel,
        value: resolveInitialValue(options, fields.identifier),
        placeholder: identifierPlaceholder,
        autocomplete: identifierAutocomplete,
        required: true,
      }],
      [{
        type: "input",
        input: "password",
        name: fields.password,
        label: passwordLabel,
        value: resolveInitialValue(options, fields.password),
        placeholder: passwordPlaceholder,
        autocomplete: "current-password",
        required: true,
      }],
    ],
  });
}

export function createReauthFormModal(options = {}) {
  if (shouldUseCrossOriginFormBridge(options)) {
    return createDelegatedPresetFormModal("reauth", options, buildReauthBridgePayload);
  }
  const fields = normalizeFieldMap(options.fields, {
    identifier: "email",
    password: "password",
  });
  const identifierKind = normalizeIdentifierKind(options.identifierKind);
  const identifierLabel = String(options.identifierLabel || (identifierKind === "username" ? "Username" : "Email address"));
  const identifierValue = String(
    options.identifierValue
    ?? resolveInitialValue(options, fields.identifier)
    ?? ""
  );
  const passwordLabel = String(options.passwordLabel || "Password");
  const passwordPlaceholder = String(options.passwordPlaceholder || "Re-enter password");
  const message = String(options.message || "Your session has expired. Please re-enter your password to continue.");
  const rows = [
    [{ type: "text", content: message }],
    [{
      type: "input",
      input: identifierKind === "username" ? "text" : "email",
      name: fields.identifier,
      label: identifierLabel,
      value: identifierValue,
      readonly: true,
      disabled: true,
      autocomplete: identifierKind === "username" ? "username" : "username",
    }],
    [{
      type: "input",
      input: "password",
      name: fields.password,
      label: passwordLabel,
      value: resolveInitialValue(options, fields.password),
      placeholder: passwordPlaceholder,
      autocomplete: "current-password",
      required: true,
    }],
  ];

  return createFormModal({
    ...options,
    title: options.title || "Session Expired",
    size: options.size || "sm",
    busyMessage: options.busyMessage || "Re-authenticating...",
    submitLabel: options.submitLabel || "Continue",
    rows,
  });
}

function createDelegatedPresetFormModal(intent, options, buildPayload) {
  const currentOptions = { ...(options || {}) };
  let destroyed = false;
  let open = false;
  let lastResult = null;

  async function openModal() {
    if (destroyed) {
      return null;
    }
    open = true;
    let initialValues = normalizeInitialValues(currentOptions.initialValues);
    let fieldErrors = {};
    let formError = "";

    try {
      while (!destroyed) {
        const payload = buildPayload(currentOptions, {
          intent,
          initialValues,
          fieldErrors,
          formError,
        });
        let session;
        try {
          const bridge = getWorkspaceUiBridge({
            timeoutMs: currentOptions.workspaceBridgeTimeoutMs,
            targetOrigin: currentOptions.workspaceBridgeTargetOrigin,
          });
          session = await bridge.openFormSession(payload);
        } catch {
          return openLocalFallback(intent, currentOptions);
        }

        lastResult = session;
        while (!destroyed) {
          const response = await session.nextEvent();
          const reason = String(response?.type || response?.reason || "dismiss");
          if (reason === "action") {
            const values = response?.values && typeof response.values === "object" ? response.values : {};
            const actionId = String(response?.actionId || "");
            const action = Array.isArray(currentOptions.extraActions)
              ? currentOptions.extraActions.find((candidate) => String(candidate?.id || "") === actionId)
              : null;
            if (!action || typeof action.onClick !== "function") {
              initialValues = {
                ...initialValues,
                ...values,
              };
              continue;
            }

            const bridgeContext = createDelegatedActionContext(action, session, currentOptions);
            const actionResult = await action.onClick(values, bridgeContext, actionId);
            if (action.closeOnClick === true && actionResult !== false) {
              open = false;
              currentOptions.onClose?.({
                reason: "action",
                actionId,
                result: values,
              });
              return response;
            }

            await session.update({
              values,
              fieldErrors: bridgeContext.getErrors(),
              formError: bridgeContext.getFormError(),
              busy: false,
            });
            initialValues = {
              ...initialValues,
              ...values,
            };
            fieldErrors = bridgeContext.getErrors();
            formError = bridgeContext.getFormError();
            continue;
          }

          if (reason !== "submit") {
            session.destroy?.();
            open = false;
            currentOptions.onClose?.({
              reason,
              actionId: reason === "cancel" ? "cancel" : null,
              result: response?.values || null,
            });
            return response;
          }

          const values = response?.values && typeof response.values === "object" ? response.values : {};
          if (typeof currentOptions.onSubmit !== "function") {
            await session.close({
              reason: "submit",
            });
            open = false;
            currentOptions.onClose?.({
              reason: "submit",
              actionId: "submit",
              result: values,
            });
            return response;
          }

          await session.update({
            busy: true,
            busyMessage: currentOptions.busyMessage,
            values,
            fieldErrors: {},
            formError: "",
          });

          const bridgeContext = createDelegatedSubmitContext(session, currentOptions);
          const accepted = await currentOptions.onSubmit(values, bridgeContext);
          if (accepted) {
            await session.close({
              reason: "submit",
            });
            open = false;
            currentOptions.onClose?.({
              reason: "submit",
              actionId: "submit",
              result: values,
            });
            return response;
          }

          await session.update({
            busy: bridgeContext.isBusy(),
            busyMessage: bridgeContext.getBusyMessage(),
            values,
            fieldErrors: bridgeContext.getErrors(),
            formError: bridgeContext.getFormError(),
          });

          initialValues = {
            ...initialValues,
            ...values,
          };
          fieldErrors = bridgeContext.getErrors();
          formError = bridgeContext.getFormError();
        }
      }
      return null;
    } finally {
      open = false;
    }
  }

  function openLocalFallback(nextIntent, nextOptions) {
    const factories = {
      login: createLocalLoginFormModal,
      reauth: createLocalReauthFormModal,
      account: createLocalAccountFormModal,
      "change-password": createLocalChangePasswordFormModal,
    };
    const localFactory = factories[nextIntent] || createLocalLoginFormModal;
    const modal = localFactory(nextOptions);
    lastResult = modal;
    return modal.open();
  }

  return {
    open: openModal,
    async close(meta = {}) {
      open = false;
      currentOptions.onClose?.(meta);
      return true;
    },
    update(nextOptions = {}) {
      Object.assign(currentOptions, nextOptions || {});
    },
    destroy() {
      destroyed = true;
      open = false;
    },
    getState() {
      return {
        open,
        options: { ...currentOptions },
        lastResult,
      };
    },
  };
}

function createDelegatedSubmitContext(session = null, options = {}) {
  let fieldErrors = {};
  let formError = "";
  let busy = true;
  let busyMessage = String(options.busyMessage || "").trim();

  return {
    setErrors(nextErrors = {}) {
      fieldErrors = normalizeApiErrors(nextErrors).fieldErrors;
    },
    clearErrors() {
      fieldErrors = {};
    },
    setFormError(message) {
      formError = String(message || "").trim();
    },
    clearFormError() {
      formError = "";
    },
    applyApiErrors(response) {
      const mapped = normalizeApiErrors(response);
      fieldErrors = mapped.fieldErrors;
      formError = mapped.formError;
      return mapped;
    },
    getErrors() {
      return { ...fieldErrors };
    },
    getFormError() {
      return formError;
    },
    setBusy(nextBusy, nextBusyMessage) {
      busy = nextBusy !== false;
      if (nextBusyMessage != null) {
        busyMessage = String(nextBusyMessage || "").trim();
      }
      if (session) {
        void session.update({
          busy,
          busyMessage,
        });
      }
    },
    isBusy() {
      return busy;
    },
    getBusyMessage() {
      return busyMessage;
    },
    mode: "",
    modal: null,
    changedFieldName: null,
  };
}

function createDelegatedActionContext(action, session = null, options = {}) {
  const base = createDelegatedSubmitContext(session, options);
  return {
    ...base,
    action,
    actionId: String(action?.id || ""),
    event: null,
  };
}

function buildLoginBridgePayload(options, state) {
  const fields = normalizeFieldMap(options.fields, {
    identifier: "email",
    password: "password",
  });
  const identifierKind = normalizeIdentifierKind(options.identifierKind);
  const identifierLabel = String(options.identifierLabel || (identifierKind === "username" ? "Username" : "Email address"));
  const identifierPlaceholder = String(options.identifierPlaceholder || (identifierKind === "username" ? "Enter username" : "name@agency.gov.ph"));
  const identifierInput = identifierKind === "username" ? "text" : "email";
  const identifierAutocomplete = String(options.identifierAutocomplete || "username");
  const passwordLabel = String(options.passwordLabel || "Password");
  const passwordPlaceholder = String(options.passwordPlaceholder || "Enter password");
  const message = String(options.message || "Please sign in to continue.");

  return {
    intent: state.intent,
    title: options.title || "Operator Login",
    ownerTitle: resolveBridgeOwnerTitle(options),
    size: options.size || "sm",
    submitLabel: options.submitLabel || "Login",
    cancelLabel: options.cancelLabel || "Cancel",
    busyMessage: options.busyMessage || "Signing in...",
    closeOnBackdrop: options.closeOnBackdrop !== false,
    closeOnEscape: options.closeOnEscape !== false,
    initialValues: {
      ...state.initialValues,
    },
    fieldErrors: state.fieldErrors,
    formError: state.formError,
    rows: [
      [{ type: "text", content: message }],
      [{
        type: "input",
        input: identifierInput,
        name: fields.identifier,
        label: identifierLabel,
        placeholder: identifierPlaceholder,
        autocomplete: identifierAutocomplete,
        required: true,
      }],
      [{
        type: "input",
        input: "password",
        name: fields.password,
        label: passwordLabel,
        placeholder: passwordPlaceholder,
        autocomplete: "current-password",
        required: true,
      }],
    ],
  };
}

function buildReauthBridgePayload(options, state) {
  const fields = normalizeFieldMap(options.fields, {
    identifier: "email",
    password: "password",
  });
  const identifierKind = normalizeIdentifierKind(options.identifierKind);
  const identifierLabel = String(options.identifierLabel || (identifierKind === "username" ? "Username" : "Email address"));
  const identifierValue = String(
    options.identifierValue
    ?? state.initialValues?.[fields.identifier]
    ?? ""
  );
  const passwordLabel = String(options.passwordLabel || "Password");
  const passwordPlaceholder = String(options.passwordPlaceholder || "Re-enter password");
  const message = String(options.message || "Your session has expired. Please re-enter your password to continue.");

  return {
    intent: state.intent,
    title: options.title || "Session Expired",
    ownerTitle: resolveBridgeOwnerTitle(options),
    size: options.size || "sm",
    submitLabel: options.submitLabel || "Continue",
    cancelLabel: options.cancelLabel || "Cancel",
    busyMessage: options.busyMessage || "Re-authenticating...",
    closeOnBackdrop: options.closeOnBackdrop === true ? true : false,
    closeOnEscape: options.closeOnEscape === true ? true : false,
    context: {
      badge: identifierKind === "username" ? "USER" : "EMAIL",
      summary: identifierValue,
    },
    initialValues: {
      ...state.initialValues,
      [fields.identifier]: identifierValue,
    },
    fieldErrors: state.fieldErrors,
    formError: state.formError,
    rows: [
      [{ type: "text", content: message }],
      [{
        type: "display",
        name: fields.identifier,
        label: identifierLabel,
      }],
      [{
        type: "hidden",
        name: fields.identifier,
      }],
      [{
        type: "input",
        input: "password",
        name: fields.password,
        label: passwordLabel,
        placeholder: passwordPlaceholder,
        autocomplete: "current-password",
        required: true,
      }],
    ],
  };
}

function buildAccountBridgePayload(options, state) {
  const fields = normalizeFieldMap(options.fields, {
    name: "name",
    email: "email",
  });
  const message = String(options.message || "").trim();
  const extraRows = normalizeRows(options.extraRows);

  return {
    intent: state.intent,
    title: options.title || "Account",
    ownerTitle: resolveBridgeOwnerTitle(options),
    size: options.size || "sm",
    submitLabel: options.submitLabel || "Save",
    cancelLabel: options.cancelLabel || "Cancel",
    busyMessage: options.busyMessage || "Saving account...",
    closeOnBackdrop: options.closeOnBackdrop !== false,
    closeOnEscape: options.closeOnEscape !== false,
    extraActionsPlacement: options.extraActionsPlacement,
    extraActions: serializeBridgeExtraActions(options.extraActions),
    initialValues: {
      ...state.initialValues,
    },
    fieldErrors: state.fieldErrors,
    formError: state.formError,
    rows: [
      ...(message ? [[{ type: "text", content: message }]] : []),
      [{
        type: "input",
        input: "text",
        name: fields.name,
        label: String(options.nameLabel || "Name"),
        placeholder: String(options.namePlaceholder || "Enter your name"),
        autocomplete: String(options.nameAutocomplete || "name"),
        required: true,
      }],
      [{
        type: "input",
        input: "email",
        name: fields.email,
        label: String(options.emailLabel || "Email"),
        placeholder: String(options.emailPlaceholder || "name@agency.gov.ph"),
        autocomplete: String(options.emailAutocomplete || "email"),
        required: true,
      }],
      ...extraRows,
    ],
  };
}

function buildAccountAvatarRow(options, fields) {
  const avatar = normalizeAccountAvatarOptions(options.avatar);
  if (!avatar) {
    return null;
  }
  return [{
    type: "avatar",
    name: fields.avatar,
    span: 2,
    accept: avatar.accept,
    capture: avatar.capture,
    label: avatar.label,
    help: avatar.help,
    placeholderText: avatar.placeholderText,
    selectLabel: avatar.selectLabel,
    changeLabel: avatar.changeLabel,
    emptyText: avatar.emptyText,
    previewText: avatar.previewText,
    previewAlt: avatar.previewAlt,
    previewUrl: avatar.previewUrl,
    required: avatar.required,
    disabled: avatar.disabled,
    readonly: avatar.readonly,
  }];
}

function hasAccountAvatar(options = {}) {
  return Boolean(normalizeAccountAvatarOptions(options.avatar));
}

function normalizeAccountAvatarOptions(value) {
  if (value === false || value == null) {
    return null;
  }
  const options = value === true ? {} : (value && typeof value === "object" ? value : {});
  const previewUrl = typeof options.previewUrl === "string" && options.previewUrl.trim()
    ? options.previewUrl.trim()
    : (typeof options.src === "string" && options.src.trim() ? options.src.trim() : "");
  return {
    label: typeof options.label === "string" ? options.label.trim() : "",
    help: typeof options.help === "string" ? options.help.trim() : "",
    accept: typeof options.accept === "string" && options.accept.trim() ? options.accept.trim() : "image/*",
    capture: typeof options.capture === "string" && options.capture.trim() ? options.capture.trim() : "",
    placeholderText: typeof options.placeholderText === "string" && options.placeholderText.trim() ? options.placeholderText.trim() : "Photo",
    selectLabel: typeof options.selectLabel === "string" && options.selectLabel.trim() ? options.selectLabel.trim() : "Choose photo",
    changeLabel: typeof options.changeLabel === "string" && options.changeLabel.trim() ? options.changeLabel.trim() : "Change photo",
    emptyText: typeof options.emptyText === "string" && options.emptyText.trim() ? options.emptyText.trim() : "Click to choose a profile photo.",
    previewText: typeof options.previewText === "string" && options.previewText.trim() ? options.previewText.trim() : "Current profile photo",
    previewAlt: typeof options.previewAlt === "string" && options.previewAlt.trim() ? options.previewAlt.trim() : "Profile photo preview",
    previewUrl,
    required: options.required === true,
    disabled: options.disabled === true,
    readonly: options.readonly === true,
  };
}

function buildChangePasswordBridgePayload(options, state) {
  const fields = normalizeFieldMap(options.fields, {
    currentPassword: "current_password",
    newPassword: "new_password",
    confirmPassword: "confirm_password",
  });
  const message = String(options.message || "").trim();

  return {
    intent: state.intent,
    title: options.title || "Change Password",
    ownerTitle: resolveBridgeOwnerTitle(options),
    size: options.size || "sm",
    submitLabel: options.submitLabel || "Update Password",
    cancelLabel: options.cancelLabel || "Cancel",
    busyMessage: options.busyMessage || "Updating password...",
    closeOnBackdrop: options.closeOnBackdrop !== false,
    closeOnEscape: options.closeOnEscape !== false,
    initialValues: {
      ...state.initialValues,
    },
    fieldErrors: state.fieldErrors,
    formError: state.formError,
    rows: [
      ...(message ? [[{ type: "text", content: message }]] : []),
      [{
        type: "input",
        input: "password",
        name: fields.currentPassword,
        label: String(options.currentPasswordLabel || "Current Password"),
        placeholder: String(options.currentPasswordPlaceholder || "Enter current password"),
        autocomplete: "current-password",
        required: true,
      }],
      [{
        type: "input",
        input: "password",
        name: fields.newPassword,
        label: String(options.newPasswordLabel || "New Password"),
        placeholder: String(options.newPasswordPlaceholder || "Enter new password"),
        autocomplete: "new-password",
        required: true,
      }],
      [{
        type: "input",
        input: "password",
        name: fields.confirmPassword,
        label: String(options.confirmPasswordLabel || "Confirm Password"),
        placeholder: String(options.confirmPasswordPlaceholder || "Re-enter new password"),
        autocomplete: "new-password",
        required: true,
      }],
    ],
  };
}

function createLocalLoginFormModal(options) {
  const localOptions = { ...(options || {}), workspaceBridge: false, renderTarget: "local" };
  return createFormModal({
    ...localOptions,
    title: localOptions.title || "Operator Login",
    size: localOptions.size || "sm",
    busyMessage: localOptions.busyMessage || "Signing in...",
    submitLabel: localOptions.submitLabel || "Login",
    rows: [
      [{ type: "text", content: String(localOptions.message || "Please sign in to continue.") }],
      [{
        type: "input",
        input: normalizeIdentifierKind(localOptions.identifierKind) === "username" ? "text" : "email",
        name: normalizeFieldMap(localOptions.fields, { identifier: "email", password: "password" }).identifier,
        label: String(localOptions.identifierLabel || (normalizeIdentifierKind(localOptions.identifierKind) === "username" ? "Username" : "Email address")),
        value: resolveInitialValue(localOptions, normalizeFieldMap(localOptions.fields, { identifier: "email", password: "password" }).identifier),
        placeholder: String(localOptions.identifierPlaceholder || (normalizeIdentifierKind(localOptions.identifierKind) === "username" ? "Enter username" : "name@agency.gov.ph")),
        autocomplete: String(localOptions.identifierAutocomplete || "username"),
        required: true,
      }],
      [{
        type: "input",
        input: "password",
        name: normalizeFieldMap(localOptions.fields, { identifier: "email", password: "password" }).password,
        label: String(localOptions.passwordLabel || "Password"),
        value: resolveInitialValue(localOptions, normalizeFieldMap(localOptions.fields, { identifier: "email", password: "password" }).password),
        placeholder: String(localOptions.passwordPlaceholder || "Enter password"),
        autocomplete: "current-password",
        required: true,
      }],
    ],
  });
}

function createLocalReauthFormModal(options) {
  const localOptions = { ...(options || {}), workspaceBridge: false, renderTarget: "local" };
  const fields = normalizeFieldMap(localOptions.fields, { identifier: "email", password: "password" });
  const identifierKind = normalizeIdentifierKind(localOptions.identifierKind);
  const identifierValue = String(localOptions.identifierValue ?? resolveInitialValue(localOptions, fields.identifier) ?? "");
  return createFormModal({
    ...localOptions,
    title: localOptions.title || "Session Expired",
    size: localOptions.size || "sm",
    busyMessage: localOptions.busyMessage || "Re-authenticating...",
    submitLabel: localOptions.submitLabel || "Continue",
    rows: [
      [{ type: "text", content: String(localOptions.message || "Your session has expired. Please re-enter your password to continue.") }],
      [{
        type: "input",
        input: identifierKind === "username" ? "text" : "email",
        name: fields.identifier,
        label: String(localOptions.identifierLabel || (identifierKind === "username" ? "Username" : "Email address")),
        value: identifierValue,
        readonly: true,
        disabled: true,
        autocomplete: "username",
      }],
      [{
        type: "input",
        input: "password",
        name: fields.password,
        label: String(localOptions.passwordLabel || "Password"),
        value: resolveInitialValue(localOptions, fields.password),
        placeholder: String(localOptions.passwordPlaceholder || "Re-enter password"),
        autocomplete: "current-password",
        required: true,
      }],
    ],
  });
}

function createLocalAccountFormModal(options) {
  return createAccountFormModal({
    ...(options || {}),
    workspaceBridge: false,
    renderTarget: "local",
  });
}

function createLocalChangePasswordFormModal(options) {
  return createChangePasswordFormModal({
    ...(options || {}),
    workspaceBridge: false,
    renderTarget: "local",
  });
}

export function createStatusUpdateFormModal(options = {}) {
  const fields = normalizeFieldMap(options.fields, {
    status: "status",
    remarks: "remarks",
    notify: "notify",
  });
  const statusOptions = normalizeOptionsList(options.statusOptions);
  const showNotify = options.showNotify !== false;

  return createFormModal({
    ...options,
    title: options.title || "Update Status",
    size: options.size || "sm",
    busyMessage: options.busyMessage || "Saving status update...",
    submitLabel: options.submitLabel || "Save Status",
    rows: [
      [{ type: "text", content: String(options.message || "Update the current operational status for this record.") }],
      [{
        type: "select",
        name: fields.status,
        label: String(options.statusLabel || "Status"),
        value: resolveInitialValue(options, fields.status),
        required: true,
        options: statusOptions,
      }],
      [{
        type: "textarea",
        name: fields.remarks,
        label: String(options.remarksLabel || "Remarks"),
        value: resolveInitialValue(options, fields.remarks),
        placeholder: String(options.remarksPlaceholder || "Add status notes"),
      }],
      ...(showNotify ? [[{
        type: "checkbox",
        name: fields.notify,
        label: String(options.notifyLabel || "Notify affected teams"),
        value: resolveCheckboxValue(options, fields.notify, options.defaultNotify !== false),
      }]] : []),
    ],
  });
}

export function createReasonFormModal(options = {}) {
  const fields = normalizeFieldMap(options.fields, {
    reasonCode: "reasonCode",
    reasonDetails: "reasonDetails",
    confirmText: "confirmText",
    notify: "notify",
  });
  const reasonOptions = normalizeOptionsList(options.reasonOptions);
  const confirmPhrase = String(options.confirmPhrase || "").trim();
  const showNotify = Boolean(options.showNotify);
  const detailsRequiredFor = normalizeReasonDetailsRequiredFor(options.detailsRequiredFor);

  return createFormModal({
    ...options,
    title: options.title || "Provide Reason",
    size: options.size || "sm",
    busyMessage: options.busyMessage || "Submitting reason...",
    submitLabel: options.submitLabel || "Confirm",
    submitVariant: options.submitVariant || "danger",
    onSubmit(values, ctx) {
      const reasonCode = String(values?.[fields.reasonCode] || "").trim();
      const reasonDetails = String(values?.[fields.reasonDetails] || "").trim();
      if (isReasonDetailsRequired(reasonCode, detailsRequiredFor) && !reasonDetails) {
        ctx?.setErrors?.({
          [fields.reasonDetails]: String(options.detailsRequiredMessage || "Details are required for the selected reason."),
        });
        return false;
      }
      if (typeof options.onSubmit === "function") {
        return options.onSubmit(values, ctx);
      }
      return true;
    },
    rows: [
      [{
        type: "alert",
        tone: options.alertTone || "danger",
        content: String(options.message || "This action may affect downstream operations. Please provide a reason before continuing."),
      }],
      [{
        type: "select",
        name: fields.reasonCode,
        label: String(options.reasonLabel || "Reason Category"),
        value: resolveInitialValue(options, fields.reasonCode),
        required: true,
        options: reasonOptions,
      }],
      [{
        type: "textarea",
        name: fields.reasonDetails,
        label: String(options.detailsLabel || "Details"),
        value: resolveInitialValue(options, fields.reasonDetails),
        placeholder: String(options.detailsPlaceholder || "Explain why this action is necessary."),
        required: detailsRequiredFor === true,
      }],
      ...(confirmPhrase ? [[{
        type: "input",
        input: "text",
        name: fields.confirmText,
        label: String(options.confirmLabel || `Type ${confirmPhrase} to confirm`),
        value: resolveInitialValue(options, fields.confirmText),
        placeholder: confirmPhrase,
        required: true,
        pattern: escapePattern(confirmPhrase),
      }]] : []),
      ...(showNotify ? [[{
        type: "checkbox",
        name: fields.notify,
        label: String(options.notifyLabel || "Notify affected users"),
        value: resolveCheckboxValue(options, fields.notify, false),
      }]] : []),
    ],
  });
}

export function createAccountFormModal(options = {}) {
  if (shouldUseCrossOriginFormBridge(options) && !hasAccountAvatar(options)) {
    return createDelegatedPresetFormModal("account", options, buildAccountBridgePayload);
  }
  const fields = normalizeFieldMap(options.fields, {
    avatar: "avatar",
    name: "name",
    email: "email",
  });
  const message = String(options.message || "").trim();
  const extraRows = normalizeRows(options.extraRows);
  const avatarRow = buildAccountAvatarRow(options, fields);

  return createFormModal({
    ...options,
    title: options.title || "Account",
    size: options.size || "sm",
    busyMessage: options.busyMessage || "Saving account...",
    submitLabel: options.submitLabel || "Save",
    rows: [
      ...(message ? [[{ type: "text", content: message }]] : []),
      ...(avatarRow ? [avatarRow] : []),
      [{
        type: "input",
        input: "text",
        name: fields.name,
        label: String(options.nameLabel || "Name"),
        value: resolveInitialValue(options, fields.name),
        placeholder: String(options.namePlaceholder || "Enter your name"),
        autocomplete: String(options.nameAutocomplete || "name"),
        required: true,
      }],
      [{
        type: "input",
        input: "email",
        name: fields.email,
        label: String(options.emailLabel || "Email"),
        value: resolveInitialValue(options, fields.email),
        placeholder: String(options.emailPlaceholder || "name@agency.gov.ph"),
        autocomplete: String(options.emailAutocomplete || "email"),
        required: true,
      }],
      ...extraRows,
    ],
  });
}

export function createChangePasswordFormModal(options = {}) {
  if (shouldUseCrossOriginFormBridge(options)) {
    return createDelegatedPresetFormModal("change-password", options, buildChangePasswordBridgePayload);
  }
  const fields = normalizeFieldMap(options.fields, {
    currentPassword: "current_password",
    newPassword: "new_password",
    confirmPassword: "confirm_password",
  });
  const message = String(options.message || "").trim();

  return createFormModal({
    ...options,
    title: options.title || "Change Password",
    size: options.size || "sm",
    busyMessage: options.busyMessage || "Updating password...",
    submitLabel: options.submitLabel || "Update Password",
    rows: [
      ...(message ? [[{ type: "text", content: message }]] : []),
      [{
        type: "input",
        input: "password",
        name: fields.currentPassword,
        label: String(options.currentPasswordLabel || "Current Password"),
        value: resolveInitialValue(options, fields.currentPassword),
        placeholder: String(options.currentPasswordPlaceholder || "Enter current password"),
        autocomplete: "current-password",
        required: true,
      }],
      [{
        type: "input",
        input: "password",
        name: fields.newPassword,
        label: String(options.newPasswordLabel || "New Password"),
        value: resolveInitialValue(options, fields.newPassword),
        placeholder: String(options.newPasswordPlaceholder || "Enter new password"),
        autocomplete: "new-password",
        required: true,
      }],
      [{
        type: "input",
        input: "password",
        name: fields.confirmPassword,
        label: String(options.confirmPasswordLabel || "Confirm Password"),
        value: resolveInitialValue(options, fields.confirmPassword),
        placeholder: String(options.confirmPasswordPlaceholder || "Re-enter new password"),
        autocomplete: "new-password",
        required: true,
      }],
    ],
  });
}

function normalizeFieldMap(value, fallback) {
  const input = value && typeof value === "object" ? value : {};
  return {
    ...fallback,
    ...Object.fromEntries(
      Object.entries(input).map(([key, fieldName]) => [key, String(fieldName || "").trim() || fallback[key]])
    ),
  };
}

function normalizeIdentifierKind(value) {
  const next = String(value || "email").trim().toLowerCase();
  return next === "username" ? "username" : "email";
}

function resolveBridgeOwnerTitle(options = {}) {
  const explicit = String(options.ownerTitle || "").trim();
  if (explicit) {
    return explicit;
  }
  if (typeof document !== "undefined") {
    const fallback = String(document.title || "").trim();
    if (fallback) {
      return fallback;
    }
  }
  return "";
}

function serializeBridgeExtraActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
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
      const id = String(action.id || `extra-action-${index}`).trim();
      if (!id || id === "cancel" || id === "submit") {
        return null;
      }
      return {
        id,
        label,
        variant: String(action.variant || "ghost").trim() || "ghost",
        icon: String(action.icon || "").trim(),
        className: String(action.className || "").trim(),
        closeOnClick: action.closeOnClick === true,
      };
    })
    .filter(Boolean);
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

function resolveInitialValue(options, name) {
  if (options.initialValues && typeof options.initialValues === "object" && Object.prototype.hasOwnProperty.call(options.initialValues, name)) {
    return options.initialValues[name];
  }
  return "";
}

function resolveCheckboxValue(options, name, fallback) {
  if (options.initialValues && typeof options.initialValues === "object" && Object.prototype.hasOwnProperty.call(options.initialValues, name)) {
    return Boolean(options.initialValues[name]);
  }
  return Boolean(fallback);
}

function normalizeReasonDetailsRequiredFor(value) {
  if (value === undefined) {
    return true;
  }
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === "string") {
    const next = String(value || "").trim();
    return next ? [next] : false;
  }
  if (Array.isArray(value)) {
    const values = value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return values.length ? values : false;
  }
  return true;
}

function isReasonDetailsRequired(reasonCode, detailsRequiredFor) {
  if (detailsRequiredFor === true) {
    return true;
  }
  if (!detailsRequiredFor) {
    return false;
  }
  const normalizedReasonCode = String(reasonCode || "").trim();
  return detailsRequiredFor.includes(normalizedReasonCode);
}

function escapePattern(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => (Array.isArray(row) ? row.filter(Boolean) : []))
    .filter((row) => row.length);
}

function shouldUseCrossOriginFormBridge(options = {}) {
  if (typeof window === "undefined" || !window.parent || window.parent === window) {
    return false;
  }
  if (String(options.renderTarget || "auto").trim().toLowerCase() === "local") {
    return false;
  }
  if (options.workspaceBridge === false) {
    return false;
  }
  return !resolveWorkspaceOverlayParent(options);
}

function normalizeInitialValues(initialValues) {
  return initialValues && typeof initialValues === "object" ? { ...initialValues } : {};
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


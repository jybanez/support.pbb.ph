import { createElement, clearNode } from "./ui.dom.js";
import { createActionModal } from "./ui.modal.js?v=0.21.61";
import { createIcon } from "./ui.icons.js?v=0.21.65";

const CHECK_KINDS = new Set([
  "microphone",
  "camera",
  "geolocation",
  "speechsynthesis",
  "speechrecognition",
  "notifications",
  "audioplayback",
  "mediadevices",
]);

const DEFAULT_DATA = {
  title: "",
  message: "",
  checks: [],
};

const DEFAULT_OPTIONS = {
  className: "",
  autoRun: true,
  allowRetry: true,
  showSummary: true,
  mode: "cards",
  onCheckStart: null,
  onCheckComplete: null,
  onRetry: null,
  onComplete: null,
};

const DEFAULT_MODAL_OPTIONS = {
  title: "Device Primer",
  size: "md",
  continueLabel: "Continue",
  retryLabel: "Retry Failed",
  showSummary: true,
  autoOpen: false,
  blockUntilReady: false,
  showCloseButton: true,
  closeOnBackdrop: true,
  closeOnEscape: true,
  autoCloseOnReady: true,
  autoRun: true,
  mode: "cards",
  onOpen: null,
  onClose: null,
  onComplete: null,
};

export function createDevicePrimer(container, data = {}, options = {}) {
  let currentData = normalizeData(data);
  let currentOptions = normalizeOptions(options);
  let root = null;
  let autoRunToken = 0;
  let runSequence = Promise.resolve();
  let queuedRuns = 0;
  let selectedCompactCheckId = "";

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    clearNode(container);
    root = createElement("section", {
      className: ["ui-device-primer", currentOptions.className || ""].filter(Boolean).join(" "),
    });

    if (currentData.title) {
      root.appendChild(createElement("h3", {
        className: "ui-title ui-device-primer-title",
        text: currentData.title,
      }));
    }
    if (currentData.message) {
      root.appendChild(createElement("p", {
        className: "ui-device-primer-message",
        text: currentData.message,
      }));
    }
    if (currentOptions.showSummary && currentOptions.mode !== "compact") {
      root.appendChild(createSummaryNode());
    }

    if (currentOptions.mode === "compact") {
      ensureCompactSelection();
    }
    const list = createElement("div", {
      className: [
        "ui-device-primer-list",
        currentOptions.mode === "compact" ? "is-compact" : "",
      ].filter(Boolean).join(" "),
      attrs: { role: "list" },
    });
    currentData.checks.forEach((check) => {
      list.appendChild(currentOptions.mode === "compact" ? createCompactCheckItem(check) : createCheckRow(check));
    });
    root.appendChild(list);
    if (currentOptions.mode === "compact") {
      const detailPanel = createCompactDetailPanel();
      if (detailPanel) {
        root.appendChild(detailPanel);
      }
    }
    container.appendChild(root);
  }

  function createSummaryNode() {
    const summary = getSummary();
    const tone = summary.hasFailures ? "warning" : (summary.allRequiredReady ? "success" : "info");
    const title = summary.hasFailures
      ? "Action needed"
      : (summary.allRequiredReady ? "Required checks ready" : "Checking device readiness");
    const summaryNode = createElement("div", {
      className: [
        "ui-device-primer-summary",
        summary.allRequiredReady ? "is-ready" : "",
        summary.hasFailures ? "is-failed" : "",
      ].filter(Boolean).join(" "),
    });
    const iconWrap = createElement("div", { className: "ui-device-primer-summary-icon" });
    iconWrap.appendChild(createIcon(`status.${tone}`, { size: 30, className: "ui-device-primer-summary-glyph" }));
    const body = createElement("div", { className: "ui-device-primer-summary-body" });
    body.appendChild(createElement("div", {
      className: "ui-device-primer-summary-eyebrow",
      text: title,
    }));
    body.appendChild(createElement("div", {
      className: "ui-device-primer-summary-text",
      text: summary.text,
    }));
    summaryNode.append(iconWrap, body);
    return summaryNode;
  }

  function createCheckRow(check) {
    const row = createElement("div", {
      className: ["ui-device-primer-row", `is-${check.status}`].join(" "),
      dataset: { checkId: check.id, checkKind: check.kind },
      attrs: { role: "listitem" },
    });
    const main = createElement("div", { className: "ui-device-primer-main" });
    const heading = createElement("div", { className: "ui-device-primer-heading" });
    const titleLine = createElement("div", { className: "ui-device-primer-titleline" });
    const titleBody = createElement("div", { className: "ui-device-primer-titlebody" });
    titleLine.appendChild(createCheckIcon(check));
    titleBody.appendChild(createElement("div", {
      className: "ui-device-primer-label",
      text: check.label,
    }));
    titleBody.appendChild(createElement("span", {
      className: `ui-badge ui-device-primer-required ${check.required ? "is-required" : "is-optional"}`,
      text: check.required ? "Required" : "Optional",
    }));
    titleLine.appendChild(titleBody);
    heading.appendChild(titleLine);
    const side = createElement("div", { className: "ui-device-primer-side" });
    side.appendChild(createStatusBadge(check.status));

    if (currentOptions.allowRetry && check.canRetry) {
      const retryButton = createElement("button", {
        className: "ui-button ui-button-quiet ui-device-primer-retry",
        attrs: { type: "button" },
      });
      retryButton.append(
        createIcon("actions.refresh", { size: 14, className: "ui-device-primer-retry-icon" }),
        createElement("span", { text: "Retry" }),
      );
      retryButton.addEventListener("click", () => {
        retryCheck(check.id).catch(() => {});
      });
      side.appendChild(retryButton);
    }

    heading.appendChild(side);
    main.appendChild(heading);
    if (check.description) {
      main.appendChild(createElement("div", {
        className: "ui-device-primer-description",
        text: check.description,
      }));
    }
    main.appendChild(createElement("div", {
      className: "ui-device-primer-detail",
      text: check.detailText,
    }));

    row.append(main);
    return row;
  }

  function createCompactCheckItem(check) {
    const label = formatCheckTooltip(check);
    const selected = String(check.id) === String(selectedCompactCheckId);
    const item = createElement("button", {
      className: [
        "ui-device-primer-compact-item",
        `is-${check.kind}`,
        `is-${check.status}`,
        check.required ? "is-required" : "is-optional",
        selected ? "is-selected" : "",
      ].join(" "),
      dataset: { checkId: check.id, checkKind: check.kind },
      attrs: {
        type: "button",
        role: "listitem",
        "aria-label": label,
        "aria-pressed": selected ? "true" : "false",
      },
    });
    const icon = createElement("span", {
      className: "ui-device-primer-compact-icon",
      attrs: { "aria-hidden": "true" },
    });
    icon.appendChild(createIcon(getCheckIconName(check.kind), {
      size: 22,
      className: "ui-device-primer-compact-glyph",
    }));
    item.append(
      icon,
      createElement("span", {
        className: "ui-device-primer-compact-status",
        attrs: { "aria-hidden": "true" },
      }),
    );
    item.addEventListener("click", () => {
      selectedCompactCheckId = check.id;
      render();
    });
    return item;
  }

  function createCompactDetailPanel() {
    const check = findCheck(selectedCompactCheckId) || currentData.checks[0] || null;
    if (!check) {
      return null;
    }
    const panel = createElement("div", {
      className: `ui-device-primer-compact-detail is-${check.status}`,
      attrs: {
        role: "status",
        "aria-live": check.status === "checking" ? "polite" : "off",
      },
    });
    const body = createElement("div", { className: "ui-device-primer-compact-detail-body" });
    body.appendChild(createElement("div", {
      className: "ui-device-primer-compact-detail-title",
      text: check.label,
    }));
    body.appendChild(createElement("div", {
      className: "ui-device-primer-compact-detail-meta",
      text: `${check.required ? "Required" : "Optional"} - ${formatStatusLabel(check.status)}`,
    }));
    if (check.description) {
      body.appendChild(createElement("div", {
        className: "ui-device-primer-compact-detail-description",
        text: check.description,
      }));
    }
    body.appendChild(createElement("div", {
      className: "ui-device-primer-compact-detail-text",
      text: check.detailText,
    }));
    panel.appendChild(body);
    if (currentOptions.allowRetry && (check.canRetry || check.status === "failed" || check.status === "blocked")) {
      const retryButton = createElement("button", {
        className: "ui-button ui-button-quiet ui-device-primer-compact-retry",
        attrs: { type: "button" },
      });
      retryButton.append(
        createIcon("actions.refresh", { size: 14, className: "ui-device-primer-retry-icon" }),
        createElement("span", { text: "Retry" }),
      );
      retryButton.addEventListener("click", () => {
        const action = check.canRetry ? retryCheck(check.id) : runCheck(check.id);
        action.catch(() => {});
      });
      panel.appendChild(retryButton);
    }
    return panel;
  }

  function ensureCompactSelection() {
    if (findCheck(selectedCompactCheckId)) {
      return;
    }
    const preferred = currentData.checks.find((check) => check.status === "failed" || check.status === "blocked")
      || currentData.checks[0]
      || null;
    selectedCompactCheckId = preferred?.id || "";
  }

  function update(nextData = {}, nextOptions = {}) {
    if (nextData && Object.prototype.hasOwnProperty.call(nextData, "title")) {
      currentData.title = nextData.title == null ? "" : String(nextData.title);
    }
    if (nextData && Object.prototype.hasOwnProperty.call(nextData, "message")) {
      currentData.message = nextData.message == null ? "" : String(nextData.message);
    }
    if (nextData && Object.prototype.hasOwnProperty.call(nextData, "checks")) {
      currentData.checks = normalizeChecks(nextData.checks);
    }
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
    scheduleAutoRun();
  }

  async function runAll() {
    for (const check of currentData.checks) {
      await runCheck(check.id);
    }
    emitComplete();
    return getState();
  }

  function runCheck(id) {
    if (queuedRuns === 0) {
      queuedRuns += 1;
      const immediateRun = executeCheck(id);
      runSequence = immediateRun.finally(() => {
        queuedRuns = Math.max(0, queuedRuns - 1);
      });
      return immediateRun;
    }
    queuedRuns += 1;
    const queuedRun = runSequence
      .catch(() => {})
      .then(() => executeCheck(id));
    runSequence = queuedRun.finally(() => {
      queuedRuns = Math.max(0, queuedRuns - 1);
    });
    return queuedRun;
  }

  async function executeCheck(id) {
    const check = findCheck(id);
    if (!check) {
      return null;
    }
    check.status = "checking";
    check.detailText = "Checking...";
    check.canRetry = false;
    check.updatedAt = Date.now();
    render();
    currentOptions.onCheckStart?.(cloneCheck(check), getState());

    const result = await performCheck(check);
    check.status = result.status;
    check.detailText = result.detailText;
    check.canRetry = Boolean(currentOptions.allowRetry && result.canRetry);
    check.updatedAt = Date.now();
    render();
    currentOptions.onCheckComplete?.(cloneCheck(check), getState());
    emitComplete();
    return cloneCheck(check);
  }

  function retryCheck(id) {
    const check = findCheck(id);
    if (!check) {
      return Promise.resolve(null);
    }
    currentOptions.onRetry?.(cloneCheck(check), getState());
    return runCheck(id);
  }

  function findCheck(id) {
    return currentData.checks.find((check) => check.id === id) || null;
  }

  function getState() {
    const summary = getSummary();
    return {
      title: currentData.title,
      message: currentData.message,
      checks: currentData.checks.map(cloneCheck),
      allComplete: summary.allComplete,
      allRequiredReady: summary.allRequiredReady,
      hasFailures: summary.hasFailures,
    };
  }

  function getSummary() {
    const checks = currentData.checks;
    const requiredChecks = checks.filter((check) => check.required);
    const readyRequiredCount = requiredChecks.filter((check) => check.status === "ready").length;
    const allComplete = checks.every((check) => check.status !== "pending" && check.status !== "checking");
    const allRequiredReady = requiredChecks.length === 0 || requiredChecks.every((check) => check.status === "ready");
    const hasFailures = checks.some((check) => check.status === "failed" || check.status === "blocked");
    const text = requiredChecks.length
      ? `${readyRequiredCount} of ${requiredChecks.length} required checks ready.`
      : `${checks.filter((check) => check.status === "ready").length} checks ready.`;
    return { allComplete, allRequiredReady, hasFailures, text };
  }

  function emitComplete() {
    currentOptions.onComplete?.(getState());
  }

  function scheduleAutoRun() {
    if (!currentOptions.autoRun) {
      return;
    }
    const token = ++autoRunToken;
    Promise.resolve().then(() => {
      if (token !== autoRunToken) {
        return;
      }
      runAll().catch(() => {});
    });
  }

  function destroy() {
    autoRunToken += 1;
    clearNode(container);
    root = null;
  }

  render();
  scheduleAutoRun();

  return {
    update,
    runAll,
    runCheck,
    retryCheck,
    getState,
    destroy,
  };
}

export function createDevicePrimerModal(data = {}, options = {}) {
  const modalOptions = normalizeModalOptions(options);
  const contentHost = createElement("div", { className: "ui-device-primer-modal-host" });
  let primerApi = null;
  let modalApi = null;
  let autoClosed = false;

  function refreshActions() {
    if (!modalApi || !primerApi) {
      return;
    }
    const state = primerApi.getState();
    const actions = [];
    if (state.hasFailures) {
      actions.push({
        id: "retry-failed",
        label: modalOptions.retryLabel,
        quiet: true,
        closeOnClick: false,
        onClick() {
          return runFailedChecks();
        },
      });
    }
    actions.push({
        id: "continue",
        label: modalOptions.continueLabel,
        primary: true,
        disabled: Boolean(modalOptions.blockUntilReady && !state.allRequiredReady),
      });
    modalApi.setActions(actions);
  }

  primerApi = createDevicePrimer(contentHost, data, {
    autoRun: modalOptions.autoRun,
    allowRetry: true,
    showSummary: modalOptions.showSummary,
    mode: modalOptions.mode,
    onCheckStart: modalOptions.onCheckStart || null,
    onCheckComplete: modalOptions.onCheckComplete || null,
    onRetry: modalOptions.onRetry || null,
    onComplete(state) {
      refreshActions();
      modalOptions.onComplete?.(state);
      maybeAutoClose(state);
    },
  });

  modalApi = createActionModal({
    title: modalOptions.title || data?.title || "Device Primer",
    size: modalOptions.size,
    content: contentHost,
    showCloseButton: modalOptions.showCloseButton,
    closeOnBackdrop: modalOptions.closeOnBackdrop,
    closeOnEscape: modalOptions.closeOnEscape,
    actions: [],
    onOpen: modalOptions.onOpen,
    onClose: modalOptions.onClose,
  });

  async function runFailedChecks() {
    const failedIds = primerApi.getState().checks.filter((check) => check.canRetry).map((check) => check.id);
    for (const id of failedIds) {
      await primerApi.retryCheck(id);
    }
    refreshActions();
    return primerApi.getState();
  }

  function maybeAutoClose(state = primerApi?.getState?.()) {
    if (!modalOptions.autoCloseOnReady || autoClosed || !modalApi) {
      return;
    }
    if (!modalApi.getState?.().open) {
      return;
    }
    if (!state?.allComplete || !state?.allRequiredReady || state?.hasFailures) {
      return;
    }
    autoClosed = true;
    modalApi.close?.({ reason: "device-primer-ready" });
  }

  refreshActions();
  if (modalOptions.autoOpen) {
    modalApi.open();
  }

  return {
    ...modalApi,
    open(content = undefined, nextOptions = undefined) {
      autoClosed = false;
      const opened = modalApi.open(content, nextOptions);
      Promise.resolve().then(() => maybeAutoClose());
      return opened;
    },
    update(nextData = {}, nextOptions = {}) {
      Object.assign(modalOptions, normalizeModalOptions({ ...modalOptions, ...(nextOptions || {}) }));
      autoClosed = false;
      primerApi.update(nextData, nextOptions);
      if (nextData && Object.prototype.hasOwnProperty.call(nextData, "title")) {
        modalApi.update({ title: nextData.title });
      } else if (nextOptions && Object.prototype.hasOwnProperty.call(nextOptions, "title")) {
        modalApi.update({ title: modalOptions.title });
      }
      refreshActions();
    },
    runAll() {
      return primerApi.runAll().then((state) => {
        refreshActions();
        maybeAutoClose(state);
        return state;
      });
    },
    runCheck(id) {
      return primerApi.runCheck(id).then((state) => {
        refreshActions();
        return state;
      });
    },
    retryCheck(id) {
      return primerApi.retryCheck(id).then((state) => {
        refreshActions();
        return state;
      });
    },
    getState() {
      return primerApi.getState();
    },
    getPrimer() {
      return primerApi;
    },
    destroy() {
      primerApi?.destroy?.();
      modalApi.destroy();
    },
  };
}

async function performCheck(check) {
  switch (check.kind) {
    case "microphone":
      return runMediaCheck({ audio: true }, "Microphone ready.");
    case "camera":
      return runMediaCheck({ video: true }, "Camera ready.");
    case "geolocation":
      return runGeolocationCheck();
    case "speechsynthesis":
      return runSpeechSynthesisCheck();
    case "speechrecognition":
      return runSpeechRecognitionCheck();
    case "notifications":
      return runNotificationCheck();
    case "audioplayback":
      return runAudioPlaybackCheck();
    case "mediadevices":
      return runMediaDevicesCheck();
    default:
      return { status: "unsupported", detailText: "Unsupported check kind.", canRetry: false };
  }
}

async function runMediaCheck(constraints, successText) {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return { status: "unsupported", detailText: "Media device access is not supported.", canRetry: false };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    try { stream?.getTracks?.().forEach((track) => track.stop()); } catch (_error) {}
    return { status: "ready", detailText: successText, canRetry: false };
  } catch (error) {
    return classifyCheckError(error, "Media device check failed.");
  }
}

function runGeolocationCheck() {
  if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== "function") {
    return Promise.resolve({ status: "unsupported", detailText: "Geolocation is not supported.", canRetry: false });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude || 0).toFixed(4);
        const lng = Number(position?.coords?.longitude || 0).toFixed(4);
        resolve({ status: "ready", detailText: `Location resolved at ${lat}, ${lng}.`, canRetry: false });
      },
      (error) => resolve(classifyCheckError(error, "Location check failed.")),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 0 }
    );
  });
}

function runSpeechSynthesisCheck() {
  if (!window.speechSynthesis) {
    return Promise.resolve({ status: "unsupported", detailText: "Speech synthesis is not supported.", canRetry: false });
  }
  return Promise.resolve({ status: "ready", detailText: "Speech synthesis is available.", canRetry: false });
}

function runSpeechRecognitionCheck() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    return Promise.resolve({ status: "unsupported", detailText: "Speech recognition is not supported.", canRetry: false });
  }
  return Promise.resolve({ status: "ready", detailText: "Speech recognition API is available.", canRetry: false });
}

async function runNotificationCheck() {
  if (typeof window.Notification === "undefined") {
    return { status: "unsupported", detailText: "Notifications are not supported.", canRetry: false };
  }
  if (window.Notification.permission === "granted") {
    return { status: "ready", detailText: "Notification permission granted.", canRetry: false };
  }
  if (window.Notification.permission === "denied") {
    return { status: "blocked", detailText: "Notification permission is blocked.", canRetry: true };
  }
  try {
    const result = await window.Notification.requestPermission();
    if (result === "granted") {
      return { status: "ready", detailText: "Notification permission granted.", canRetry: false };
    }
    if (result === "denied") {
      return { status: "blocked", detailText: "Notification permission denied.", canRetry: true };
    }
    return { status: "failed", detailText: "Notification permission was dismissed.", canRetry: true };
  } catch (error) {
    return classifyCheckError(error, "Notification check failed.");
  }
}

async function runAudioPlaybackCheck() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return { status: "unsupported", detailText: "Web Audio is not supported.", canRetry: false };
  }
  let context = null;
  try {
    context = new AudioContextCtor();
    if (context.state === "running") {
      return { status: "ready", detailText: "Audio playback is ready.", canRetry: false };
    }
    if (typeof context.resume === "function") {
      primeAudioContextOutput(context);
      const resumeResult = await attemptAudioContextResume(context, 900);
      if (resumeResult.ready) {
        return { status: "ready", detailText: "Audio playback is ready.", canRetry: false };
      }
      if (resumeResult.error) {
        return classifyCheckError(resumeResult.error, "Audio playback is not ready yet.");
      }
    }
    return {
      status: "blocked",
      detailText: getAudioPlaybackBlockedDetail(),
      canRetry: true,
    };
  } catch (error) {
    return classifyCheckError(error, "Audio playback is not ready yet.");
  } finally {
    try { await context?.close?.(); } catch (_error) {}
  }
}

function primeAudioContextOutput(context) {
  try {
    if (!context || typeof context.createOscillator !== "function" || typeof context.createGain !== "function" || !context.destination) {
      return;
    }
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    gain.gain.value = 0.00001;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    if (typeof oscillator.stop === "function") {
      oscillator.stop((Number(context.currentTime) || 0) + 0.02);
    }
  } catch (_error) {
    // Silent priming is best-effort only.
  }
}

function getAudioPlaybackBlockedDetail() {
  const defaultText = "Audio playback needs a user gesture before the audio context can start.";
  try {
    const isEmbedded = window.top !== window.self;
    const autoplayAllowed =
      document.permissionsPolicy?.allowsFeature?.("autoplay") ??
      document.featurePolicy?.allowsFeature?.("autoplay") ??
      null;
    if (isEmbedded && autoplayAllowed === false) {
      return "Audio playback is blocked by the host iframe permissions. Allow autoplay on the iframe, then retry.";
    }
    if (isEmbedded) {
      return "Audio playback may be blocked by embed permissions. If this page is inside an iframe, ensure the host allows autoplay, then retry.";
    }
  } catch (_error) {
    return defaultText;
  }
  return defaultText;
}

async function attemptAudioContextResume(context, timeoutMs = 400) {
  let resumeError = null;
  let resumeSettled = false;
  try {
    Promise.resolve(context.resume?.()).then(() => {
      resumeSettled = true;
    }).catch((error) => {
      resumeSettled = true;
      resumeError = error;
    });
  } catch (error) {
    resumeSettled = true;
    resumeError = error;
  }
  await Promise.resolve();
  await Promise.resolve();
  if (context?.state === "running") {
    return { ready: true, error: null };
  }
  if (resumeError) {
    return { ready: false, error: resumeError };
  }
  if (resumeSettled) {
    return { ready: false, error: null };
  }
  if (await Promise.race([
    waitForAudioContextRunning(context, timeoutMs),
    wait(Math.max(timeoutMs + 250, 0)).then(() => false),
  ])) {
    return { ready: true, error: null };
  }
  return { ready: false, error: resumeError };
}

function waitForAudioContextRunning(context, timeoutMs = 400) {
  if (!context || context.state === "running") {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      try {
        context.removeEventListener?.("statechange", handleStateChange);
      } catch (_error) {}
      const existing = context.onstatechange;
      if (existing === handleStateChange) {
        context.onstatechange = null;
      }
      resolve(Boolean(value));
    };
    const handleStateChange = () => {
      if (context.state === "running") {
        finish(true);
      }
    };
    try {
      context.addEventListener?.("statechange", handleStateChange);
    } catch (_error) {}
    if (!context.addEventListener && !context.onstatechange) {
      context.onstatechange = handleStateChange;
    }
    timer = setTimeout(() => finish(context.state === "running"), Math.max(0, Number(timeoutMs) || 0));
  });
}

function wait(timeoutMs = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(timeoutMs) || 0));
  });
}

async function runMediaDevicesCheck() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") {
    return { status: "unsupported", detailText: "Media device enumeration is not supported.", canRetry: false };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!Array.isArray(devices) || !devices.length) {
      return { status: "failed", detailText: "No media devices were reported.", canRetry: true };
    }
    return { status: "ready", detailText: `${devices.length} media device(s) available.`, canRetry: false };
  } catch (error) {
    return classifyCheckError(error, "Media device enumeration failed.");
  }
}

function classifyCheckError(error, fallbackText) {
  const name = String(error?.name || "");
  const message = String(error?.message || fallbackText || "Check failed.");
  const blockedNames = new Set(["NotAllowedError", "PermissionDeniedError", "SecurityError"]);
  return {
    status: blockedNames.has(name) ? "blocked" : "failed",
    detailText: message,
    canRetry: true,
  };
}

function normalizeData(data = {}) {
  return {
    ...DEFAULT_DATA,
    ...(data || {}),
    title: data?.title == null ? "" : String(data.title),
    message: data?.message == null ? "" : String(data.message),
    checks: normalizeChecks(data?.checks || []),
  };
}

function normalizeOptions(options = {}) {
  const mode = String(options?.mode || DEFAULT_OPTIONS.mode).trim().toLowerCase() === "compact" ? "compact" : "cards";
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    className: options?.className == null ? "" : String(options.className),
    mode,
  };
}

function normalizeModalOptions(options = {}) {
  const mode = String(options?.mode || DEFAULT_MODAL_OPTIONS.mode).trim().toLowerCase() === "compact" ? "compact" : "cards";
  return {
    ...DEFAULT_MODAL_OPTIONS,
    ...(options || {}),
    showSummary: options?.showSummary !== false,
    autoCloseOnReady: options?.autoCloseOnReady !== false,
    mode,
  };
}

function normalizeChecks(checks = []) {
  return Array.isArray(checks) ? checks.map((check, index) => {
    const kind = normalizeCheckKind(check?.kind);
    const status = normalizeStatus(check?.status);
    return {
      id: check?.id == null ? `check-${index + 1}` : String(check.id),
      kind,
      label: check?.label == null ? formatCheckLabel(kind) : String(check.label),
      description: check?.description == null ? "" : String(check.description),
      required: check?.required !== false,
      autoRun: check?.autoRun !== false,
      status,
      detailText: check?.detailText == null ? defaultDetailForStatus(status) : String(check.detailText),
      canRetry: Boolean(check?.canRetry),
      updatedAt: Number.isFinite(check?.updatedAt) ? Number(check.updatedAt) : null,
    };
  }) : [];
}

function normalizeCheckKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  return CHECK_KINDS.has(value) ? value : "microphone";
}

function normalizeStatus(status) {
  const value = String(status || "pending").trim().toLowerCase();
  return ["pending", "checking", "ready", "failed", "blocked", "unsupported"].includes(value) ? value : "pending";
}

function defaultDetailForStatus(status) {
  if (status === "pending") return "Waiting to run.";
  if (status === "checking") return "Checking...";
  if (status === "ready") return "Ready.";
  if (status === "unsupported") return "This capability is not supported.";
  return "Check not ready.";
}

function formatStatusLabel(status) {
  switch (status) {
    case "checking": return "Checking";
    case "ready": return "Ready";
    case "failed": return "Failed";
    case "blocked": return "Blocked";
    case "unsupported": return "Unsupported";
    default: return "Pending";
  }
}

function formatCheckTooltip(check) {
  const requirement = check.required ? "Required" : "Optional";
  const status = formatStatusLabel(check.status);
  const detail = String(check.detailText || defaultDetailForStatus(check.status)).trim();
  return `${check.label}. ${requirement}. ${status}.${detail ? ` ${detail}` : ""}`;
}

function formatCheckLabel(kind) {
  switch (kind) {
    case "microphone": return "Microphone";
    case "camera": return "Camera";
    case "geolocation": return "Location Service";
    case "speechsynthesis": return "Speech Synthesis";
    case "speechrecognition": return "Speech Recognition";
    case "notifications": return "Notifications";
    case "audioplayback": return "Audio Playback";
    case "mediadevices": return "Media Devices";
    default: return "Check";
  }
}

function createCheckIcon(check) {
  const chip = createElement("span", {
    className: `ui-device-primer-check-icon is-${check.kind} is-${check.status}`,
    attrs: { "aria-hidden": "true" },
  });
  chip.appendChild(createIcon(getCheckIconName(check.kind), {
    size: 16,
    className: "ui-device-primer-check-glyph",
  }));
  return chip;
}

function createStatusBadge(status) {
  const badge = createElement("span", {
    className: `ui-badge ui-device-primer-status is-${status}`,
  });
  badge.append(
    createIcon(getStatusIconName(status), {
      size: 14,
      className: "ui-device-primer-status-icon",
    }),
    createElement("span", {
      className: "ui-device-primer-status-label",
      text: formatStatusLabel(status),
    }),
  );
  return badge;
}

function getCheckIconName(kind) {
  switch (kind) {
    case "microphone": return "media.microphone";
    case "camera": return "assets.camera";
    case "geolocation": return "places.pin";
    case "speechsynthesis": return "comms.message";
    case "speechrecognition": return "comms.signal";
    case "notifications": return "comms.notification";
    case "audioplayback": return "media.audio";
    case "mediadevices": return "data.grid";
    default: return "actions.check";
  }
}

function getStatusIconName(status) {
  switch (status) {
    case "ready": return "status.success";
    case "failed": return "status.error";
    case "blocked": return "status.warning";
    case "checking": return "actions.refresh";
    case "unsupported": return "status.info";
    default: return "time.clock";
  }
}

function cloneCheck(check) {
  return { ...check };
}


import { createElement, clearNode } from "./ui.dom.js";
import { createSelect as createSharedSelect } from "./ui.select.js";

const MEDIA_KIND_MAP = {
  audioinput: "microphone",
  videoinput: "camera",
  audiooutput: "speaker",
};

const DEVICE_KIND_TO_MEDIA = {
  microphone: "audioinput",
  camera: "videoinput",
  speaker: "audiooutput",
};

const VALID_STATES = new Set([
  "idle",
  "loading",
  "ready",
  "unsupported",
  "permission-required",
  "permission-denied",
  "no-devices",
  "needs-user-action",
  "testing",
  "test-failed",
  "error",
]);

const DEFAULT_DATA = {
  kind: "custom",
  label: "",
  description: "",
  devices: [],
  selectedDeviceId: "",
  status: "idle",
  detailText: "",
};

const DEFAULT_OPTIONS = {
  adapter: null,
  autoRefresh: true,
  className: "",
  layout: "regular",
  presentation: "select",
  refreshLabel: "Refresh",
  requestPermissionLabel: "Allow",
  requestDeviceLabel: "Choose",
  testLabel: "Test",
  placeholder: "Select a device",
  ariaLive: "polite",
  context: null,
  onRefresh: null,
  onPermissionRequest: null,
  onRequestDevice: null,
  onSelectionChange: null,
  onTestStart: null,
  onTestComplete: null,
  onError: null,
};

export function createDeviceSelector(container, data = {}, options = {}) {
  let currentData = normalizeData(data);
  let currentOptions = normalizeOptions(options);
  let destroyed = false;
  let root = null;
  let selectInstance = null;
  let adapterUnsubscribe = null;
  let refreshToken = 0;
  let menuOpen = false;

  function render() {
    if (!container || container.nodeType !== 1 || destroyed) {
      return;
    }
    selectInstance?.destroy?.();
    selectInstance = null;
    clearNode(container);
    root = createElement("section", {
      className: [
        "ui-device-selector",
        `ui-device-selector--${currentOptions.layout}`,
        currentOptions.className,
      ].filter(Boolean).join(" "),
      dataset: {
        kind: currentData.kind,
        status: currentData.status,
        deviceCount: String(currentData.devices.length),
        presentation: currentOptions.presentation,
      },
      attrs: {
        "aria-label": currentData.label || deviceKindLabel(currentData.kind),
      },
    });

    const header = createElement("div", { className: "ui-device-selector-header" });
    const titleWrap = createElement("div", { className: "ui-device-selector-title-wrap" });
    titleWrap.appendChild(createElement("div", {
      className: "ui-device-selector-title",
      text: currentData.label || deviceKindLabel(currentData.kind),
    }));
    if (currentData.description && currentOptions.layout !== "compact") {
      titleWrap.appendChild(createElement("div", {
        className: "ui-device-selector-description",
        text: currentData.description,
      }));
    }
    header.appendChild(titleWrap);
    header.appendChild(createStatusBadge());
    root.appendChild(header);

    const controls = createElement("div", { className: "ui-device-selector-controls" });
    controls.appendChild(createDeviceControl());
    controls.appendChild(createActionStrip());
    root.appendChild(controls);

    const detail = currentData.detailText || defaultDetailText(currentData);
    if (detail || currentOptions.layout !== "compact") {
      root.appendChild(createElement("div", {
        className: "ui-device-selector-detail",
        text: detail,
        attrs: { "aria-live": currentOptions.ariaLive },
      }));
    }

    container.appendChild(root);
  }

  function createStatusBadge() {
    return createElement("span", {
      className: ["ui-device-selector-status", `is-${currentData.status}`].join(" "),
      text: statusLabel(currentData.status),
      attrs: { role: "status", "aria-live": currentOptions.ariaLive },
    });
  }

  function createDeviceControl() {
    if (currentOptions.presentation === "native-select") {
      return createNativeSelect();
    }
    if (currentOptions.presentation === "menu") {
      return createMenuControl();
    }
    if (currentOptions.presentation === "list") {
      return createListControl();
    }
    return createHostedSelect();
  }

  function createHostedSelect() {
    const host = createElement("div", { className: "ui-device-selector-select-host" });
    const items = currentData.devices.map((device) => ({
      value: device.id,
      label: device.label || fallbackDeviceLabel(device, currentData.devices),
    }));
    selectInstance = createSharedSelect(host, items, {
      ariaLabel: `${currentData.label || deviceKindLabel(currentData.kind)} device`,
      placeholder: currentOptions.placeholder,
      emptyText: "No matching devices.",
      searchable: currentOptions.searchable,
      clearable: false,
      selected: currentData.selectedDeviceId ? [currentData.selectedDeviceId] : [],
      onChange(value) {
        selectDevice(value || "").catch(() => {});
      },
    });
    const trigger = host.querySelector(".ui-select-trigger");
    if (trigger && shouldDisableSelect()) {
      trigger.disabled = true;
      trigger.setAttribute("aria-disabled", "true");
    }
    return host;
  }

  function createNativeSelect() {
    const select = createElement("select", {
      className: "ui-device-selector-select",
      attrs: {
        "aria-label": `${currentData.label || deviceKindLabel(currentData.kind)} device`,
        disabled: shouldDisableSelect() ? "disabled" : null,
      },
    });
    select.appendChild(createElement("option", {
      text: currentOptions.placeholder,
      attrs: { value: "" },
    }));
    currentData.devices.forEach((device) => {
      select.appendChild(createElement("option", {
        text: device.label || fallbackDeviceLabel(device, currentData.devices),
        attrs: { value: device.id },
      }));
    });
    select.value = currentData.selectedDeviceId || "";
    select.addEventListener("change", () => {
      selectDevice(select.value).catch(() => {});
    });
    return select;
  }

  function createMenuControl() {
    const wrap = createElement("div", {
      className: ["ui-device-selector-menu", menuOpen ? "is-open" : ""].join(" "),
    });
    const selected = getSelectedDevice();
    const trigger = createElement("button", {
      className: "ui-device-selector-menu-trigger",
      attrs: {
        type: "button",
        disabled: shouldDisableSelect() ? "disabled" : null,
        "aria-haspopup": "listbox",
        "aria-expanded": menuOpen ? "true" : "false",
      },
    });
    trigger.append(
      createElement("span", {
        className: "ui-device-selector-menu-value",
        text: selected ? (selected.label || fallbackDeviceLabel(selected, currentData.devices)) : currentOptions.placeholder,
      }),
      createElement("span", {
        className: "ui-device-selector-menu-caret",
        attrs: { "aria-hidden": "true" },
        text: "⌄",
      }),
    );
    trigger.addEventListener("click", () => {
      menuOpen = !menuOpen;
      render();
    });
    wrap.appendChild(trigger);

    if (menuOpen) {
      const list = createElement("div", {
        className: "ui-device-selector-menu-list",
        attrs: { role: "listbox", "aria-label": `${currentData.label || deviceKindLabel(currentData.kind)} devices` },
      });
      if (!currentData.devices.length) {
        list.appendChild(createElement("div", {
          className: "ui-device-selector-menu-empty",
          text: "No matching devices.",
        }));
      }
      currentData.devices.forEach((device) => {
        list.appendChild(createDeviceOptionButton(device, "ui-device-selector-menu-item"));
      });
      wrap.appendChild(list);
    }
    return wrap;
  }

  function createListControl() {
    const list = createElement("div", {
      className: "ui-device-selector-list",
      attrs: { role: "listbox", "aria-label": `${currentData.label || deviceKindLabel(currentData.kind)} devices` },
    });
    if (!currentData.devices.length) {
      list.appendChild(createElement("div", {
        className: "ui-device-selector-list-empty",
        text: "No matching devices.",
      }));
      return list;
    }
    currentData.devices.forEach((device) => {
      list.appendChild(createDeviceOptionButton(device, "ui-device-selector-list-item"));
    });
    return list;
  }

  function createDeviceOptionButton(device, className) {
    const selected = String(device.id) === String(currentData.selectedDeviceId);
    const button = createElement("button", {
      className: [className, selected ? "is-selected" : ""].filter(Boolean).join(" "),
      attrs: {
        type: "button",
        role: "option",
        "aria-selected": selected ? "true" : "false",
      },
    });
    const label = device.label || fallbackDeviceLabel(device, currentData.devices);
    button.append(
      createElement("span", { className: "ui-device-selector-option-label", text: label }),
      createElement("span", { className: "ui-device-selector-option-meta", text: device.transport || device.kind }),
    );
    button.addEventListener("click", () => {
      menuOpen = false;
      selectDevice(device.id).catch(() => {});
    });
    return button;
  }

  function createActionStrip() {
    const actions = createElement("div", { className: "ui-device-selector-actions" });
    actions.appendChild(createButton(currentOptions.refreshLabel, "refresh", refresh, canRefresh()));
    if (hasAdapterMethod("requestPermission")) {
      actions.appendChild(createButton(currentOptions.requestPermissionLabel, "permission", requestPermission, canRequest()));
    }
    if (hasAdapterMethod("requestDevice")) {
      actions.appendChild(createButton(currentOptions.requestDeviceLabel, "request", requestDevice, canRequest()));
    }
    if (hasAdapterMethod("testDevice")) {
      actions.appendChild(createButton(currentOptions.testLabel, "test", testSelectedDevice, canTest()));
    }
    return actions;
  }

  function createButton(label, action, handler, enabled) {
    const button = createElement("button", {
      className: ["ui-button", "ui-button-quiet", "ui-device-selector-action", `is-${action}`].join(" "),
      text: label,
      attrs: {
        type: "button",
        disabled: enabled ? null : "disabled",
      },
    });
    button.addEventListener("click", () => {
      handler().catch(() => {});
    });
    return button;
  }

  function canRefresh() {
    return currentData.status !== "loading" && currentData.status !== "testing";
  }

  function canRequest() {
    return currentData.status !== "loading" && currentData.status !== "testing" && currentData.status !== "unsupported";
  }

  function canTest() {
    return Boolean(currentData.selectedDeviceId) && currentData.status !== "loading" && currentData.status !== "testing";
  }

  function shouldDisableSelect() {
    return currentData.status === "loading" || currentData.status === "unsupported" || currentData.devices.length === 0;
  }

  function getAdapterContext(extra = {}) {
    return {
      selector: api,
      state: getState(),
      ...(currentOptions.context && typeof currentOptions.context === "object" ? currentOptions.context : {}),
      ...extra,
    };
  }

  async function refresh() {
    const token = ++refreshToken;
    setStatus("loading", "Checking connected devices...");
    emit("onRefresh", getState());
    try {
      if (currentOptions.adapter && hasAdapterMethod("isSupported")) {
        const supported = await currentOptions.adapter.isSupported(getAdapterContext());
        if (!supported) {
          if (token === refreshToken) {
            currentData = normalizeData({
              ...currentData,
              devices: [],
              status: "unsupported",
              detailText: "This browser or adapter does not support this device type.",
            });
            render();
          }
          return getState();
        }
      }
      const devices = hasAdapterMethod("listDevices")
        ? await currentOptions.adapter.listDevices(getAdapterContext())
        : currentData.devices;
      if (token !== refreshToken || destroyed) {
        return getState();
      }
      const normalizedDevices = normalizeDevices(devices, currentData.kind);
      const selectedDeviceId = resolveSelectedDeviceId(currentData.selectedDeviceId, normalizedDevices);
      currentData = normalizeData({
        ...currentData,
        devices: normalizedDevices,
        selectedDeviceId,
        status: normalizedDevices.length ? "ready" : "no-devices",
        detailText: normalizedDevices.length ? "" : "No matching devices were found.",
      });
      render();
      return getState();
    } catch (error) {
      handleError(error, "Unable to refresh devices.");
      return getState();
    }
  }

  async function requestPermission() {
    if (!hasAdapterMethod("requestPermission")) {
      return getState();
    }
    setStatus("needs-user-action", "Waiting for browser permission...");
    emit("onPermissionRequest", getState());
    try {
      await currentOptions.adapter.requestPermission(getAdapterContext());
      return refresh();
    } catch (error) {
      const denied = isPermissionDeniedError(error);
      currentData = normalizeData({
        ...currentData,
        status: denied ? "permission-denied" : "error",
        detailText: denied ? "Permission was denied. Use browser site settings to allow this device." : errorMessage(error, "Permission request failed."),
      });
      render();
      emit("onError", { error, state: getState() });
      return getState();
    }
  }

  async function requestDevice() {
    if (!hasAdapterMethod("requestDevice")) {
      return getState();
    }
    setStatus("needs-user-action", "Waiting for device selection...");
    emit("onRequestDevice", getState());
    try {
      const device = await currentOptions.adapter.requestDevice(getAdapterContext());
      const nextDevices = mergeDevice(currentData.devices, normalizeDevice(device, currentData.kind));
      const selectedDeviceId = device?.id || device?.deviceId || currentData.selectedDeviceId;
      currentData = normalizeData({
        ...currentData,
        devices: nextDevices,
        selectedDeviceId,
        status: nextDevices.length ? "ready" : "no-devices",
        detailText: "",
      });
      render();
      emit("onSelectionChange", getSelectionPayload());
      return getState();
    } catch (error) {
      handleError(error, "Device request failed.");
      return getState();
    }
  }

  async function selectDevice(deviceId) {
    const selectedDeviceId = String(deviceId || "");
    const device = currentData.devices.find((item) => String(item.id) === selectedDeviceId) || null;
    menuOpen = false;
    currentData = normalizeData({
      ...currentData,
      selectedDeviceId,
      detailText: device ? "" : currentData.detailText,
    });
    render();
    try {
      if (device && hasAdapterMethod("selectDevice")) {
        await currentOptions.adapter.selectDevice(device, getAdapterContext({ device }));
      }
      emit("onSelectionChange", getSelectionPayload());
    } catch (error) {
      handleError(error, "Device selection failed.");
    }
    return getState();
  }

  async function testSelectedDevice() {
    const device = getSelectedDevice();
    if (!device || !hasAdapterMethod("testDevice")) {
      return getState();
    }
    setStatus("testing", `Testing ${device.label || "selected device"}...`);
    emit("onTestStart", { device, state: getState() });
    try {
      const result = await currentOptions.adapter.testDevice(device, getAdapterContext({ device }));
      currentData = normalizeData({
        ...currentData,
        status: "ready",
        detailText: result?.message || `${device.label || "Selected device"} passed the test.`,
      });
      render();
      emit("onTestComplete", { device, result, state: getState() });
      return getState();
    } catch (error) {
      currentData = normalizeData({
        ...currentData,
        status: "test-failed",
        detailText: errorMessage(error, "Device test failed."),
      });
      render();
      emit("onError", { error, state: getState() });
      emit("onTestComplete", { device, error, state: getState() });
      return getState();
    }
  }

  function update(nextData = {}, nextOptions = {}) {
    const previousAdapter = currentOptions.adapter;
    currentData = normalizeData({ ...currentData, ...(nextData || {}) });
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    if (currentOptions.presentation !== "menu") {
      menuOpen = false;
    }
    if (previousAdapter !== currentOptions.adapter) {
      bindAdapterSubscription();
    }
    render();
    return getState();
  }

  function setStatus(status, detailText) {
    currentData = normalizeData({ ...currentData, status, detailText });
    render();
  }

  function getSelectedDevice() {
    return currentData.devices.find((device) => String(device.id) === String(currentData.selectedDeviceId)) || null;
  }

  function getSelectionPayload() {
    return {
      kind: currentData.kind,
      selectedDeviceId: currentData.selectedDeviceId,
      device: getSelectedDevice(),
      state: getState(),
    };
  }

  function getState() {
    return {
      ...currentData,
      devices: currentData.devices.map((device) => ({ ...device })),
      selectedDevice: getSelectedDevice(),
      adapterSupported: currentData.status !== "unsupported",
    };
  }

  function destroy() {
    destroyed = true;
    refreshToken += 1;
    adapterUnsubscribe?.();
    adapterUnsubscribe = null;
    selectInstance?.destroy?.();
    selectInstance = null;
    clearNode(container);
    root = null;
  }

  function bindAdapterSubscription() {
    adapterUnsubscribe?.();
    adapterUnsubscribe = null;
    if (hasAdapterMethod("subscribe")) {
      const unsubscribe = currentOptions.adapter.subscribe(() => {
        refresh().catch(() => {});
      }, getAdapterContext());
      if (typeof unsubscribe === "function") {
        adapterUnsubscribe = unsubscribe;
      }
    }
  }

  function hasAdapterMethod(name) {
    return currentOptions.adapter && typeof currentOptions.adapter[name] === "function";
  }

  function emit(name, payload) {
    const callback = currentOptions[name];
    if (typeof callback === "function") {
      callback(payload);
    }
  }

  function handleError(error, fallback) {
    currentData = normalizeData({
      ...currentData,
      status: "error",
      detailText: errorMessage(error, fallback),
    });
    render();
    emit("onError", { error, state: getState() });
  }

  const api = {
    destroy,
    getState,
    refresh,
    requestDevice,
    requestPermission,
    selectDevice,
    testSelectedDevice,
    update,
  };

  render();
  bindAdapterSubscription();
  if (currentOptions.autoRefresh && currentOptions.adapter) {
    refresh().catch(() => {});
  }

  return api;
}

export function createMediaDeviceAdapter(options = {}) {
  const mediaKind = normalizeMediaKind(options.kind || options.mediaKind || "audioinput");
  const deviceKind = MEDIA_KIND_MAP[mediaKind] || "custom";
  const sampleAudioUrl = String(options.sampleAudioUrl || "");

  return {
    kind: deviceKind,
    async isSupported() {
      return Boolean(getMediaDevices()?.enumerateDevices);
    },
    async listDevices() {
      const mediaDevices = getMediaDevices();
      if (!mediaDevices?.enumerateDevices) {
        return [];
      }
      const rawDevices = await mediaDevices.enumerateDevices();
      const devices = rawDevices
        .filter((device) => device.kind === mediaKind)
        .map((device, index) => normalizeMediaDevice(device, mediaKind, index));
      if (mediaKind === "audiooutput") {
        return ensureSpeakerFallback(devices);
      }
      return devices;
    },
    async requestPermission() {
      if (mediaKind === "audiooutput") {
        if (typeof getMediaDevices()?.selectAudioOutput === "function") {
          return getMediaDevices().selectAudioOutput();
        }
        return { id: "default", label: "System default speaker" };
      }
      const constraints = mediaKind === "videoinput" ? { video: true } : { audio: true };
      const stream = await getMediaDevices().getUserMedia(constraints);
      stopStream(stream);
      return true;
    },
    async requestDevice() {
      if (mediaKind === "audiooutput" && typeof getMediaDevices()?.selectAudioOutput === "function") {
        const device = await getMediaDevices().selectAudioOutput();
        return normalizeMediaDevice(device, mediaKind, 0);
      }
      return null;
    },
    async selectDevice() {
      return true;
    },
    async testDevice(device) {
      if (mediaKind === "audiooutput") {
        await testSpeaker(device, sampleAudioUrl);
        return { status: "ready", message: "Speaker test completed." };
      }
      const constraints = mediaKind === "videoinput"
        ? { video: buildDeviceConstraint(device) }
        : { audio: buildDeviceConstraint(device) };
      const stream = await getMediaDevices().getUserMedia(constraints);
      stopStream(stream);
      return { status: "ready", message: `${deviceKindLabel(deviceKind)} test completed.` };
    },
    subscribe(listener) {
      const mediaDevices = getMediaDevices();
      if (!mediaDevices || typeof mediaDevices.addEventListener !== "function") {
        return null;
      }
      mediaDevices.addEventListener("devicechange", listener);
      return () => mediaDevices.removeEventListener("devicechange", listener);
    },
  };
}

function normalizeData(input = {}) {
  const data = { ...DEFAULT_DATA, ...(input || {}) };
  const kind = normalizeDeviceKind(data.kind);
  const devices = normalizeDevices(data.devices, kind);
  const selectedDeviceId = resolveSelectedDeviceId(data.selectedDeviceId, devices);
  const hasExplicitStatus = Object.prototype.hasOwnProperty.call(input || {}, "status");
  return {
    ...data,
    kind,
    label: String(data.label || ""),
    description: String(data.description || ""),
    devices,
    selectedDeviceId,
    status: normalizeStatus(hasExplicitStatus ? data.status : (devices.length ? "ready" : "idle")),
    detailText: String(data.detailText || ""),
  };
}

function normalizeOptions(input = {}) {
  const options = { ...DEFAULT_OPTIONS, ...(input || {}) };
  return {
    ...options,
    className: String(options.className || ""),
    layout: String(options.layout || "regular").toLowerCase() === "compact" ? "compact" : "regular",
    presentation: normalizePresentation(options.presentation),
    searchable: options.searchable !== false,
    refreshLabel: String(options.refreshLabel || "Refresh"),
    requestPermissionLabel: String(options.requestPermissionLabel || "Allow"),
    requestDeviceLabel: String(options.requestDeviceLabel || "Choose"),
    testLabel: String(options.testLabel || "Test"),
    placeholder: String(options.placeholder || "Select a device"),
    ariaLive: ["off", "polite", "assertive"].includes(String(options.ariaLive || "").toLowerCase())
      ? String(options.ariaLive).toLowerCase()
      : "polite",
    autoRefresh: options.autoRefresh !== false,
  };
}

function normalizePresentation(value) {
  const next = String(value || "select").toLowerCase();
  return ["select", "native-select", "menu", "list"].includes(next) ? next : "select";
}

function normalizeDevice(input, fallbackKind = "custom") {
  if (!input || typeof input !== "object") {
    return null;
  }
  const id = String(input.id || input.deviceId || input.value || "");
  if (!id) {
    return null;
  }
  const kind = normalizeDeviceKind(input.kind || fallbackKind);
  return {
    id,
    label: String(input.label || ""),
    kind,
    groupId: String(input.groupId || ""),
    transport: String(input.transport || "manual"),
    status: String(input.status || "available"),
    capabilities: {
      ...(input.capabilities && typeof input.capabilities === "object" ? input.capabilities : {}),
    },
    raw: input.raw || null,
  };
}

function normalizeDevices(devices, fallbackKind) {
  if (!Array.isArray(devices)) {
    return [];
  }
  const seen = new Set();
  return devices
    .map((device) => normalizeDevice(device, fallbackKind))
    .filter(Boolean)
    .filter((device) => {
      if (seen.has(device.id)) {
        return false;
      }
      seen.add(device.id);
      return true;
    });
}

function normalizeDeviceKind(value) {
  const next = String(value || "custom").toLowerCase();
  if (DEVICE_KIND_TO_MEDIA[next]) {
    return next;
  }
  if (MEDIA_KIND_MAP[next]) {
    return MEDIA_KIND_MAP[next];
  }
  return ["printer", "scanner", "usb", "bluetooth", "serial", "hid", "custom"].includes(next) ? next : "custom";
}

function normalizeMediaKind(value) {
  const next = String(value || "audioinput").toLowerCase();
  if (MEDIA_KIND_MAP[next]) {
    return next;
  }
  return DEVICE_KIND_TO_MEDIA[next] || "audioinput";
}

function normalizeStatus(status) {
  const next = String(status || "idle").toLowerCase();
  return VALID_STATES.has(next) ? next : "idle";
}

function normalizeMediaDevice(device, mediaKind, index) {
  const id = String(device?.deviceId || device?.id || "");
  return normalizeDevice({
    id,
    label: device?.label || fallbackMediaLabel(mediaKind, index),
    kind: MEDIA_KIND_MAP[mediaKind] || "custom",
    groupId: device?.groupId || "",
    transport: "browser-media",
    status: "available",
    capabilities: {
      canTest: true,
      canConnect: false,
      canDisconnect: false,
      canSetDefault: mediaKind === "audiooutput",
    },
    raw: device || null,
  }, MEDIA_KIND_MAP[mediaKind] || "custom");
}

function ensureSpeakerFallback(devices) {
  const hasDefault = devices.some((device) => device.id === "default");
  const fallback = normalizeDevice({
    id: "default",
    label: "System default speaker",
    kind: "speaker",
    transport: "browser-media",
    status: "available",
    capabilities: {
      canTest: true,
      canSetDefault: false,
      fallback: true,
    },
  }, "speaker");
  return hasDefault ? devices : [fallback, ...devices];
}

function resolveSelectedDeviceId(selectedDeviceId, devices) {
  const requested = String(selectedDeviceId || "");
  if (requested && !devices.length) {
    return requested;
  }
  if (requested && devices.some((device) => String(device.id) === requested)) {
    return requested;
  }
  return "";
}

function mergeDevice(devices, device) {
  if (!device) {
    return devices;
  }
  return normalizeDevices([device, ...devices], device.kind);
}

function fallbackDeviceLabel(device, devices) {
  const index = devices.findIndex((item) => item.id === device.id);
  return `${deviceKindLabel(device.kind)} ${index + 1}`;
}

function fallbackMediaLabel(mediaKind, index) {
  return `${deviceKindLabel(MEDIA_KIND_MAP[mediaKind] || "Device")} ${index + 1}`;
}

function deviceKindLabel(kind) {
  const labels = {
    camera: "Camera",
    microphone: "Microphone",
    speaker: "Speaker",
    printer: "Printer",
    scanner: "Scanner",
    usb: "USB Device",
    bluetooth: "Bluetooth Device",
    serial: "Serial Device",
    hid: "HID Device",
    custom: "Device",
  };
  return labels[kind] || "Device";
}

function statusLabel(status) {
  const labels = {
    idle: "Idle",
    loading: "Loading",
    ready: "Ready",
    unsupported: "Unsupported",
    "permission-required": "Permission needed",
    "permission-denied": "Permission denied",
    "no-devices": "No devices",
    "needs-user-action": "Action needed",
    testing: "Testing",
    "test-failed": "Test failed",
    error: "Error",
  };
  return labels[status] || "Idle";
}

function defaultDetailText(data) {
  if (data.status === "ready" && data.selectedDeviceId) {
    const device = data.devices.find((item) => item.id === data.selectedDeviceId);
    return device ? `${device.label || deviceKindLabel(device.kind)} selected.` : "";
  }
  if (data.status === "permission-required") {
    return "Allow device permission to show device names and available inputs.";
  }
  return "";
}

function getMediaDevices() {
  return globalThis.navigator?.mediaDevices || null;
}

function buildDeviceConstraint(device) {
  if (!device?.id || device.id === "default") {
    return true;
  }
  return { deviceId: { exact: device.id } };
}

function stopStream(stream) {
  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => {
      if (track && typeof track.stop === "function") {
        track.stop();
      }
    });
  }
}

async function testSpeaker(device, sampleAudioUrl) {
  if (!sampleAudioUrl || typeof Audio === "undefined") {
    return true;
  }
  const audio = new Audio(sampleAudioUrl);
  if (device?.id && device.id !== "default" && typeof audio.setSinkId === "function") {
    await audio.setSinkId(device.id);
  }
  await audio.play();
  setTimeout(() => {
    audio.pause();
    audio.currentTime = 0;
  }, 900);
  return true;
}

function isPermissionDeniedError(error) {
  const name = String(error?.name || "");
  return name === "NotAllowedError" || name === "PermissionDeniedError";
}

function errorMessage(error, fallback) {
  return String(error?.message || fallback || "Device operation failed.");
}

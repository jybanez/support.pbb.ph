import { createElement } from "./ui.dom.js";

const DEFAULT_OPTIONS = {
  src: "",
  srcdoc: "",
  title: "Embedded content",
  loadingText: "Loading embedded page...",
  errorTitle: "Unable to load embedded page",
  errorMessage: "Check the requested URL or embedded app availability.",
  sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads",
  referrerPolicy: "strict-origin-when-cross-origin",
  allow: "",
  allowFullscreen: false,
  className: "",
  onLoad: null,
  onError: null,
};

export function createIframeHost(options = {}) {
  let currentOptions = normalizeOptions(options);
  let destroyed = false;

  const root = createElement("section", {
    className: ["ui-iframe-host", currentOptions.className].filter(Boolean).join(" "),
    attrs: { "data-status": "idle", "data-ui-window-fill": "true" },
  });
  const stack = createElement("div", { className: "ui-iframe-host__stack" });
  const iframe = document.createElement("iframe");
  iframe.className = "ui-iframe-host__frame";
  iframe.setAttribute("loading", "eager");

  const loading = createElement("div", { className: "ui-iframe-host__status is-loading" });
  const loadingTitle = createElement("strong", { text: "Loading" });
  const loadingText = createElement("p", { text: currentOptions.loadingText });
  loading.append(loadingTitle, loadingText);

  const error = createElement("div", { className: "ui-iframe-host__status is-error", attrs: { hidden: "hidden" } });
  const errorTitle = createElement("strong", { text: currentOptions.errorTitle });
  const errorText = createElement("p", { text: currentOptions.errorMessage });
  error.append(errorTitle, errorText);

  stack.append(iframe, loading, error);
  root.appendChild(stack);

  const state = {
    src: "",
    srcdoc: "",
    title: currentOptions.title,
    status: "idle",
    loading: false,
    loaded: false,
    error: null,
  };

  function applyStaticOptions() {
    root.className = ["ui-iframe-host", currentOptions.className].filter(Boolean).join(" ");
    iframe.title = currentOptions.title;
    state.title = currentOptions.title;
    loadingText.textContent = currentOptions.loadingText;
    errorTitle.textContent = currentOptions.errorTitle;
    errorText.textContent = currentOptions.errorMessage;
    if (currentOptions.sandbox) {
      iframe.setAttribute("sandbox", currentOptions.sandbox);
    } else {
      iframe.removeAttribute("sandbox");
    }
    if (currentOptions.referrerPolicy) {
      iframe.setAttribute("referrerpolicy", currentOptions.referrerPolicy);
    } else {
      iframe.removeAttribute("referrerpolicy");
    }
    if (currentOptions.allow) {
      iframe.setAttribute("allow", currentOptions.allow);
    } else {
      iframe.removeAttribute("allow");
    }
    if (currentOptions.allowFullscreen) {
      iframe.setAttribute("allowfullscreen", "allowfullscreen");
    } else {
      iframe.removeAttribute("allowfullscreen");
    }
  }

  function setStatus(nextStatus, nextError = null) {
    state.status = nextStatus;
    state.loading = nextStatus === "loading";
    state.loaded = nextStatus === "ready";
    state.error = nextError ? { ...nextError } : null;
    root.dataset.status = nextStatus;
    iframe.hidden = nextStatus !== "ready";
    loading.hidden = nextStatus !== "loading";
    error.hidden = nextStatus !== "error";
    root.classList.toggle("is-loading", nextStatus === "loading");
    root.classList.toggle("is-ready", nextStatus === "ready");
    root.classList.toggle("is-error", nextStatus === "error");
  }

  function loadCurrentSource() {
    if (destroyed) {
      return;
    }
    const hasSrcdoc = Boolean(currentOptions.srcdoc.trim());
    const hasSrc = Boolean(currentOptions.src.trim());
    state.src = hasSrc ? currentOptions.src : "";
    state.srcdoc = hasSrcdoc ? currentOptions.srcdoc : "";

    if (!hasSrcdoc && !hasSrc) {
      enterError("invalid-source", currentOptions.errorMessage);
      iframe.removeAttribute("src");
      iframe.removeAttribute("srcdoc");
      return;
    }

    setStatus("loading");
    if (hasSrcdoc) {
      iframe.removeAttribute("src");
      iframe.srcdoc = currentOptions.srcdoc;
      return;
    }
    iframe.removeAttribute("srcdoc");
    iframe.src = currentOptions.src;
  }

  function enterError(code, message) {
    setStatus("error", {
      code: String(code || "load-failed"),
      message: String(message || currentOptions.errorMessage),
    });
    currentOptions.onError?.(getState());
  }

  function handleLoad() {
    if (destroyed || state.status !== "loading") {
      return;
    }
    setStatus("ready");
    currentOptions.onLoad?.(getState());
  }

  function getSrc() {
    return state.src;
  }

  function setSrc(url) {
    currentOptions.src = typeof url === "string" ? url.trim() : "";
    currentOptions.srcdoc = "";
    loadCurrentSource();
  }

  function reload() {
    loadCurrentSource();
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({
      ...currentOptions,
      ...(nextOptions || {}),
    });
    applyStaticOptions();
    loadCurrentSource();
  }

  function getState() {
    return {
      src: state.src,
      srcdoc: state.srcdoc,
      title: state.title,
      status: state.status,
      loading: state.loading,
      loaded: state.loaded,
      error: state.error ? { ...state.error } : null,
    };
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    iframe.removeEventListener("load", handleLoad);
    root.remove();
  }

  iframe.addEventListener("load", handleLoad);

  applyStaticOptions();
  loadCurrentSource();

  return {
    root,
    iframe,
    getSrc,
    setSrc,
    reload,
    update,
    getState,
    destroy,
  };
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    src: typeof options.src === "string" ? options.src : (typeof options.src === "number" ? String(options.src) : String(options.src || "")),
    srcdoc: typeof options.srcdoc === "string" ? options.srcdoc : String(options.srcdoc || ""),
    title: String(options.title || DEFAULT_OPTIONS.title),
    loadingText: String(options.loadingText || DEFAULT_OPTIONS.loadingText),
    errorTitle: String(options.errorTitle || DEFAULT_OPTIONS.errorTitle),
    errorMessage: String(options.errorMessage || DEFAULT_OPTIONS.errorMessage),
    sandbox: typeof options.sandbox === "string" ? options.sandbox.trim() : DEFAULT_OPTIONS.sandbox,
    referrerPolicy: typeof options.referrerPolicy === "string" ? options.referrerPolicy.trim() : DEFAULT_OPTIONS.referrerPolicy,
    allow: typeof options.allow === "string" ? options.allow.trim() : "",
    allowFullscreen: Boolean(options.allowFullscreen),
    className: String(options.className || ""),
  };
}


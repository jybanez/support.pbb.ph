import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createProgress } from "./ui.progress.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "File uploader",
  dropzoneAriaLabel: "Add files",
  accept: "",
  multiple: true,
  autoUpload: false,
  maxFiles: 20,
  maxFileSize: 25 * 1024 * 1024, // 25MB
  allowedTypes: null, // e.g. ["image/", "video/mp4", ".pdf"]
  dropText: "Drop files here or click Browse.",
  emptyText: "No files queued.",
  startText: "Start Upload",
  clearText: "Clear",
  browseText: "Browse",
  smoothProgress: true,
  progressAnimationMs: 220,
  useChunkUpload: false,
  chunkSize: 1024 * 1024, // 1MB
  uploadKeyPrefix: "upload",
  onGetResumeState: null, // async ({ item, uploadKey, state }) => { uploadedBytes? }
  onCreateUploadSession: null, // async ({ item, uploadKey, state, signal }) => session
  onUploadChunk: null, // async (payload) => void
  onPersistResumeState: null, // async ({ item, uploadKey, uploadedBytes, totalBytes, chunkIndex, totalChunks, session })
  onFinalizeUpload: null, // async ({ item, uploadKey, session, totalBytes, totalChunks, state, signal })
  onClearResumeState: null, // async ({ item, uploadKey, session })
  onUpload: null, // async (item, controls) => Promise<void>
  onChange: null,
  onError: null,
  onComplete: null,
};

export function createFileUploader(container, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let items = [];
  let running = false;
  let queueCursor = 0;
  let idCounter = 1;
  const controllers = new Map();
  const progressAnimations = new Map();
  const itemRefs = new Map();
  let root = null;
  let list = null;
  let input = null;
  let startBtn = null;
  let clearBtn = null;
  let statusLive = null;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: `ui-file-uploader ${currentOptions.className || ""}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    const toolbar = createElement("div", { className: "ui-file-uploader-toolbar" });
    startBtn = createElement("button", {
      className: "ui-button ui-button-primary",
      text: currentOptions.startText,
      attrs: { type: "button" },
    });
    clearBtn = createElement("button", {
      className: "ui-button",
      text: currentOptions.clearText,
      attrs: { type: "button" },
    });
    const browseBtn = createElement("button", {
      className: "ui-button",
      text: currentOptions.browseText,
      attrs: { type: "button" },
    });
    events.on(startBtn, "click", () => start());
    events.on(clearBtn, "click", () => clear());
    events.on(browseBtn, "click", () => input?.click());
    toolbar.append(startBtn, clearBtn, browseBtn);

    const dropzone = createElement("div", {
      className: "ui-file-uploader-dropzone",
      text: currentOptions.dropText,
      attrs: {
        role: "button",
        tabindex: "0",
        "aria-label": currentOptions.dropzoneAriaLabel,
      },
    });
    input = createElement("input", {
      className: "ui-file-uploader-input",
      attrs: {
        type: "file",
        "aria-hidden": "true",
        tabindex: "-1",
        ...(currentOptions.accept ? { accept: currentOptions.accept } : {}),
        ...(currentOptions.multiple ? { multiple: "multiple" } : {}),
      },
    });
    dropzone.appendChild(input);
    events.on(dropzone, "click", () => input.click());
    events.on(dropzone, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      input.click();
    });
    events.on(dropzone, "dragover", (event) => {
      event.preventDefault();
      dropzone.classList.add("is-dragover");
    });
    events.on(dropzone, "dragleave", () => dropzone.classList.remove("is-dragover"));
    events.on(dropzone, "drop", (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-dragover");
      const dropped = Array.from(event.dataTransfer?.files || []);
      addFiles(dropped);
    });
    events.on(input, "change", () => {
      const selected = Array.from(input.files || []);
      addFiles(selected);
      input.value = "";
    });

    list = createElement("div", {
      className: "ui-file-uploader-list",
      attrs: {
        role: "list",
        "aria-label": "Upload queue",
      },
    });
    statusLive = createElement("p", {
      className: "ui-file-uploader-status",
      attrs: {
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
      },
    });
    renderList();

    root.append(toolbar, dropzone, list, statusLive);
    container.appendChild(root);
  }

  function renderList() {
    if (!list) {
      return;
    }
    disposeItemRefs();
    itemRefs.clear();
    clearNode(list);
    if (!items.length) {
      list.appendChild(createElement("p", {
        className: "ui-file-uploader-empty",
        text: currentOptions.emptyText,
      }));
      syncButtons();
      updateLiveStatus();
      return;
    }

    items.forEach((item) => {
      const row = createElement("article", { className: `ui-file-uploader-item is-${item.status}` });
      row.setAttribute("role", "listitem");
      row.setAttribute("aria-label", `${item.name}, ${item.status}, ${formatBytes(item.size)}`);
      const head = createElement("div", { className: "ui-file-uploader-item-head" });
      const name = createElement("p", { className: "ui-file-uploader-name", text: item.name });
      const meta = createElement("p", { className: "ui-file-uploader-meta", text: `${formatBytes(item.size)} • ${item.status}` });
      head.append(name, meta);

      const progressWrap = createElement("div", { className: "ui-file-uploader-progress-wrap" });
      const progressMount = createElement("div", { className: "ui-file-uploader-progress-mount" });
      const progressApi = createProgress(
        progressMount,
        { value: Math.max(0, Math.min(100, item.progress)) },
        {
          style: "gradient",
          size: "sm",
          showLabel: false,
          showPercent: false,
          animate: true,
          rounded: true,
          color: resolveProgressColor(item.status),
        }
      );
      progressWrap.appendChild(progressMount);
      if (item.error) {
        progressWrap.appendChild(createElement("p", { className: "ui-file-uploader-error", text: item.error }));
      }

      const actions = createElement("div", { className: "ui-file-uploader-actions" });
      if (item.status === "error") {
        const retry = createElement("button", { className: "ui-button", text: "Retry", attrs: { type: "button" } });
        events.on(retry, "click", () => retryItem(item.id));
        actions.appendChild(retry);
      }
      if (item.status === "uploading") {
        const cancel = createElement("button", { className: "ui-button", text: "Cancel", attrs: { type: "button" } });
        events.on(cancel, "click", () => cancelItem(item.id));
        actions.appendChild(cancel);
      }
      if (item.status !== "uploading") {
        const remove = createElement("button", { className: "ui-button", text: "Remove", attrs: { type: "button" } });
        events.on(remove, "click", () => removeItem(item.id));
        actions.appendChild(remove);
      }

      row.append(head, progressWrap, actions);
      list.appendChild(row);
      itemRefs.set(item.id, { progressApi, meta });
    });
    syncButtons();
    updateLiveStatus();
  }

  function disposeItemRefs() {
    itemRefs.forEach((refs) => {
      refs?.progressApi?.destroy?.();
    });
  }

  function syncItemVisual(item) {
    const refs = itemRefs.get(item.id);
    if (!refs) {
      return;
    }
    refs.progressApi?.update(
      { value: Math.max(0, Math.min(100, item.progress)) },
      { color: resolveProgressColor(item.status) }
    );
    refs.meta.textContent = `${formatBytes(item.size)} • ${item.status}`;
  }

  function animateProgressTo(item, target, { emit = false } = {}) {
    const clampedTarget = Math.max(0, Math.min(100, Number(target) || 0));
    const existing = progressAnimations.get(item.id);
    if (existing != null) {
      cancelAnimationFrame(existing);
      progressAnimations.delete(item.id);
    }

    if (!currentOptions.smoothProgress) {
      item.progress = clampedTarget;
      syncItemVisual(item);
      if (emit) {
        emitChange();
      }
      return;
    }

    const start = Number(item.progress) || 0;
    const delta = clampedTarget - start;
    if (Math.abs(delta) < 0.01) {
      item.progress = clampedTarget;
      syncItemVisual(item);
      if (emit) {
        emitChange();
      }
      return;
    }
    const duration = Math.max(40, Number(currentOptions.progressAnimationMs) || 220);
    const startedAt = performance.now();
    const step = (now) => {
      const elapsed = now - startedAt;
      const ratio = Math.max(0, Math.min(1, elapsed / duration));
      const eased = 1 - Math.pow(1 - ratio, 3);
      item.progress = start + (delta * eased);
      syncItemVisual(item);
      if (ratio < 1) {
        const raf = requestAnimationFrame(step);
        progressAnimations.set(item.id, raf);
        return;
      }
      item.progress = clampedTarget;
      syncItemVisual(item);
      progressAnimations.delete(item.id);
      if (emit) {
        emitChange();
      }
    };
    const raf = requestAnimationFrame(step);
    progressAnimations.set(item.id, raf);
  }

  function syncButtons() {
    const hasQueue = items.some((item) => item.status === "queued" || item.status === "error");
    if (startBtn) {
      startBtn.disabled = running || !hasQueue;
    }
    if (clearBtn) {
      clearBtn.disabled = !items.length;
    }
  }

  function updateLiveStatus() {
    if (!statusLive) {
      return;
    }
    const queued = items.filter((item) => item.status === "queued").length;
    const uploading = items.filter((item) => item.status === "uploading").length;
    const success = items.filter((item) => item.status === "success").length;
    const errors = items.filter((item) => item.status === "error").length;
    statusLive.textContent = `${items.length} file${items.length === 1 ? "" : "s"} in queue. ${queued} queued, ${uploading} uploading, ${success} complete, ${errors} error.`;
  }

  function emitChange() {
    currentOptions.onChange?.(getState());
  }

  function addFiles(fileList = []) {
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList || []);
    if (!files.length) {
      return;
    }
    const room = Math.max(0, currentOptions.maxFiles - items.length);
    files.slice(0, room).forEach((file) => {
      const validation = validateFile(file);
      const item = {
        id: `upload-${Date.now()}-${idCounter++}`,
        file,
        name: String(file.name || `file-${idCounter}`),
        size: Number(file.size || 0),
        type: String(file.type || ""),
        progress: 0,
        uploadedBytes: 0,
        chunkIndex: 0,
        totalChunks: 0,
        status: validation.ok ? "queued" : "error",
        error: validation.ok ? "" : validation.error,
      };
      items.push(item);
    });
    renderList();
    emitChange();
    if (currentOptions.autoUpload) {
      start();
    }
  }

  function validateFile(file) {
    if (!file) {
      return { ok: false, error: "Invalid file." };
    }
    if (file.size > currentOptions.maxFileSize) {
      return { ok: false, error: `File too large (max ${formatBytes(currentOptions.maxFileSize)}).` };
    }
    if (Array.isArray(currentOptions.allowedTypes) && currentOptions.allowedTypes.length) {
      const matched = currentOptions.allowedTypes.some((rule) => matchType(file, rule));
      if (!matched) {
        return { ok: false, error: "File type is not allowed." };
      }
    }
    return { ok: true, error: "" };
  }

  function retryItem(itemId) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    item.status = "queued";
    item.error = "";
    item.progress = 0;
    item.uploadedBytes = 0;
    item.chunkIndex = 0;
    item.totalChunks = 0;
    renderList();
    emitChange();
    if (currentOptions.autoUpload) {
      start();
    }
  }

  function removeItem(itemId) {
    cancelItem(itemId);
    const anim = progressAnimations.get(itemId);
    if (anim != null) {
      cancelAnimationFrame(anim);
      progressAnimations.delete(itemId);
    }
    items = items.filter((entry) => entry.id !== itemId);
    renderList();
    emitChange();
  }

  function clear() {
    items.forEach((entry) => cancelItem(entry.id));
    progressAnimations.forEach((raf) => cancelAnimationFrame(raf));
    progressAnimations.clear();
    items = [];
    queueCursor = 0;
    running = false;
    renderList();
    emitChange();
  }

  function cancelItem(itemId) {
    const controller = controllers.get(itemId);
    if (controller) {
      controller.abort();
      controllers.delete(itemId);
    }
    const item = items.find((entry) => entry.id === itemId);
    if (item && item.status === "uploading") {
      item.status = "error";
      item.error = "Upload cancelled.";
      item.progress = 0;
      item.uploadedBytes = 0;
      item.chunkIndex = 0;
      syncItemVisual(item);
    }
  }

  async function start() {
    if (running) {
      return;
    }
    running = true;
    syncButtons();
    try {
      while (true) {
        const next = items.find((item) => item.status === "queued");
        if (!next) {
          break;
        }
        await uploadItem(next);
      }
    } finally {
      running = false;
      syncButtons();
      currentOptions.onComplete?.(getState());
    }
  }

  async function uploadItem(item) {
    item.status = "uploading";
    item.error = "";
    item.progress = 1;
    renderList();
    emitChange();

    const controller = new AbortController();
    controllers.set(item.id, controller);
    const controls = {
      signal: controller.signal,
      report(progress) {
        animateProgressTo(item, progress, { emit: true });
      },
    };

    try {
      if (typeof currentOptions.onUpload === "function") {
        await currentOptions.onUpload(item, controls);
      } else if (currentOptions.useChunkUpload || typeof currentOptions.onUploadChunk === "function") {
        await uploadByChunks(item, controls);
      } else {
        await defaultUpload(item, controls);
      }
      if (controller.signal.aborted) {
        throw new Error("Upload cancelled.");
      }
      item.status = "success";
      animateProgressTo(item, 100, { emit: false });
      item.uploadedBytes = item.size;
      item.chunkIndex = item.totalChunks || item.chunkIndex;
      item.error = "";
    } catch (error) {
      item.status = "error";
      item.error = String(error?.message || "Upload failed.");
      item.progress = Math.max(0, Math.min(100, item.progress));
      currentOptions.onError?.(error, item, getState());
    } finally {
      controllers.delete(item.id);
      renderList();
      emitChange();
    }
  }

  async function uploadByChunks(item, controls) {
    const totalBytes = Math.max(0, Number(item.size) || 0);
    const chunkSize = Math.max(1, Number(currentOptions.chunkSize) || (1024 * 1024));
    const totalChunks = Math.max(1, Math.ceil(Math.max(1, totalBytes) / chunkSize));
    item.totalChunks = totalChunks;

    const uploadKey = getUploadKey(item, currentOptions);
    let uploadedBytes = 0;
    let session = null;

    if (typeof currentOptions.onGetResumeState === "function") {
      const resume = await currentOptions.onGetResumeState({ item, uploadKey, state: getState() });
      uploadedBytes = clampNumber(resume?.uploadedBytes, 0, totalBytes);
    }
    if (typeof currentOptions.onCreateUploadSession === "function") {
      session = await currentOptions.onCreateUploadSession({
        item,
        uploadKey,
        state: getState(),
        signal: controls.signal,
      });
    }

    item.uploadedBytes = uploadedBytes;
    item.chunkIndex = Math.min(totalChunks, Math.floor(uploadedBytes / chunkSize));
    controls.report(percentFromBytes(uploadedBytes, totalBytes));

    for (let chunkIndex = item.chunkIndex; chunkIndex < totalChunks; chunkIndex += 1) {
      if (controls.signal.aborted) {
        throw new Error("Upload cancelled.");
      }
      const chunkStart = chunkIndex * chunkSize;
      const chunkEnd = Math.min(totalBytes, chunkStart + chunkSize);
      const chunkBlob = item.file?.slice ? item.file.slice(chunkStart, chunkEnd) : null;

      const payload = {
        item,
        uploadKey,
        session,
        chunkIndex,
        totalChunks,
        chunkStart,
        chunkEnd,
        chunkSize: Math.max(0, chunkEnd - chunkStart),
        chunk: chunkBlob,
        uploadedBytes,
        totalBytes,
        signal: controls.signal,
        reportChunkProgress(ratio) {
          const safeRatio = clampNumber(Number(ratio) || 0, 0, 1);
          const chunkBytes = chunkEnd - chunkStart;
          const estimate = chunkStart + (chunkBytes * safeRatio);
          controls.report(percentFromBytes(estimate, totalBytes));
        },
      };

      if (typeof currentOptions.onUploadChunk === "function") {
        await currentOptions.onUploadChunk(payload);
      } else {
        await defaultChunkUpload(payload);
      }

      uploadedBytes = chunkEnd;
      item.uploadedBytes = uploadedBytes;
      item.chunkIndex = chunkIndex + 1;
      controls.report(percentFromBytes(uploadedBytes, totalBytes));

      if (typeof currentOptions.onPersistResumeState === "function") {
        await currentOptions.onPersistResumeState({
          item,
          uploadKey,
          uploadedBytes,
          totalBytes,
          chunkIndex: item.chunkIndex,
          totalChunks,
          session,
        });
      }
    }

    if (typeof currentOptions.onFinalizeUpload === "function") {
      await currentOptions.onFinalizeUpload({
        item,
        uploadKey,
        session,
        totalBytes,
        totalChunks,
        state: getState(),
        signal: controls.signal,
      });
    }
    if (typeof currentOptions.onClearResumeState === "function") {
      await currentOptions.onClearResumeState({ item, uploadKey, session });
    }
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function destroy() {
    clear();
    disposeItemRefs();
    events.clear();
    clearNode(container);
    root = null;
    list = null;
    input = null;
    startBtn = null;
    clearBtn = null;
    statusLive = null;
    itemRefs.clear();
  }

  function getState() {
    return {
      running,
      queueCursor,
      options: { ...currentOptions },
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size,
        type: item.type,
        progress: item.progress,
        uploadedBytes: item.uploadedBytes,
        chunkIndex: item.chunkIndex,
        totalChunks: item.totalChunks,
        status: item.status,
        error: item.error,
      })),
    };
  }

  render();

  return {
    addFiles,
    start,
    clear,
    update,
    remove(itemId) {
      removeItem(itemId);
    },
    retry(itemId) {
      retryItem(itemId);
    },
    getState,
    destroy,
  };
}

function resolveProgressColor(status) {
  if (status === "success") {
    return "#1dab6a";
  }
  if (status === "error") {
    return "#ff4f6f";
  }
  return "#4a85ff";
}

async function defaultUpload(_item, controls) {
  let current = 0;
  while (current < 100) {
    if (controls.signal.aborted) {
      throw new Error("Upload cancelled.");
    }
    current += 12;
    controls.report(current);
    await wait(90);
  }
  controls.report(100);
}

async function defaultChunkUpload(payload) {
  const duration = Math.max(40, Math.min(240, Math.round((payload.chunkSize || 1) / (256 * 1024)) * 60));
  const steps = 4;
  for (let i = 1; i <= steps; i += 1) {
    if (payload.signal?.aborted) {
      throw new Error("Upload cancelled.");
    }
    payload.reportChunkProgress(i / steps);
    await wait(Math.round(duration / steps));
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptions(options) {
  return { ...DEFAULT_OPTIONS, ...(options || {}) };
}

function getUploadKey(item, options) {
  const prefix = options?.uploadKeyPrefix ? String(options.uploadKeyPrefix) : "upload";
  return `${prefix}:${String(item.name || "file")}:${Number(item.size) || 0}:${String(item.type || "")}`;
}

function percentFromBytes(uploadedBytes, totalBytes) {
  if (!totalBytes) {
    return uploadedBytes > 0 ? 100 : 0;
  }
  return clampNumber((uploadedBytes / totalBytes) * 100, 0, 100);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
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

function matchType(file, rule) {
  const fileType = String(file.type || "");
  const fileName = String(file.name || "").toLowerCase();
  const needle = String(rule || "").toLowerCase();
  if (!needle) {
    return false;
  }
  if (needle.endsWith("/")) {
    return fileType.toLowerCase().startsWith(needle);
  }
  if (needle.startsWith(".")) {
    return fileName.endsWith(needle);
  }
  return fileType.toLowerCase() === needle;
}

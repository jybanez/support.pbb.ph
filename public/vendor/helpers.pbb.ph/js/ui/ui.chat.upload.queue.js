import { createElement, clearNode } from "./ui.dom.js";
import { createMediaStrip } from "./ui.media.strip.js";
import { createIcon } from "./ui.icons.js";

const REMOVE_ICON = () => createIcon("actions.close", { className: "ui-chat-upload-queue-remove-icon" });

const DEFAULT_OPTIONS = {
  className: "",
  emptyHidden: true,
  maxMediaThumbs: 8,
  mediaStripOptions: {},
  onRemove: null,
  onOpen: null,
};

export function createChatUploadQueue(container, data = {}, options = {}) {
  let currentItems = normalizeItems(data?.items || []);
  let currentOptions = { ...DEFAULT_OPTIONS, ...(options || {}) };
  let mediaStripApis = [];

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }

    clearNode(container);
    destroyMediaStrips(mediaStripApis);

    const root = createElement("div", {
      className: `ui-chat-upload-queue ${currentOptions.className || ""}`.trim(),
    });
    root.__chatUploadQueueRemove = (item) => currentOptions.onRemove?.(item);

    if (!currentItems.length) {
      root.hidden = Boolean(currentOptions.emptyHidden);
      container.appendChild(root);
      return;
    }

    const mediaItems = currentItems
      .filter((item) => item.kind === "image" || item.kind === "video")
      .slice(0, currentOptions.maxMediaThumbs);
    const fileItems = currentItems.filter((item) => item.kind !== "image" && item.kind !== "video");

    if (mediaItems.length) {
      const mediaSection = createElement("div", { className: "ui-chat-upload-queue-media" });
      const mediaHost = createElement("div", { className: "ui-chat-upload-queue-media-host" });
      mediaSection.appendChild(mediaHost);
      const stripApi = createMediaStrip(mediaHost, mediaItems.map((item) => ({
        id: item.id,
        type: item.kind === "video" ? "video" : "image",
        src: item.previewUrl || "",
        thumb: item.previewUrl || "",
        poster: item.previewUrl || "",
        title: item.name || "",
        alt: item.name || `${item.kind} attachment`,
      })), {
        layout: "wrap",
        ...((currentOptions.mediaStripOptions && typeof currentOptions.mediaStripOptions === "object")
          ? currentOptions.mediaStripOptions
          : {}),
        onOpen(openedItem, index) {
          const item = mediaItems[index] || mediaItems.find((candidate) => candidate.id === openedItem?.id) || null;
          if (item) {
            currentOptions.onOpen?.(item);
          }
          currentOptions.mediaStripOptions?.onOpen?.(openedItem, index);
        },
      });
      mediaStripApis.push(stripApi);
      attachMediaThumbChrome(mediaHost, mediaItems);
      const mediaErrors = createMediaErrorList(mediaItems);
      if (mediaErrors) {
        mediaSection.appendChild(mediaErrors);
      }
      root.appendChild(mediaSection);
    }

    if (fileItems.length) {
      const files = createElement("div", { className: "ui-chat-upload-queue-files" });
      fileItems.forEach((item) => {
        const row = createElement("div", { className: "ui-chat-upload-queue-file" });
        const main = createElement("div", { className: "ui-chat-upload-queue-file-main" });
        main.appendChild(createElement("div", {
          className: "ui-chat-upload-queue-file-name",
          text: item.name || "Attachment",
        }));
        if (item.sizeLabel) {
          main.appendChild(createElement("div", {
            className: "ui-chat-upload-queue-file-meta",
            text: item.sizeLabel,
          }));
        }
        const progressNode = createProgressNode(item);
        if (progressNode) {
          main.appendChild(progressNode);
        }
        if (item.errorText) {
          main.appendChild(createElement("div", {
            className: "ui-chat-upload-queue-file-error",
            text: item.errorText,
          }));
        }
        row.appendChild(main);
        row.appendChild(createRemoveButton(item, "is-inline"));
        files.appendChild(row);
      });
      root.appendChild(files);
    }

    container.appendChild(root);
  }

  function createRemoveButton(item, className = "") {
    const button = createElement("button", {
      className: ["ui-chat-upload-queue-remove", className].filter(Boolean).join(" "),
      attrs: {
        type: "button",
        title: "Remove attachment",
        "aria-label": `Remove ${item.name || "attachment"}`,
      },
    });
    const icon = REMOVE_ICON();
    if (icon) {
      button.appendChild(icon);
    } else {
      button.textContent = "Remove";
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      currentOptions.onRemove?.(item);
    });
    return button;
  }

  function update(nextData = {}, nextOptions = {}) {
    if (Object.prototype.hasOwnProperty.call(nextData || {}, "items")) {
      currentItems = normalizeItems(nextData.items || []);
    }
    currentOptions = { ...currentOptions, ...(nextOptions || {}) };
    render();
  }

  function destroy() {
    destroyMediaStrips(mediaStripApis);
    clearNode(container);
  }

  function setItems(items = []) {
    currentItems = normalizeItems(items);
    render();
  }

  function getItems() {
    return currentItems.map((item) => ({ ...item }));
  }

  function getState() {
    return {
      items: getItems(),
      options: { ...currentOptions },
    };
  }

  render();
  return { update, destroy, setItems, getItems, getState };
}

function attachMediaThumbChrome(mediaHost, mediaItems) {
  const thumbs = Array.from(mediaHost.querySelectorAll(".ui-media-thumb"));
  thumbs.forEach((thumb, index) => {
    const item = mediaItems[index];
    if (!item) {
      return;
    }
    thumb.classList.add("ui-chat-upload-queue-media-thumb");
    const button = createElement("button", {
      className: "ui-chat-upload-queue-remove is-overlay",
      attrs: {
        type: "button",
        title: "Remove attachment",
        "aria-label": `Remove ${item.name || "attachment"}`,
      },
    });
    const icon = REMOVE_ICON();
    if (icon) {
      button.appendChild(icon);
    } else {
      button.textContent = "Remove";
    }
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      thumb.blur?.();
      const root = mediaHost.closest(".ui-chat-upload-queue");
      if (root && typeof root.__chatUploadQueueRemove === "function") {
        root.__chatUploadQueueRemove(item);
      }
    });
    thumb.appendChild(button);

    const stateNode = createMediaThumbState(item);
    if (stateNode) {
      thumb.appendChild(stateNode);
    }
  });
}

function normalizeItems(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
        ...item,
        kind: normalizeKind(item?.kind),
        status: normalizeStatus(item?.status),
        progress: normalizeProgress(item?.progress),
      }))
    : [];
}

function normalizeKind(kind) {
  const value = String(kind || "file").toLowerCase();
  if (value === "image" || value === "video" || value === "audio") {
    return value;
  }
  return "file";
}

function normalizeStatus(status) {
  const value = String(status || "queued").toLowerCase();
  if (value === "uploading" || value === "uploaded" || value === "failed") {
    return value;
  }
  return "queued";
}

function normalizeProgress(progress) {
  const next = Number(progress);
  if (!Number.isFinite(next)) {
    return null;
  }
  return Math.max(0, Math.min(100, next));
}

function createMediaThumbState(item) {
  if (item.status === "queued" && item.progress == null && !item.errorText) {
    return null;
  }
  const overlay = createElement("div", {
    className: `ui-chat-upload-queue-media-state is-${item.status}`,
  });
  if (item.progress != null || item.status === "uploading") {
    const track = createElement("div", { className: "ui-chat-upload-queue-media-progress-track" });
    const fill = createElement("div", {
      className: `ui-chat-upload-queue-media-progress-fill is-${item.status}`,
    });
    fill.style.width = `${item.progress ?? 0}%`;
    track.appendChild(fill);
    overlay.appendChild(track);
    overlay.appendChild(createElement("div", {
      className: "ui-chat-upload-queue-media-progress-label",
      text: item.progressLabel || formatStatusLabel(item),
    }));
    return overlay;
  }
  overlay.appendChild(createElement("div", {
    className: "ui-chat-upload-queue-media-progress-label",
    text: item.progressLabel || formatStatusLabel(item),
  }));
  return overlay;
}

function createMediaErrorList(items) {
  const failedItems = items.filter((item) => item.errorText);
  if (!failedItems.length) {
    return null;
  }
  const list = createElement("div", { className: "ui-chat-upload-queue-media-errors" });
  failedItems.forEach((item) => {
    list.appendChild(createElement("div", {
      className: "ui-chat-upload-queue-media-status-error",
      text: item.errorText,
    }));
  });
  return list;
}

function createProgressNode(item, className = "") {
  if (item.progress == null && item.status !== "uploading") {
    if (item.status === "uploaded") {
      return createElement("div", {
        className: ["ui-chat-upload-queue-progress", className, "is-complete"].filter(Boolean).join(" "),
        text: item.progressLabel || "Uploaded",
      });
    }
    return null;
  }
  const wrap = createElement("div", {
    className: ["ui-chat-upload-queue-progress", className].filter(Boolean).join(" "),
  });
  const track = createElement("div", { className: "ui-chat-upload-queue-progress-track" });
  const fill = createElement("div", {
    className: `ui-chat-upload-queue-progress-fill is-${item.status}`,
  });
  fill.style.width = `${item.progress ?? 0}%`;
  track.appendChild(fill);
  wrap.appendChild(track);
  wrap.appendChild(createElement("div", {
    className: "ui-chat-upload-queue-progress-label",
    text: item.progressLabel || formatStatusLabel(item),
  }));
  return wrap;
}

function formatStatusLabel(item) {
  if (item.status === "uploading") {
    return item.progress != null ? `${item.progress}%` : "Uploading";
  }
  if (item.status === "uploaded") {
    return "Uploaded";
  }
  if (item.status === "failed") {
    return "Failed";
  }
  return "Queued";
}

function destroyMediaStrips(list) {
  list.forEach((api) => api?.destroy?.());
  list.length = 0;
}

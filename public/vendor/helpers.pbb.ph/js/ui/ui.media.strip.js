import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createMediaViewer } from "./ui.media.viewer.js";

const DEFAULT_OPTIONS = {
  layout: "scroll", // scroll | wrap
  animationMs: 300,
  autoplay: true,
  muted: false,
  loop: false,
  showControls: true,
  className: "",
  baseUrl: "",
  viewerAriaLabel: "Media viewer",
  viewerClassName: "",
  showViewerHeader: true,
  showViewerFooter: true,
  showViewerCounter: true,
  showViewerClose: true,
  showViewerPrevNext: true,
  showViewerToolbar: true,
  showViewerAudiograph: false,
  viewerAudiographStyle: "neon",
  viewerFit: "contain",
  onOpen: null,
  onClose: null,
};

export function createMediaStrip(container, items = [], options = {}) {
  let currentOptions = normalizeOptions(options);
  let currentItems = normalizeItems(items, currentOptions);
  let root = null;
  let viewerHost = null;
  let viewerApi = null;
  let activeIndex = -1;
  const stripEvents = createEventBag();

  function getViewerItems() {
    return getViewerItemsFromStripItems(currentItems);
  }

  function findStripIndexById(id) {
    return currentItems.findIndex((item) => String(item.id) === String(id));
  }

  function findViewerIndexById(id) {
    return getViewerItems().findIndex((item) => String(item.id) === String(id));
  }

  function ensureViewer() {
    if (viewerApi) {
      return viewerApi;
    }
    viewerHost = document.createElement("div");
    viewerHost.className = "ui-media-strip-viewer-host";
    document.body.appendChild(viewerHost);
    viewerApi = createMediaViewer(viewerHost, getViewerOptions());
    return viewerApi;
  }

  function getViewerOptions() {
    return {
      items: getViewerItems().map((item) => ({
        id: item.id,
        type: item.type,
        src: item.srcUrl,
        thumb: item.thumbUrl,
        poster: item.posterUrl,
        title: item.title,
        alt: item.alt,
        duration_seconds: item.duration,
        metadata: item.metadata || {},
      })),
      fit: currentOptions.viewerFit,
      autoplayVideo: currentOptions.autoplay,
      mutedVideo: currentOptions.muted,
      loopVideo: currentOptions.loop,
      showVideoControls: currentOptions.showControls,
      ariaLabel: currentOptions.viewerAriaLabel,
      showHeader: currentOptions.showViewerHeader,
      showFooter: currentOptions.showViewerFooter,
      showCounter: currentOptions.showViewerCounter,
      showClose: currentOptions.showViewerClose,
      showPrevNext: currentOptions.showViewerPrevNext,
      showToolbar: currentOptions.showViewerToolbar,
      showAudiograph: currentOptions.showViewerAudiograph,
      audiographStyle: currentOptions.viewerAudiographStyle,
      className: currentOptions.viewerClassName,
      onOpen: (viewerItem, index) => {
        const stripIndex = findStripIndexById(viewerItem?.id);
        activeIndex = stripIndex;
        currentOptions.onOpen?.(stripIndex >= 0 ? currentItems[stripIndex] || null : null, stripIndex);
      },
      onClose: () => {
        const closedIndex = activeIndex;
        const closedItem = closedIndex >= 0 ? currentItems[closedIndex] || null : null;
        activeIndex = -1;
        currentOptions.onClose?.(closedItem, closedIndex);
      },
      onChange: (viewerItem) => {
        activeIndex = findStripIndexById(viewerItem?.id);
      },
    };
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    stripEvents.clear();
    clearNode(container);

    root = createElement("div", {
      className: `ui-media-strip ${currentOptions.layout === "wrap" ? "is-wrap" : "is-scroll"} ${currentOptions.className || ""}`.trim(),
    });

    currentItems.forEach((item, index) => {
      const thumb = createElement("button", {
        className: `ui-media-thumb ${item.processing ? "is-processing" : ""}`.trim(),
        attrs: {
          type: "button",
          "aria-label": item.alt || item.title || item.processingLabel || (item.processing ? `Processing media ${index + 1}` : `Media ${index + 1}`),
          ...(item.processing ? { disabled: "disabled", "aria-disabled": "true" } : {}),
        },
        dataset: { mediaId: item.id || String(index) },
      });

      if (item.processing && !item.srcUrl) {
        thumb.appendChild(createProcessingPlaceholder(item, index));
      } else if (item.type === "video" && !item.thumbUrl) {
        const videoThumb = createElement("video", {
          className: "ui-media-thumb-video",
          attrs: {
            src: item.srcUrl,
            muted: "muted",
            playsinline: "playsinline",
            preload: "metadata",
          },
        });
        thumb.appendChild(videoThumb);
      } else {
        const image = createElement("img", {
          className: "ui-media-thumb-image",
          attrs: {
            src: item.thumbUrl || item.srcUrl,
            alt: item.alt || item.title || `Media ${index + 1}`,
            loading: "lazy",
          },
        });
        thumb.appendChild(image);
      }

      if (item.type === "video" && !item.processing) {
        const overlay = createElement("span", {
          className: "ui-media-thumb-play",
          html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12l10-6z"></path></svg>',
        });
        thumb.appendChild(overlay);
      }

      if (!item.processing) {
        stripEvents.on(thumb, "click", () => openByIndex(index));
      }
      root.appendChild(thumb);
    });

    container.appendChild(root);
    ensureViewer().update(getViewerOptions());
  }

  function openByIndex(index) {
    if (!currentItems.length) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(currentItems.length - 1, Number(index) || 0));
    const item = currentItems[safeIndex];
    if (!item || item.processing || !item.srcUrl) {
      return;
    }
    const viewerIndex = findViewerIndexById(item.id);
    if (viewerIndex === -1) {
      return;
    }
    activeIndex = safeIndex;
    ensureViewer().update(getViewerOptions());
    viewerApi.open(viewerIndex);
  }

  function openById(id) {
    const index = currentItems.findIndex((item) => String(item.id) === String(id));
    if (index >= 0) {
      openByIndex(index);
    }
  }

  render();

  return {
    destroy() {
      stripEvents.clear();
      clearNode(container);
      root = null;
      if (viewerApi) {
        viewerApi.destroy();
        viewerApi = null;
      }
      if (viewerHost?.parentNode) {
        viewerHost.parentNode.removeChild(viewerHost);
      }
      viewerHost = null;
      activeIndex = -1;
    },
    update(nextItems = [], nextOptions = {}) {
      currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
      currentItems = normalizeItems(nextItems, currentOptions);
      if (!currentItems.length) {
        activeIndex = -1;
      } else if (activeIndex >= currentItems.length) {
        activeIndex = currentItems.length - 1;
      }
      render();
    },
    openById,
    openByIndex,
    getState() {
      return {
        items: clone(currentItems),
        options: clone(currentOptions),
        activeIndex,
        viewerState: viewerApi?.getState?.() || null,
      };
    },
  };
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    layout: options.layout === "wrap" ? "wrap" : "scroll",
  };
}

function normalizeItems(items, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const normalizedType = item?.type === "video"
        ? "video"
        : item?.type === "photo" || item?.type === "image"
          ? "image"
          : "unsupported";
      const path = resolveUrl(String(item?.path || item?.srcUrl || item?.src || ""), normalizedOptions.baseUrl);
      const thumb = resolveUrl(String(item?.thumbUrl || item?.thumb || ""), normalizedOptions.baseUrl);
      const src = resolveUrl(String(item?.srcUrl || item?.src || path || thumb || ""), normalizedOptions.baseUrl);
      const processing = Boolean(item?.processing || item?.metadata?.processing) && !src;
      return {
        id: item?.id ?? String(index),
        type: normalizedType,
        processing,
        processingLabel: String(item?.processingLabel || "").trim(),
        thumbUrl: thumb || (normalizedType === "image" ? src : ""),
        srcUrl: src,
        alt: item?.alt || "",
        title: item?.title || "",
        duration: item?.duration ?? item?.duration_seconds ?? null,
        mimeType: item?.mimeType || "",
        posterUrl: resolveUrl(String(item?.posterUrl || item?.poster || ""), normalizedOptions.baseUrl),
        metadata: item?.metadata && typeof item.metadata === "object" ? { ...item.metadata } : {},
        raw: item,
      };
    })
    .filter((item) => (item.type === "image" || item.type === "video") && (Boolean(item.srcUrl) || item.processing));
}

function createProcessingPlaceholder(item, index) {
  const placeholder = createElement("span", {
    className: "ui-media-thumb-processing",
  });
  placeholder.appendChild(createElement("span", {
    className: "ui-media-thumb-processing-spinner",
    attrs: { "aria-hidden": "true" },
  }));
  if (item.processingLabel) {
    placeholder.appendChild(createElement("span", {
      className: "ui-media-thumb-processing-label",
      text: item.processingLabel,
    }));
  }
  placeholder.appendChild(createElement("span", {
    className: "ui-media-thumb-processing-sr",
    text: item.processingLabel || item.alt || item.title || `Processing media ${index + 1}`,
  }));
  return placeholder;
}

function getViewerItemsFromStripItems(items) {
  return items.filter((item) => !item.processing && Boolean(item.srcUrl));
}

function resolveUrl(url, baseUrl) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:") || value.startsWith("./")) {
    return value;
  }
  if (!baseUrl) {
    return value;
  }
  return `${String(baseUrl).replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch (_error) {
    return JSON.parse(JSON.stringify(value));
  }
}

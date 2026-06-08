import { createElement, clearNode } from "./ui.dom.js";
import { createMediaStrip } from "./ui.media.strip.js";
import { createMenu } from "./ui.menu.js";

const DOWNLOAD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v9.17l2.59-2.58L17 12l-5 5-5-5 1.41-1.41L11 13.17V4zm-5 14h12v2H6v-2z"></path></svg>';
const MESSAGE_MENU_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="12" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="17.5" cy="12" r="1.5"></circle></svg>';
const DEFAULT_MESSAGE_HEIGHT = 128;
const DEFAULT_SYSTEM_HEIGHT = 40;

const DEFAULT_OPTIONS = {
  className: "",
  emptyTitle: "No messages yet",
  emptyText: "Start the conversation from the composer below.",
  showSenderNames: true,
  showTimestamps: true,
  showStates: true,
  groupAdjacentMessages: true,
  alignOutgoingRight: true,
  showMessageMenuTrigger: true,
  maxMediaThumbsPerMessage: 4,
  mediaStripOptions: {},
  getMessageMenuItems: null,
  messageMenuOptions: {},
  enableVirtualization: false,
  virtualThreshold: 120,
  virtualOverscan: 10,
  bottomAnchorThreshold: 48,
  onAttachmentOpen: null,
  onAttachmentDownload: null,
  onMessageAction: null,
  onMessageMenuSelect: null,
};

export function createChatThread(container, data = {}, options = {}) {
  let currentMessages = normalizeMessages(data?.messages || []);
  let currentOptions = { ...DEFAULT_OPTIONS, ...(options || {}) };
  let mediaStripApis = [];
  let messageMenuApis = [];
  let virtualRoot = null;
  let virtualViewport = null;
  let virtualScroller = null;
  let topSpacer = null;
  let sliceHost = null;
  let bottomSpacer = null;
  let scrollRaf = 0;
  let remeasureRaf = 0;
  let measureRetryCount = 0;
  const measuredHeights = new Map();

  function render(reason = "replace", restoreSnapshot = null) {
    if (!container || container.nodeType !== 1) {
      return;
    }

    destroyMediaStrips(mediaStripApis);
    destroyMessageMenus(messageMenuApis);

    if (shouldVirtualize(currentMessages, currentOptions)) {
      renderVirtual(reason, restoreSnapshot);
      return;
    }

    teardownVirtualRoot();
    clearNode(container);

    const root = createElement("div", {
      className: `ui-chat-thread ${currentOptions.className || ""}`.trim(),
    });

    if (!currentMessages.length) {
      root.appendChild(createEmptyState());
      container.appendChild(root);
      return;
    }

    currentMessages.forEach((message, index) => {
      root.appendChild(createMessageNode(message, index));
    });

    container.appendChild(root);
  }

  function renderVirtual(reason = "replace", restoreSnapshot = null) {
    ensureVirtualRoot();

    if (!currentMessages.length) {
      clearNode(sliceHost);
      topSpacer.style.height = "0px";
      bottomSpacer.style.height = "0px";
      sliceHost.appendChild(createEmptyState());
      if (restoreSnapshot?.mode === "bottom") {
        queuePinnedToBottom();
      }
      return;
    }

    const viewportHeight = getViewportHeight();
    const scrollTop = virtualViewport.scrollTop;
    const windowRange = computeVirtualWindow(currentMessages, measuredHeights, scrollTop, viewportHeight, currentOptions.virtualOverscan);

    clearNode(sliceHost);
    topSpacer.style.height = `${windowRange.topSpacerHeight}px`;
    bottomSpacer.style.height = `${windowRange.bottomSpacerHeight}px`;

    for (let index = windowRange.start; index < windowRange.end; index += 1) {
      sliceHost.appendChild(createMessageNode(currentMessages[index], index));
    }

    measureVisibleRows(windowRange.start);
    applyRestoreSnapshot(restoreSnapshot, reason);
  }

  function createEmptyState() {
    const empty = createElement("div", { className: "ui-chat-thread-empty" });
    empty.appendChild(createElement("div", {
      className: "ui-chat-thread-empty-title",
      text: currentOptions.emptyTitle,
    }));
    empty.appendChild(createElement("div", {
      className: "ui-chat-thread-empty-text",
      text: currentOptions.emptyText,
    }));
    return empty;
  }

  function createMessageNode(message, index) {
    const previous = currentMessages[index - 1] || null;
    const grouped = Boolean(currentOptions.groupAdjacentMessages && isGroupedWithPrevious(previous, message));
    const direction = normalizeDirection(message.direction);
    const row = createElement("article", {
      className: [
        "ui-chat-message",
        `is-${direction}`,
        grouped ? "is-grouped" : "",
        message?.meta?.emphasized ? "is-emphasized" : "",
        message?.meta?.muted ? "is-muted" : "",
      ].filter(Boolean).join(" "),
      attrs: {
        "data-message-id": String(message.id || ""),
        "data-direction": direction,
      },
    });

    if (direction === "system") {
      row.appendChild(createElement("div", {
        className: "ui-chat-message-system",
        text: String(message.text || ""),
      }));
      return row;
    }

    const bubble = createElement("div", { className: "ui-chat-message-bubble" });
    const menuItems = getMessageMenuItemsFromOptions(message, currentMessages, currentOptions);
    if (menuItems.length) {
      bubble.appendChild(createMessageMenuTrigger(message, menuItems));
    }
    if (currentOptions.showSenderNames && shouldShowSenderName(message, grouped)) {
      bubble.appendChild(createElement("div", {
        className: "ui-chat-message-sender",
        text: String(message.senderName || ""),
      }));
      if (message.senderSubtitle) {
        bubble.appendChild(createElement("div", {
          className: "ui-chat-message-sender-subtitle",
          text: String(message.senderSubtitle),
        }));
      }
    }

    if (message.text) {
      bubble.appendChild(createElement("div", {
        className: "ui-chat-message-text",
        text: String(message.text),
      }));
    }

    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length) {
      bubble.appendChild(createAttachmentsNode(message, attachments));
    }

    const meta = createMessageMeta(message, direction, grouped);
    if (meta) {
      bubble.appendChild(meta);
    }

    row.appendChild(bubble);
    return row;
  }

  function createMessageMenuTrigger(message, menuItems) {
    const trigger = createElement("button", {
      className: "ui-chat-message-menu-trigger",
      html: MESSAGE_MENU_ICON,
      attrs: {
        type: "button",
        title: "Message actions",
        "aria-label": `Message actions for ${String(message.senderName || "message")}`,
      },
    });
    const menuApi = createMenu(trigger, menuItems, {
      placement: "bottom-end",
      align: "right",
      ...((currentOptions.messageMenuOptions && typeof currentOptions.messageMenuOptions === "object")
        ? currentOptions.messageMenuOptions
        : {}),
      onSelect(item, meta) {
        currentOptions.onMessageMenuSelect?.(message, item, meta);
        currentOptions.messageMenuOptions?.onSelect?.(item, meta);
      },
    });
    messageMenuApis.push(menuApi);
    return trigger;
  }

  function createAttachmentsNode(message, attachments) {
    const wrap = createElement("div", { className: "ui-chat-message-attachments" });
    const mediaItems = attachments
      .filter((item) => item.kind === "image" || item.kind === "video")
      .slice(0, currentOptions.maxMediaThumbsPerMessage);
    const fileItems = attachments.filter((item) => item.kind !== "image" && item.kind !== "video");

    if (mediaItems.length) {
      const mediaHost = createElement("div", { className: "ui-chat-message-media-strip" });
      wrap.appendChild(mediaHost);
      const stripApi = createMediaStrip(mediaHost, mediaItems.map((attachment) => ({
        id: attachment.id,
        type: attachment.kind === "video" ? "video" : "image",
        src: attachment.url || attachment.previewUrl || "",
        thumb: attachment.previewUrl || attachment.url || "",
        poster: attachment.posterUrl || attachment.previewUrl || attachment.url || "",
        title: attachment.name || "",
        alt: attachment.name || `${attachment.kind} attachment`,
      })), {
        layout: "wrap",
        ...((currentOptions.mediaStripOptions && typeof currentOptions.mediaStripOptions === "object")
          ? currentOptions.mediaStripOptions
          : {}),
        onOpen(item, index) {
          const attachment = mediaItems[index] || mediaItems.find((candidate) => candidate.id === item?.id) || null;
          if (attachment) {
            currentOptions.onAttachmentOpen?.(message, attachment);
          }
          currentOptions.mediaStripOptions?.onOpen?.(item, index);
        },
      });
      mediaStripApis.push(stripApi);
    }

    if (fileItems.length) {
      const list = createElement("div", { className: "ui-chat-message-files" });
      fileItems.forEach((attachment) => {
        const row = createElement("div", { className: "ui-chat-attachment-file" });
        const main = createElement("button", {
          className: "ui-chat-attachment-file-main",
          attrs: { type: "button" },
        });
        main.appendChild(createElement("span", {
          className: "ui-chat-attachment-file-name",
          text: attachment.name || "File attachment",
        }));
        if (attachment.sizeLabel) {
          main.appendChild(createElement("span", {
            className: "ui-chat-attachment-file-meta",
            text: attachment.sizeLabel,
          }));
        }
        main.addEventListener("click", () => currentOptions.onAttachmentOpen?.(message, attachment));
        row.appendChild(main);
        if (currentOptions.onAttachmentDownload) {
          const download = createElement("button", {
            className: "ui-chat-attachment-file-download",
            html: DOWNLOAD_ICON,
            attrs: { type: "button", title: "Download attachment", "aria-label": "Download attachment" },
          });
          download.addEventListener("click", () => currentOptions.onAttachmentDownload?.(message, attachment));
          row.appendChild(download);
        }
        list.appendChild(row);
      });
      wrap.appendChild(list);
    }

    return wrap;
  }

  function createMessageMeta(message, direction, grouped) {
    const meta = createElement("div", { className: "ui-chat-message-meta" });
    let hasContent = false;

    if (currentOptions.showTimestamps && message.timestamp && (!grouped || direction === "outgoing")) {
      meta.appendChild(createElement("span", {
        className: "ui-chat-message-timestamp",
        text: String(message.timestamp),
      }));
      hasContent = true;
    }

    if (direction === "outgoing" && currentOptions.showStates && message.state) {
      meta.appendChild(createElement("span", {
        className: `ui-chat-message-state is-${String(message.state).replace(/[^a-z-]/gi, "").toLowerCase()}`,
        text: formatStateLabel(message.state),
      }));
      hasContent = true;
    }

    return hasContent ? meta : null;
  }

  function ensureVirtualRoot() {
    if (virtualRoot && virtualViewport && virtualScroller && topSpacer && sliceHost && bottomSpacer) {
      virtualRoot.className = `ui-chat-thread is-virtualized ${currentOptions.className || ""}`.trim();
      return;
    }

    teardownVirtualRoot();
    clearNode(container);

    virtualRoot = createElement("div", {
      className: `ui-chat-thread is-virtualized ${currentOptions.className || ""}`.trim(),
    });
    virtualViewport = createElement("div", { className: "ui-chat-thread-viewport" });
    virtualScroller = createElement("div", { className: "ui-chat-thread-virtual-scroller" });
    topSpacer = createElement("div", { className: "ui-chat-thread-virtual-spacer is-top" });
    sliceHost = createElement("div", { className: "ui-chat-thread-virtual-window" });
    bottomSpacer = createElement("div", { className: "ui-chat-thread-virtual-spacer is-bottom" });

    virtualScroller.appendChild(topSpacer);
    virtualScroller.appendChild(sliceHost);
    virtualScroller.appendChild(bottomSpacer);
    virtualViewport.appendChild(virtualScroller);
    virtualRoot.appendChild(virtualViewport);
    container.appendChild(virtualRoot);

    virtualViewport.addEventListener("scroll", onViewportScroll, { passive: true });

  }

  function teardownVirtualRoot() {
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
    }
    if (remeasureRaf) {
      cancelAnimationFrame(remeasureRaf);
      remeasureRaf = 0;
    }
    if (virtualViewport) {
      virtualViewport.removeEventListener("scroll", onViewportScroll);
    }
    virtualRoot = null;
    virtualViewport = null;
    virtualScroller = null;
    topSpacer = null;
    sliceHost = null;
    bottomSpacer = null;
  }

  function onViewportScroll() {
    if (scrollRaf) {
      return;
    }
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      renderVirtual("scroll", null);
    });
  }

  function scheduleVirtualRender() {
    if (!virtualViewport) {
      return;
    }
    if (scrollRaf) {
      return;
    }
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      renderVirtual("measure", null);
    });
  }

  function captureVirtualSnapshot() {
    if (!virtualViewport || !shouldVirtualize(currentMessages, currentOptions)) {
      return null;
    }
    const anchor = getFirstVisibleAnchor(virtualViewport);
    return {
      scrollTop: virtualViewport.scrollTop,
      scrollHeight: virtualViewport.scrollHeight,
      mode: isPinnedToBottom(virtualViewport, currentOptions.bottomAnchorThreshold) ? "bottom" : "preserve",
      anchorId: anchor?.id || null,
      anchorOffset: anchor?.offset || 0,
    };
  }

  function applyRestoreSnapshot(snapshot, reason) {
    if (!virtualViewport || !snapshot) {
      return;
    }

    if (snapshot.mode === "bottom" && reason === "append") {
      queuePinnedToBottom();
      return;
    }

    if (reason === "prepend") {
      const delta = virtualViewport.scrollHeight - snapshot.scrollHeight;
      virtualViewport.scrollTop = snapshot.scrollTop + delta;
      requestAnimationFrame(() => {
        if (!virtualViewport || !snapshot.anchorId) {
          return;
        }
        const anchorNode = findMessageNodeById(virtualViewport, snapshot.anchorId);
        if (!anchorNode) {
          return;
        }
        const viewportRect = virtualViewport.getBoundingClientRect();
        const anchorRect = anchorNode.getBoundingClientRect();
        const offsetDelta = (anchorRect.top - viewportRect.top) - snapshot.anchorOffset;
        if (Math.abs(offsetDelta) > 1) {
          virtualViewport.scrollTop += offsetDelta;
        }
      });
      return;
    }

    if (snapshot.mode === "preserve") {
      virtualViewport.scrollTop = snapshot.scrollTop;
    }
  }

  function queuePinnedToBottom() {
    if (!virtualViewport) {
      return;
    }
    const applyBottom = () => {
      if (!virtualViewport) {
        return;
      }
      virtualViewport.scrollTop = virtualViewport.scrollHeight;
    };
    applyBottom();
    requestAnimationFrame(() => {
      applyBottom();
      requestAnimationFrame(applyBottom);
    });
  }

  function measureVisibleRows(startIndex) {
    if (!sliceHost) {
      return;
    }

    let changed = false;
    Array.from(sliceHost.children).forEach((node, offset) => {
      const message = currentMessages[startIndex + offset];
      if (!message || !node || node.nodeType !== 1) {
        return;
      }
      const key = getMessageMeasureKey(message, startIndex + offset);
      const nextHeight = Math.max(1, Math.round(node.getBoundingClientRect().height));
      if (measuredHeights.get(key) !== nextHeight) {
        measuredHeights.set(key, nextHeight);
        changed = true;
      }
    });

    if (changed && !remeasureRaf && measureRetryCount < 2) {
      measureRetryCount += 1;
      remeasureRaf = requestAnimationFrame(() => {
        remeasureRaf = 0;
        renderVirtual("measure", null);
      });
    } else if (!changed) {
      measureRetryCount = 0;
    }
  }

  function getViewportHeight() {
    if (!virtualViewport) {
      return container?.clientHeight || 0;
    }
    return virtualViewport.clientHeight || container?.clientHeight || 0;
  }

  function update(nextData = {}, nextOptions = {}) {
    const previousMessages = currentMessages;
    const snapshot = captureVirtualSnapshot();
    if (Object.prototype.hasOwnProperty.call(nextData || {}, "messages")) {
      currentMessages = normalizeMessages(nextData.messages || []);
    }
    currentOptions = { ...currentOptions, ...(nextOptions || {}) };
    const reason = detectChangeReason(previousMessages, currentMessages);
    render(reason, snapshot);
  }

  function destroy() {
    destroyMediaStrips(mediaStripApis);
    destroyMessageMenus(messageMenuApis);
    teardownVirtualRoot();
    clearNode(container);
  }

  function setMessages(messages = []) {
    const previousMessages = currentMessages;
    const snapshot = captureVirtualSnapshot();
    currentMessages = normalizeMessages(messages);
    render(detectChangeReason(previousMessages, currentMessages), snapshot);
  }

  function getMessages() {
    return currentMessages.map((message) => ({
      ...message,
      attachments: Array.isArray(message.attachments) ? message.attachments.map((item) => ({ ...item })) : [],
      meta: message.meta ? { ...message.meta } : undefined,
    }));
  }

  function getState() {
    return {
      messages: getMessages(),
      options: { ...currentOptions },
      virtualization: {
        enabled: shouldVirtualize(currentMessages, currentOptions),
      },
    };
  }

  render();
  return { update, destroy, setMessages, getMessages, getState };
}

function destroyMediaStrips(list = []) {
  list.forEach((api) => api?.destroy?.());
  list.length = 0;
}

function destroyMessageMenus(list = []) {
  list.forEach((api) => api?.destroy?.());
  list.length = 0;
}

function normalizeMessages(messages) {
  return Array.isArray(messages) ? messages.map((message) => ({
    ...message,
    direction: normalizeDirection(message?.direction),
    attachments: Array.isArray(message?.attachments) ? message.attachments.map((item) => ({ ...item })) : [],
    meta: message?.meta ? { ...message.meta } : undefined,
  })) : [];
}

function normalizeDirection(direction) {
  const value = String(direction || "incoming").toLowerCase();
  if (value === "outgoing" || value === "system") {
    return value;
  }
  return "incoming";
}

function isGroupedWithPrevious(previous, current) {
  if (!previous || !current) {
    return false;
  }
  const prevDirection = normalizeDirection(previous.direction);
  const currentDirection = normalizeDirection(current.direction);
  if (prevDirection !== currentDirection || currentDirection === "system") {
    return false;
  }
  return String(previous.senderName || "") === String(current.senderName || "");
}

function shouldShowSenderName(message, grouped) {
  if (normalizeDirection(message.direction) === "outgoing") {
    return Boolean(message.senderName) && !grouped;
  }
  return Boolean(message.senderName) && !grouped;
}

function getMessageMenuItemsFromOptions(message, currentMessages, currentOptions) {
  if (currentOptions.showMessageMenuTrigger === false || typeof currentOptions.getMessageMenuItems !== "function") {
    return [];
  }
  const items = currentOptions.getMessageMenuItems(message, { messages: currentMessages.map((item) => ({ ...item })) });
  return Array.isArray(items) ? items : [];
}

function formatStateLabel(state) {
  const value = String(state || "").toLowerCase();
  switch (value) {
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "failed":
      return "Failed";
    default:
      return String(state || "");
  }
}

function shouldVirtualize(messages, options) {
  return Boolean(options?.enableVirtualization) && Array.isArray(messages) && messages.length >= Number(options?.virtualThreshold || 0);
}

function getMessageMeasureKey(message, index) {
  return String(message?.id ?? index);
}

function estimateMessageHeight(message) {
  if (normalizeDirection(message?.direction) === "system") {
    return DEFAULT_SYSTEM_HEIGHT;
  }
  let height = DEFAULT_MESSAGE_HEIGHT;
  if (message?.text) {
    height += Math.min(56, Math.ceil(String(message.text).length / 42) * 18);
  }
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.some((item) => item.kind === "image" || item.kind === "video")) {
    height += 112;
  }
  const fileCount = attachments.filter((item) => item.kind !== "image" && item.kind !== "video").length;
  height += fileCount * 52;
  return height;
}

function computeVirtualWindow(messages, measuredHeights, scrollTop, viewportHeight, overscan) {
  const heights = messages.map((message, index) => measuredHeights.get(getMessageMeasureKey(message, index)) || estimateMessageHeight(message));
  const offsets = new Array(messages.length);
  let totalHeight = 0;
  for (let index = 0; index < heights.length; index += 1) {
    offsets[index] = totalHeight;
    totalHeight += heights[index];
  }

  const visibleBottom = scrollTop + Math.max(viewportHeight, 1);
  let visibleStart = 0;
  while (visibleStart < messages.length && offsets[visibleStart] + heights[visibleStart] < scrollTop) {
    visibleStart += 1;
  }

  let visibleEnd = visibleStart;
  while (visibleEnd < messages.length && offsets[visibleEnd] < visibleBottom) {
    visibleEnd += 1;
  }

  const start = Math.max(0, visibleStart - Math.max(0, overscan || 0));
  const end = Math.min(messages.length, Math.max(visibleEnd, visibleStart + 1) + Math.max(0, overscan || 0));
  const topSpacerHeight = offsets[start] || 0;
  const bottomStart = end < messages.length ? offsets[end] : totalHeight;
  const bottomSpacerHeight = Math.max(0, totalHeight - bottomStart);

  return {
    start,
    end,
    topSpacerHeight,
    bottomSpacerHeight,
  };
}

function detectChangeReason(previousMessages, nextMessages) {
  if (!Array.isArray(previousMessages) || !Array.isArray(nextMessages)) {
    return "replace";
  }
  if (previousMessages.length === 0 || nextMessages.length === 0) {
    return "replace";
  }
  if (nextMessages.length > previousMessages.length) {
    if (isPrefixMatch(previousMessages, nextMessages)) {
      return "append";
    }
    if (isSuffixMatch(previousMessages, nextMessages)) {
      return "prepend";
    }
  }
  return "replace";
}

function isPrefixMatch(previousMessages, nextMessages) {
  return previousMessages.every((message, index) => sameMessageIdentity(message, nextMessages[index]));
}

function isSuffixMatch(previousMessages, nextMessages) {
  const offset = nextMessages.length - previousMessages.length;
  return previousMessages.every((message, index) => sameMessageIdentity(message, nextMessages[offset + index]));
}

function sameMessageIdentity(left, right) {
  return String(left?.id ?? "") === String(right?.id ?? "") && normalizeDirection(left?.direction) === normalizeDirection(right?.direction);
}

function isPinnedToBottom(viewport, threshold) {
  if (!viewport) {
    return true;
  }
  const distance = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
  return distance <= Math.max(0, Number(threshold) || 0);
}

function getFirstVisibleAnchor(viewport) {
  if (!viewport) {
    return null;
  }
  const viewportRect = viewport.getBoundingClientRect();
  const rows = Array.from(viewport.querySelectorAll(".ui-chat-message[data-message-id]"));
  const candidate = rows.find((row) => row.getBoundingClientRect().bottom > viewportRect.top + 2);
  if (!candidate) {
    return null;
  }
  return {
    id: candidate.dataset.messageId || null,
    offset: candidate.getBoundingClientRect().top - viewportRect.top,
  };
}

function findMessageNodeById(viewport, id) {
  if (!viewport || !id) {
    return null;
  }
  return Array.from(viewport.querySelectorAll(".ui-chat-message[data-message-id]"))
    .find((row) => row.dataset.messageId === id) || null;
}

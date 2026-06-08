import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Kanban board",
  laneTitleKey: "title",
  laneIdKey: "id",
  cardIdKey: "id",
  cardTitleKey: "title",
  cardMetaKey: "meta",
  draggable: true,
  keyboardMoves: true,
  emptyText: "No cards.",
  showEmptyPlaceholder: true,
  wipLimits: null, // { [laneId]: number }
  validateMove: null, // ({ card, fromLaneId, toLaneId, fromIndex, toIndex, lanes }) => boolean | { ok, reason }
  onCardMove: null,
  onMoveRejected: null,
  onCardClick: null,
};

export function createKanban(container, lanes = [], options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let currentLanes = normalizeLanes(lanes, currentOptions);
  let dragCardId = null;
  let dragFromLaneId = null;
  let dragFromIndex = -1;
  let dragOverLaneId = null;
  let dragOverIndex = -1;
  let pendingFocusCardId = null;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    const root = createElement("section", {
      className: `ui-kanban ${currentOptions.className || ""}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });
    currentLanes.forEach((lane) => {
      root.appendChild(renderLane(lane));
    });
    container.appendChild(root);
    if (pendingFocusCardId) {
      const focusNode = container.querySelector(`.ui-kanban-card[data-card-id="${cssEscape(pendingFocusCardId)}"]`);
      focusNode?.focus?.({ preventScroll: true });
      pendingFocusCardId = null;
    }
  }

  function renderLane(lane) {
    const titleId = `ui-kanban-lane-title-${toDomIdToken(lane.id)}`;
    const laneNode = createElement("section", {
      className: "ui-kanban-lane",
      attrs: {
        "data-lane-id": lane.id,
        role: "region",
        "aria-labelledby": titleId,
      },
    });
    const header = createElement("header", { className: "ui-kanban-lane-header" });
    header.appendChild(createElement("h4", {
      className: "ui-title",
      text: lane.title,
      attrs: { id: titleId },
    }));
    header.appendChild(createElement("span", { className: "ui-kanban-count", text: String(lane.cards.length) }));
    laneNode.appendChild(header);

    const cards = createElement("div", {
      className: "ui-kanban-cards",
      attrs: {
        role: "list",
        "aria-label": `${lane.title} cards`,
      },
    });
    const handleLaneDragOver = (event) => {
      if (!currentOptions.draggable || !dragCardId) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      setDropTarget(lane.id, resolveDropIndex(cards, event.clientY));
    };
    events.on(laneNode, "dragover", handleLaneDragOver);
    events.on(cards, "dragover", handleLaneDragOver);
    events.on(laneNode, "dragleave", (event) => {
      if (laneNode.contains(event.relatedTarget)) {
        return;
      }
      clearDropTarget();
    });
    events.on(laneNode, "drop", (event) => {
      event.preventDefault();
      if (!dragCardId || !dragFromLaneId) {
        clearDropTarget();
        return;
      }
      const targetIndex = dragOverLaneId === lane.id
        ? dragOverIndex
        : resolveDropIndex(cards, event.clientY);
      moveCard(dragCardId, dragFromLaneId, lane.id, targetIndex);
      clearDropTarget();
      dragCardId = null;
      dragFromLaneId = null;
      dragFromIndex = -1;
    });

    if (!lane.cards.length && currentOptions.showEmptyPlaceholder) {
      cards.appendChild(createElement("p", { className: "ui-kanban-empty", text: currentOptions.emptyText }));
    } else {
      lane.cards.forEach((card) => {
        const cardIndex = lane.cards.findIndex((entry) => entry.id === card.id);
        cards.appendChild(renderCard(card, lane.id, cardIndex));
      });
    }
    laneNode.appendChild(cards);
    return laneNode;
  }

  function renderCard(card, laneId, cardIndex) {
    const node = createElement("article", {
      className: "ui-kanban-card",
      attrs: {
        "data-card-id": card.id,
        draggable: currentOptions.draggable ? "true" : null,
        tabindex: currentOptions.keyboardMoves || typeof currentOptions.onCardClick === "function" ? "0" : null,
        role: "listitem",
        "aria-label": card.meta ? `${card.title}. ${card.meta}` : card.title,
      },
    });
    node.appendChild(createElement("h5", { className: "ui-kanban-card-title", text: card.title }));
    if (card.meta) {
      node.appendChild(createElement("p", { className: "ui-kanban-card-meta", text: card.meta }));
    }

    events.on(node, "click", () => {
      currentOptions.onCardClick?.(card, laneId);
    });
    if (currentOptions.draggable) {
      events.on(node, "dragstart", (event) => {
        dragCardId = card.id;
        dragFromLaneId = laneId;
        dragFromIndex = cardIndex;
        node.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", card.id);
        event.dataTransfer?.setData("application/x-kanban-lane", laneId);
        setDropTarget(laneId, cardIndex);
      });
      events.on(node, "dragover", (event) => {
        if (!dragCardId) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
        setDropTarget(laneId, resolveDropIndex(node.parentElement, event.clientY));
      });
      events.on(node, "drop", (event) => {
        event.preventDefault();
        if (!dragCardId || !dragFromLaneId) {
          clearDropTarget();
          return;
        }
        const targetIndex = dragOverLaneId === laneId
          ? dragOverIndex
          : resolveDropIndex(node.parentElement, event.clientY);
        moveCard(dragCardId, dragFromLaneId, laneId, targetIndex);
        clearDropTarget();
        dragCardId = null;
        dragFromLaneId = null;
        dragFromIndex = -1;
      });
      events.on(node, "dragend", () => {
        node.classList.remove("is-dragging");
        clearDropTarget();
        dragCardId = null;
        dragFromLaneId = null;
        dragFromIndex = -1;
      });
    }

    if (currentOptions.keyboardMoves) {
      events.on(node, "keydown", (event) => {
        if (event.defaultPrevented) {
          return;
        }
        if ((event.key === "Enter" || event.key === " ") && typeof currentOptions.onCardClick === "function") {
          event.preventDefault();
          currentOptions.onCardClick(card, laneId);
          return;
        }
        if (!currentOptions.draggable) {
          return;
        }
        let handled = false;
        if (event.key === "ArrowUp") {
          handled = moveCard(card.id, laneId, laneId, cardIndex - 1);
        } else if (event.key === "ArrowDown") {
          handled = moveCard(card.id, laneId, laneId, cardIndex + 1);
        } else if (event.key === "ArrowLeft") {
          const laneIndex = currentLanes.findIndex((lane) => lane.id === laneId);
          if (laneIndex > 0) {
            const toLaneId = currentLanes[laneIndex - 1].id;
            handled = moveCard(card.id, laneId, toLaneId);
          }
        } else if (event.key === "ArrowRight") {
          const laneIndex = currentLanes.findIndex((lane) => lane.id === laneId);
          if (laneIndex >= 0 && laneIndex < currentLanes.length - 1) {
            const toLaneId = currentLanes[laneIndex + 1].id;
            handled = moveCard(card.id, laneId, toLaneId);
          }
        }
        if (handled) {
          event.preventDefault();
          pendingFocusCardId = card.id;
        }
      });
    }
    return node;
  }

  function moveCard(cardId, fromLaneId, toLaneId, toIndex = null) {
    if (!cardId || !fromLaneId || !toLaneId) {
      return false;
    }

    const fromLane = currentLanes.find((lane) => lane.id === fromLaneId);
    const toLane = currentLanes.find((lane) => lane.id === toLaneId);
    if (!fromLane || !toLane) {
      return false;
    }
    const fromIndex = fromLane.cards.findIndex((card) => card.id === cardId);
    if (fromIndex < 0) {
      return false;
    }

    const fallbackToIndex = toLane.cards.length;
    const requestedToIndex = Number.isFinite(Number(toIndex)) ? Number(toIndex) : fallbackToIndex;
    let nextToIndex = clampIndex(Math.round(requestedToIndex), 0, toLane.cards.length);
    if (fromLaneId === toLaneId && fromIndex < nextToIndex) {
      nextToIndex -= 1;
    }
    if (fromLaneId === toLaneId && fromIndex === nextToIndex) {
      return false;
    }

    const card = fromLane.cards[fromIndex];
    const validation = canMoveCard({
      card,
      fromLaneId,
      toLaneId,
      fromIndex,
      toIndex: nextToIndex,
    });
    if (!validation.ok) {
      currentOptions.onMoveRejected?.({
        reason: validation.reason || "Move rejected.",
        card,
        fromLaneId,
        toLaneId,
        fromIndex,
        toIndex: nextToIndex,
      });
      return false;
    }

    const [movedCard] = fromLane.cards.splice(fromIndex, 1);
    const insertionIndex = clampIndex(nextToIndex, 0, toLane.cards.length);
    toLane.cards.splice(insertionIndex, 0, movedCard);
    currentOptions.onCardMove?.({
      card: movedCard,
      fromLaneId,
      toLaneId,
      fromIndex,
      toIndex: insertionIndex,
      lanes: currentLanes.map(cloneLane),
    });
    render();
    return true;
  }

  function canMoveCard(payload) {
    const projected = currentLanes.map(cloneLane);
    const source = projected.find((lane) => lane.id === payload.fromLaneId);
    const target = projected.find((lane) => lane.id === payload.toLaneId);
    if (!source || !target) {
      return { ok: false, reason: "Invalid lane." };
    }
    const sourceIndex = source.cards.findIndex((card) => card.id === payload.card.id);
    if (sourceIndex < 0) {
      return { ok: false, reason: "Card not found." };
    }
    const [card] = source.cards.splice(sourceIndex, 1);
    const insertIndex = clampIndex(payload.toIndex, 0, target.cards.length);
    target.cards.splice(insertIndex, 0, card);

    const wipLimit = resolveWipLimit(payload.toLaneId, currentOptions.wipLimits);
    if (Number.isFinite(wipLimit) && target.cards.length > wipLimit) {
      return { ok: false, reason: `Lane limit reached (${wipLimit}).` };
    }

    if (typeof currentOptions.validateMove === "function") {
      const result = currentOptions.validateMove({
        ...payload,
        lanes: projected,
      });
      if (result === false) {
        return { ok: false, reason: "Move blocked by validation." };
      }
      if (result && typeof result === "object" && result.ok === false) {
        return { ok: false, reason: String(result.reason || "Move blocked by validation.") };
      }
    }

    return { ok: true };
  }

  function update(nextLanes = currentLanes, nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    currentLanes = normalizeLanes(nextLanes, currentOptions);
    clearDropTarget();
    render();
  }

  function destroy() {
    events.clear();
    clearDropTarget();
    clearNode(container);
  }

  function getState() {
    return {
      lanes: currentLanes.map(cloneLane),
      options: { ...currentOptions },
    };
  }

  function setDropTarget(laneId, index) {
    dragOverLaneId = laneId;
    dragOverIndex = Number.isFinite(Number(index)) ? Number(index) : -1;
    updateDropIndicators();
  }

  function clearDropTarget() {
    dragOverLaneId = null;
    dragOverIndex = -1;
    updateDropIndicators();
  }

  function updateDropIndicators() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    container.querySelectorAll(".ui-kanban-cards").forEach((cardsNode) => {
      cardsNode.classList.remove("is-drop-target", "is-drop-at-end");
      cardsNode.querySelectorAll(".ui-kanban-card").forEach((cardNode) => {
        cardNode.classList.remove("is-drop-before");
      });
    });

    if (!dragOverLaneId || dragOverIndex < 0) {
      return;
    }

    const cardsNode = container.querySelector(`.ui-kanban-lane[data-lane-id="${cssEscape(dragOverLaneId)}"] .ui-kanban-cards`);
    if (!cardsNode) {
      return;
    }

    cardsNode.classList.add("is-drop-target");
    const cardNodes = Array.from(cardsNode.querySelectorAll(".ui-kanban-card"));
    if (!cardNodes.length || dragOverIndex >= cardNodes.length) {
      cardsNode.classList.add("is-drop-at-end");
      return;
    }
    cardNodes[dragOverIndex]?.classList.add("is-drop-before");
  }

  render();

  return {
    update,
    moveCard,
    getState,
    destroy,
  };
}

function normalizeOptions(options) {
  const normalized = { ...DEFAULT_OPTIONS, ...(options || {}) };
  normalized.emptyText = String(normalized.emptyText ?? DEFAULT_OPTIONS.emptyText);
  normalized.showEmptyPlaceholder = normalized.showEmptyPlaceholder !== false;
  return normalized;
}

function normalizeLanes(lanes, options) {
  if (!Array.isArray(lanes)) {
    return [];
  }
  return lanes
    .map((lane, index) => {
      if (!lane || typeof lane !== "object") {
        return null;
      }
      const id = String(lane[options.laneIdKey] ?? `lane-${index}`);
      const title = String(lane[options.laneTitleKey] ?? id);
      const cards = Array.isArray(lane.cards)
        ? lane.cards
          .map((card, cardIndex) => normalizeCard(card, `${id}-card-${cardIndex}`, options))
          .filter(Boolean)
        : [];
      return { id, title, cards };
    })
    .filter(Boolean);
}

function normalizeCard(card, fallbackId, options) {
  if (!card || typeof card !== "object") {
    return null;
  }
  return {
    id: String(card[options.cardIdKey] ?? fallbackId),
    title: String(card[options.cardTitleKey] ?? card.id ?? fallbackId),
    meta: card[options.cardMetaKey] == null ? "" : String(card[options.cardMetaKey]),
    raw: card,
  };
}

function cloneLane(lane) {
  return {
    id: lane.id,
    title: lane.title,
    cards: lane.cards.map((card) => ({
      id: card.id,
      title: card.title,
      meta: card.meta,
      raw: card.raw,
    })),
  };
}

function resolveWipLimit(laneId, wipLimits) {
  if (!wipLimits || typeof wipLimits !== "object") {
    return NaN;
  }
  const value = Number(wipLimits[laneId]);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : NaN;
}

function clampIndex(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function resolveDropIndex(cardsNode, clientY) {
  if (!cardsNode || cardsNode.nodeType !== 1) {
    return 0;
  }
  const cardNodes = Array.from(cardsNode.querySelectorAll(".ui-kanban-card"));
  if (!cardNodes.length) {
    return 0;
  }
  for (let index = 0; index < cardNodes.length; index += 1) {
    const rect = cardNodes[index].getBoundingClientRect();
    if (clientY < rect.top + (rect.height / 2)) {
      return index;
    }
  }
  return cardNodes.length;
}

function toDomIdToken(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "item";
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") {
    return CSS.escape(String(value));
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

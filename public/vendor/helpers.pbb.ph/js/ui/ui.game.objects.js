const DEFAULT_OBJECT_OPTIONS = {
  id: "",
  x: 0,
  y: 0,
  width: 64,
  height: 64,
  zIndex: 0,
  visible: true,
  disabled: false,
  interactive: true,
  state: "",
  data: null,
  update: null,
  render: null,
  hitTest: null,
  onPointerEnter: null,
  onPointerMove: null,
  onPointerLeave: null,
  onPointerDown: null,
  onPointerUp: null,
  onClick: null,
};

const DEFAULT_LAYER_OPTIONS = {
  objects: [],
};

const DEFAULT_FLIP_CARD_OPTIONS = {
  id: "",
  x: 0,
  y: 0,
  width: 96,
  height: 128,
  zIndex: 0,
  visible: true,
  disabled: false,
  interactive: true,
  state: "hidden",
  data: null,
  frontLabel: "",
  backLabel: "?",
  matched: false,
  revealed: false,
  flipOnHover: false,
  flipDuration: 180,
  onFlip: null,
  onSelect: null,
  renderFront: null,
  renderBack: null,
  render: null,
};

const DEFAULT_TETROMINO_OPTIONS = {
  id: "",
  shape: "T",
  row: 0,
  column: 4,
  rotation: 0,
  cellSize: 24,
  zIndex: 0,
  visible: true,
  disabled: false,
  interactive: false,
  data: null,
  colors: null,
  onMove: null,
  onRotate: null,
  render: null,
};

const TETROMINO_SHAPES = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

const TETROMINO_COLORS = {
  I: "#5ed7ff",
  O: "#ffd95e",
  T: "#b48dff",
  S: "#54d3a5",
  Z: "#ff7474",
  J: "#74a4ff",
  L: "#ffb45e",
};

const SRS_JLSTZ_WALL_KICKS = {
  "0>1": [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2]],
  "1>0": [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2]],
  "1>2": [[0, 0], [+1, 0], [+1, -1], [0, +2], [+1, +2]],
  "2>1": [[0, 0], [-1, 0], [-1, +1], [0, -2], [-1, -2]],
  "2>3": [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2]],
  "3>2": [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, +2], [-1, +2]],
  "0>3": [[0, 0], [+1, 0], [+1, +1], [0, -2], [+1, -2]],
};

const SRS_I_WALL_KICKS = {
  "0>1": [[0, 0], [-2, 0], [+1, 0], [-2, -1], [+1, +2]],
  "1>0": [[0, 0], [+2, 0], [-1, 0], [+2, +1], [-1, -2]],
  "1>2": [[0, 0], [-1, 0], [+2, 0], [-1, +2], [+2, -1]],
  "2>1": [[0, 0], [+1, 0], [-2, 0], [+1, -2], [-2, +1]],
  "2>3": [[0, 0], [+2, 0], [-1, 0], [+2, +1], [-1, -2]],
  "3>2": [[0, 0], [-2, 0], [+1, 0], [-2, -1], [+1, +2]],
  "3>0": [[0, 0], [+1, 0], [-2, 0], [+1, -2], [-2, +1]],
  "0>3": [[0, 0], [-1, 0], [+2, 0], [-1, +2], [+2, -1]],
};

const SRS_O_WALL_KICKS = {
  "0>1": [[0, 0]],
  "1>0": [[0, 0]],
  "1>2": [[0, 0]],
  "2>1": [[0, 0]],
  "2>3": [[0, 0]],
  "3>2": [[0, 0]],
  "3>0": [[0, 0]],
  "0>3": [[0, 0]],
};

export function createGameObject(options = {}) {
  let current = normalizeObjectOptions(options);
  const object = {
    get id() {
      return current.id;
    },
    get x() {
      return current.x;
    },
    get y() {
      return current.y;
    },
    get width() {
      return current.width;
    },
    get height() {
      return current.height;
    },
    get zIndex() {
      return current.zIndex;
    },
    get visible() {
      return current.visible;
    },
    get disabled() {
      return current.disabled;
    },
    get interactive() {
      return current.interactive;
    },
    get state() {
      return current.state;
    },
    get data() {
      return current.data;
    },
    get hover() {
      return current.hover;
    },
    get pressed() {
      return current.pressed;
    },
    getBounds,
    getState,
    setData,
    setDisabled,
    setInteractive,
    setPosition,
    setSize,
    setState,
    setVisible,
    containsPoint,
    update,
    render,
    handlePointer,
  };

  function getBounds() {
    return {
      x: current.x,
      y: current.y,
      width: current.width,
      height: current.height,
      left: current.x,
      top: current.y,
      right: current.x + current.width,
      bottom: current.y + current.height,
    };
  }

  function getState() {
    return {
      id: current.id,
      x: current.x,
      y: current.y,
      width: current.width,
      height: current.height,
      zIndex: current.zIndex,
      visible: current.visible,
      disabled: current.disabled,
      interactive: current.interactive,
      state: current.state,
      hover: current.hover,
      pressed: current.pressed,
      data: current.data,
    };
  }

  function setData(data) {
    current = { ...current, data };
    return object;
  }

  function setDisabled(disabled) {
    current = { ...current, disabled: Boolean(disabled), pressed: disabled ? false : current.pressed };
    return object;
  }

  function setInteractive(interactive) {
    current = { ...current, interactive: Boolean(interactive) };
    return object;
  }

  function setPosition(x, y) {
    current = { ...current, x: normalizeNumber(x, current.x), y: normalizeNumber(y, current.y) };
    return object;
  }

  function setSize(width, height) {
    current = {
      ...current,
      width: normalizeNumber(width, current.width, 1),
      height: normalizeNumber(height, current.height, 1),
    };
    return object;
  }

  function setState(state) {
    current = { ...current, state: String(state || "") };
    return object;
  }

  function setVisible(visible) {
    current = { ...current, visible: Boolean(visible) };
    return object;
  }

  function containsPoint(point) {
    if (!current.visible) {
      return false;
    }
    if (typeof current.hitTest === "function") {
      return current.hitTest(point, object) === true;
    }
    return point.x >= current.x && point.x <= current.x + current.width && point.y >= current.y && point.y <= current.y + current.height;
  }

  function update(delta, meta = {}) {
    current.update?.(delta, { ...meta, object });
    return object;
  }

  function render(context, meta = {}) {
    if (!current.visible) {
      return object;
    }
    if (typeof current.render === "function") {
      current.render(context, object, meta);
      return object;
    }
    renderDefaultObject(context, object);
    return object;
  }

  function handlePointer(type, point, meta = {}) {
    const payload = { ...meta, type, point, object };
    if (type === "enter") {
      current = { ...current, hover: true };
      current.onPointerEnter?.(payload);
    } else if (type === "move") {
      current.onPointerMove?.(payload);
    } else if (type === "leave") {
      current = { ...current, hover: false, pressed: false };
      current.onPointerLeave?.(payload);
    } else if (type === "down") {
      current = { ...current, pressed: true };
      current.onPointerDown?.(payload);
    } else if (type === "up") {
      const wasPressed = current.pressed;
      current = { ...current, pressed: false };
      current.onPointerUp?.(payload);
      if (wasPressed) {
        current.onClick?.(payload);
      }
    }
    return object;
  }

  return object;
}

export function createGameObjectLayer(options = {}) {
  const current = { ...DEFAULT_LAYER_OPTIONS, ...(options || {}) };
  let objects = [];
  let hovered = null;
  let pressed = null;

  const layer = {
    add,
    clear,
    findAt,
    getObjects,
    handlePointer,
    remove,
    render,
    update,
  };

  current.objects.forEach((object) => add(object));

  function add(object) {
    const next = normalizeLayerObject(object);
    objects = objects.filter((candidate) => candidate !== next && candidate.id !== next.id);
    objects.push(next);
    sortObjects();
    return next;
  }

  function remove(idOrObject) {
    const id = typeof idOrObject === "string" ? idOrObject : idOrObject?.id;
    const target = objects.find((object) => object === idOrObject || object.id === id);
    if (!target) {
      return false;
    }
    if (hovered === target) {
      hovered = null;
    }
    if (pressed === target) {
      pressed = null;
    }
    objects = objects.filter((object) => object !== target);
    return true;
  }

  function clear() {
    objects = [];
    hovered = null;
    pressed = null;
  }

  function getObjects() {
    return objects.slice();
  }

  function findAt(point) {
    const normalized = normalizePoint(point);
    for (let index = objects.length - 1; index >= 0; index -= 1) {
      const object = objects[index];
      if (!object.disabled && object.interactive && object.containsPoint(normalized)) {
        return object;
      }
    }
    return null;
  }

  function handlePointer(input) {
    const event = normalizePointerInput(input);
    const target = findAt(event.point);
    if (target !== hovered) {
      hovered?.handlePointer("leave", event.point, event);
      target?.handlePointer("enter", event.point, event);
      hovered = target;
    }
    if (event.type === "move") {
      target?.handlePointer("move", event.point, event);
    } else if (event.type === "down") {
      pressed = target;
      target?.handlePointer("down", event.point, event);
    } else if (event.type === "up" || event.type === "cancel") {
      const releaseTarget = pressed;
      pressed = null;
      releaseTarget?.handlePointer("up", event.point, event);
    } else if (event.type === "leave") {
      hovered?.handlePointer("leave", event.point, event);
      hovered = null;
      pressed = null;
    }
    return target;
  }

  function update(delta, meta = {}) {
    objects.forEach((object) => object.update(delta, meta));
    return layer;
  }

  function render(context, meta = {}) {
    objects.forEach((object) => object.render(context, meta));
    return layer;
  }

  function sortObjects() {
    objects.sort((a, b) => a.zIndex - b.zIndex);
  }

  return layer;
}

export function createPointerInputRouter(canvas, objectLayer, options = {}) {
  if (!canvas || canvas.nodeType !== 1) {
    throw new Error("[createPointerInputRouter] A canvas element is required.");
  }
  if (!objectLayer || typeof objectLayer.handlePointer !== "function") {
    throw new Error("[createPointerInputRouter] A game object layer is required.");
  }

  const scaleToCanvas = options.scaleToCanvas !== false;
  const listenerSpecs = [
    ["pointermove", "move"],
    ["pointerdown", "down"],
    ["pointerup", "up"],
    ["pointercancel", "cancel"],
    ["pointerleave", "leave"],
  ];
  const listeners = [];

  listenerSpecs.forEach(([eventName, type]) => {
    const handler = (event) => {
      const point = getCanvasPoint(canvas, event, scaleToCanvas);
      objectLayer.handlePointer({
        type,
        x: point.x,
        y: point.y,
        pointerId: event.pointerId,
        sourceEvent: event,
      });
    };
    listeners.push([eventName, handler]);
    canvas.addEventListener(eventName, handler);
  });

  return {
    destroy() {
      listeners.forEach(([eventName, handler]) => {
        canvas.removeEventListener(eventName, handler);
      });
    },
  };
}

export function createFlipCard(options = {}) {
  const cardOptions = normalizeFlipCardOptions(options);
  let flipProgress = cardOptions.revealed || cardOptions.matched ? 1 : 0;
  let targetProgress = flipProgress;
  let revealed = cardOptions.revealed;
  let matched = cardOptions.matched;
  let lastFlipState = flipProgress >= 1 ? "front" : "back";

  const card = createGameObject({
    ...cardOptions,
    state: getCardState(),
    update(delta, meta) {
      const durationSeconds = cardOptions.flipDuration / 1000;
      const step = durationSeconds > 0 ? delta / durationSeconds : 1;
      if (flipProgress < targetProgress) {
        flipProgress = Math.min(targetProgress, flipProgress + step);
      } else if (flipProgress > targetProgress) {
        flipProgress = Math.max(targetProgress, flipProgress - step);
      }
      syncState();
      cardOptions.update?.(delta, { ...meta, card });
    },
    render(context, object, meta) {
      if (typeof cardOptions.render === "function") {
        cardOptions.render(context, card, meta);
        return;
      }
      renderFlipCard(context, card, cardOptions, meta);
    },
    onPointerEnter(meta) {
      if (cardOptions.flipOnHover && !revealed && !matched) {
        targetProgress = 1;
      }
      cardOptions.onPointerEnter?.({ ...meta, card });
    },
    onPointerLeave(meta) {
      if (cardOptions.flipOnHover && !revealed && !matched) {
        targetProgress = 0;
      }
      cardOptions.onPointerLeave?.({ ...meta, card });
    },
    onClick(meta) {
      if (!matched) {
        reveal();
        cardOptions.onSelect?.(card, meta);
      }
      cardOptions.onClick?.({ ...meta, card });
    },
  });

  Object.defineProperties(card, {
    flipProgress: {
      get() {
        return flipProgress;
      },
    },
    revealed: {
      get() {
        return revealed;
      },
    },
    matched: {
      get() {
        return matched;
      },
    },
  });

  card.flip = flip;
  card.hide = hide;
  card.reveal = reveal;
  card.setMatched = setMatched;

  function flip(force) {
    const next = typeof force === "boolean" ? force : !revealed;
    if (next) {
      reveal();
    } else {
      hide();
    }
    return card;
  }

  function reveal() {
    revealed = true;
    targetProgress = 1;
    syncState();
    emitFlip();
    return card;
  }

  function hide() {
    if (matched) {
      return card;
    }
    revealed = false;
    targetProgress = 0;
    syncState();
    emitFlip();
    return card;
  }

  function setMatched(nextMatched = true) {
    matched = Boolean(nextMatched);
    if (matched) {
      revealed = true;
      targetProgress = 1;
    }
    syncState();
    return card;
  }

  function syncState() {
    card.setState(getCardState());
  }

  function emitFlip() {
    const nextFlipState = revealed || matched ? "front" : "back";
    if (nextFlipState !== lastFlipState) {
      lastFlipState = nextFlipState;
      cardOptions.onFlip?.(card, { revealed, matched, flipProgress });
    }
  }

  function getCardState() {
    if (matched) {
      return "matched";
    }
    return revealed ? "revealed" : "hidden";
  }

  return card;
}

export function createTetromino(options = {}) {
  const tetrominoOptions = normalizeTetrominoOptions(options);
  let row = tetrominoOptions.row;
  let column = tetrominoOptions.column;
  let rotation = tetrominoOptions.rotation;
  let cellSize = tetrominoOptions.cellSize;

  const piece = createGameObject({
    id: tetrominoOptions.id,
    x: column * cellSize,
    y: row * cellSize,
    width: 4 * cellSize,
    height: 4 * cellSize,
    zIndex: tetrominoOptions.zIndex,
    visible: tetrominoOptions.visible,
    disabled: tetrominoOptions.disabled,
    interactive: tetrominoOptions.interactive,
    state: "active",
    data: tetrominoOptions.data,
    render(context, object, meta) {
      if (typeof tetrominoOptions.render === "function") {
        tetrominoOptions.render(context, piece, meta);
        return;
      }
      renderTetromino(context, piece, tetrominoOptions);
    },
  });

  Object.defineProperties(piece, {
    shape: {
      get() {
        return tetrominoOptions.shape;
      },
    },
    row: {
      get() {
        return row;
      },
    },
    column: {
      get() {
        return column;
      },
    },
    rotation: {
      get() {
        return rotation;
      },
    },
    cellSize: {
      get() {
        return cellSize;
      },
    },
  });

  piece.getCells = getCells;
  piece.getMatrix = getMatrix;
  piece.getMovePreview = getMovePreview;
  piece.getRotationPreview = getRotationPreview;
  piece.getWallKickTests = getWallKickTests;
  piece.moveBy = moveBy;
  piece.moveTo = moveTo;
  piece.rotate = rotate;
  piece.setCellSize = setCellSize;

  syncBounds();

  function getCells(overrides = {}) {
    const nextRow = normalizeNumber(overrides.row, row);
    const nextColumn = normalizeNumber(overrides.column, column);
    const nextRotation = normalizeRotation(overrides.rotation ?? rotation);
    return getTetrominoOffsets(tetrominoOptions.shape, nextRotation).map(([cellColumn, cellRow]) => ({
      row: nextRow + cellRow,
      column: nextColumn + cellColumn,
      localRow: cellRow,
      localColumn: cellColumn,
      shape: tetrominoOptions.shape,
    }));
  }

  function getMatrix(nextRotation = rotation) {
    const matrix = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
    getTetrominoOffsets(tetrominoOptions.shape, nextRotation).forEach(([cellColumn, cellRow]) => {
      matrix[cellRow][cellColumn] = tetrominoOptions.shape;
    });
    return matrix;
  }

  function getMovePreview(deltaColumn = 0, deltaRow = 0) {
    const next = {
      row: row + normalizeNumber(deltaRow, 0),
      column: column + normalizeNumber(deltaColumn, 0),
      rotation,
    };
    return {
      ...next,
      cells: getCells(next),
    };
  }

  function getRotationPreview(direction = 1, kick = { column: 0, row: 0 }) {
    const nextRotation = getNextRotation(rotation, direction);
    const normalizedKick = normalizeKick(kick);
    const next = {
      row: row + normalizedKick.row,
      column: column + normalizedKick.column,
      rotation: nextRotation,
      kick: normalizedKick,
    };
    return {
      ...next,
      cells: getCells(next),
    };
  }

  function getWallKickTests(direction = 1, kicks = null) {
    const nextRotation = getNextRotation(rotation, direction);
    const tests = Array.isArray(kicks) ? kicks : getSrsWallKicks(tetrominoOptions.shape, rotation, nextRotation);
    return tests.map((kick) => getRotationPreview(direction, normalizeKick(kick)));
  }

  function moveBy(deltaColumn = 0, deltaRow = 0) {
    return moveTo(column + normalizeNumber(deltaColumn, 0), row + normalizeNumber(deltaRow, 0));
  }

  function moveTo(nextColumn = column, nextRow = row) {
    column = normalizeNumber(nextColumn, column);
    row = normalizeNumber(nextRow, row);
    syncBounds();
    tetrominoOptions.onMove?.(piece, { row, column, rotation, cells: getCells() });
    return piece;
  }

  function rotate(direction = 1, accepted = null) {
    const preview = accepted && typeof accepted === "object" ? accepted : getRotationPreview(direction);
    rotation = normalizeRotation(preview.rotation);
    row = normalizeNumber(preview.row, row);
    column = normalizeNumber(preview.column, column);
    syncBounds();
    tetrominoOptions.onRotate?.(piece, { row, column, rotation, cells: getCells() });
    return piece;
  }

  function setCellSize(nextCellSize) {
    cellSize = normalizeNumber(nextCellSize, cellSize, 1);
    syncBounds();
    return piece;
  }

  function syncBounds() {
    piece.setPosition(column * cellSize, row * cellSize);
    piece.setSize(4 * cellSize, 4 * cellSize);
    piece.setState(`rotation-${rotation}`);
  }

  return piece;
}

function renderDefaultObject(context, object) {
  const bounds = object.getBounds();
  context.save();
  context.globalAlpha = object.disabled ? 0.45 : 1;
  context.fillStyle = object.hover ? "#263957" : "#172033";
  context.strokeStyle = object.pressed ? "#8db5ff" : "#34445f";
  context.lineWidth = 2;
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.restore();
}

function renderFlipCard(context, card, options, meta) {
  const bounds = card.getBounds();
  const progress = card.flipProgress;
  const showFront = progress >= 0.5;
  const scaleX = Math.max(0.08, Math.abs(1 - progress * 2));
  context.save();
  context.translate(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  context.scale(scaleX, 1);
  context.translate(-bounds.width / 2, -bounds.height / 2);
  if (showFront) {
    if (typeof options.renderFront === "function") {
      options.renderFront(context, card, meta);
    } else {
      renderCardFace(context, bounds.width, bounds.height, options.frontLabel || "Card", "#e9f1ff", "#213c68", "#07101d");
    }
  } else if (typeof options.renderBack === "function") {
    options.renderBack(context, card, meta);
  } else {
    renderCardFace(context, bounds.width, bounds.height, options.backLabel || "?", "#132033", "#4f76b8", "#d7e0f4");
  }
  context.restore();
}

function renderTetromino(context, piece, options) {
  const color = options.colors?.[piece.shape] || TETROMINO_COLORS[piece.shape] || "#8db5ff";
  context.save();
  piece.getCells().forEach((cell) => {
    const x = cell.column * piece.cellSize;
    const y = cell.row * piece.cellSize;
    context.fillStyle = color;
    context.strokeStyle = "#07101d";
    context.lineWidth = Math.max(1, piece.cellSize * 0.08);
    context.fillRect(x + 1, y + 1, piece.cellSize - 2, piece.cellSize - 2);
    context.strokeRect(x + 1, y + 1, piece.cellSize - 2, piece.cellSize - 2);
    context.fillStyle = "rgba(255, 255, 255, 0.18)";
    context.fillRect(x + 4, y + 4, Math.max(2, piece.cellSize - 8), Math.max(2, piece.cellSize * 0.18));
  });
  context.restore();
}

function renderCardFace(context, width, height, label, fill, stroke, textColor) {
  const radius = Math.min(14, width / 6, height / 6);
  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = 3;
  roundedRect(context, 0, 0, width, height, radius);
  context.fill();
  context.stroke();
  context.fillStyle = textColor;
  context.font = `700 ${Math.max(18, Math.min(34, width * 0.28))}px Segoe UI, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(label), width / 2, height / 2);
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function normalizeObjectOptions(input = {}) {
  const next = { ...DEFAULT_OBJECT_OPTIONS, ...(input || {}) };
  return {
    ...next,
    id: String(next.id || `object-${Math.random().toString(36).slice(2)}`),
    x: normalizeNumber(next.x, DEFAULT_OBJECT_OPTIONS.x),
    y: normalizeNumber(next.y, DEFAULT_OBJECT_OPTIONS.y),
    width: normalizeNumber(next.width, DEFAULT_OBJECT_OPTIONS.width, 1),
    height: normalizeNumber(next.height, DEFAULT_OBJECT_OPTIONS.height, 1),
    zIndex: normalizeNumber(next.zIndex, DEFAULT_OBJECT_OPTIONS.zIndex),
    visible: next.visible !== false,
    disabled: next.disabled === true,
    interactive: next.interactive !== false,
    state: String(next.state || ""),
    hover: false,
    pressed: false,
    update: typeof next.update === "function" ? next.update : null,
    render: typeof next.render === "function" ? next.render : null,
    hitTest: typeof next.hitTest === "function" ? next.hitTest : null,
    onPointerEnter: typeof next.onPointerEnter === "function" ? next.onPointerEnter : null,
    onPointerMove: typeof next.onPointerMove === "function" ? next.onPointerMove : null,
    onPointerLeave: typeof next.onPointerLeave === "function" ? next.onPointerLeave : null,
    onPointerDown: typeof next.onPointerDown === "function" ? next.onPointerDown : null,
    onPointerUp: typeof next.onPointerUp === "function" ? next.onPointerUp : null,
    onClick: typeof next.onClick === "function" ? next.onClick : null,
  };
}

function normalizeFlipCardOptions(input = {}) {
  const next = { ...DEFAULT_FLIP_CARD_OPTIONS, ...(input || {}) };
  return {
    ...normalizeObjectOptions(next),
    frontLabel: String(next.frontLabel || ""),
    backLabel: String(next.backLabel || "?"),
    revealed: next.revealed === true,
    matched: next.matched === true,
    flipOnHover: next.flipOnHover === true,
    flipDuration: normalizeNumber(next.flipDuration, DEFAULT_FLIP_CARD_OPTIONS.flipDuration, 0),
    onFlip: typeof next.onFlip === "function" ? next.onFlip : null,
    onSelect: typeof next.onSelect === "function" ? next.onSelect : null,
    renderFront: typeof next.renderFront === "function" ? next.renderFront : null,
    renderBack: typeof next.renderBack === "function" ? next.renderBack : null,
  };
}

function normalizeTetrominoOptions(input = {}) {
  const next = { ...DEFAULT_TETROMINO_OPTIONS, ...(input || {}) };
  const shape = String(next.shape || DEFAULT_TETROMINO_OPTIONS.shape).trim().toUpperCase();
  const normalizedShape = TETROMINO_SHAPES[shape] ? shape : DEFAULT_TETROMINO_OPTIONS.shape;
  return {
    ...next,
    id: String(next.id || `tetromino-${normalizedShape.toLowerCase()}-${Math.random().toString(36).slice(2)}`),
    shape: normalizedShape,
    row: normalizeNumber(next.row, DEFAULT_TETROMINO_OPTIONS.row),
    column: normalizeNumber(next.column, DEFAULT_TETROMINO_OPTIONS.column),
    rotation: normalizeRotation(next.rotation),
    cellSize: normalizeNumber(next.cellSize, DEFAULT_TETROMINO_OPTIONS.cellSize, 1),
    zIndex: normalizeNumber(next.zIndex, DEFAULT_TETROMINO_OPTIONS.zIndex),
    visible: next.visible !== false,
    disabled: next.disabled === true,
    interactive: next.interactive === true,
    data: next.data ?? null,
    colors: next.colors && typeof next.colors === "object" ? next.colors : null,
    onMove: typeof next.onMove === "function" ? next.onMove : null,
    onRotate: typeof next.onRotate === "function" ? next.onRotate : null,
    render: typeof next.render === "function" ? next.render : null,
  };
}

function getTetrominoOffsets(shape, rotation) {
  const states = TETROMINO_SHAPES[shape] || TETROMINO_SHAPES.T;
  return states[normalizeRotation(rotation)].map(([column, row]) => [column, row]);
}

function getSrsWallKicks(shape, fromRotation, toRotation) {
  const key = `${normalizeRotation(fromRotation)}>${normalizeRotation(toRotation)}`;
  const table = shape === "I" ? SRS_I_WALL_KICKS : shape === "O" ? SRS_O_WALL_KICKS : SRS_JLSTZ_WALL_KICKS;
  return (table[key] || [[0, 0]]).map(([column, srsY]) => ({
    column,
    row: -srsY,
    srsX: column,
    srsY,
  }));
}

function normalizeKick(kick) {
  if (Array.isArray(kick)) {
    const column = normalizeNumber(kick[0], 0);
    const srsY = normalizeNumber(kick[1], 0);
    return { column, row: -srsY, srsX: column, srsY };
  }
  return {
    column: normalizeNumber(kick?.column, 0),
    row: normalizeNumber(kick?.row, 0),
    srsX: normalizeNumber(kick?.srsX ?? kick?.column, 0),
    srsY: normalizeNumber(kick?.srsY ?? -(kick?.row ?? 0), 0),
  };
}

function getNextRotation(fromRotation, direction) {
  return normalizeRotation(fromRotation + normalizeRotationDirection(direction));
}

function normalizeRotation(input) {
  const next = Math.trunc(normalizeNumber(input, 0));
  return ((next % 4) + 4) % 4;
}

function normalizeRotationDirection(input) {
  const next = Number(input);
  return Number.isFinite(next) && next < 0 ? -1 : 1;
}

function normalizeLayerObject(object) {
  if (object && typeof object.containsPoint === "function" && typeof object.render === "function") {
    return object;
  }
  return createGameObject(object || {});
}

function normalizePointerInput(input = {}) {
  const type = ["move", "down", "up", "cancel", "leave"].includes(input.type) ? input.type : "move";
  return {
    ...input,
    type,
    point: normalizePoint(input.point || input),
  };
}

function normalizePoint(point = {}) {
  return {
    x: normalizeNumber(point.x, 0),
    y: normalizeNumber(point.y, 0),
  };
}

function normalizeNumber(value, fallback, min = -Infinity, max = Infinity) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, next));
}

function getCanvasPoint(canvas, event, scaleToCanvas) {
  const rect = canvas.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  if (!scaleToCanvas || !rect.width || !rect.height) {
    return { x: localX, y: localY };
  }
  return {
    x: localX * (canvas.width / rect.width),
    y: localY * (canvas.height / rect.height),
  };
}

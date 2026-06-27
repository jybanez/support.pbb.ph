const DEFAULT_MAZE_OPTIONS = {
  map: [],
  tiles: {},
  cellSize: 24,
  defaultTile: { type: "path", enterable: true },
};

const DIRECTIONS = {
  up: { row: -1, column: 0, x: 0, y: -1 },
  down: { row: 1, column: 0, x: 0, y: 1 },
  left: { row: 0, column: -1, x: -1, y: 0 },
  right: { row: 0, column: 1, x: 1, y: 0 },
};

export function createGridMaze(options = {}) {
  const current = normalizeMazeOptions(options);
  let cells = normalizeMap(current.map, current);
  let index = buildMazeIndex(cells, current.cellSize);

  function getTile(row, column) {
    return cloneCell(cells[row]?.[column] || null);
  }

  function setTile(row, column, value) {
    if (!isInside(row, column)) {
      return false;
    }
    cells[row][column] = normalizeCell(value, row, column, current);
    index = buildMazeIndex(cells, current.cellSize);
    return true;
  }

  function isInside(row, column) {
    return row >= 0 && column >= 0 && row < cells.length && column < (cells[0]?.length || 0);
  }

  function canEnter(row, column, context = {}) {
    if (!isInside(row, column)) {
      return false;
    }
    const cell = cells[row][column];
    if (typeof cell.enterable === "boolean") {
      return cell.enterable;
    }
    if (typeof cell.data?.enterable === "boolean") {
      return cell.data.enterable;
    }
    return cell.type !== "wall";
  }

  function isWall(row, column) {
    const cell = cells[row]?.[column];
    return Boolean(cell && (cell.type === "wall" || canEnter(row, column) === false));
  }

  function isPath(row, column) {
    return isInside(row, column) && !isWall(row, column);
  }

  function gridToPixel(row, column) {
    return {
      x: column * current.cellSize,
      y: row * current.cellSize,
    };
  }

  function pixelToGrid(x, y) {
    return {
      row: Math.floor((Number(y) || 0) / current.cellSize),
      column: Math.floor((Number(x) || 0) / current.cellSize),
    };
  }

  function cellCenter(row, column) {
    return {
      x: (column + 0.5) * current.cellSize,
      y: (row + 0.5) * current.cellSize,
    };
  }

  function forEachCell(callback) {
    if (typeof callback !== "function") {
      return;
    }
    cells.forEach((rowCells, row) => {
      rowCells.forEach((cell, column) => {
        callback(cloneCell(cell), { row, column, maze: api });
      });
    });
  }

  function getPoints(name) {
    const key = String(name || "").trim();
    return (index.pointGroups[key] || []).map((point) => ({ ...point }));
  }

  function getState() {
    return {
      rows: cells.length,
      columns: cells[0]?.length || 0,
      cellSize: current.cellSize,
      cells: cells.map((row) => row.map(cloneCell)),
      points: clonePointMap(index.points),
      pointGroups: clonePointGroups(index.pointGroups),
      collectibles: index.collectibles.map((item) => ({ ...item })),
    };
  }

  const api = {
    get rows() {
      return cells.length;
    },
    get columns() {
      return cells[0]?.length || 0;
    },
    get cellSize() {
      return current.cellSize;
    },
    get points() {
      return clonePointMap(index.points);
    },
    get pointGroups() {
      return clonePointGroups(index.pointGroups);
    },
    get collectibles() {
      return index.collectibles.map((item) => ({ ...item }));
    },
    getTile,
    setTile,
    isInside,
    isWall,
    isPath,
    canEnter,
    gridToPixel,
    pixelToGrid,
    cellCenter,
    forEachCell,
    getPoints,
    getState,
  };

  return api;
}

export function createGridMover(options = {}) {
  const current = normalizeMoverOptions(options);
  let row = current.row;
  let column = current.column;
  let direction = current.direction;
  let queuedDirection = current.queuedDirection;
  let position = cellCenter(row, column, current.cellSize);
  let target = null;
  let movingDirection = "";

  function setDirection(nextDirection) {
    direction = normalizeDirection(nextDirection);
    return api;
  }

  function queueDirection(nextDirection) {
    queuedDirection = normalizeDirection(nextDirection);
    return api;
  }

  function moveTo(nextRow, nextColumn) {
    row = normalizeInteger(nextRow, row);
    column = normalizeInteger(nextColumn, column);
    position = cellCenter(row, column, current.cellSize);
    target = null;
    movingDirection = "";
    return api;
  }

  function moveTowardCell(nextRow, nextColumn, options = {}) {
    const nextCell = normalizeCellRef({ row: nextRow, column: nextColumn });
    if (!nextCell) {
      return false;
    }
    const nextDirection = directionBetweenCells({ row, column }, nextCell);
    if (!nextDirection) {
      return false;
    }
    const raw = {
      row: nextCell.row,
      column: nextCell.column,
      direction: nextDirection,
    };
    const resolved = normalizeResolvedExit(current.resolveExit?.(raw, getState()) || raw, raw);
    if (!current.canEnter(resolved.row, resolved.column, { direction: nextDirection, mover: api })) {
      return false;
    }
    direction = nextDirection;
    queuedDirection = "";
    movingDirection = nextDirection;
    const rawCenter = cellCenter(raw.row, raw.column, current.cellSize);
    const resolvedCenter = cellCenter(resolved.row, resolved.column, current.cellSize);
    const exitsGridStep = raw.row !== resolved.row || raw.column !== resolved.column;
    target = {
      row: resolved.row,
      column: resolved.column,
      x: resolvedCenter.x,
      y: resolvedCenter.y,
      travelX: exitsGridStep ? rawCenter.x : resolvedCenter.x,
      travelY: exitsGridStep ? rawCenter.y : resolvedCenter.y,
      stopAfterTarget: options?.continueAfterTarget !== true,
    };
    return true;
  }

  function update(deltaSeconds = 0) {
    const delta = Math.max(0, Number(deltaSeconds) || 0);
    let remaining = current.speed * current.cellSize * delta;

    while (remaining > 0) {
      if (!target) {
        chooseNextTarget();
        if (!target) {
          break;
        }
      }

      const travelX = target.travelX ?? target.x;
      const travelY = target.travelY ?? target.y;
      const dx = travelX - position.x;
      const dy = travelY - position.y;
      const distance = Math.hypot(dx, dy);
      if (shouldPreTurn(distance)) {
        position = { x: target.x, y: target.y };
        row = target.row;
        column = target.column;
        if (target.stopAfterTarget) {
          direction = "";
          movingDirection = "";
          remaining = 0;
        }
        target = null;
        continue;
      }
      if (distance <= 0.0001 || remaining >= distance) {
        const stopAfterTarget = target.stopAfterTarget === true;
        position = { x: target.x, y: target.y };
        row = target.row;
        column = target.column;
        remaining -= Math.max(0, distance);
        if (stopAfterTarget) {
          direction = "";
          movingDirection = "";
          remaining = 0;
        }
        target = null;
        continue;
      }

      position = {
        x: position.x + (dx / distance) * remaining,
        y: position.y + (dy / distance) * remaining,
      };
      remaining = 0;
    }

    return getState();
  }

  function chooseNextTarget() {
    const nextDirection = chooseDirection();
    if (!nextDirection) {
      movingDirection = "";
      return;
    }
    const vector = DIRECTIONS[nextDirection];
    const raw = {
      row: row + vector.row,
      column: column + vector.column,
      direction: nextDirection,
    };
    const resolved = normalizeResolvedExit(current.resolveExit?.(raw, getState()) || raw, raw);
    if (!current.canEnter(resolved.row, resolved.column, { direction: nextDirection, mover: api })) {
      if (nextDirection === direction) {
        direction = "";
      }
      movingDirection = "";
      return;
    }
    direction = nextDirection;
    movingDirection = nextDirection;
    const rawCenter = cellCenter(raw.row, raw.column, current.cellSize);
    const resolvedCenter = cellCenter(resolved.row, resolved.column, current.cellSize);
    const exitsGridStep = raw.row !== resolved.row || raw.column !== resolved.column;
    target = {
      row: resolved.row,
      column: resolved.column,
      x: resolvedCenter.x,
      y: resolvedCenter.y,
      travelX: exitsGridStep ? rawCenter.x : resolvedCenter.x,
      travelY: exitsGridStep ? rawCenter.y : resolvedCenter.y,
    };
  }

  function chooseDirection() {
    if (queuedDirection && canMove(queuedDirection)) {
      const accepted = queuedDirection;
      queuedDirection = "";
      return accepted;
    }
    if (direction && canMove(direction)) {
      return direction;
    }
    return "";
  }

  function canMove(candidate) {
    const vector = DIRECTIONS[candidate];
    if (!vector) {
      return false;
    }
    const raw = { row: row + vector.row, column: column + vector.column, direction: candidate };
    const resolved = normalizeResolvedExit(current.resolveExit?.(raw, getState()) || raw, raw);
    return current.canEnter(resolved.row, resolved.column, { direction: candidate, mover: api });
  }

  function shouldPreTurn(distanceToTarget) {
    return current.preTurnTolerance > 0
      && target
      && queuedDirection
      && queuedDirection !== movingDirection
      && distanceToTarget <= current.preTurnTolerance * current.cellSize
      && canMoveFrom(queuedDirection, target.row, target.column);
  }

  function canMoveFrom(candidate, sourceRow, sourceColumn) {
    const vector = DIRECTIONS[candidate];
    if (!vector) {
      return false;
    }
    const raw = { row: sourceRow + vector.row, column: sourceColumn + vector.column, direction: candidate };
    const resolved = normalizeResolvedExit(current.resolveExit?.(raw, getState()) || raw, raw);
    return current.canEnter(resolved.row, resolved.column, { direction: candidate, mover: api });
  }

  function getState() {
    return {
      row,
      column,
      x: position.x,
      y: position.y,
      direction,
      queuedDirection,
      movingDirection,
      target: target ? { row: target.row, column: target.column, x: target.x, y: target.y } : null,
      speed: current.speed,
      cellSize: current.cellSize,
      preTurnTolerance: current.preTurnTolerance,
    };
  }

  const api = {
    setDirection,
    queueDirection,
    moveTo,
    moveTowardCell,
    update,
    getState,
  };

  return api;
}

export function createGridPathfinder(options = {}) {
  const current = normalizePathfinderOptions(options);

  function findPath(start, target, pathOptions = {}) {
    const from = normalizeCellRef(start);
    const to = normalizeCellRef(target);
    if (!from || !to || !canVisit(from.row, from.column, pathOptions) || !canVisit(to.row, to.column, pathOptions)) {
      return [];
    }
    const queue = [from];
    const visited = new Set([cellKey(from)]);
    const previous = new Map();

    while (queue.length) {
      const cell = queue.shift();
      if (cell.row === to.row && cell.column === to.column) {
        return reconstructPath(cell, previous);
      }
      getNeighbors(cell, pathOptions).forEach((neighbor) => {
        const key = cellKey(neighbor);
        if (!visited.has(key)) {
          visited.add(key);
          previous.set(key, cell);
          queue.push(neighbor);
        }
      });
    }
    return [];
  }

  function nextStep(start, target, pathOptions = {}) {
    const path = findPath(start, target, pathOptions);
    return path.length > 1 ? path[1] : null;
  }

  function distanceMap(target, pathOptions = {}) {
    const to = normalizeCellRef(target);
    const distances = new Map();
    if (!to || !canVisit(to.row, to.column, pathOptions)) {
      return distances;
    }
    const queue = [to];
    distances.set(cellKey(to), 0);

    while (queue.length) {
      const cell = queue.shift();
      const distance = distances.get(cellKey(cell));
      getNeighbors(cell, pathOptions).forEach((neighbor) => {
        const key = cellKey(neighbor);
        if (!distances.has(key)) {
          distances.set(key, distance + 1);
          queue.push(neighbor);
        }
      });
    }

    return distances;
  }

  function getNeighbors(cell, pathOptions = {}) {
    if (typeof pathOptions.getNeighbors === "function") {
      return normalizeNeighborList(pathOptions.getNeighbors(cell, { pathfinder: api })).filter((neighbor) => canVisit(neighbor.row, neighbor.column, pathOptions));
    }
    const diagonal = pathOptions.diagonal ?? current.diagonal;
    const vectors = diagonal
      ? [
        ...Object.values(DIRECTIONS),
        { row: -1, column: -1 },
        { row: -1, column: 1 },
        { row: 1, column: -1 },
        { row: 1, column: 1 },
      ]
      : Object.values(DIRECTIONS);
    return vectors
      .map((vector) => ({ row: cell.row + vector.row, column: cell.column + vector.column }))
      .filter((neighbor) => canVisit(neighbor.row, neighbor.column, pathOptions));
  }

  function canVisit(row, column, pathOptions = {}) {
    if (row < 0 || column < 0 || row >= current.rows || column >= current.columns) {
      return false;
    }
    const canEnter = pathOptions.canEnter || current.canEnter;
    return canEnter(row, column, { pathfinder: api }) !== false;
  }

  const api = {
    findPath,
    nextStep,
    distanceMap,
    getNeighbors,
  };

  return api;
}

function normalizeMazeOptions(options) {
  const next = { ...DEFAULT_MAZE_OPTIONS, ...(options || {}) };
  next.map = Array.isArray(next.map) ? next.map : [];
  next.tiles = next.tiles && typeof next.tiles === "object" ? next.tiles : {};
  next.cellSize = Math.max(1, Number(next.cellSize) || DEFAULT_MAZE_OPTIONS.cellSize);
  next.defaultTile = normalizeTileDefinition(next.defaultTile || DEFAULT_MAZE_OPTIONS.defaultTile);
  return next;
}

function normalizeMap(map, options) {
  const rows = map.map((row) => (typeof row === "string" ? Array.from(row) : (Array.isArray(row) ? row.slice() : [])));
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map((row, rowIndex) => Array.from({ length: columns }, (_, columnIndex) => normalizeCell(row[columnIndex] ?? " ", rowIndex, columnIndex, options)));
}

function normalizeCell(value, row, column, options) {
  const rawObject = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const symbol = rawObject ? String(rawObject.symbol ?? rawObject.key ?? rawObject.type ?? ".") : String(value ?? " ");
  const definition = normalizeTileDefinition(options.tiles[symbol] || options.tiles[rawObject?.type] || options.defaultTile);
  const data = {
    ...definition.data,
    ...(rawObject?.data || {}),
  };
  const type = rawObject?.type || definition.type || (symbol === "#" ? "wall" : "path");
  const enterable = rawObject && typeof rawObject.enterable === "boolean" ? rawObject.enterable : definition.enterable;
  const point = rawObject?.point ?? definition.point ?? null;
  const points = normalizePointNames([...(normalizeStringArray(definition.points)), ...(normalizeStringArray(rawObject?.points))]);
  if (point) {
    points.unshift(String(point));
  }
  const collectible = rawObject?.collectible ?? definition.collectible ?? null;

  return {
    row,
    column,
    symbol,
    type,
    enterable: typeof enterable === "boolean" ? enterable : type !== "wall",
    point: points[0] || "",
    points,
    collectible,
    data,
    source: rawObject ? { ...rawObject } : value,
  };
}

function normalizeTileDefinition(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return {
    ...value,
    data: value.data && typeof value.data === "object" ? { ...value.data } : {},
  };
}

function buildMazeIndex(cells, cellSize) {
  const points = {};
  const pointGroups = {};
  const collectibles = [];
  cells.forEach((rowCells) => {
    rowCells.forEach((cell) => {
      const center = {
        row: cell.row,
        column: cell.column,
        x: (cell.column + 0.5) * cellSize,
        y: (cell.row + 0.5) * cellSize,
      };
      cell.points.forEach((name) => {
        if (!pointGroups[name]) {
          pointGroups[name] = [];
        }
        pointGroups[name].push(center);
        if (!points[name]) {
          points[name] = center;
        }
      });
      if (cell.collectible !== null && cell.collectible !== undefined && cell.collectible !== false) {
        const collectibleData = typeof cell.collectible === "object" ? cell.collectible : {};
        collectibles.push({
          id: `${cell.row}:${cell.column}`,
          row: cell.row,
          column: cell.column,
          x: center.x,
          y: center.y,
          type: typeof cell.collectible === "string" ? cell.collectible : collectibleData.type || "item",
          value: collectibleData.value,
          data: { ...collectibleData },
        });
      }
    });
  });
  return { points, pointGroups, collectibles };
}

function normalizeMoverOptions(options) {
  const next = { ...(options || {}) };
  return {
    row: normalizeInteger(next.row, 0),
    column: normalizeInteger(next.column, 0),
    direction: normalizeDirection(next.direction),
    queuedDirection: normalizeDirection(next.queuedDirection),
    speed: Math.max(0, Number(next.speed) || 0),
    cellSize: Math.max(1, Number(next.cellSize) || DEFAULT_MAZE_OPTIONS.cellSize),
    preTurnTolerance: clamp(Number(next.preTurnTolerance) || 0, 0, 0.49),
    canEnter: typeof next.canEnter === "function" ? next.canEnter : () => true,
    resolveExit: typeof next.resolveExit === "function" ? next.resolveExit : null,
  };
}

function normalizePathfinderOptions(options) {
  const next = { ...(options || {}) };
  return {
    rows: Math.max(0, normalizeInteger(next.rows, 0)),
    columns: Math.max(0, normalizeInteger(next.columns, 0)),
    diagonal: next.diagonal === true,
    canEnter: typeof next.canEnter === "function" ? next.canEnter : () => true,
  };
}

function normalizeDirection(value) {
  const key = String(value || "").trim().toLowerCase();
  return DIRECTIONS[key] ? key : "";
}

function normalizeResolvedExit(value, fallback) {
  const next = value && typeof value === "object" ? value : fallback;
  return {
    row: normalizeInteger(next.row, fallback.row),
    column: normalizeInteger(next.column, fallback.column),
    direction: normalizeDirection(next.direction || fallback.direction),
  };
}

function normalizeCellRef(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = Number(value.row);
  const column = Number(value.column);
  if (!Number.isFinite(row) || !Number.isFinite(column)) {
    return null;
  }
  return {
    row: Math.trunc(row),
    column: Math.trunc(column),
  };
}

function normalizeNeighborList(value) {
  return Array.isArray(value) ? value.map(normalizeCellRef).filter(Boolean) : [];
}

function reconstructPath(cell, previous) {
  const path = [cell];
  let cursor = cell;
  while (previous.has(cellKey(cursor))) {
    cursor = previous.get(cellKey(cursor));
    path.unshift(cursor);
  }
  return path.map((item) => ({ row: item.row, column: item.column }));
}

function cellCenter(row, column, cellSize) {
  return {
    x: (column + 0.5) * cellSize,
    y: (row + 0.5) * cellSize,
  };
}

function cellKey(cell) {
  return `${cell.row}:${cell.column}`;
}

function directionBetweenCells(from, to) {
  const rowDelta = to.row - from.row;
  const columnDelta = to.column - from.column;
  return Object.entries(DIRECTIONS).find(([, vector]) => vector.row === rowDelta && vector.column === columnDelta)?.[0] || "";
}

function normalizeInteger(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
}

function clamp(value, min, max) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return min;
  }
  return Math.max(min, Math.min(max, next));
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizePointNames(value) {
  return Array.from(new Set(normalizeStringArray(value)));
}

function cloneCell(cell) {
  if (!cell) {
    return null;
  }
  return {
    ...cell,
    points: cell.points.slice(),
    data: { ...cell.data },
    source: cell.source && typeof cell.source === "object" ? { ...cell.source } : cell.source,
  };
}

function clonePointMap(points) {
  return Object.fromEntries(Object.entries(points).map(([key, point]) => [key, { ...point }]));
}

function clonePointGroups(groups) {
  return Object.fromEntries(Object.entries(groups).map(([key, points]) => [key, points.map((point) => ({ ...point }))]));
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  nodes: [],
  rootId: null,
  className: "",
  chrome: true,
  width: null,
  height: 680,
  orientation: "horizontal",
  expandDepth: 2,
  selectionMode: "multi",
  selectedIds: [],
  collapsedIds: [],
  nodeWidth: 196,
  nodeHeight: 68,
  levelGap: 92,
  siblingGap: 18,
  pan: true,
  zoom: true,
  minZoom: 0.18,
  maxZoom: 3,
  zoomStep: 0.12,
  fitOnInit: true,
  cullPadding: 180,
  emptyText: "No tree data.",
  ariaLabel: "Tree mind map",
  theme: null,
  themeUrl: "",
  onSelectionChange: null,
  onNodeSelect: null,
  onNodeToggle: null,
};

const DEFAULT_THEME = {
  background: "#07111f",
  grid: "rgba(126, 166, 224, 0.08)",
  edge: "rgba(132, 169, 222, 0.58)",
  edgeSelected: "#ffd166",
  nodeFill: "#111b2d",
  nodeFillHover: "#15243a",
  nodeBorder: "#304768",
  nodeBorderSelected: "#7fb2ff",
  nodeText: "#e2ebfb",
  nodeSubtext: "#9eb4d8",
  nodeShadow: "rgba(0, 0, 0, 0.28)",
  toggleFill: "#0a1322",
  toggleBorder: "#3a5278",
  status: {
    default: "#8fa5c5",
    planned: "#9fb2d8",
    provisioning: "#74b9ff",
    active: "#48d597",
    inactive: "#8c98ad",
    maintenance: "#ffd166",
    retired: "#ef7d7d",
    selected: "#7fb2ff",
  },
};

export function createTreeMindMap(container, options = {}) {
  const events = createEventBag();
  const mirrorEvents = createEventBag();
  let currentOptions = normalizeOptions(options);
  let theme = mergeTheme(DEFAULT_THEME, currentOptions.theme);
  let tree = normalizeTree(currentOptions.nodes, currentOptions.rootId);
  let collapsed = new Set(currentOptions.collapsedIds);
  let selected = new Set(currentOptions.selectedIds);
  let transform = { x: 24, y: 24, scale: 1 };
  let pointer = { active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 };
  let root = null;
  let viewport = null;
  let canvas = null;
  let ctx = null;
  let mirror = null;
  let empty = null;
  let ro = null;
  let hoverId = null;
  let layout = emptyLayout();
  let raf = 0;
  let destroyed = false;
  let themeRequest = 0;

  initializeCollapsed();
  renderShell();
  if (currentOptions.themeUrl) {
    loadTheme(currentOptions.themeUrl);
  } else {
    relayout({ fit: currentOptions.fitOnInit });
  }

  const api = {
    getState() {
      return {
        selectedIds: Array.from(selected),
        collapsedIds: Array.from(collapsed),
        zoom: transform.scale,
        panX: transform.x,
        panY: transform.y,
        visibleNodeCount: layout.visibleNodes.length,
        totalNodeCount: tree.nodes.length,
        bounds: { ...layout.bounds },
      };
    },
    getSelectedNodes() {
      return getSelectedNodes();
    },
    setData(nodes, nextOptions = {}) {
      currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}), nodes });
      tree = normalizeTree(currentOptions.nodes, currentOptions.rootId);
      selected = new Set(Array.from(selected).filter((id) => tree.byId.has(id)));
      initializeCollapsed();
      relayout({ fit: Boolean(nextOptions.fit) });
    },
    update(nextOptions = {}) {
      currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
      if (Object.prototype.hasOwnProperty.call(nextOptions, "nodes") || Object.prototype.hasOwnProperty.call(nextOptions, "rootId")) {
        tree = normalizeTree(currentOptions.nodes, currentOptions.rootId);
        selected = new Set(Array.from(selected).filter((id) => tree.byId.has(id)));
        collapsed = new Set(Array.from(collapsed).filter((id) => tree.byId.has(id)));
        if (!Object.prototype.hasOwnProperty.call(nextOptions, "collapsedIds")) {
          initializeCollapsed();
        }
      }
      if (Object.prototype.hasOwnProperty.call(nextOptions, "selectedIds")) {
        selected = new Set(currentOptions.selectedIds.filter((id) => tree.byId.has(id)));
      }
      if (Object.prototype.hasOwnProperty.call(nextOptions, "collapsedIds")) {
        collapsed = new Set(currentOptions.collapsedIds.filter((id) => tree.byId.has(id)));
      }
      if (Object.prototype.hasOwnProperty.call(nextOptions, "theme")) {
        theme = mergeTheme(DEFAULT_THEME, currentOptions.theme);
      }
      if (Object.prototype.hasOwnProperty.call(nextOptions, "themeUrl") && currentOptions.themeUrl) {
        loadTheme(currentOptions.themeUrl);
        return;
      }
      relayout({ fit: Boolean(nextOptions.fit) });
    },
    setTheme(themeConfig = {}) {
      theme = mergeTheme(DEFAULT_THEME, themeConfig);
      paint();
    },
    async loadTheme(url) {
      await loadTheme(url);
    },
    selectNode(nodeId, meta = {}) {
      selectNode(nodeId, meta);
    },
    setSelectedIds(ids = []) {
      selected = new Set(asArray(ids).map(String).filter((id) => tree.byId.has(id)));
      emitSelectionChange();
      renderMirror();
      paint();
    },
    clearSelection() {
      selected.clear();
      emitSelectionChange();
      renderMirror();
      paint();
    },
    expandNode(nodeId) {
      collapsed.delete(String(nodeId));
      currentOptions.onNodeToggle?.({ node: cloneNode(tree.byId.get(String(nodeId))), collapsed: false });
      relayout();
    },
    collapseNode(nodeId) {
      const id = String(nodeId);
      if (tree.childrenById.get(id)?.length) {
        collapsed.add(id);
        currentOptions.onNodeToggle?.({ node: cloneNode(tree.byId.get(id)), collapsed: true });
        relayout();
      }
    },
    toggleNode(nodeId) {
      toggleNode(String(nodeId));
    },
    expandAll() {
      collapsed.clear();
      relayout();
    },
    collapseAll() {
      collapsed = new Set(tree.nodes.filter((node) => tree.childrenById.get(node.id)?.length).map((node) => node.id));
      if (tree.root) {
        collapsed.delete(tree.root.id);
      }
      relayout();
    },
    zoomIn() {
      setZoom(transform.scale + currentOptions.zoomStep);
    },
    zoomOut() {
      setZoom(transform.scale - currentOptions.zoomStep);
    },
    setZoom(scale) {
      setZoom(scale);
    },
    resetView() {
      transform = { x: 24, y: 24, scale: 1 };
      paint();
    },
    fitToView() {
      fitToView();
      paint();
    },
    destroy() {
      destroyed = true;
      events.clear();
      mirrorEvents.clear();
      if (ro) {
        ro.disconnect();
      }
      if (raf) {
        cancelAnimationFrame(raf);
      }
      clearNode(container);
    },
  };

  return api;

  async function loadTheme(url) {
    const requestId = themeRequest + 1;
    themeRequest = requestId;
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`Unable to load tree mind map theme: ${response.status}`);
    }
    const config = await response.json();
    if (destroyed || requestId !== themeRequest) {
      return;
    }
    theme = mergeTheme(DEFAULT_THEME, config);
    relayout({ fit: currentOptions.fitOnInit });
  }

  function renderShell() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    clearNode(container);
    root = createElement("section", {
      className: `ui-tree-mind-map${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className || ""}`.trim(),
      attrs: { role: "region", "aria-label": currentOptions.ariaLabel },
    });
    viewport = createElement("div", { className: "ui-tree-mind-map__viewport" });
    canvas = createElement("canvas", { className: "ui-tree-mind-map__canvas", attrs: { tabindex: "0" } });
    mirror = createElement("div", { className: "ui-tree-mind-map__mirror", attrs: { role: "tree" } });
    empty = createElement("div", { className: "ui-tree-mind-map__empty", text: currentOptions.emptyText });
    viewport.append(canvas, mirror, empty);
    root.appendChild(viewport);
    container.appendChild(root);
    ctx = canvas.getContext("2d");
    bindInteractions();
    ro = new ResizeObserver(() => relayout());
    ro.observe(viewport);
  }

  function bindInteractions() {
    events.on(canvas, "pointerdown", (event) => {
      if (!currentOptions.pan) {
        return;
      }
      pointer = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        originX: transform.x,
        originY: transform.y,
      };
      canvas.setPointerCapture?.(event.pointerId);
    });
    events.on(canvas, "pointermove", (event) => {
      const hit = hitTest(event);
      hoverId = hit?.node?.id || null;
      if (pointer.active) {
        const dx = event.clientX - pointer.startX;
        const dy = event.clientY - pointer.startY;
        pointer.moved = pointer.moved || Math.abs(dx) + Math.abs(dy) > 4;
        transform.x = pointer.originX + dx;
        transform.y = pointer.originY + dy;
      }
      paint();
    });
    events.on(canvas, "pointerup", (event) => {
      canvas.releasePointerCapture?.(event.pointerId);
      const wasPan = pointer.active && pointer.moved;
      pointer.active = false;
      if (wasPan) {
        return;
      }
      const hit = hitTest(event);
      if (!hit) {
        if (!event.ctrlKey && !event.metaKey && currentOptions.selectionMode !== "multi-sticky") {
          selected.clear();
          emitSelectionChange();
          renderMirror();
          paint();
        }
        return;
      }
      if (hit.part === "toggle") {
        toggleNode(hit.node.id);
        return;
      }
      selectNode(hit.node.id, { additive: event.ctrlKey || event.metaKey || currentOptions.selectionMode === "multi-sticky" });
    });
    events.on(canvas, "mouseleave", () => {
      hoverId = null;
      paint();
    });
    events.on(canvas, "wheel", (event) => {
      if (!currentOptions.zoom) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const focal = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setZoom(transform.scale + (event.deltaY > 0 ? -currentOptions.zoomStep : currentOptions.zoomStep), focal);
    }, { passive: false });
    events.on(canvas, "keydown", (event) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        api.zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        api.zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        api.resetView();
      }
    });
  }

  function relayout({ fit = false } = {}) {
    if (!canvas || !viewport || destroyed) {
      return;
    }
    resizeCanvas();
    layout = computeLayout(tree, collapsed, currentOptions);
    empty.hidden = Boolean(tree.root);
    renderMirror();
    if (fit || currentOptions.fitOnInit) {
      fitToView();
      currentOptions.fitOnInit = false;
    }
    paint();
  }

  function resizeCanvas() {
    const width = Math.max(1, Number(currentOptions.width) || viewport.clientWidth || container.clientWidth || 1);
    const height = Math.max(240, Number(currentOptions.height) || viewport.clientHeight || 680);
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    viewport.style.height = `${height}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function paint() {
    if (!ctx || !canvas || raf) {
      return;
    }
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw();
    });
  }

  function draw() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);
    drawGrid(width, height);
    if (!tree.root) {
      return;
    }
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);
    drawEdges();
    drawNodes(width, height);
    ctx.restore();
  }

  function drawGrid(width, height) {
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    const gap = 48 * transform.scale;
    if (gap >= 18) {
      const offsetX = transform.x % gap;
      const offsetY = transform.y % gap;
      for (let x = offsetX; x < width; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = offsetY; y < height; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEdges() {
    ctx.save();
    ctx.lineWidth = 2 / Math.max(0.8, transform.scale);
    for (const edge of layout.edges) {
      const parentSelected = selected.has(edge.from.id);
      const childSelected = selected.has(edge.to.id);
      ctx.strokeStyle = parentSelected || childSelected ? theme.edgeSelected : theme.edge;
      ctx.beginPath();
      const fromX = edge.from.x + edge.from.width;
      const fromY = edge.from.y + edge.from.height / 2;
      const toX = edge.to.x;
      const toY = edge.to.y + edge.to.height / 2;
      const midX = fromX + Math.max(24, (toX - fromX) / 2);
      ctx.moveTo(fromX, fromY);
      ctx.bezierCurveTo(midX, fromY, midX, toY, toX, toY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNodes(viewWidth, viewHeight) {
    const view = screenToWorldRect(viewWidth, viewHeight, currentOptions.cullPadding);
    for (const item of layout.visibleNodes) {
      if (!intersects(item, view)) {
        continue;
      }
      drawNode(item);
    }
  }

  function drawNode(item) {
    const node = item.node;
    const isSelected = selected.has(node.id);
    const isHover = hoverId === node.id;
    const radius = 10;
    ctx.save();
    ctx.shadowColor = theme.nodeShadow;
    ctx.shadowBlur = isSelected ? 16 : 8;
    ctx.shadowOffsetY = 4;
    roundRect(item.x, item.y, item.width, item.height, radius);
    ctx.fillStyle = isHover ? theme.nodeFillHover : theme.nodeFill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = isSelected ? 2.5 : 1.4;
    ctx.strokeStyle = isSelected ? theme.nodeBorderSelected : theme.nodeBorder;
    ctx.stroke();
    ctx.fillStyle = getStatusColor(node.status, isSelected);
    ctx.beginPath();
    ctx.arc(item.x + 14, item.y + 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.nodeText;
    ctx.font = "700 14px Segoe UI, Arial, sans-serif";
    drawText(node.label, item.x + 28, item.y + 14, item.width - 42, 18);
    ctx.fillStyle = theme.nodeSubtext;
    ctx.font = "12px Segoe UI, Arial, sans-serif";
    drawText(node.subtitle || node.status || "", item.x + 28, item.y + 36, item.width - 42, 16);
    const childCount = tree.childrenById.get(node.id)?.length || 0;
    if (childCount) {
      const t = getToggleBox(item);
      roundRect(t.x, t.y, t.width, t.height, 6);
      ctx.fillStyle = theme.toggleFill;
      ctx.fill();
      ctx.strokeStyle = theme.toggleBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = theme.nodeText;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(t.x + 6, t.y + t.height / 2);
      ctx.lineTo(t.x + t.width - 6, t.y + t.height / 2);
      if (collapsed.has(node.id)) {
        ctx.moveTo(t.x + t.width / 2, t.y + 6);
        ctx.lineTo(t.x + t.width / 2, t.y + t.height - 6);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawText(text, x, y, maxWidth, lineHeight) {
    const value = String(text || "");
    if (!value) {
      return;
    }
    let output = value;
    while (output.length && ctx.measureText(output).width > maxWidth) {
      output = output.slice(0, -1);
    }
    if (output.length < value.length && output.length > 1) {
      output = `${output.slice(0, -1)}...`;
    }
    ctx.fillText(output, x, y + lineHeight - 4);
  }

  function renderMirror() {
    if (!mirror) {
      return;
    }
    mirrorEvents.clear();
    clearNode(mirror);
    layout.visibleNodes.forEach((entry) => {
      const button = createElement("button", {
        className: `ui-tree-mind-map__mirror-node${selected.has(entry.node.id) ? " is-selected" : ""}`,
        attrs: {
          type: "button",
          role: "treeitem",
          "aria-selected": String(selected.has(entry.node.id)),
          "aria-level": String(entry.depth + 1),
        },
        text: entry.node.label,
      });
      mirrorEvents.on(button, "click", (event) => {
        selectNode(entry.node.id, { additive: event.ctrlKey || event.metaKey || currentOptions.selectionMode === "multi-sticky" });
      });
      mirror.appendChild(button);
    });
  }

  function hitTest(event) {
    const rect = canvas.getBoundingClientRect();
    const point = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    for (let index = layout.visibleNodes.length - 1; index >= 0; index -= 1) {
      const item = layout.visibleNodes[index];
      if (point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height) {
        const toggle = getToggleBox(item);
        const part = point.x >= toggle.x && point.x <= toggle.x + toggle.width && point.y >= toggle.y && point.y <= toggle.y + toggle.height ? "toggle" : "node";
        return { node: item.node, item, part };
      }
    }
    return null;
  }

  function getToggleBox(item) {
    return { x: item.x + item.width - 30, y: item.y + 10, width: 20, height: 20 };
  }

  function screenToWorld(x, y) {
    return {
      x: (x - transform.x) / transform.scale,
      y: (y - transform.y) / transform.scale,
    };
  }

  function screenToWorldRect(width, height, padding = 0) {
    const topLeft = screenToWorld(-padding, -padding);
    const bottomRight = screenToWorld(width + padding, height + padding);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  function setZoom(nextScale, focal = null) {
    const clamped = clamp(nextScale, currentOptions.minZoom, currentOptions.maxZoom);
    if (Math.abs(clamped - transform.scale) < 0.001) {
      return;
    }
    if (focal) {
      const before = screenToWorld(focal.x, focal.y);
      transform.scale = clamped;
      transform.x = focal.x - before.x * transform.scale;
      transform.y = focal.y - before.y * transform.scale;
    } else {
      transform.scale = clamped;
    }
    paint();
  }

  function fitToView() {
    if (!canvas || !layout.visibleNodes.length) {
      return;
    }
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const bounds = layout.bounds;
    const padding = 48;
    const scaleX = (width - padding * 2) / Math.max(1, bounds.width);
    const scaleY = (height - padding * 2) / Math.max(1, bounds.height);
    const nextScale = clamp(Math.min(scaleX, scaleY), currentOptions.minZoom, currentOptions.maxZoom);
    transform.scale = nextScale;
    transform.x = padding - bounds.x * nextScale + Math.max(0, (width - padding * 2 - bounds.width * nextScale) / 2);
    transform.y = padding - bounds.y * nextScale + Math.max(0, (height - padding * 2 - bounds.height * nextScale) / 2);
  }

  function toggleNode(nodeId) {
    if (!tree.childrenById.get(nodeId)?.length) {
      return;
    }
    const nextCollapsed = !collapsed.has(nodeId);
    if (nextCollapsed) {
      collapsed.add(nodeId);
    } else {
      collapsed.delete(nodeId);
    }
    currentOptions.onNodeToggle?.({ node: cloneNode(tree.byId.get(nodeId)), collapsed: nextCollapsed });
    relayout();
  }

  function selectNode(nodeId, meta = {}) {
    const id = String(nodeId || "");
    if (!tree.byId.has(id)) {
      return;
    }
    const multi = currentOptions.selectionMode !== "single";
    if (!multi || !meta.additive) {
      selected.clear();
      selected.add(id);
    } else if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    const selectedNodes = getSelectedNodes();
    currentOptions.onNodeSelect?.({ node: cloneNode(tree.byId.get(id)), selectedNodes });
    emitSelectionChange();
    renderMirror();
    paint();
  }

  function getSelectedNodes() {
    return Array.from(selected)
      .map((id) => tree.byId.get(id))
      .filter(Boolean)
      .map(cloneNode);
  }

  function emitSelectionChange() {
    currentOptions.onSelectionChange?.(getSelectedNodes());
  }

  function initializeCollapsed() {
    if (currentOptions.collapsedIds.length) {
      collapsed = new Set(currentOptions.collapsedIds.filter((id) => tree.byId.has(id)));
      return;
    }
    collapsed.clear();
    tree.nodes.forEach((node) => {
      if (node.depth >= currentOptions.expandDepth && tree.childrenById.get(node.id)?.length) {
        collapsed.add(node.id);
      }
    });
  }

  function getStatusColor(status, isSelected) {
    if (isSelected && theme.status?.selected) {
      return theme.status.selected;
    }
    return theme.status?.[status] || theme.status?.default || "#8fa5c5";
  }
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.nodes = Array.isArray(next.nodes) ? next.nodes : [];
  next.selectedIds = asArray(next.selectedIds).map(String);
  next.collapsedIds = asArray(next.collapsedIds).map(String);
  next.selectionMode = ["single", "multi", "multi-sticky"].includes(next.selectionMode) ? next.selectionMode : "multi";
  next.expandDepth = Math.max(0, Number(next.expandDepth) || 0);
  next.nodeWidth = Math.max(120, Number(next.nodeWidth) || DEFAULT_OPTIONS.nodeWidth);
  next.nodeHeight = Math.max(44, Number(next.nodeHeight) || DEFAULT_OPTIONS.nodeHeight);
  next.levelGap = Math.max(24, Number(next.levelGap) || DEFAULT_OPTIONS.levelGap);
  next.siblingGap = Math.max(4, Number(next.siblingGap) || DEFAULT_OPTIONS.siblingGap);
  next.minZoom = Math.max(0.05, Number(next.minZoom) || DEFAULT_OPTIONS.minZoom);
  next.maxZoom = Math.max(next.minZoom, Number(next.maxZoom) || DEFAULT_OPTIONS.maxZoom);
  next.zoomStep = Math.max(0.02, Number(next.zoomStep) || DEFAULT_OPTIONS.zoomStep);
  next.cullPadding = Math.max(0, Number(next.cullPadding) || 0);
  next.chrome = next.chrome !== false;
  next.pan = next.pan !== false;
  next.zoom = next.zoom !== false;
  next.fitOnInit = next.fitOnInit !== false;
  return next;
}

function normalizeTree(nodes, rootId = null) {
  const byId = new Map();
  const childrenById = new Map();
  const normalized = [];
  flattenNodes(nodes).forEach((node) => {
    if (!node || typeof node !== "object" || node.id == null) {
      return;
    }
    const item = {
      ...node,
      id: String(node.id),
      parentId: node.parentId == null ? null : String(node.parentId),
      label: String(node.label || node.name || node.id),
      subtitle: String(node.subtitle || node.type || node.deployment || ""),
      status: String(node.status || "default"),
      data: node.data && typeof node.data === "object" ? { ...node.data } : {},
      depth: 0,
    };
    byId.set(item.id, item);
    childrenById.set(item.id, []);
    normalized.push(item);
  });
  normalized.forEach((node) => {
    if (node.parentId && childrenById.has(node.parentId)) {
      childrenById.get(node.parentId).push(node);
    }
  });
  const root = (rootId && byId.get(String(rootId)))
    || normalized.find((node) => !node.parentId || !byId.has(node.parentId))
    || normalized[0]
    || null;
  if (root) {
    assignDepth(root, 0, childrenById, new Set());
  }
  return { root, nodes: normalized, byId, childrenById };
}

function flattenNodes(nodes, parentId = null, output = []) {
  asArray(nodes).forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const copy = { ...node };
    if (copy.parentId == null && parentId != null) {
      copy.parentId = parentId;
    }
    delete copy.children;
    output.push(copy);
    if (Array.isArray(node.children)) {
      flattenNodes(node.children, node.id, output);
    }
  });
  return output;
}

function assignDepth(node, depth, childrenById, seen) {
  if (!node || seen.has(node.id)) {
    return;
  }
  seen.add(node.id);
  node.depth = depth;
  childrenById.get(node.id)?.forEach((child) => assignDepth(child, depth + 1, childrenById, seen));
}

function computeLayout(tree, collapsed, options) {
  if (!tree.root) {
    return emptyLayout();
  }
  const visibleNodes = [];
  const edges = [];
  let cursorY = 0;
  const itemById = new Map();

  place(tree.root, 0);

  const bounds = visibleNodes.reduce((acc, item) => ({
    x: Math.min(acc.x, item.x),
    y: Math.min(acc.y, item.y),
    right: Math.max(acc.right, item.x + item.width),
    bottom: Math.max(acc.bottom, item.y + item.height),
  }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });

  return {
    visibleNodes,
    edges,
    bounds: {
      x: Number.isFinite(bounds.x) ? bounds.x : 0,
      y: Number.isFinite(bounds.y) ? bounds.y : 0,
      width: Number.isFinite(bounds.right) ? bounds.right - bounds.x : 1,
      height: Number.isFinite(bounds.bottom) ? bounds.bottom - bounds.y : 1,
    },
  };

  function place(node, depth) {
    const children = collapsed.has(node.id) ? [] : (tree.childrenById.get(node.id) || []);
    const childItems = children.map((child) => place(child, depth + 1));
    let y;
    if (childItems.length) {
      const first = childItems[0];
      const last = childItems[childItems.length - 1];
      y = (first.y + last.y) / 2;
    } else {
      y = cursorY;
      cursorY += options.nodeHeight + options.siblingGap;
    }
    const item = {
      node,
      depth,
      x: depth * (options.nodeWidth + options.levelGap),
      y,
      width: options.nodeWidth,
      height: options.nodeHeight,
    };
    visibleNodes.push(item);
    itemById.set(node.id, item);
    childItems.forEach((childItem) => edges.push({ from: item, to: childItem }));
    return item;
  }
}

function emptyLayout() {
  return { visibleNodes: [], edges: [], bounds: { x: 0, y: 0, width: 1, height: 1 } };
}

function mergeTheme(base, override) {
  if (!override || typeof override !== "object") {
    return JSON.parse(JSON.stringify(base));
  }
  const next = { ...base, ...override };
  next.status = { ...(base.status || {}), ...(override.status || {}) };
  return next;
}

function cloneNode(node) {
  if (!node) {
    return null;
  }
  return JSON.parse(JSON.stringify(node));
}

function asArray(value) {
  return Array.isArray(value) ? value : (value == null ? [] : [value]);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function intersects(item, rect) {
  return item.x < rect.x + rect.width
    && item.x + item.width > rect.x
    && item.y < rect.y + rect.height
    && item.y + item.height > rect.y;
}

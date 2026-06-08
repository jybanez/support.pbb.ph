import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_OPTIONS = {
  data: null,
  className: "",
  chrome: true,
  orientation: "horizontal",
  externalLane: "right",
  showOverlayLinks: true,
  showExternalNodes: true,
  searchTerm: "",
  searchFields: ["label", "type"],
  autoExpandMatches: true,
  highlightMatches: true,
  emptyText: "No hierarchy data.",
  emptySearchText: "No matching results.",
  selectable: true,
  collapsible: true,
  expandDepth: 8,
  pan: true,
  zoom: true,
  fitOnOpen: true,
  minZoom: 0.45,
  maxZoom: 2.5,
  zoomStep: 0.1,
  ariaLabel: "Hierarchy map",
  onNodeClick: null,
  onNodeToggle: null,
  onLinkClick: null,
  onSelectionChange: null,
};

export function createHierarchyMap(container, options = {}) {
  const events = createEventBag();
  const rowEvents = createEventBag();
  let currentOptions = normalizeOptions(options);
  let hierarchyData = normalizeData(currentOptions.data);
  let expanded = new Set();
  let selectedNodeId = null;
  let selectedLinkId = null;
  let searchTerm = String(currentOptions.searchTerm || "");
  let panState = { x: 0, y: 0, startX: 0, startY: 0, active: false };
  let zoom = 1;
  let root = null;
  let viewport = null;
  let stage = null;
  let svg = null;
  let layers = null;
  let treeColumnsHost = null;
  let externalHost = null;
  let emptyHost = null;
  let nodeElements = new Map();
  let linkElements = new Map();
  let currentState = emptyState();
  let hasFitOnce = false;

  initializeExpanded();
  render();

  return {
    getData() {
      return cloneData(hierarchyData);
    },
    getState() {
      return {
        ...currentState,
        zoom,
        panX: panState.x,
        panY: panState.y,
        selectedNodeId,
        selectedLinkId,
        expandedNodeIds: Array.from(expanded),
      };
    },
    setData(nextData) {
      hierarchyData = normalizeData(nextData);
      initializeExpanded();
      render();
    },
    update(nextOptions = {}) {
      currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
      if (Object.prototype.hasOwnProperty.call(nextOptions || {}, "data")) {
        hierarchyData = normalizeData(currentOptions.data);
      }
      if (Object.prototype.hasOwnProperty.call(nextOptions || {}, "searchTerm")) {
        searchTerm = String(currentOptions.searchTerm || "");
      }
      initializeExpanded();
      render();
    },
    setSearchTerm(term) {
      searchTerm = String(term || "");
      render();
    },
    clearSearch() {
      searchTerm = "";
      render();
    },
    expandNode(nodeId) {
      if (!nodeId) {
        return;
      }
      expanded.add(String(nodeId));
      render();
    },
    collapseNode(nodeId) {
      if (!nodeId) {
        return;
      }
      expanded.delete(String(nodeId));
      render();
    },
    toggleNode(nodeId) {
      if (!nodeId) {
        return;
      }
      const key = String(nodeId);
      if (expanded.has(key)) {
        expanded.delete(key);
      } else {
        expanded.add(key);
      }
      render();
    },
    expandAll() {
      expanded = collectExpandableNodeIds(hierarchyData.root);
      render();
    },
    collapseAll() {
      expanded = new Set([hierarchyData.root?.id].filter(Boolean));
      render();
    },
    selectNode(nodeId) {
      selectedNodeId = nodeId == null ? null : String(nodeId);
      selectedLinkId = null;
      updateSelectedState();
      emitSelectionChange();
    },
    selectLink(linkId) {
      selectedLinkId = linkId == null ? null : String(linkId);
      selectedNodeId = null;
      updateSelectedState();
      emitSelectionChange();
    },
    focusNode(nodeId) {
      const node = nodeElements.get(String(nodeId || ""));
      if (node) {
        node.focus();
      }
    },
    zoomIn() {
      setZoom(zoom + currentOptions.zoomStep);
    },
    zoomOut() {
      setZoom(zoom - currentOptions.zoomStep);
    },
    resetView() {
      zoom = 1;
      panState.x = 0;
      panState.y = 0;
      applyTransform();
    },
    fitToView() {
      fitToViewport();
    },
    destroy() {
      events.clear();
      rowEvents.clear();
      clearNode(container);
      root = null;
      viewport = null;
      stage = null;
      svg = null;
      layers = null;
      treeColumnsHost = null;
      externalHost = null;
      emptyHost = null;
      nodeElements.clear();
      linkElements.clear();
    },
  };

  function emptyState() {
    return {
      visibleNodeCount: 0,
      visibleExternalCount: 0,
      visibleLinkCount: 0,
      visibleColumns: [],
      search: {
        active: false,
        term: "",
        matchCount: 0,
        visibleNodeCount: 0,
      },
    };
  }

  function initializeExpanded() {
    const validIds = new Set();
    walkNodes(hierarchyData.root, (node) => validIds.add(node.id));
    expanded = new Set(Array.from(expanded).filter((id) => validIds.has(id)));
    if (expanded.size === 0 && hierarchyData.root) {
      expandToDepth(hierarchyData.root, 1, currentOptions.expandDepth, expanded);
    }
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    rowEvents.clear();
    clearNode(container);
    nodeElements = new Map();
    linkElements = new Map();

    root = createElement("section", {
      className: `ui-hierarchy-map${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className || ""}`.trim(),
      attrs: { role: "region", "aria-label": String(currentOptions.ariaLabel || "Hierarchy map") },
    });
    viewport = createElement("div", { className: "ui-hierarchy-map__viewport" });
    stage = createElement("div", { className: "ui-hierarchy-map__stage" });
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ui-hierarchy-map__links");
    svg.setAttribute("aria-hidden", "true");
    layers = createElement("div", { className: "ui-hierarchy-map__layers" });
    treeColumnsHost = createElement("div", { className: "ui-hierarchy-map__tree" });
    externalHost = createElement("div", { className: "ui-hierarchy-map__externals" });
    emptyHost = createElement("div", { className: "ui-hierarchy-map__empty" });

    stage.append(svg, layers);
    layers.append(treeColumnsHost, externalHost);
    viewport.append(stage, emptyHost);
    root.appendChild(viewport);
    container.appendChild(root);

    bindViewportInteractions();

    const searchInfo = buildSearchInfo();
    const visibleTree = buildVisibleTree(hierarchyData.root, searchInfo);
    const columns = collectColumns(visibleTree);
    const visibleNodeIds = new Set();
    walkVisible(visibleTree, (entry) => visibleNodeIds.add(entry.node.id));
    const externals = collectVisibleExternals(searchInfo, visibleNodeIds);
    const visibleLinks = collectVisibleLinks(visibleNodeIds, externals);

    currentState = {
      visibleNodeCount: visibleNodeIds.size,
      visibleExternalCount: externals.length,
      visibleLinkCount: visibleLinks.length,
      visibleColumns: columns.map((column) => ({ depth: column.depth, count: column.entries.length })),
      search: {
        active: Boolean(searchInfo.active),
        term: searchInfo.term,
        matchCount: searchInfo.matchCount,
        visibleNodeCount: visibleNodeIds.size,
      },
    };

    if (!visibleTree) {
      treeColumnsHost.hidden = true;
      externalHost.hidden = true;
      emptyHost.hidden = false;
      emptyHost.textContent = searchInfo.active ? currentOptions.emptySearchText : currentOptions.emptyText;
      currentState.visibleColumns = [];
      currentState.visibleNodeCount = 0;
      currentState.visibleExternalCount = 0;
      currentState.visibleLinkCount = 0;
      applyTransform();
      return;
    }

    treeColumnsHost.hidden = false;
    externalHost.hidden = !currentOptions.showExternalNodes;
    emptyHost.hidden = true;

    renderColumns(columns, searchInfo);
    renderExternals(externals, searchInfo);
    requestAnimationFrame(() => {
      drawConnectors(visibleTree, visibleLinks);
      if (currentOptions.fitOnOpen && !hasFitOnce) {
        fitToViewport();
        hasFitOnce = true;
      } else {
        applyTransform();
      }
    });
  }

  function buildSearchInfo() {
    const term = String(searchTerm || "").trim();
    const fields = uniqueStrings(currentOptions.searchFields);
    const regex = term ? new RegExp(escapeRegex(term), "ig") : null;
    const matchedIds = new Set();

    if (regex) {
      walkNodes(hierarchyData.root, (node) => {
        if (matchesNode(node, term, fields)) {
          matchedIds.add(node.id);
        }
      });
      (hierarchyData.externals || []).forEach((node) => {
        if (matchesNode(node, term, fields)) {
          matchedIds.add(node.id);
        }
      });
    }

    return {
      active: Boolean(term),
      term,
      regex,
      fields,
      matchedIds,
      matchCount: matchedIds.size,
    };
  }

  function buildVisibleTree(node, searchInfo) {
    if (!node) {
      return null;
    }
    const ownMatch = searchInfo.active ? searchInfo.matchedIds.has(node.id) : true;
    const childEntries = [];
    let descendantMatch = false;

    (node.children || []).forEach((child) => {
      const childEntry = buildVisibleTree(child, searchInfo);
      if (childEntry) {
        childEntries.push(childEntry);
        if (childEntry._selfMatch || childEntry._descendantMatch) {
          descendantMatch = true;
        }
      }
    });

    if (searchInfo.active && !ownMatch && !descendantMatch) {
      return null;
    }

    const showChildren = childEntries.length > 0 && (
      !currentOptions.collapsible ||
      expanded.has(node.id) ||
      (searchInfo.active && currentOptions.autoExpandMatches)
    );

    return {
      node,
      children: showChildren ? childEntries : [],
      _allChildren: childEntries,
      _selfMatch: ownMatch,
      _descendantMatch: descendantMatch,
    };
  }

  function collectColumns(entry) {
    const columns = [];
    visit(entry, 0);
    return columns;

    function visit(current, depth) {
      if (!current) {
        return;
      }
      if (!columns[depth]) {
        columns[depth] = { depth, entries: [] };
      }
      columns[depth].entries.push(current);
      current.children.forEach((child) => visit(child, depth + 1));
    }
  }

  function collectVisibleExternals(searchInfo, visibleNodeIds) {
    const externals = currentOptions.showExternalNodes ? [...(hierarchyData.externals || [])] : [];
    if (!searchInfo.active) {
      return externals;
    }

    return externals.filter((node) => {
      if (searchInfo.matchedIds.has(node.id)) {
        return true;
      }
      return (hierarchyData.links || []).some((link) => link.from === node.id && visibleNodeIds.has(link.to));
    });
  }

  function collectVisibleLinks(visibleNodeIds, externals) {
    if (!currentOptions.showOverlayLinks) {
      return [];
    }
    const externalIds = new Set(externals.map((node) => node.id));
    return (hierarchyData.links || []).filter((link) => externalIds.has(link.from) && visibleNodeIds.has(link.to));
  }

  function renderColumns(columns, searchInfo) {
    clearNode(treeColumnsHost);
    columns.forEach((column, depth) => {
      const columnEl = createElement("div", {
        className: "ui-hierarchy-map__column",
        dataset: { depth },
      });
      const title = createElement("div", {
        className: "ui-hierarchy-map__column-title",
        text: depthLabel(column.entries[0]?.node?.type, depth),
      });
      const stack = createElement("div", { className: "ui-hierarchy-map__column-stack" });
      column.entries.forEach((entry) => stack.appendChild(renderNodeCard(entry, searchInfo)));
      columnEl.append(title, stack);
      treeColumnsHost.appendChild(columnEl);
    });
  }

  function renderExternals(externals, searchInfo) {
    clearNode(externalHost);
    if (!externals.length) {
      externalHost.hidden = true;
      return;
    }
    externalHost.hidden = false;
    const title = createElement("div", {
      className: "ui-hierarchy-map__column-title",
      text: "External Entities",
    });
    const stack = createElement("div", { className: "ui-hierarchy-map__column-stack" });
    externals.forEach((node) => {
      stack.appendChild(renderNodeCard({
        node,
        children: [],
        _allChildren: [],
        _selfMatch: searchInfo.active ? searchInfo.matchedIds.has(node.id) : false,
        _descendantMatch: false,
      }, searchInfo, true));
    });
    externalHost.append(title, stack);
  }

  function renderNodeCard(entry, searchInfo, external = false) {
    const { node } = entry;
    const hasChildren = !external && Boolean(node.children?.length);
    const isExpanded = expanded.has(node.id);
    const button = createElement("button", {
      className: `ui-hierarchy-map__node-card${selectedNodeId === node.id ? " is-selected" : ""}${external ? " is-external" : ""}${searchInfo.active && searchInfo.matchedIds.has(node.id) ? " is-match" : ""}`,
      attrs: {
        type: "button",
        "aria-label": `${node.label}${node.type ? `, ${node.type}` : ""}`,
      },
      dataset: { nodeId: node.id },
    });
    if (currentOptions.selectable) {
      rowEvents.on(button, "click", (event) => {
        event.preventDefault();
        selectedNodeId = node.id;
        selectedLinkId = null;
        updateSelectedState();
        currentOptions.onNodeClick?.({
          node: cloneNode(node),
          path: getNodePath(node.id),
        });
        emitSelectionChange();
      });
    }

    const top = createElement("div", { className: "ui-hierarchy-map__node-top" });
    const labelWrap = createElement("div", { className: "ui-hierarchy-map__node-label-wrap" });
    const label = createElement("div", { className: "ui-hierarchy-map__node-label" });
    if (searchInfo.active && currentOptions.highlightMatches) {
      label.innerHTML = highlightText(node.label, searchInfo.regex);
    } else {
      label.textContent = node.label;
    }
    labelWrap.appendChild(label);

    if (node.type) {
      labelWrap.appendChild(createElement("span", {
        className: "ui-hierarchy-map__node-badge",
        text: formatType(node.type),
      }));
    }

    top.appendChild(labelWrap);

    if (currentOptions.collapsible && hasChildren) {
      const toggle = createElement("button", {
        className: `ui-hierarchy-map__node-toggle${isExpanded ? " is-open" : ""}`,
        attrs: {
          type: "button",
          "aria-label": isExpanded ? "Collapse node" : "Expand node",
          "aria-expanded": String(isExpanded),
        },
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      });
      rowEvents.on(toggle, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (expanded.has(node.id)) {
          expanded.delete(node.id);
          currentOptions.onNodeToggle?.({ node: cloneNode(node), expanded: false });
        } else {
          expanded.add(node.id);
          currentOptions.onNodeToggle?.({ node: cloneNode(node), expanded: true });
        }
        render();
      });
      top.appendChild(toggle);
    }

    button.appendChild(top);

    const meta = buildMeta(node);
    if (meta.length) {
      const metaList = createElement("div", { className: "ui-hierarchy-map__node-meta" });
      meta.forEach((value) => {
        metaList.appendChild(createElement("div", {
          className: "ui-hierarchy-map__node-meta-item",
          text: value,
        }));
      });
      button.appendChild(metaList);
    }

    if (!external && hasChildren) {
      button.appendChild(createElement("div", {
        className: "ui-hierarchy-map__node-count",
        text: `${node.children.length} child${node.children.length === 1 ? "" : "ren"}`,
      }));
    }

    nodeElements.set(node.id, button);
    return button;
  }

  function drawConnectors(visibleTree, overlayLinks) {
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const stageWidth = Math.ceil(layers.scrollWidth + 24);
    const stageHeight = Math.ceil(layers.scrollHeight + 24);
    stage.style.width = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;
    svg.setAttribute("width", String(stageWidth));
    svg.setAttribute("height", String(stageHeight));
    svg.setAttribute("viewBox", `0 0 ${stageWidth} ${stageHeight}`);

    drawTreeLinks(visibleTree);
    overlayLinks.forEach((link) => drawOverlayLink(link));
    updateSelectedState();
  }

  function drawTreeLinks(entry) {
    if (!entry) {
      return;
    }
    const fromEl = nodeElements.get(entry.node.id);
    entry.children.forEach((child) => {
      const toEl = nodeElements.get(child.node.id);
      if (fromEl && toEl) {
        appendPath(buildPath(fromEl, toEl), `ui-hierarchy-map__link ui-hierarchy-map__link--tree`);
      }
      drawTreeLinks(child);
    });
  }

  function drawOverlayLink(link) {
    const fromEl = nodeElements.get(link.from);
    const toEl = nodeElements.get(link.to);
    if (!fromEl || !toEl) {
      return;
    }
    const path = buildPath(toEl, fromEl, {
      startSide: "right",
      endSide: "left",
      overlay: true,
    });
    const pathEl = appendPath(path, `ui-hierarchy-map__link ui-hierarchy-map__link--overlay${link.dashed ? " is-dashed" : ""}${selectedLinkId === link.id ? " is-selected" : ""}`);
    pathEl.dataset.linkId = link.id;
    pathEl.dataset.from = link.from;
    pathEl.dataset.to = link.to;
    rowEvents.on(pathEl, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectedLinkId = link.id;
      selectedNodeId = null;
      updateSelectedState();
      currentOptions.onLinkClick?.({ link: { ...link } });
      emitSelectionChange();
    });
    linkElements.set(link.id, pathEl);
  }

  function appendPath(d, className) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", className);
    svg.appendChild(path);
    return path;
  }

  function buildPath(fromEl, toEl, options = false) {
    const config = typeof options === "boolean"
      ? { overlay: options, startSide: "right", endSide: "left" }
      : {
          overlay: Boolean(options?.overlay),
          startSide: options?.startSide || "right",
          endSide: options?.endSide || "left",
        };
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    const startX = fromRect.left - stageRect.left + (config.startSide === "left" ? 0 : fromRect.width);
    const startY = fromRect.top - stageRect.top + (fromRect.height / 2);
    const endX = toRect.left - stageRect.left + (config.endSide === "left" ? 0 : toRect.width);
    const endY = toRect.top - stageRect.top + (toRect.height / 2);
    const delta = Math.max(28, Math.abs(endX - startX) * (config.overlay ? 0.3 : 0.42));

    return `M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}`;
  }

  function bindViewportInteractions() {
    if (!viewport) {
      return;
    }
    if (currentOptions.zoom) {
      events.on(viewport, "wheel", (event) => {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -currentOptions.zoomStep : currentOptions.zoomStep;
        setZoom(zoom + delta, event.offsetX, event.offsetY);
      }, { passive: false });
    }
    if (currentOptions.pan) {
      events.on(viewport, "pointerdown", (event) => {
        const interactiveTarget = event.target instanceof Element
          ? event.target.closest(".ui-hierarchy-map__node-card, .ui-hierarchy-map__node-toggle")
          : null;
        if (interactiveTarget) {
          return;
        }
        const panSurface = event.target instanceof Element
          ? event.target.closest(".ui-hierarchy-map__viewport, .ui-hierarchy-map__stage, .ui-hierarchy-map__layers, .ui-hierarchy-map__tree, .ui-hierarchy-map__externals")
          : null;
        if (!panSurface && event.target !== viewport) {
          return;
        }
        event.preventDefault();
        panState.active = true;
        panState.startX = event.clientX - panState.x;
        panState.startY = event.clientY - panState.y;
        viewport.setPointerCapture?.(event.pointerId);
      });
      events.on(viewport, "pointermove", (event) => {
        if (!panState.active) {
          return;
        }
        panState.x = event.clientX - panState.startX;
        panState.y = event.clientY - panState.startY;
        applyTransform();
      });
      events.on(viewport, "pointerup", (event) => {
        panState.active = false;
        viewport.releasePointerCapture?.(event.pointerId);
      });
      events.on(viewport, "pointerleave", () => {
        panState.active = false;
      });
    }
  }

  function setZoom(nextZoom) {
    zoom = clamp(nextZoom, currentOptions.minZoom, currentOptions.maxZoom);
    applyTransform();
  }

  function applyTransform() {
    if (!stage) {
      return;
    }
    stage.style.transform = `translate(${Math.round(panState.x)}px, ${Math.round(panState.y)}px) scale(${zoom})`;
  }

  function fitToViewport() {
    if (!viewport || !layers) {
      return;
    }
    const contentWidth = Math.max(1, layers.scrollWidth + 24);
    const contentHeight = Math.max(1, layers.scrollHeight + 24);
    const viewportWidth = Math.max(1, viewport.clientWidth - 24);
    const viewportHeight = Math.max(1, viewport.clientHeight - 24);
    const scale = clamp(Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight), currentOptions.minZoom, currentOptions.maxZoom);
    zoom = scale;
    panState.x = Math.max(12, (viewport.clientWidth - (contentWidth * scale)) / 2);
    panState.y = Math.max(12, (viewport.clientHeight - (contentHeight * scale)) / 2);
    applyTransform();
  }

  function updateSelectedState() {
    nodeElements.forEach((element, id) => {
      element.classList.toggle("is-selected", id === selectedNodeId);
    });
    linkElements.forEach((element, id) => {
      element.classList.toggle("is-selected", id === selectedLinkId);
    });
  }

  function emitSelectionChange() {
    currentOptions.onSelectionChange?.({
      selectedNode: selectedNodeId ? cloneNode(findNodeById(hierarchyData.root, selectedNodeId) || findExternalById(hierarchyData.externals, selectedNodeId)) : null,
      selectedLink: selectedLinkId ? JSON.parse(JSON.stringify(hierarchyData.links.find((entry) => entry.id === selectedLinkId) || null)) : null,
    });
  }

  function buildMeta(node) {
    const meta = [];
    if (node.meta?.status) {
      meta.push(`Status: ${node.meta.status}`);
    }
    if (node.meta?.barangayCount != null) {
      meta.push(`Barangays: ${node.meta.barangayCount}`);
    }
    if (node.meta?.cityCount != null) {
      meta.push(`Cities: ${node.meta.cityCount}`);
    }
    if (node.meta?.provinceCount != null) {
      meta.push(`Provinces: ${node.meta.provinceCount}`);
    }
    if (node.meta?.areaName) {
      meta.push(node.meta.areaName);
    }
    return meta.slice(0, 2);
  }

  function getNodePath(nodeId) {
    const path = [];
    if (!hierarchyData.root || !nodeId) {
      return path;
    }
    findPath(hierarchyData.root, String(nodeId), path);
    return path.map((node) => ({ id: node.id, label: node.label, type: node.type }));
  }
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.chrome = next.chrome !== false;
  next.showOverlayLinks = next.showOverlayLinks !== false;
  next.showExternalNodes = next.showExternalNodes !== false;
  next.autoExpandMatches = next.autoExpandMatches !== false;
  next.highlightMatches = next.highlightMatches !== false;
  next.selectable = next.selectable !== false;
  next.collapsible = next.collapsible !== false;
  next.pan = next.pan !== false;
  next.zoom = next.zoom !== false;
  next.fitOnOpen = next.fitOnOpen !== false;
  next.expandDepth = Math.max(1, Number(next.expandDepth) || 1);
  next.zoomStep = Math.max(0.01, Number(next.zoomStep) || 0.1);
  next.minZoom = Math.max(0.1, Number(next.minZoom) || 0.45);
  next.maxZoom = Math.max(next.minZoom, Number(next.maxZoom) || 2.5);
  next.orientation = "horizontal";
  return next;
}

function normalizeData(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    root: normalizeNode(source.root || null),
    externals: Array.isArray(source.externals) ? source.externals.map((node) => normalizeNode(node, true)).filter(Boolean) : [],
    links: Array.isArray(source.links) ? source.links.map(normalizeLink).filter(Boolean) : [],
  };
}

function normalizeNode(node, external = false) {
  if (!node || typeof node !== "object") {
    return null;
  }
  const normalized = {
    id: String(node.id || ""),
    label: String(node.label || ""),
    type: String(node.type || (external ? "external" : "node")),
    meta: node.meta && typeof node.meta === "object" ? { ...node.meta } : {},
    children: Array.isArray(node.children) ? node.children.map((child) => normalizeNode(child)).filter(Boolean) : [],
  };
  if (!normalized.id || !normalized.label) {
    return null;
  }
  return normalized;
}

function normalizeLink(link) {
  if (!link || typeof link !== "object") {
    return null;
  }
  const normalized = {
    id: String(link.id || ""),
    from: String(link.from || ""),
    to: String(link.to || ""),
    type: String(link.type || "link"),
    label: link.label == null ? "" : String(link.label),
    dashed: Boolean(link.dashed),
    tone: link.tone == null ? "info" : String(link.tone),
    meta: link.meta && typeof link.meta === "object" ? { ...link.meta } : {},
  };
  if (!normalized.id || !normalized.from || !normalized.to) {
    return null;
  }
  return normalized;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data || {}));
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node || null));
}

function walkNodes(node, visit) {
  if (!node) {
    return;
  }
  visit(node);
  (node.children || []).forEach((child) => walkNodes(child, visit));
}

function walkVisible(entry, visit) {
  if (!entry) {
    return;
  }
  visit(entry);
  entry.children.forEach((child) => walkVisible(child, visit));
}

function expandToDepth(node, depth, maxDepth, expanded) {
  if (!node) {
    return;
  }
  expanded.add(node.id);
  if (depth >= maxDepth) {
    return;
  }
  (node.children || []).forEach((child) => expandToDepth(child, depth + 1, maxDepth, expanded));
}

function collectExpandableNodeIds(node, set = new Set()) {
  if (!node) {
    return set;
  }
  set.add(node.id);
  (node.children || []).forEach((child) => collectExpandableNodeIds(child, set));
  return set;
}

function matchesNode(node, term, fields) {
  const lowered = String(term || "").toLowerCase();
  if (!lowered) {
    return true;
  }
  return fields.some((field) => {
    const value = resolveField(node, field);
    return value != null && String(value).toLowerCase().includes(lowered);
  });
}

function resolveField(node, field) {
  if (!field) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(node, field)) {
    return node[field];
  }
  if (node.meta && Object.prototype.hasOwnProperty.call(node.meta, field)) {
    return node.meta[field];
  }
  return null;
}

function highlightText(text, regex) {
  const value = String(text || "");
  if (!regex) {
    return escapeHtml(value);
  }
  const clone = new RegExp(regex.source, regex.flags);
  return escapeHtml(value).replace(clone, (match) => `<mark class="ui-hierarchy-map__match">${match}</mark>`);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean)));
}

function depthLabel(type, depth) {
  if (type) {
    return formatType(type);
  }
  return `Level ${depth + 1}`;
}

function formatType(type) {
  return String(type || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function findNodeById(node, nodeId) {
  if (!node || !nodeId) {
    return null;
  }
  if (node.id === nodeId) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findNodeById(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findExternalById(externals, nodeId) {
  if (!nodeId) {
    return null;
  }
  return (Array.isArray(externals) ? externals : []).find((node) => node.id === nodeId) || null;
}

function findPath(node, nodeId, path) {
  if (!node) {
    return false;
  }
  path.push(node);
  if (node.id === nodeId) {
    return true;
  }
  for (const child of node.children || []) {
    if (findPath(child, nodeId, path)) {
      return true;
    }
  }
  path.pop();
  return false;
}

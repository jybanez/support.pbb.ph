import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  chrome: true,
  expandAll: false,
  selectable: true,
  checkable: false,
  lazyLoadChildren: null, // async (node, state) => children[]
  onLoadChildren: null,
  enableVirtualization: false,
  virtualRowHeight: 34,
  virtualOverscan: 6,
  virtualHeight: 320,
  onToggle: null,
  onSelect: null,
  onCheck: null,
};

export function createTree(container, data = [], options = {}) {
  const events = createEventBag();
  const rowEvents = createEventBag();
  let currentOptions = normalizeOptions(options);
  let treeData = normalizeNodes(data);
  let expanded = new Set();
  let selectedId = null;
  let checked = new Set();
  let root = null;
  let viewport = null;
  let rowsLayer = null;
  let staticHost = null;
  let currentRows = [];
  let viewportScrollTop = 0;

  if (currentOptions.expandAll) {
    expandAll(treeData, expanded);
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    rowEvents.clear();
    clearNode(container);

    root = createElement("div", {
      className: `ui-tree${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className || ""}`.trim(),
      attrs: { role: "tree" },
    });

    if (!treeData.length) {
      root.appendChild(createElement("p", { className: "ui-tree-empty", text: "No tree nodes." }));
      container.appendChild(root);
      return;
    }

    currentRows = buildVisibleRows(treeData, expanded);
    if (!currentRows.length) {
      root.appendChild(createElement("p", { className: "ui-tree-empty", text: "No visible nodes." }));
      container.appendChild(root);
      return;
    }

    if (currentOptions.enableVirtualization) {
      viewport = createElement("div", { className: "ui-tree-viewport" });
      viewport.style.height = `${Math.max(120, Number(currentOptions.virtualHeight) || 320)}px`;
      rowsLayer = createElement("div", { className: "ui-tree-rows-layer" });
      viewport.appendChild(rowsLayer);
      root.appendChild(viewport);
      container.appendChild(root);
      events.on(viewport, "scroll", () => {
        viewportScrollTop = viewport.scrollTop;
        renderVirtualRows();
      });
      viewport.scrollTop = viewportScrollTop;
      renderVirtualRows();
      return;
    }

    staticHost = createElement("div", { className: "ui-tree-list", attrs: { role: "group" } });
    root.appendChild(staticHost);
    container.appendChild(root);
    renderStaticRows();
  }

  function renderStaticRows() {
    if (!staticHost) {
      return;
    }
    rowEvents.clear();
    clearNode(staticHost);
    currentRows.forEach((row) => {
      staticHost.appendChild(renderRow(row));
    });
  }

  function renderVirtualRows() {
    if (!viewport || !rowsLayer) {
      return;
    }
    const rowHeight = Math.max(24, Number(currentOptions.virtualRowHeight) || 34);
    const overscan = Math.max(0, Number(currentOptions.virtualOverscan) || 0);
    const total = currentRows.length;
    const viewportHeight = viewport.clientHeight || Math.max(120, Number(currentOptions.virtualHeight) || 320);
    const start = Math.max(0, Math.floor((viewport.scrollTop || 0) / rowHeight) - overscan);
    const end = Math.min(total, Math.ceil(((viewport.scrollTop || 0) + viewportHeight) / rowHeight) + overscan);

    rowEvents.clear();
    clearNode(rowsLayer);
    rowsLayer.style.height = `${Math.max(1, total * rowHeight)}px`;

    for (let index = start; index < end; index += 1) {
      const rowNode = renderRow(currentRows[index]);
      rowNode.classList.add("is-virtual");
      rowNode.style.position = "absolute";
      rowNode.style.left = "0";
      rowNode.style.right = "0";
      rowNode.style.top = `${index * rowHeight}px`;
      rowNode.style.height = `${rowHeight}px`;
      rowsLayer.appendChild(rowNode);
    }
  }

  function renderRow(row) {
    const { node, level } = row;
    const hasChildren = node.children.length > 0 || node.hasChildren;
    const isExpanded = expanded.has(node.id);
    const item = createElement("div", {
      className: "ui-tree-item",
      attrs: {
        role: "treeitem",
        "aria-level": String(level),
        "aria-expanded": hasChildren ? String(isExpanded) : null,
      },
    });
    const rowNode = createElement("div", {
      className: `ui-tree-row${selectedId === node.id ? " is-selected" : ""}`,
    });
    rowNode.style.paddingLeft = `${4 + ((level - 1) * 18)}px`;

    const toggle = createElement("button", {
      className: `ui-tree-toggle${hasChildren ? "" : " is-empty"}${node._loading ? " is-loading" : ""}${isExpanded ? " is-open" : ""}`,
      attrs: { type: "button", "aria-label": hasChildren ? "Toggle node" : "Leaf node" },
      html: hasChildren ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>' : "",
    });
    rowEvents.on(toggle, "click", () => {
      if (!hasChildren) {
        return;
      }
      toggleNode(node);
    });
    rowNode.appendChild(toggle);

    if (currentOptions.checkable) {
      const checkbox = createElement("input", {
        className: "ui-tree-check",
        attrs: { type: "checkbox" },
      });
      checkbox.checked = checked.has(node.id);
      rowEvents.on(checkbox, "change", () => {
        if (checkbox.checked) {
          checked.add(node.id);
        } else {
          checked.delete(node.id);
        }
        currentOptions.onCheck?.(node, checkbox.checked, Array.from(checked));
      });
      rowNode.appendChild(checkbox);
    }

    const label = createElement("button", {
      className: "ui-tree-label",
      attrs: { type: "button" },
      text: node.label,
    });
    rowEvents.on(label, "click", () => {
      if (!currentOptions.selectable) {
        return;
      }
      selectedId = node.id;
      currentOptions.onSelect?.(node);
      render();
    });
    rowNode.appendChild(label);
    item.appendChild(rowNode);
    return item;
  }

  async function toggleNode(node) {
    const wasExpanded = expanded.has(node.id);
    if (wasExpanded) {
      expanded.delete(node.id);
      currentOptions.onToggle?.(node, false);
      render();
      return;
    }
    expanded.add(node.id);
    currentOptions.onToggle?.(node, true);

    const shouldLoad = shouldLoadChildren(node);

    if (!shouldLoad) {
      render();
      return;
    }

    await loadChildrenNode(node, false);
    render();
  }

  function shouldLoadChildren(node) {
    return Boolean(currentOptions.lazyLoadChildren)
      && node.hasChildren
      && !node._loaded
      && !node._loading;
  }

  async function loadChildrenNode(node, force = false) {
    if (!node || typeof node !== "object") {
      return [];
    }
    if (!force && !shouldLoadChildren(node)) {
      return node.children || [];
    }
    node._loading = true;
    node._loadError = null;
    render();
    try {
      const loaded = await currentOptions.lazyLoadChildren(node, getState());
      const normalized = normalizeNodes(Array.isArray(loaded) ? loaded : []);
      node.children = normalized;
      node._loaded = true;
      node._loading = false;
      node._loadError = null;
      currentOptions.onLoadChildren?.(node, normalized, getState());
      return normalized;
    } catch (error) {
      node._loading = false;
      node._loadError = error;
      return [];
    } finally {
      render();
    }
  }

  function update(nextData = treeData, nextOptions = {}) {
    treeData = normalizeNodes(nextData);
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    if (currentOptions.expandAll) {
      expanded.clear();
      expandAll(treeData, expanded);
    } else {
      expanded = new Set(Array.from(expanded).filter((id) => hasNodeId(treeData, id)));
    }
    checked = new Set(Array.from(checked).filter((id) => hasNodeId(treeData, id)));
    if (selectedId != null && !hasNodeId(treeData, selectedId)) {
      selectedId = null;
    }
    render();
  }

  function destroy() {
    events.clear();
    rowEvents.clear();
    clearNode(container);
    root = null;
    viewport = null;
    rowsLayer = null;
    staticHost = null;
  }

  function getState() {
    return {
      data: treeData.map(cloneNode),
      visibleRows: currentRows.map((row) => ({ id: row.node.id, level: row.level })),
      expanded: Array.from(expanded),
      selectedId,
      checked: Array.from(checked),
      options: { ...currentOptions },
    };
  }

  render();

  return {
    update,
    async loadChildren(nodeId) {
      const node = findNodeById(treeData, nodeId);
      if (!node) {
        return [];
      }
      return loadChildrenNode(node, false);
    },
    async refreshChildren(nodeId) {
      const node = findNodeById(treeData, nodeId);
      if (!node) {
        return [];
      }
      node._loaded = false;
      return loadChildrenNode(node, true);
    },
    expandAll() {
      expandAll(treeData, expanded);
      render();
    },
    collapseAll() {
      expanded.clear();
      render();
    },
    setSelected(nodeId) {
      selectedId = nodeId == null ? null : String(nodeId);
      render();
    },
    getState,
    destroy,
  };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.chrome = next.chrome !== false;
  next.expandAll = Boolean(next.expandAll);
  next.selectable = Boolean(next.selectable);
  next.checkable = Boolean(next.checkable);
  next.enableVirtualization = Boolean(next.enableVirtualization);
  next.virtualRowHeight = Math.max(24, Number(next.virtualRowHeight) || 34);
  next.virtualOverscan = Math.max(0, Number(next.virtualOverscan) || 6);
  next.virtualHeight = Math.max(120, Number(next.virtualHeight) || 320);
  return next;
}

function normalizeNodes(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((node, index) => normalizeNode(node, `node-${index}`))
    .filter(Boolean);
}

function normalizeNode(node, fallbackId) {
  if (!node || typeof node !== "object") {
    return null;
  }
  const id = String(node.id ?? fallbackId);
  const children = Array.isArray(node.children)
    ? node.children.map((child, index) => normalizeNode(child, `${id}-${index}`)).filter(Boolean)
    : [];
  const explicitHasChildren = Object.prototype.hasOwnProperty.call(node, "hasChildren")
    ? Boolean(node.hasChildren)
    : undefined;
  return {
    id,
    label: String(node.label ?? node.name ?? id),
    hasChildren: explicitHasChildren == null ? children.length > 0 : explicitHasChildren,
    children,
    _loaded: children.length > 0,
    _loading: false,
    _loadError: null,
  };
}

function buildVisibleRows(nodes, expanded, level = 1, acc = []) {
  nodes.forEach((node) => {
    acc.push({ node, level });
    if (expanded.has(node.id) && node.children.length) {
      buildVisibleRows(node.children, expanded, level + 1, acc);
    }
  });
  return acc;
}

function expandAll(nodes, set) {
  nodes.forEach((node) => {
    if (node.children.length || node.hasChildren) {
      set.add(node.id);
      expandAll(node.children, set);
    }
  });
}

function hasNodeId(nodes, id) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.id === id) {
      return true;
    }
    if (node.children.length && hasNodeId(node.children, id)) {
      return true;
    }
  }
  return false;
}

function findNodeById(nodes, id) {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.id === String(id)) {
      return node;
    }
    if (node.children.length) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function cloneNode(node) {
  return {
    id: node.id,
    label: node.label,
    hasChildren: node.hasChildren,
    children: node.children.map(cloneNode),
  };
}

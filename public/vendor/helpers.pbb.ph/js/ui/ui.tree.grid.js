import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  chrome: true,
  columns: [],
  rows: [],
  rowKey: "id",
  indent: 18,
  defaultExpanded: false,
  expandedRowIds: [],
  selectable: "none", // none | single | multi
  selectedRowIds: [],
  wrapCellContent: false,
  enableColumnResize: false,
  lazyLoadChildren: null,
  onLoadChildren: null,
  searchTerm: "",
  searchFields: [],
  autoExpandMatches: true,
  highlightMatches: true,
  emptySearchText: "No matching results.",
  enableVirtualization: false,
  virtualRowHeight: 40,
  virtualOverscan: 8,
  virtualThreshold: 120,
  minColumnWidth: 72,
  columnWidths: {},
  emptyText: "No data available.",
  ariaLabel: "Tree grid",
  getRowId: null,
  getChildren: null,
  onToggle: null,
  onRowClick: null,
  onSelectionChange: null,
};

export function createTreeGrid(container, options = {}) {
  const events = createEventBag();
  const rowEvents = createEventBag();
  let currentOptions = normalizeOptions(options);
  let currentRows = normalizeRows(currentOptions.rows);
  let root = null;
  let tableWrap = null;
  let table = null;
  let tbody = null;
  let focusedRowId = null;
  let resizeCleanup = null;
  let isResizing = false;
  let renderFrame = null;
  let tableColMap = new Map();
  let visibleRows = [];
  let searchSummary = {
    active: false,
    term: "",
    matchCount: 0,
    visibleCount: 0,
  };
  let expandedRowIds = initializeExpandedState();
  let selectedRowIds = new Set((currentOptions.selectedRowIds || []).map(String));
  let columnWidths = normalizeColumnWidths(currentOptions.columnWidths);
  let virtualState = {
    enabled: false,
    rows: [],
    totalRows: 0,
    rowHeight: 40,
    overscan: 8,
    start: 0,
    end: 0,
    lastRenderedStart: -1,
    lastRenderedEnd: -1,
  };

  function getRowId(row) {
    if (typeof currentOptions.getRowId === "function") {
      return String(currentOptions.getRowId(row));
    }
    return String(row?.[currentOptions.rowKey] ?? "");
  }

  function getChildren(row) {
    if (typeof currentOptions.getChildren === "function") {
      const value = currentOptions.getChildren(row);
      return Array.isArray(value) ? value : [];
    }
    return Array.isArray(row?.children) ? row.children : [];
  }

  function hasChildrenRow(row) {
    return getChildren(row).length > 0 || Boolean(row?.hasChildren);
  }

  function shouldLoadChildren(row) {
    return Boolean(currentOptions.lazyLoadChildren)
      && Boolean(row?.hasChildren)
      && !Array.isArray(row?.children)
      && !row?._loaded
      && !row?._loading;
  }

  function walkTree(rows, visitor, depth = 0, parentId = null) {
    rows.forEach((row) => {
      visitor(row, depth, parentId);
      const id = getRowId(row);
      const children = getChildren(row);
      if (children.length) {
        walkTree(children, visitor, depth + 1, id);
      }
    });
  }

  function flattenRows(rows, expandedIds, depth = 0, parentId = null, acc = []) {
    rows.forEach((row) => {
      const id = getRowId(row);
      const children = getChildren(row);
      const hasKids = hasChildrenRow(row);
      const expanded = hasKids && expandedIds.has(id);
      acc.push({
        id,
        row,
        depth,
        parentId,
        hasChildren: hasKids,
        expanded,
        isLeaf: !hasKids,
      });
      if (hasKids && expanded) {
        flattenRows(children, expandedIds, depth + 1, id, acc);
      }
    });
    return acc;
  }

  function getSearchState() {
    const term = String(currentOptions.searchTerm || "").trim().toLowerCase();
    const fields = Array.isArray(currentOptions.searchFields) && currentOptions.searchFields.length
      ? currentOptions.searchFields.map(String)
      : currentOptions.columns.map((column) => String(column?.key || "")).filter(Boolean);
    return {
      active: Boolean(term),
      term,
      fields,
      autoExpandMatches: currentOptions.autoExpandMatches !== false,
      highlightMatches: currentOptions.highlightMatches !== false,
    };
  }

  function collectSearchableText(row, searchState) {
    const values = [];
    searchState.fields.forEach((field) => {
      const value = row?.[field];
      if (value == null) {
        return;
      }
      if (Array.isArray(value)) {
        values.push(value.join(" "));
        return;
      }
      if (typeof value === "object") {
        return;
      }
      values.push(String(value));
    });
    return values.join(" ").toLowerCase();
  }

  function filterAndFlattenRows(rows, searchState, depth = 0, parentId = null, acc = []) {
    rows.forEach((row) => {
      const id = getRowId(row);
      const children = getChildren(row);
      const hasKids = hasChildrenRow(row);
      const childEntries = [];
      if (children.length) {
        filterAndFlattenRows(children, searchState, depth + 1, id, childEntries);
      }
      const selfMatch = collectSearchableText(row, searchState).includes(searchState.term);
      const include = selfMatch || childEntries.length > 0;
      if (!include) {
        return;
      }
      const expanded = hasKids && searchState.autoExpandMatches && childEntries.length > 0;
      acc.push({
        id,
        row,
        depth,
        parentId,
        hasChildren: hasKids,
        expanded,
        isLeaf: !hasKids,
        selfMatch,
        hasMatchedDescendant: childEntries.length > 0,
      });
      if (expanded) {
        acc.push(...childEntries);
      }
    });
    return acc;
  }

  function findRowEntryLocal(rows, rowId, depth = 0, parentId = null) {
    for (const row of rows) {
      const id = getRowId(row);
      if (id === rowId) {
        return { row, depth, parentId };
      }
      const children = getChildren(row);
      if (children.length) {
        const found = findRowEntryLocal(children, rowId, depth + 1, id);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  function initializeExpandedState() {
    const explicit = new Set((currentOptions.expandedRowIds || []).map(String));
    if (explicit.size) {
      return explicit;
    }
    if (!currentOptions.defaultExpanded) {
      return new Set();
    }
    const ids = [];
    walkTree(currentRows, (row) => {
      if (hasChildrenRow(row)) {
        ids.push(getRowId(row));
      }
    });
    return new Set(ids);
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    rowEvents.clear();
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: `ui-tree-grid${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className || ""}`.trim(),
      attrs: {
        role: "treegrid",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    tableWrap = createElement("div", { className: "ui-tree-grid-table-wrap" });
    table = createElement("table", { className: "ui-tree-grid-table" });
    const colgroup = createElement("colgroup");
    const thead = createElement("thead");
    const headRow = createElement("tr");
    tableColMap = new Map();

    currentOptions.columns.forEach((column) => {
      const key = String(column.key || "");
      const widthValue = resolveColumnWidth(column, columnWidths);
      const col = createElement("col");
      if (widthValue) {
        col.style.width = widthValue;
      }
      tableColMap.set(key, col);
      colgroup.appendChild(col);

      const th = createElement("th", {
        className: "ui-tree-grid-col",
        text: String(column.label || key),
        attrs: { scope: "col" },
      });
      if (widthValue) {
        th.style.width = widthValue;
      }
      if (currentOptions.enableColumnResize && column.resizable !== false) {
        const handle = createElement("span", {
          className: "ui-tree-grid-resize-handle",
          attrs: { role: "separator", "aria-orientation": "vertical" },
        });
        th.appendChild(handle);
        events.on(handle, "mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          beginResize(event, column, col, th);
        });
        events.on(handle, "click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
      }
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.append(colgroup, thead);
    tbody = createElement("tbody");
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);
    container.appendChild(root);
    events.on(tableWrap, "scroll", () => {
      if (!virtualState.enabled) {
        return;
      }
      if (renderFrame != null) {
        cancelAnimationFrame(renderFrame);
      }
      renderFrame = requestAnimationFrame(() => {
        renderFrame = null;
        renderVirtualRows();
      });
    });
    syncTableWidth();
    renderRows();
  }

  function renderRows() {
    if (!tbody) {
      return;
    }
    rowEvents.clear();
    clearNode(tbody);
    const searchState = getSearchState();
    visibleRows = searchState.active
      ? filterAndFlattenRows(currentRows, searchState)
      : flattenRows(currentRows, expandedRowIds);
    searchSummary = {
      active: searchState.active,
      term: searchState.term,
      matchCount: searchState.active
        ? visibleRows.filter((entry) => entry.selfMatch).length
        : visibleRows.length,
      visibleCount: visibleRows.length,
    };

    if (!visibleRows.length) {
      virtualState.enabled = false;
      virtualState.lastRenderedStart = -1;
      virtualState.lastRenderedEnd = -1;
      const tr = createElement("tr", { className: "ui-tree-grid-state-row" });
      const td = createElement("td", {
        className: "ui-tree-grid-state-cell",
        text: searchState.active ? currentOptions.emptySearchText : currentOptions.emptyText,
        attrs: { colspan: String(Math.max(1, currentOptions.columns.length)) },
      });
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    if (!focusedRowId || !visibleRows.some((entry) => entry.id === focusedRowId)) {
      focusedRowId = visibleRows[0]?.id ?? null;
    }

    if (shouldVirtualize(visibleRows.length)) {
      virtualState.enabled = true;
      virtualState.rows = visibleRows;
      virtualState.totalRows = visibleRows.length;
      virtualState.rowHeight = Math.max(24, Number(currentOptions.virtualRowHeight) || 40);
      virtualState.overscan = Math.max(0, Number(currentOptions.virtualOverscan) || 8);
      virtualState.lastRenderedStart = -1;
      virtualState.lastRenderedEnd = -1;
      renderVirtualRows(searchState);
      return;
    }

    virtualState.enabled = false;
    virtualState.lastRenderedStart = -1;
    virtualState.lastRenderedEnd = -1;
    appendVisibleRows(visibleRows, searchState, 0);
  }

  function appendVisibleRows(entries, searchState, offset = 0) {
    entries.forEach((entry, index) => {
      const tr = createElement("tr", {
        className: [
          "ui-tree-grid-row",
          entry.depth > 0 ? "is-child-row" : "is-root-row",
          selectedRowIds.has(entry.id) ? "is-selected" : "",
        ].filter(Boolean).join(" "),
        attrs: {
          role: "row",
          tabindex: focusedRowId === entry.id ? "0" : "-1",
          "aria-level": String(entry.depth + 1),
          "aria-expanded": entry.hasChildren ? String(entry.expanded) : null,
        },
        dataset: {
          rowId: entry.id,
          depth: String(entry.depth),
        },
      });

      rowEvents.on(tr, "click", (event) => {
        setFocusedRow(entry.id);
        handleRowActivation(entry, event);
      });
      rowEvents.on(tr, "keydown", (event) => {
        handleRowKeydown(entry, offset + index, event);
      });
      rowEvents.on(tr, "focus", () => {
        focusedRowId = entry.id;
        syncRowFocus();
      });

      currentOptions.columns.forEach((column) => {
        const key = String(column.key || "");
        const td = createElement("td", {
          className: buildCellClassName(column, entry),
          attrs: { role: "gridcell" },
        });
        if (column.align) {
          td.dataset.align = String(column.align);
        }
        if (isTreeColumn(column)) {
          td.appendChild(renderTreeCell(column, entry, searchState));
        } else {
          td.appendChild(renderStandardCell(column, entry, searchState));
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  function shouldVirtualize(rowCount) {
    if (!currentOptions.enableVirtualization) {
      return false;
    }
    const threshold = Math.max(1, Number(currentOptions.virtualThreshold) || 120);
    return rowCount >= threshold;
  }

  function renderVirtualRows(searchState = getSearchState()) {
    if (!tbody || !tableWrap || !virtualState.enabled) {
      return;
    }
    const totalRows = virtualState.totalRows;
    const rowHeight = virtualState.rowHeight;
    const overscan = virtualState.overscan;
    const viewportHeight = Math.max(1, tableWrap.clientHeight || 1);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
    const scrollTop = Math.max(0, tableWrap.scrollTop || 0);
    const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight));
    const start = Math.max(0, firstVisible - overscan);
    const end = Math.min(totalRows, firstVisible + visibleCount + overscan);

    if (virtualState.lastRenderedStart === start && virtualState.lastRenderedEnd === end) {
      return;
    }

    virtualState.start = start;
    virtualState.end = end;
    virtualState.lastRenderedStart = start;
    virtualState.lastRenderedEnd = end;

    clearNode(tbody);
    rowEvents.clear();

    const topPad = start * rowHeight;
    const bottomPad = Math.max(0, (totalRows - end) * rowHeight);
    if (topPad > 0) {
      tbody.appendChild(buildSpacerRow(topPad));
    }
    appendVisibleRows(virtualState.rows.slice(start, end), searchState, start);
    if (bottomPad > 0) {
      tbody.appendChild(buildSpacerRow(bottomPad));
    }
  }

  function renderTreeCell(column, entry, searchState) {
    const wrap = createElement("div", {
      className: "ui-tree-grid-tree-cell",
      attrs: {
        style: `--ui-tree-grid-depth:${entry.depth};--ui-tree-grid-indent:${Math.max(8, Number(currentOptions.indent) || 18)}px;`,
      },
    });
    const spacer = createElement("span", { className: "ui-tree-grid-tree-spacer", attrs: { "aria-hidden": "true" } });
    wrap.appendChild(spacer);

    if (entry.hasChildren) {
      const toggle = createElement("button", {
        className: `ui-tree-grid-toggle${entry.expanded ? " is-expanded" : ""}${entry.row?._loading ? " is-loading" : ""}${entry.row?._loadError ? " is-error" : ""}`,
        attrs: {
          type: "button",
          "aria-label": entry.expanded ? "Collapse row" : "Expand row",
          title: entry.expanded ? "Collapse" : "Expand",
          "aria-busy": entry.row?._loading ? "true" : null,
          disabled: entry.row?._loading ? "disabled" : null,
        },
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
      });
      rowEvents.on(toggle, "click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await toggleRow(entry.id);
      });
      wrap.appendChild(toggle);
    } else {
      wrap.appendChild(createElement("span", { className: "ui-tree-grid-toggle-placeholder", attrs: { "aria-hidden": "true" } }));
    }

    if (typeof column.icon === "function") {
      const iconValue = column.icon(entry.row, entry);
      if (iconValue) {
        const icon = createElement("span", { className: "ui-tree-grid-tree-icon", attrs: { "aria-hidden": "true" } });
        if (iconValue instanceof HTMLElement) {
          icon.appendChild(iconValue.cloneNode(true));
        } else {
          icon.innerHTML = String(iconValue);
        }
        wrap.appendChild(icon);
      }
    }

    wrap.appendChild(renderHighlightedText(
      `${resolveColumnValue(column, entry)}${entry.row?._loading ? " (loading...)" : ""}${entry.row?._loadError ? " (load failed)" : ""}`,
      "ui-tree-grid-tree-label",
      searchState
    ));

    return wrap;
  }

  function renderStandardCell(column, entry, searchState) {
    const value = entry.row?.[column.key];
    const renderCell =
      typeof column.renderCell === "function"
        ? () => column.renderCell({ row: entry.row, value, key: column.key, column, entry })
        : typeof column.render === "function"
          ? () => column.render(value, entry.row, entry)
          : null;
    const content = renderCell ? renderCell() : resolveColumnValue(column, entry);
    if (isDomNode(content)) {
      return content;
    }
    return renderHighlightedText(content == null ? "" : String(content), "ui-tree-grid-cell-text", searchState);
  }

  function handleRowActivation(entry, event) {
    if (isSelectable()) {
      toggleSelection(entry.id);
    }
    if (typeof currentOptions.onRowClick === "function") {
      currentOptions.onRowClick({
        row: entry.row,
        rowId: entry.id,
        depth: entry.depth,
        entry,
        event,
      });
    }
    renderRows();
  }

  async function handleRowKeydown(entry, index, event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRowAt(index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRowAt(index - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusRowAt(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusRowAt(visibleRows.length - 1);
      return;
    }
    if (event.key === "ArrowRight" && entry.hasChildren && !entry.expanded) {
      event.preventDefault();
      await setExpanded(entry.id, true);
      return;
    }
    if (event.key === "ArrowLeft" && entry.hasChildren && entry.expanded) {
      event.preventDefault();
      setExpanded(entry.id, false);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && entry.hasChildren) {
      event.preventDefault();
      await toggleRow(entry.id);
      return;
    }
  }

  function focusRowAt(index) {
    const safeIndex = Math.max(0, Math.min(visibleRows.length - 1, index));
    const next = visibleRows[safeIndex];
    if (!next) {
      return;
    }
    setFocusedRow(next.id);
    const rowEl = tbody?.querySelector?.(`[data-row-id="${escapeSelector(next.id)}"]`);
    rowEl?.focus();
  }

  function setFocusedRow(rowId) {
    focusedRowId = String(rowId || "");
    syncRowFocus();
  }

  function syncRowFocus() {
    if (!tbody) {
      return;
    }
    tbody.querySelectorAll("[data-row-id]").forEach((row) => {
      row.setAttribute("tabindex", row.getAttribute("data-row-id") === focusedRowId ? "0" : "-1");
    });
  }

  function toggleSelection(rowId) {
    if (!isSelectable()) {
      return;
    }
    const key = String(rowId);
    if (currentOptions.selectable === "single") {
      selectedRowIds = new Set([key]);
    } else if (selectedRowIds.has(key)) {
      selectedRowIds.delete(key);
    } else {
      selectedRowIds.add(key);
    }
    if (typeof currentOptions.onSelectionChange === "function") {
      currentOptions.onSelectionChange({
        selectedRowIds: Array.from(selectedRowIds),
        selectedRows: visibleRows.filter((entry) => selectedRowIds.has(entry.id)).map((entry) => entry.row),
      });
    }
  }

  function isSelectable() {
    return currentOptions.selectable === "single" || currentOptions.selectable === "multi";
  }

  async function loadChildrenRow(rowId, force = false) {
    const key = String(rowId || "");
    const entry = findRowEntryLocal(currentRows, key);
    if (!entry || typeof currentOptions.lazyLoadChildren !== "function") {
      return [];
    }
    const row = entry.row;
    if (!force && !shouldLoadChildren(row)) {
      return Array.isArray(row.children) ? row.children : [];
    }
    row._loading = true;
    row._loadError = null;
    renderRows();
    try {
      const loaded = await currentOptions.lazyLoadChildren(row, api.getState());
      row.children = normalizeRows(Array.isArray(loaded) ? loaded : []);
      row._loaded = true;
      row._loading = false;
      row._loadError = null;
      currentOptions.onLoadChildren?.(row, row.children, api.getState());
      return row.children;
    } catch (error) {
      row._loading = false;
      row._loadError = error;
      return [];
    } finally {
      renderRows();
    }
  }

  async function setExpanded(rowId, expanded, emit = true) {
    const key = String(rowId || "");
    const entry = findRowEntryLocal(currentRows, key);
    if (!entry || !hasChildrenRow(entry.row)) {
      return false;
    }
    if (expanded && shouldLoadChildren(entry.row)) {
      await loadChildrenRow(key, false);
    }
    if (expanded) {
      expandedRowIds.add(key);
    } else {
      expandedRowIds.delete(key);
    }
    renderRows();
    if (emit && typeof currentOptions.onToggle === "function") {
      currentOptions.onToggle({
        row: entry.row,
        rowId: key,
        expanded: Boolean(expanded),
        depth: entry.depth,
      });
    }
    return true;
  }

  async function toggleRow(rowId) {
    const key = String(rowId || "");
    const next = !expandedRowIds.has(key);
    return setExpanded(key, next, true);
  }

  function expandAll() {
    walkTree(currentRows, (row) => {
      if (hasChildrenRow(row)) {
        expandedRowIds.add(getRowId(row));
      }
    });
    renderRows();
  }

  function collapseAll() {
    expandedRowIds.clear();
    renderRows();
  }

  function beginResize(mouseDownEvent, column, colEl, headerCell) {
    const columnKey = String(column.key || "");
    const startX = Number(mouseDownEvent.clientX) || 0;
    const rect = headerCell.getBoundingClientRect();
    const initialWidth = Math.max(20, Math.round(rect.width || parseInt(colEl.style.width, 10) || 120));
    const minWidth = Math.max(32, Number(currentOptions.minColumnWidth) || 72);
    isResizing = true;
    root?.classList.add("is-resizing-cols");

    const onMouseMove = (moveEvent) => {
      const delta = (Number(moveEvent.clientX) || 0) - startX;
      const next = Math.max(minWidth, initialWidth + delta);
      const widthText = `${Math.round(next)}px`;
      colEl.style.width = widthText;
      headerCell.style.width = widthText;
      columnWidths[columnKey] = Math.round(next);
      syncTableWidth();
    };

    const onMouseUp = () => {
      cleanup();
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      isResizing = false;
      root?.classList.remove("is-resizing-cols");
      resizeCleanup = null;
    };

    resizeCleanup = cleanup;
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
  }

  function syncTableWidth() {
    if (!table || !tableColMap.size) {
      return;
    }
    let explicitTotal = 0;
    tableColMap.forEach((colEl) => {
      const width = parseInt(colEl.style.width, 10);
      if (Number.isFinite(width) && width > 0) {
        explicitTotal += width;
      }
    });
    if (explicitTotal > 0) {
      table.style.width = `${explicitTotal}px`;
      table.style.minWidth = `${explicitTotal}px`;
      return;
    }
    table.style.width = "";
    table.style.minWidth = "";
  }

  function getData() {
    return currentRows;
  }

  function getVisibleRows() {
    return visibleRows.map((entry) => ({ ...entry }));
  }

  function getExpandedRowIds() {
    return Array.from(expandedRowIds);
  }

  function setRows(nextRows = []) {
    currentRows = normalizeRows(nextRows);
    renderRows();
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    if (nextOptions.rows) {
      currentRows = normalizeRows(nextOptions.rows);
    }
    if (nextOptions.columnWidths) {
      columnWidths = normalizeColumnWidths({
        ...columnWidths,
        ...(nextOptions.columnWidths || {}),
      });
    }
    if (nextOptions.expandedRowIds) {
      expandedRowIds = new Set((nextOptions.expandedRowIds || []).map(String));
    }
    if (nextOptions.selectedRowIds) {
      selectedRowIds = new Set((nextOptions.selectedRowIds || []).map(String));
    }
    if (Object.prototype.hasOwnProperty.call(nextOptions, "searchTerm")) {
      currentOptions.searchTerm = String(nextOptions.searchTerm || "");
    }
    render();
  }

  function destroy() {
    if (renderFrame != null) {
      cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    if (resizeCleanup) {
      resizeCleanup();
    }
    rowEvents.clear();
    events.clear();
    clearNode(container);
    root = null;
    tableWrap = null;
    table = null;
    tbody = null;
  }

  const api = {
    getData,
    getVisibleRows,
    getExpandedRowIds,
    setExpanded,
    loadChildren: loadChildrenRow,
    async refreshChildren(rowId) {
      const entry = findRowEntryLocal(currentRows, String(rowId || ""));
      if (!entry) {
        return [];
      }
      entry.row._loaded = false;
      return loadChildrenRow(rowId, true);
    },
    toggleRow,
    expandAll,
    collapseAll,
    setRows,
    setSearchTerm(nextSearchTerm = "") {
      currentOptions.searchTerm = String(nextSearchTerm || "");
      renderRows();
    },
    clearSearch() {
      currentOptions.searchTerm = "";
      renderRows();
    },
    update,
    destroy,
    getState() {
      return {
        rows: currentRows,
        visibleRows: getVisibleRows(),
        expandedRowIds: getExpandedRowIds(),
        selectedRowIds: Array.from(selectedRowIds),
        search: { ...searchSummary },
        options: { ...currentOptions },
      };
    },
  };

  render();
  return api;
}

function buildSpacerRow(height) {
  const tr = createElement("tr", { className: "ui-tree-grid-row-spacer", attrs: { "aria-hidden": "true" } });
  const td = createElement("td", { className: "ui-tree-grid-cell-spacer", attrs: { colspan: "999" } });
  const fill = createElement("span", {
    className: "ui-tree-grid-spacer-fill",
    attrs: { style: `height:${Math.max(0, Math.round(height))}px;` },
  });
  td.appendChild(fill);
  tr.appendChild(td);
  return tr;
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeTreeGridRow).filter(Boolean) : [];
}

function normalizeOptions(options) {
  const next = {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
  next.columns = Array.isArray(next.columns) ? next.columns : [];
  next.rows = Array.isArray(next.rows) ? next.rows : [];
  next.expandedRowIds = Array.isArray(next.expandedRowIds) ? next.expandedRowIds : [];
  next.selectedRowIds = Array.isArray(next.selectedRowIds) ? next.selectedRowIds : [];
  next.columnWidths = normalizeColumnWidths(next.columnWidths);
  next.chrome = next.chrome !== false;
  const treeColumns = next.columns.filter((column) => Boolean(column?.tree));
  if (treeColumns.length > 1) {
    console.error("createTreeGrid: only one column may declare tree: true. Using the first declared tree column.");
  }
  if (!treeColumns.length && next.columns.length) {
    next.columns = next.columns.map((column, index) => index === 0 ? { ...column, tree: true } : column);
  }
  return next;
}

function normalizeColumnWidths(widths) {
  return widths && typeof widths === "object" ? { ...widths } : {};
}

function normalizeTreeGridRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  const normalized = { ...row };
  normalized.hasChildren = Object.prototype.hasOwnProperty.call(row, "hasChildren")
    ? Boolean(row.hasChildren)
    : Array.isArray(row.children) && row.children.length > 0;
  normalized.children = Array.isArray(row.children) ? normalizeRows(row.children) : row.children;
  normalized._loaded = Array.isArray(normalized.children) ? normalized.children.length > 0 : Boolean(row._loaded);
  normalized._loading = Boolean(row._loading);
  normalized._loadError = row._loadError || null;
  return normalized;
}

function resolveColumnWidth(column, widths) {
  const key = String(column?.key || "");
  if (key && Number.isFinite(Number(widths?.[key])) && Number(widths[key]) > 0) {
    return `${Math.round(Number(widths[key]))}px`;
  }
  if (column?.width == null) {
    return "";
  }
  const widthValue = String(column.width).trim();
  return widthValue || "";
}

function resolveColumnValue(column, entry) {
  if (typeof column?.label === "function" && column.tree) {
    return column.label(entry.row, entry);
  }
  const value = entry.row?.[column.key];
  return value == null ? "" : value;
}

function renderHighlightedText(text, className, searchState) {
  const value = String(text || "");
  if (!searchState?.active || !searchState?.highlightMatches || !searchState.term) {
    return createElement("span", {
      className,
      text: value,
    });
  }
  const lower = value.toLowerCase();
  const needle = searchState.term;
  let cursor = 0;
  let found = false;
  const wrap = createElement("span", { className });
  while (cursor < value.length) {
    const index = lower.indexOf(needle, cursor);
    if (index < 0) {
      const tail = value.slice(cursor);
      if (tail) {
        wrap.appendChild(document.createTextNode(tail));
      }
      break;
    }
    found = true;
    const before = value.slice(cursor, index);
    const match = value.slice(index, index + needle.length);
    if (before) {
      wrap.appendChild(document.createTextNode(before));
    }
    wrap.appendChild(createElement("mark", {
      className: "ui-tree-grid-match",
      text: match,
    }));
    cursor = index + needle.length;
  }
  if (!found) {
    return createElement("span", {
      className,
      text: value,
    });
  }
  return wrap;
}

function buildCellClassName(column, entry) {
  const wrap = typeof column?.wrap === "boolean" ? column.wrap : false;
  return [
    "ui-tree-grid-cell",
    wrap ? "is-wrap" : "is-nowrap",
    isTreeColumn(column) ? "is-tree-cell" : "",
    entry.depth > 0 ? "is-depth-child" : "",
    column?.className || "",
  ].filter(Boolean).join(" ");
}

function isTreeColumn(column) {
  return Boolean(column?.tree);
}

function isDomNode(value) {
  return Boolean(value && typeof value === "object" && typeof value.nodeType === "number");
}

function escapeSelector(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value));
  }
  return String(value).replace(/"/g, '\\"');
}

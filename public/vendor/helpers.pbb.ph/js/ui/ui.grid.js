import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  mode: "local", // local | remote
  columns: [],
  rowKey: "id",
  selectable: "none", // none | single | multi
  selectedKeys: [],
  enableSort: undefined,
  enableSearch: undefined,
  enablePagination: undefined,
  enableColumnResize: false,
  enableVirtualization: false,
  virtualRowHeight: 40,
  virtualOverscan: 8,
  virtualThreshold: 80,
  minColumnWidth: 72,
  columnWidths: {},
  chrome: true,
  wrapCellContent: true,
  searchPlaceholder: "Search...",
  search: "",
  filters: {},
  sortBy: "",
  sortDir: "", // asc | desc | ""
  page: 1,
  pageSize: 10,
  pageSizeOptions: [10, 20, 50],
  totalRows: null,
  emptyText: "No data available.",
  loading: false,
  errorText: "",
  onRowClick: null,
  onSelectionChange: null,
  onQueryChange: null,
  onColumnResize: null,
  toolbarStart: null,
  toolbarEnd: null,
};

export function createGrid(container, rows = [], options = {}) {
  const events = createEventBag();
  const rowEvents = createEventBag();
  let currentRows = normalizeRows(rows);
  let currentOptions = normalizeOptions(options);

  let root = null;
  let tableEl = null;
  let tableWrapEl = null;
  let searchInput = null;
  let tableBody = null;
  let pageInfo = null;
  let prevButton = null;
  let nextButton = null;
  let pageSizeSelect = null;
  let tableColMap = new Map();
  let isResizing = false;
  let activeResizeCleanup = null;
  let suppressSortUntil = 0;
  let renderFrame = null;
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

  let query = {
    search: currentOptions.search || "",
    filters: currentOptions.filters || {},
    sortBy: currentOptions.sortBy || "",
    sortDir: currentOptions.sortDir || "",
    page: Math.max(1, Number(currentOptions.page) || 1),
    pageSize: Math.max(1, Number(currentOptions.pageSize) || 10),
  };

  let selectedKeys = new Set((currentOptions.selectedKeys || []).map(String));
  let columnWidths = normalizeColumnWidths(currentOptions.columnWidths);

  function isSearchEnabled() {
    return Boolean(currentOptions.enableSearch);
  }

  function isSortEnabled() {
    return Boolean(currentOptions.enableSort);
  }

  function isPaginationEnabled() {
    return Boolean(currentOptions.enablePagination);
  }

  function isSelectable() {
    return currentOptions.selectable === "single" || currentOptions.selectable === "multi";
  }

  function isSingleSelect() {
    return currentOptions.selectable === "single";
  }

  function isRemoteMode() {
    return String(currentOptions.mode).toLowerCase() === "remote";
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    rowEvents.clear();
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: `ui-grid${currentOptions.chrome ? "" : " is-chrome-less"} ${currentOptions.className}`.trim(),
      attrs: { "data-mode": currentOptions.mode },
    });

    const toolbar = createElement("div", { className: "ui-grid-toolbar" });
    const leftTools = createElement("div", { className: "ui-grid-tools-left" });
    const rightTools = createElement("div", { className: "ui-grid-tools-right" });

    if (isSearchEnabled()) {
      searchInput = createElement("input", {
        className: "ui-input ui-grid-search",
        attrs: {
          type: "text",
          placeholder: currentOptions.searchPlaceholder,
          value: query.search,
        },
      });
      leftTools.appendChild(searchInput);
      events.on(searchInput, "input", () => {
        query.search = searchInput.value || "";
        query.page = 1;
        onQueryUpdated();
      });
    }

    if (isPaginationEnabled()) {
      pageSizeSelect = createElement("select", { className: "ui-grid-pagesize" });
      (currentOptions.pageSizeOptions || [10, 20, 50]).forEach((value) => {
        const option = createElement("option", {
          text: String(value),
          attrs: { value: String(value) },
        });
        if (Number(value) === Number(query.pageSize)) {
          option.selected = true;
        }
        pageSizeSelect.appendChild(option);
      });
      rightTools.appendChild(pageSizeSelect);
      events.on(pageSizeSelect, "change", () => {
        query.pageSize = Math.max(1, Number(pageSizeSelect.value) || query.pageSize);
        query.page = 1;
        onQueryUpdated();
      });
    }

    appendToolbarContent(leftTools, currentOptions.toolbarStart, "start");
    appendToolbarContent(rightTools, currentOptions.toolbarEnd, "end");

    if (leftTools.children.length) {
      toolbar.appendChild(leftTools);
    }
    if (rightTools.children.length) {
      toolbar.appendChild(rightTools);
    }
    if (toolbar.children.length) {
      root.appendChild(toolbar);
    }

    const tableWrap = createElement("div", { className: "ui-grid-table-wrap" });
    tableWrapEl = tableWrap;
    const table = createElement("table", { className: "ui-grid-table" });
    tableEl = table;
    const colgroup = createElement("colgroup");
    const thead = createElement("thead");
    const headRow = createElement("tr");
    tableColMap = new Map();

    if (isSelectable()) {
      const selectCol = createElement("col");
      selectCol.style.width = "34px";
      colgroup.appendChild(selectCol);
      headRow.appendChild(createElement("th", { className: "ui-grid-col-select" }));
    }

    currentOptions.columns.forEach((column) => {
      const sortable = isSortEnabled() && Boolean(column.sortable !== false);
      const colEl = createElement("col");
      const widthValue = resolveColumnWidth(column, columnWidths);
      if (widthValue) {
        colEl.style.width = widthValue;
      }
      tableColMap.set(String(column.key), colEl);
      colgroup.appendChild(colEl);

      const th = createElement("th", {
        className: `ui-grid-col ${sortable ? "is-sortable" : ""}`.trim(),
        text: String(column.label || column.key || ""),
      });
      if (widthValue) {
        th.style.width = widthValue;
      }
      if (query.sortBy === column.key) {
        th.dataset.sortDir = query.sortDir || "";
      }
      if (sortable) {
        const caret = createElement("span", {
          className: "ui-grid-sort-indicator",
          text: getSortSymbol(query.sortBy === column.key ? query.sortDir : ""),
        });
        th.appendChild(caret);
        events.on(th, "click", () => {
          if (Date.now() < suppressSortUntil) {
            return;
          }
          if (query.sortBy !== column.key) {
            query.sortBy = column.key;
            query.sortDir = "asc";
          } else if (query.sortDir === "asc") {
            query.sortDir = "desc";
          } else if (query.sortDir === "desc") {
            query.sortDir = "";
            query.sortBy = "";
          } else {
            query.sortDir = "asc";
          }
          query.page = 1;
          onQueryUpdated();
        });
      }
      if (currentOptions.enableColumnResize && column.resizable !== false) {
        const handle = createElement("span", {
          className: "ui-grid-resize-handle",
          attrs: { role: "separator", "aria-orientation": "vertical" },
        });
        th.appendChild(handle);
        events.on(handle, "mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          beginResize(event, column, colEl, th);
        });
        events.on(handle, "click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
      }
      headRow.appendChild(th);
    });
    table.appendChild(colgroup);
    thead.appendChild(headRow);
    table.appendChild(thead);

    tableBody = createElement("tbody");
    table.appendChild(tableBody);
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);

    if (isPaginationEnabled()) {
      const footer = createElement("div", { className: "ui-grid-footer" });
      pageInfo = createElement("p", { className: "ui-grid-pageinfo" });
      const controls = createElement("div", { className: "ui-grid-pager" });
      prevButton = createElement("button", {
        className: "ui-button",
        text: "Prev",
        attrs: { type: "button" },
      });
      nextButton = createElement("button", {
        className: "ui-button",
        text: "Next",
        attrs: { type: "button" },
      });
      controls.append(prevButton, nextButton);
      footer.append(pageInfo, controls);
      root.appendChild(footer);

      events.on(prevButton, "click", () => {
        if (query.page > 1) {
          query.page -= 1;
          onQueryUpdated();
        }
      });
      events.on(nextButton, "click", () => {
        query.page += 1;
        onQueryUpdated();
      });
    }

    container.appendChild(root);
    events.on(tableWrapEl, "scroll", () => {
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

  function onQueryUpdated() {
    const shouldRestoreSearchFocus = document.activeElement === searchInput;
    const selectionStart = shouldRestoreSearchFocus ? searchInput.selectionStart : null;
    const selectionEnd = shouldRestoreSearchFocus ? searchInput.selectionEnd : null;
    if (isRemoteMode()) {
      currentOptions.onQueryChange?.(getQuery());
    }
    render();
    if (shouldRestoreSearchFocus && searchInput) {
      searchInput.focus();
      if (selectionStart != null && selectionEnd != null) {
        try {
          searchInput.setSelectionRange(selectionStart, selectionEnd);
        } catch (error) {
          // Ignore selection restore failures for unsupported input states.
        }
      }
    }
  }

  function beginResize(mouseDownEvent, column, colEl, headerCell) {
    const columnKey = String(column.key || "");
    const startX = Number(mouseDownEvent.clientX) || 0;
    const rect = headerCell.getBoundingClientRect();
    const initialWidth = Math.max(20, Math.round(rect.width || parseInt(colEl.style.width, 10) || 120));
    const minWidth = Math.max(32, Number(currentOptions.minColumnWidth) || 72);
    isResizing = true;
    root?.classList.add("is-resizing-cols");
    let hasMoved = false;

    const onMouseMove = (moveEvent) => {
      const delta = (Number(moveEvent.clientX) || 0) - startX;
      if (Math.abs(delta) > 2) {
        hasMoved = true;
      }
      const next = Math.max(minWidth, initialWidth + delta);
      const widthText = `${Math.round(next)}px`;
      colEl.style.width = widthText;
      headerCell.style.width = widthText;
      columnWidths[columnKey] = Math.round(next);
      syncTableWidth();
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      isResizing = false;
      root?.classList.remove("is-resizing-cols");
      activeResizeCleanup = null;
      if (hasMoved) {
        suppressSortUntil = Date.now() + 220;
      }
      currentOptions.onColumnResize?.({
        key: columnKey,
        width: columnWidths[columnKey],
        columnWidths: { ...columnWidths },
      });
    };

    activeResizeCleanup = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      isResizing = false;
      root?.classList.remove("is-resizing-cols");
      activeResizeCleanup = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function syncTableWidth() {
    if (!tableEl) {
      return;
    }
    let total = isSelectable() ? 34 : 0;
    currentOptions.columns.forEach((column) => {
      const key = String(column.key || "");
      const colEl = tableColMap.get(key);
      const fromMap = Number(columnWidths[key]);
      if (Number.isFinite(fromMap) && fromMap > 0) {
        total += fromMap;
        return;
      }
      const widthText = colEl?.style?.width || "";
      const parsed = parseFloat(widthText);
      if (Number.isFinite(parsed) && parsed > 0) {
        total += parsed;
        return;
      }
      const fallback = parseFloat(String(column.width || ""));
      total += Number.isFinite(fallback) && fallback > 0 ? fallback : 160;
    });
    const safeTotal = Math.max(320, Math.round(total));
    tableEl.style.width = `${safeTotal}px`;
    tableEl.style.minWidth = `${safeTotal}px`;
  }

  function renderRows() {
    if (!tableBody) {
      return;
    }
    rowEvents.clear();
    clearNode(tableBody);

    if (currentOptions.loading) {
      tableBody.appendChild(buildStateRow("Loading..."));
      updatePagerMeta(0, 0, 0);
      return;
    }
    if (currentOptions.errorText) {
      tableBody.appendChild(buildStateRow(String(currentOptions.errorText)));
      updatePagerMeta(0, 0, 0);
      return;
    }

    const display = isRemoteMode() ? getRemoteRows() : getLocalRows();
    const rowsToRender = display.rows;
    const totalRows = display.totalRows;
    const totalPages = Math.max(1, Math.ceil(totalRows / query.pageSize));
    const safePage = Math.max(1, Math.min(query.page, totalPages));
    if (safePage !== query.page) {
      query.page = safePage;
    }

    if (!rowsToRender.length) {
      virtualState.enabled = false;
      virtualState.lastRenderedStart = -1;
      virtualState.lastRenderedEnd = -1;
      tableBody.appendChild(buildStateRow(currentOptions.emptyText));
      updatePagerMeta(totalRows, totalPages, safePage);
      return;
    }

    if (shouldVirtualize(rowsToRender.length)) {
      virtualState.enabled = true;
      virtualState.rows = rowsToRender;
      virtualState.totalRows = rowsToRender.length;
      virtualState.rowHeight = Math.max(24, Number(currentOptions.virtualRowHeight) || 40);
      virtualState.overscan = Math.max(0, Number(currentOptions.virtualOverscan) || 8);
      virtualState.lastRenderedStart = -1;
      virtualState.lastRenderedEnd = -1;
      renderVirtualRows();
    } else {
      virtualState.enabled = false;
      virtualState.lastRenderedStart = -1;
      virtualState.lastRenderedEnd = -1;
      rowsToRender.forEach((row, index) => {
        tableBody.appendChild(buildDataRow(row, index));
      });
    }

    updatePagerMeta(totalRows, totalPages, safePage);
  }

  function shouldVirtualize(rowCount) {
    if (!currentOptions.enableVirtualization) {
      return false;
    }
    const threshold = Math.max(1, Number(currentOptions.virtualThreshold) || 80);
    return rowCount >= threshold;
  }

  function renderVirtualRows() {
    if (!tableBody || !tableWrapEl || !virtualState.enabled) {
      return;
    }
    const totalRows = virtualState.totalRows;
    const rowHeight = virtualState.rowHeight;
    const overscan = virtualState.overscan;
    const viewportHeight = Math.max(1, tableWrapEl.clientHeight || 1);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
    const scrollTop = Math.max(0, tableWrapEl.scrollTop || 0);
    const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight));
    const start = Math.max(0, firstVisible - overscan);
    const end = Math.min(totalRows, firstVisible + visibleCount + overscan);
    if (start === virtualState.lastRenderedStart && end === virtualState.lastRenderedEnd) {
      return;
    }
    virtualState.start = start;
    virtualState.end = end;
    virtualState.lastRenderedStart = start;
    virtualState.lastRenderedEnd = end;
    rowEvents.clear();
    clearNode(tableBody);

    const topHeight = start * rowHeight;
    const bottomHeight = Math.max(0, (totalRows - end) * rowHeight);

    if (topHeight > 0) {
      tableBody.appendChild(buildSpacerRow(topHeight));
    }
    for (let index = start; index < end; index += 1) {
      const row = virtualState.rows[index];
      tableBody.appendChild(buildDataRow(row, index));
    }
    if (bottomHeight > 0) {
      tableBody.appendChild(buildSpacerRow(bottomHeight));
    }
  }

  function buildSpacerRow(height) {
    const tr = createElement("tr", { className: "ui-grid-row-spacer" });
    const td = createElement("td", {
      className: "ui-grid-cell-spacer",
      attrs: { colspan: String(currentOptions.columns.length + (isSelectable() ? 1 : 0)) },
    });
    const filler = createElement("div", { className: "ui-grid-spacer-fill" });
    filler.style.height = `${Math.max(0, Math.round(height))}px`;
    td.appendChild(filler);
    tr.appendChild(td);
    return tr;
  }

  function buildDataRow(row, index) {
    const tr = createElement("tr", { className: "ui-grid-row" });
    const rowKey = getRowKey(row, index, currentOptions.rowKey);
    const selected = selectedKeys.has(String(rowKey));
    tr.dataset.rowKey = String(rowKey);
    tr.classList.toggle("is-selected", selected);

    if (isSelectable()) {
      const cell = createElement("td", { className: "ui-grid-col-select" });
      const checkbox = createElement("input", {
        attrs: {
          type: isSingleSelect() ? "radio" : "checkbox",
          name: "ui-grid-select",
        },
      });
      checkbox.checked = selected;
      rowEvents.on(checkbox, "change", () => {
        toggleSelection(rowKey, checkbox.checked);
      });
      cell.appendChild(checkbox);
      tr.appendChild(cell);
    }

    currentOptions.columns.forEach((column) => {
      const wrapEnabled = resolveCellWrap(currentOptions.wrapCellContent, column);
      const td = createElement("td", {
        className: `ui-grid-cell ${wrapEnabled ? "is-wrap" : "is-nowrap"}`.trim(),
      });
      if (column.align) {
        td.style.textAlign = String(column.align);
      }
      const value = row?.[column.key];
      let content = value;
      if (typeof column.format === "function") {
        content = column.format(value, row);
      }
      const renderCell =
        typeof column.renderCell === "function"
          ? () => column.renderCell({ row, value, key: column.key, column, index })
          : typeof column.render === "function"
            ? () => column.render(value, row, { row, value, key: column.key, column, index })
            : null;
      if (renderCell) {
        const rendered = renderCell();
        if (isDomNode(rendered)) {
          td.appendChild(rendered);
        } else {
          td.textContent = rendered == null ? "" : String(rendered);
        }
      } else {
        td.textContent = content == null ? "" : String(content);
        if (!wrapEnabled && td.textContent) {
          td.title = td.textContent;
        }
      }
      tr.appendChild(td);
    });

    rowEvents.on(tr, "click", (event) => {
      if (isResizing) {
        return;
      }
      if (event.target && event.target.closest("input")) {
        return;
      }
      currentOptions.onRowClick?.(row, { rowKey, index });
    });
    return tr;
  }

  function toggleSelection(rowKey, checked) {
    const key = String(rowKey);
    if (isSingleSelect()) {
      selectedKeys.clear();
      if (checked) {
        selectedKeys.add(key);
      }
    } else {
      if (checked) {
        selectedKeys.add(key);
      } else {
        selectedKeys.delete(key);
      }
    }
    currentOptions.onSelectionChange?.(getSelectedRows(), Array.from(selectedKeys));
    renderRows();
  }

  function getLocalRows() {
    let next = [...currentRows];
    if (isSearchEnabled() && query.search) {
      const needle = String(query.search).toLowerCase();
      next = next.filter((row) =>
        currentOptions.columns.some((column) =>
          String(row?.[column.key] ?? "").toLowerCase().includes(needle)
        )
      );
    }
    if (isSortEnabled() && query.sortBy && query.sortDir) {
      const key = query.sortBy;
      const dir = query.sortDir === "desc" ? -1 : 1;
      next.sort((a, b) => compareValues(a?.[key], b?.[key]) * dir);
    }
    const totalRows = next.length;
    if (isPaginationEnabled()) {
      const start = (Math.max(1, query.page) - 1) * query.pageSize;
      next = next.slice(start, start + query.pageSize);
    }
    return { rows: next, totalRows };
  }

  function getRemoteRows() {
    const totalRows = Math.max(0, Number(currentOptions.totalRows) || currentRows.length);
    return { rows: currentRows, totalRows };
  }

  function updatePagerMeta(totalRows, totalPages, page) {
    if (!pageInfo || !prevButton || !nextButton) {
      return;
    }
    pageInfo.textContent = `Page ${page} of ${totalPages} · ${totalRows} row(s)`;
    prevButton.disabled = page <= 1;
    nextButton.disabled = page >= totalPages;
  }

  function buildStateRow(text) {
    const tr = createElement("tr");
    const td = createElement("td", {
      className: "ui-grid-state-cell",
      text: text || currentOptions.emptyText,
      attrs: { colspan: String(currentOptions.columns.length + (isSelectable() ? 1 : 0)) },
    });
    tr.appendChild(td);
    return tr;
  }

  function update(nextRows = [], nextOptions = {}) {
    currentRows = normalizeRows(nextRows);
    currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
    columnWidths = normalizeColumnWidths({
      ...columnWidths,
      ...(currentOptions.columnWidths || {}),
    });
    query = {
      search: currentOptions.search ?? query.search ?? "",
      filters: currentOptions.filters ?? query.filters ?? {},
      sortBy: currentOptions.sortBy ?? query.sortBy ?? "",
      sortDir: currentOptions.sortDir ?? query.sortDir ?? "",
      page: Math.max(1, Number(currentOptions.page ?? query.page ?? 1)),
      pageSize: Math.max(1, Number(currentOptions.pageSize ?? query.pageSize ?? 10)),
    };
    selectedKeys = new Set((currentOptions.selectedKeys || Array.from(selectedKeys)).map(String));
    render();
  }

  function setRows(nextRows = []) {
    update(nextRows, {});
  }

  function setQuery(nextQuery = {}) {
    query = {
      ...query,
      ...nextQuery,
      page: Math.max(1, Number(nextQuery.page ?? query.page ?? 1)),
      pageSize: Math.max(1, Number(nextQuery.pageSize ?? query.pageSize ?? 10)),
    };
    render();
  }

  function getQuery() {
    return { ...query, filters: { ...(query.filters || {}) } };
  }

  function getSelectedRows() {
    if (!selectedKeys.size) {
      return [];
    }
    const keys = new Set(Array.from(selectedKeys));
    return currentRows.filter((row, index) => keys.has(String(getRowKey(row, index, currentOptions.rowKey))));
  }

  function clearSelection() {
    selectedKeys.clear();
    renderRows();
  }

  function getState() {
    return {
      mode: currentOptions.mode,
      query: getQuery(),
      selectedKeys: Array.from(selectedKeys),
      rows: [...currentRows],
      options: { ...currentOptions },
      columnWidths: { ...columnWidths },
    };
  }

  function appendToolbarContent(host, source, placement) {
    const nodes = normalizeToolbarContent(source, placement);
    nodes.forEach((node) => host.appendChild(node));
  }

  function normalizeToolbarContent(source, placement) {
    let value = source;
    if (typeof value === "function") {
      const display = isRemoteMode() ? getRemoteRows() : getLocalRows();
      value = value({
        placement,
        query: getQuery(),
        selectedKeys: Array.from(selectedKeys),
        selectedRows: getSelectedRows(),
        rowCount: currentRows.length,
        visibleRows: [...display.rows],
        totalRows: display.totalRows,
        options: { ...currentOptions },
        createElement,
      });
    }
    return normalizeToolbarValue(value, placement);
  }

  function destroy() {
    if (renderFrame != null) {
      cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    if (activeResizeCleanup) {
      activeResizeCleanup();
    }
    rowEvents.clear();
    events.clear();
    clearNode(container);
    root = null;
    tableEl = null;
    tableWrapEl = null;
    searchInput = null;
    tableBody = null;
    pageInfo = null;
    prevButton = null;
    nextButton = null;
    pageSizeSelect = null;
  }

  render();

  return {
    destroy,
    update,
    setRows,
    setQuery,
    getQuery,
    getSelectedRows,
    clearSelection,
    getState,
  };
}

function normalizeToolbarValue(value, placement) {
  if (value == null || value === false) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeToolbarValue(item, placement));
  }
  if (isDomNode(value)) {
    return [wrapToolbarNode(value, placement)];
  }
  return [wrapToolbarText(value, placement)];
}

function wrapToolbarNode(node, placement) {
  const wrap = createElement("div", {
    className: `ui-grid-toolbar-slot is-${placement}`.trim(),
  });
  wrap.appendChild(node);
  return wrap;
}

function wrapToolbarText(value, placement) {
  return createElement("div", {
    className: `ui-grid-toolbar-slot is-${placement}`.trim(),
    text: String(value),
  });
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function normalizeOptions(options) {
  const next = {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
  next.chrome = next.chrome !== false;
  if (next.enableSort === undefined) {
    next.enableSort = next.mode === "local";
  }
  if (next.enableSearch === undefined) {
    next.enableSearch = next.mode === "local";
  }
  if (next.enablePagination === undefined) {
    next.enablePagination = next.mode === "local";
  }
  next.columns = Array.isArray(next.columns) ? next.columns : [];
  return next;
}

function normalizeColumnWidths(input) {
  const next = {};
  if (!input || typeof input !== "object") {
    return next;
  }
  Object.keys(input).forEach((key) => {
    const value = input[key];
    const width = Number(value);
    if (Number.isFinite(width) && width > 0) {
      next[key] = Math.round(width);
    }
  });
  return next;
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
  if (!widthValue) {
    return "";
  }
  return widthValue;
}

function resolveCellWrap(defaultWrap, column) {
  if (typeof column?.wrap === "boolean") {
    return column.wrap;
  }
  return Boolean(defaultWrap);
}

function compareValues(a, b) {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return -1;
  }
  if (b == null) {
    return 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function getSortSymbol(dir) {
  if (dir === "asc") {
    return " ↑";
  }
  if (dir === "desc") {
    return " ↓";
  }
  return "";
}

function getRowKey(row, index, rowKeyOption) {
  if (!row || typeof row !== "object") {
    return index;
  }
  if (typeof rowKeyOption === "function") {
    return rowKeyOption(row, index);
  }
  if (typeof rowKeyOption === "string" && rowKeyOption) {
    return row[rowKeyOption] ?? index;
  }
  return row.id ?? row.key ?? index;
}

function isDomNode(value) {
  return Boolean(value && typeof value === "object" && typeof value.nodeType === "number");
}

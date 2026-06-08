import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Tree Select",
  placeholder: "Select...",
  emptyText: "No options found.",
  searchable: true,
  closeOnSelect: true,
  selectOnTab: false,
  clearable: true,
  defaultExpanded: false,
  selected: null,
  onChange: null,
};

export function createTreeSelect(container, items = [], options = {}) {
  const events = createEventBag();
  const globalEvents = createEventBag();
  let currentOptions = normalizeOptions(options);
  let normalized = normalizeNodes(items, currentOptions);
  let search = "";
  let open = false;
  let selected = normalizeSelected(currentOptions.selected);
  let root = null;
  let trigger = null;
  let menu = null;
  let searchInput = null;
  let list = null;
  let menuMount = null;
  let activeIndex = -1;
  const listId = `ui-tree-select-list-${Math.random().toString(36).slice(2, 10)}`;

  ensureSelectionIntegrity();
  expandAncestors(selected);

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    detachMenu();
    clearNode(container);

    root = createElement("div", {
      className: `ui-tree-select ${currentOptions.className || ""}`.trim(),
    });
    trigger = createElement("button", {
      className: "ui-tree-select-trigger",
      attrs: {
        type: "button",
        "aria-haspopup": "tree",
        "aria-expanded": open ? "true" : "false",
        "aria-label": currentOptions.ariaLabel,
        "aria-controls": open ? listId : null,
      },
    });

    trigger.appendChild(createElement("span", {
      className: "ui-tree-select-value",
      text: getDisplayValue(),
    }));
    trigger.appendChild(createElement("span", {
      className: "ui-tree-select-caret",
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    }));

    if (currentOptions.clearable && selected) {
      const clear = createElement("button", {
        className: "ui-tree-select-clear",
        attrs: { type: "button", "aria-label": "Clear selection", title: "Clear selection" },
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      });
      events.on(clear, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selected = null;
        emitChange();
        render();
      });
      trigger.appendChild(clear);
    }

    events.on(trigger, "click", () => {
      if (open) {
        closeMenu();
      } else {
        openMenu();
      }
    });
    events.on(trigger, "keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!open) {
          openMenu();
          return;
        }
        moveActive(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (!open) {
          openMenu();
        } else {
          activateActiveEntry();
        }
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        closeMenu();
      }
    });
    root.appendChild(trigger);
    container.appendChild(root);

    if (open) {
      menu = createElement("div", { className: "ui-tree-select-menu" });
      if (currentOptions.searchable) {
        searchInput = createElement("input", {
          className: "ui-input ui-tree-select-search",
          attrs: {
            type: "text",
            placeholder: "Search...",
            "aria-controls": listId,
          },
        });
        searchInput.value = search;
        events.on(searchInput, "input", () => {
          search = searchInput.value || "";
          if (activeIndex < 0) {
            activeIndex = 0;
          }
          clampActiveIndex();
          renderList();
        });
        events.on(searchInput, "keydown", handleMenuKeydown);
        menu.appendChild(searchInput);
      }
      list = createElement("div", {
        className: "ui-tree-select-list",
        attrs: { role: "tree", id: listId, "aria-label": currentOptions.ariaLabel },
      });
      menu.appendChild(list);
      mountMenu();
      renderList();
      if (currentOptions.searchable && searchInput) {
        searchInput.focus();
      } else {
        trigger.focus();
      }
    }

    bindGlobal();
  }

  function renderList() {
    if (!list) {
      return;
    }
    clearNode(list);
    const visibleEntries = getVisibleEntries();
    if (!visibleEntries.length) {
      list.appendChild(createElement("p", {
        className: "ui-tree-select-empty",
        text: currentOptions.emptyText,
      }));
      return;
    }
    visibleEntries.forEach((entry, index) => {
      const node = entry.node;
      const hasChildren = node.children.length > 0;
      const isSelected = selected === node.value;
      const isActive = index === activeIndex;
      const row = createElement("div", {
        className: `ui-tree-select-option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}${node.disabled ? " is-disabled" : ""}${!node.selectable ? " is-branch" : ""}`,
        attrs: {
          role: "treeitem",
          id: `${listId}-option-${index}`,
          "aria-level": String(node.depth + 1),
          "aria-selected": node.selectable ? (isSelected ? "true" : "false") : null,
          "aria-expanded": hasChildren ? String(isNodeExpanded(node) || Boolean(entry.searchActive)) : null,
          "aria-disabled": node.disabled ? "true" : null,
        },
      });
      row.dataset.index = String(index);
      row.dataset.value = node.value;
      row.style.setProperty("--tree-select-depth", String(node.depth));

      if (hasChildren) {
        const toggle = createElement("button", {
          className: "ui-tree-select-toggle",
          attrs: {
            type: "button",
            tabindex: "-1",
            "aria-label": `${isNodeExpanded(node) || Boolean(entry.searchActive) ? "Collapse" : "Expand"} ${node.label}`,
          },
          html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
        });
        if (isNodeExpanded(node) || Boolean(entry.searchActive)) {
          toggle.classList.add("is-expanded");
        }
        events.on(toggle, "click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleExpanded(node.value);
        });
        row.appendChild(toggle);
      } else {
        row.appendChild(createElement("span", { className: "ui-tree-select-toggle-spacer" }));
      }

      const content = createElement("span", { className: "ui-tree-select-option-content" });
      const label = createElement("span", {
        className: "ui-tree-select-option-label",
      });
      renderHighlightedLabel(node.label, entry.matched ? search : "").forEach((child) => {
        label.appendChild(child);
      });
      content.appendChild(label);
      if (node.pathLabels.length > 1) {
        content.appendChild(createElement("span", {
          className: "ui-tree-select-option-path",
          text: node.pathLabels.slice(0, -1).join(" / "),
        }));
      }
      row.appendChild(content);

      events.on(row, "click", () => {
        if (node.disabled) {
          return;
        }
        if (node.selectable) {
          setSelected(node.value, { close: currentOptions.closeOnSelect });
          return;
        }
        if (hasChildren) {
          toggleExpanded(node.value);
        }
      });
      events.on(row, "mouseenter", () => {
        activeIndex = index;
        syncActiveOption();
      });
      list.appendChild(row);
    });
    clampActiveIndex();
    syncActiveOption();
  }

  function handleMenuKeydown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const visibleEntries = getVisibleEntries();
      setActiveIndex(visibleEntries.length - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      expandActiveEntry();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      collapseActiveEntry();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateActiveEntry();
      return;
    }
    if (event.key === "Tab" && currentOptions.selectOnTab) {
      activateActiveEntry({ close: true, restoreFocus: false });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  function mountMenu() {
    menuMount = document.body;
    if (!menu || !menuMount) {
      return;
    }
    menuMount.appendChild(menu);
    positionMenu();
  }

  function detachMenu() {
    if (menu?.parentNode) {
      menu.parentNode.removeChild(menu);
    }
    menu = null;
    searchInput = null;
    list = null;
    menuMount = null;
  }

  function positionMenu() {
    if (!menu || !trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 12);
    const spaceAbove = Math.max(0, rect.top - 12);
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxMenuHeight = Math.max(180, Math.min(openUpward ? spaceAbove : spaceBelow, 360));

    menu.style.position = "fixed";
    menu.style.left = `${Math.round(rect.left)}px`;
    menu.style.width = `${Math.round(rect.width)}px`;
    menu.style.maxWidth = `${Math.round(rect.width)}px`;
    menu.style.top = openUpward ? "auto" : `${Math.round(rect.bottom + 6)}px`;
    menu.style.bottom = openUpward ? `${Math.round(viewportHeight - rect.top + 6)}px` : "auto";

    const listNode = menu.querySelector(".ui-tree-select-list");
    if (listNode) {
      listNode.style.maxHeight = `${Math.round(Math.max(112, maxMenuHeight - (currentOptions.searchable ? 52 : 12)))}px`;
    }
  }

  function openMenu() {
    open = true;
    expandAncestors(selected);
    setInitialActiveIndex();
    render();
  }

  function closeMenu({ restoreFocus = true } = {}) {
    open = false;
    render();
    if (restoreFocus) {
      trigger?.focus?.();
    }
  }

  function setInitialActiveIndex() {
    const visibleEntries = getVisibleEntries();
    if (!visibleEntries.length) {
      activeIndex = -1;
      return;
    }
    const selectedIndex = visibleEntries.findIndex((entry) => entry.node.value === selected);
    activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  }

  function clampActiveIndex() {
    const visibleEntries = getVisibleEntries();
    if (!visibleEntries.length) {
      activeIndex = -1;
      return;
    }
    if (activeIndex < 0) {
      activeIndex = 0;
      return;
    }
    if (activeIndex > visibleEntries.length - 1) {
      activeIndex = visibleEntries.length - 1;
    }
  }

  function setActiveIndex(nextIndex) {
    const visibleEntries = getVisibleEntries();
    if (!visibleEntries.length) {
      activeIndex = -1;
      syncActiveOption();
      return;
    }
    activeIndex = Math.max(0, Math.min(visibleEntries.length - 1, Number(nextIndex) || 0));
    syncActiveOption();
  }

  function moveActive(delta) {
    const visibleEntries = getVisibleEntries();
    if (!visibleEntries.length) {
      activeIndex = -1;
      syncActiveOption();
      return;
    }
    if (activeIndex < 0) {
      activeIndex = 0;
    } else {
      activeIndex = (activeIndex + delta + visibleEntries.length) % visibleEntries.length;
    }
    syncActiveOption();
  }

  function activateActiveEntry(config = {}) {
    const visibleEntries = getVisibleEntries();
    if (!visibleEntries.length) {
      return;
    }
    clampActiveIndex();
    const active = visibleEntries[activeIndex];
    if (!active?.node || active.node.disabled) {
      return;
    }
    if (active.node.selectable) {
      const closeAfterSelect = config.close !== undefined ? Boolean(config.close) : Boolean(currentOptions.closeOnSelect);
      const restoreFocus = config.restoreFocus !== undefined ? Boolean(config.restoreFocus) : true;
      setSelected(active.node.value, { close: closeAfterSelect, restoreFocus });
      return;
    }
    if (active.node.children.length) {
      toggleExpanded(active.node.value);
    }
  }

  function expandActiveEntry() {
    const active = getActiveEntry();
    if (!active?.node || !active.node.children.length || search.trim()) {
      return;
    }
    if (!isNodeExpanded(active.node)) {
      normalized.expanded.add(active.node.value);
      render();
    }
  }

  function collapseActiveEntry() {
    const active = getActiveEntry();
    if (!active?.node || search.trim()) {
      return;
    }
    if (active.node.children.length && isNodeExpanded(active.node)) {
      normalized.expanded.delete(active.node.value);
      render();
      return;
    }
    if (active.node.parentValue && normalized.byValue.has(active.node.parentValue)) {
      const parentIndex = getVisibleEntries().findIndex((entry) => entry.node.value === active.node.parentValue);
      if (parentIndex >= 0) {
        activeIndex = parentIndex;
        syncActiveOption();
      }
    }
  }

  function getActiveEntry() {
    const visibleEntries = getVisibleEntries();
    if (!visibleEntries.length || activeIndex < 0 || activeIndex >= visibleEntries.length) {
      return null;
    }
    return visibleEntries[activeIndex] || null;
  }

  function syncActiveOption() {
    if (!list) {
      return;
    }
    const options = Array.from(list.querySelectorAll(".ui-tree-select-option"));
    options.forEach((optionNode) => optionNode.classList.remove("is-active"));
    if (activeIndex < 0 || activeIndex >= options.length) {
      trigger?.removeAttribute("aria-activedescendant");
      searchInput?.removeAttribute("aria-activedescendant");
      return;
    }
    const active = options[activeIndex];
    active?.classList.add("is-active");
    if (active?.id) {
      trigger?.setAttribute("aria-activedescendant", active.id);
      searchInput?.setAttribute("aria-activedescendant", active.id);
    }
    active?.scrollIntoView?.({ block: "nearest" });
  }

  function bindGlobal() {
    globalEvents.clear();
    if (!open) {
      return;
    }
    globalEvents.on(document, "mousedown", (event) => {
      const target = event.target;
      if (target && root && !root.contains(target) && !menu?.contains(target)) {
        open = false;
        render();
      }
    });
    globalEvents.on(window, "resize", () => {
      if (open) {
        positionMenu();
      }
    });
    globalEvents.on(window, "scroll", () => {
      if (open) {
        positionMenu();
      }
    }, true);
    globalEvents.on(document, "keydown", (event) => {
      if (!open) {
        return;
      }
      if (currentOptions.searchable) {
        if ((event.key === "Escape" || event.key === "Tab") && document.activeElement !== searchInput) {
          handleMenuKeydown(event);
        }
        return;
      }
      handleMenuKeydown(event);
    });
  }

  function getDisplayValue() {
    if (!selected) {
      return currentOptions.placeholder;
    }
    const node = normalized.byValue.get(selected);
    if (!node) {
      return currentOptions.placeholder;
    }
    return node.pathLabels.join(" / ");
  }

  function getVisibleEntries() {
    const entries = [];
    const needle = String(search || "").trim().toLowerCase();
    if (!needle) {
      appendVisibleEntries(normalized.roots, entries);
      return entries;
    }
    normalized.roots.forEach((node) => {
      appendSearchEntries(node, entries, needle, false);
    });
    return entries;
  }

  function appendVisibleEntries(nodes, entries) {
    nodes.forEach((node) => {
      entries.push({ node, matched: false, searchActive: false });
      if (node.children.length && isNodeExpanded(node)) {
        appendVisibleEntries(node.children, entries);
      }
    });
  }

  function appendSearchEntries(node, entries, needle, ancestorMatched) {
    const selfMatched = String(node.label || "").toLowerCase().includes(needle);
    const branchMatched = ancestorMatched || selfMatched;
    const childEntries = [];
    node.children.forEach((child) => {
      appendSearchEntries(child, childEntries, needle, branchMatched);
    });
    if (!branchMatched && !childEntries.length) {
      return;
    }
    entries.push({
      node,
      matched: selfMatched,
      searchActive: true,
    });
    childEntries.forEach((entry) => entries.push(entry));
  }

  function toggleExpanded(value) {
    if (search.trim()) {
      return;
    }
    if (normalized.expanded.has(value)) {
      normalized.expanded.delete(value);
    } else {
      normalized.expanded.add(value);
    }
    render();
  }

  function isNodeExpanded(node) {
    return normalized.expanded.has(node.value);
  }

  function setSelected(value, config = {}) {
    const node = value == null ? null : normalized.byValue.get(String(value));
    if (!node || node.disabled || !node.selectable) {
      return;
    }
    selected = node.value;
    expandAncestors(selected);
    emitChange();
    if (config.close) {
      closeMenu({ restoreFocus: config.restoreFocus !== false });
      return;
    }
    render();
  }

  function emitChange() {
    const node = selected ? normalized.byValue.get(selected) || null : null;
    currentOptions.onChange?.(selected, node ? cloneNodeForPublic(node) : null);
  }

  function ensureSelectionIntegrity() {
    if (!selected) {
      return;
    }
    const node = normalized.byValue.get(selected);
    if (!node || node.disabled || !node.selectable) {
      selected = null;
    }
  }

  function expandAncestors(value) {
    if (!value || !normalized.byValue.has(value)) {
      return;
    }
    let current = normalized.byValue.get(value);
    while (current?.parentValue) {
      normalized.expanded.add(current.parentValue);
      current = normalized.byValue.get(current.parentValue) || null;
    }
  }

  function update(nextItems = [], nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    normalized = normalizeNodes(nextItems, currentOptions);
    selected = normalizeSelected(nextOptions.selected ?? selected);
    ensureSelectionIntegrity();
    expandAncestors(selected);
    clampActiveIndex();
    render();
  }

  function setValue(nextValue) {
    const nextSelected = normalizeSelected(nextValue);
    if (nextSelected == null) {
      selected = null;
      emitChange();
      render();
      return;
    }
    const nextNode = normalized.byValue.get(nextSelected);
    if (!nextNode || nextNode.disabled || !nextNode.selectable) {
      return;
    }
    selected = nextNode.value;
    expandAncestors(selected);
    emitChange();
    render();
  }

  function getValue() {
    return selected;
  }

  function getState() {
    return {
      open,
      search,
      selected,
      options: { ...currentOptions },
      visibleItems: getVisibleEntries().map((entry) => ({
        value: entry.node.value,
        label: entry.node.label,
        depth: entry.node.depth,
        selectable: entry.node.selectable,
        disabled: entry.node.disabled,
        pathLabels: [...entry.node.pathLabels],
      })),
      items: normalized.roots.map((node) => cloneNodeForPublic(node)),
    };
  }

  function destroy() {
    globalEvents.clear();
    events.clear();
    detachMenu();
    clearNode(container);
    root = null;
    trigger = null;
    menu = null;
    searchInput = null;
    list = null;
  }

  render();

  return {
    destroy,
    update,
    setValue,
    getValue,
    getState,
  };
}

function normalizeOptions(options) {
  const next = {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
  next.ariaLabel = String(next.ariaLabel || "Tree Select");
  return next;
}

function normalizeNodes(items, options) {
  const expanded = new Set();
  const byValue = new Map();
  const roots = normalizeNodeList(items, {
    depth: 0,
    parentValue: null,
    pathLabels: [],
    expanded,
    byValue,
    defaultExpanded: Boolean(options.defaultExpanded),
  });
  return { roots, expanded, byValue };
}

function normalizeNodeList(items, context) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item, index) => normalizeNode(item, index, context)).filter(Boolean);
}

function normalizeNode(item, index, context) {
  const source = item && typeof item === "object" ? item : { value: String(item), label: String(item) };
  const children = Array.isArray(source.children) ? source.children : [];
  const value = String(source.value ?? source.id ?? `${context.parentValue || "root"}-${index}`);
  const label = String(source.label ?? source.name ?? source.value ?? source.id ?? `Option ${index + 1}`);
  const selectable = source.selectable != null ? Boolean(source.selectable) : children.length === 0;
  const node = {
    value,
    label,
    disabled: Boolean(source.disabled),
    selectable,
    depth: context.depth,
    parentValue: context.parentValue,
    pathLabels: [...context.pathLabels, label],
    meta: source.meta ?? null,
    children: [],
  };
  context.byValue.set(value, node);
  if (children.length) {
    if (context.defaultExpanded || source.expanded === true) {
      context.expanded.add(value);
    }
    node.children = normalizeNodeList(children, {
      depth: context.depth + 1,
      parentValue: value,
      pathLabels: node.pathLabels,
      expanded: context.expanded,
      byValue: context.byValue,
      defaultExpanded: context.defaultExpanded,
    });
  }
  return node;
}

function normalizeSelected(selected) {
  if (selected == null || selected === "") {
    return null;
  }
  return String(selected);
}

function renderHighlightedLabel(label, query) {
  const text = String(label || "");
  const needle = String(query || "").trim();
  if (!needle) {
    return [document.createTextNode(text)];
  }
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const index = lowerText.indexOf(lowerNeedle);
  if (index < 0) {
    return [document.createTextNode(text)];
  }
  const nodes = [];
  if (index > 0) {
    nodes.push(document.createTextNode(text.slice(0, index)));
  }
  nodes.push(createElement("mark", {
    className: "ui-tree-select-match",
    text: text.slice(index, index + needle.length),
  }));
  if (index + needle.length < text.length) {
    nodes.push(document.createTextNode(text.slice(index + needle.length)));
  }
  return nodes;
}

function cloneNodeForPublic(node) {
  return {
    value: node.value,
    label: node.label,
    disabled: node.disabled,
    selectable: node.selectable,
    depth: node.depth,
    parentValue: node.parentValue,
    pathLabels: [...node.pathLabels],
    meta: node.meta,
    children: node.children.map((child) => cloneNodeForPublic(child)),
  };
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Select",
  placeholder: "Select...",
  emptyText: "No options found.",
  searchable: true,
  multiple: false,
  closeOnSelect: true,
  selectOnTab: false,
  clearable: true,
  selected: [],
  onChange: null,
};

export function createSelect(container, items = [], options = {}) {
  const events = createEventBag();
  const globalEvents = createEventBag();
  let currentItems = normalizeItems(items);
  let currentOptions = normalizeOptions(options);
  let search = "";
  let open = false;
  let selected = new Set(normalizeSelected(currentOptions.selected, currentOptions.multiple));
  let root = null;
  let trigger = null;
  let menu = null;
  let searchInput = null;
  let list = null;
  let menuMount = null;
  let activeIndex = -1;
  const listId = `ui-select-list-${Math.random().toString(36).slice(2, 10)}`;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    detachMenu();
    clearNode(container);

    root = createElement("div", {
      className: `ui-select ${currentOptions.className || ""}`.trim(),
    });
    trigger = createElement("button", {
      className: "ui-select-trigger",
      attrs: {
        type: "button",
        "aria-haspopup": "listbox",
        "aria-expanded": open ? "true" : "false",
        "aria-label": currentOptions.ariaLabel,
        "aria-controls": open ? listId : null,
      },
    });

    trigger.appendChild(createElement("span", {
      className: "ui-select-value",
      text: getDisplayValue(),
    }));
    trigger.appendChild(createElement("span", {
      className: "ui-select-caret",
      html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    }));

    if (currentOptions.clearable && selected.size) {
      const clear = createElement("button", {
        className: "ui-select-clear",
        attrs: { type: "button", "aria-label": "Clear selection", title: "Clear selection" },
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      });
      events.on(clear, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selected.clear();
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
          selectActiveOption();
        }
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        closeMenu();
      }
    });
    root.appendChild(trigger);

    container.appendChild(root);

    if (open) {
      menu = createElement("div", { className: "ui-select-menu" });
      if (currentOptions.searchable) {
        searchInput = createElement("input", {
          className: "ui-input ui-select-search",
          attrs: { type: "text", placeholder: "Search..." },
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
        events.on(searchInput, "keydown", (event) => {
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
            const filtered = getFilteredItems();
            setActiveIndex(filtered.length - 1);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            selectActiveOption();
            return;
          }
          if (event.key === "Tab" && currentOptions.selectOnTab) {
            selectActiveOption({ close: true, restoreFocus: false });
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeMenu();
          }
        });
        menu.appendChild(searchInput);
      }
      list = createElement("div", { className: "ui-select-list", attrs: { role: "listbox", id: listId, "aria-label": currentOptions.ariaLabel } });
      if (currentOptions.multiple) {
        list.setAttribute("aria-multiselectable", "true");
      }
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
    const filtered = getFilteredItems();
    if (!filtered.length) {
      list.appendChild(createElement("p", {
        className: "ui-select-empty",
        text: currentOptions.emptyText,
      }));
      return;
    }
    filtered.forEach((item, index) => {
      const key = String(item.value);
      const isSelected = selected.has(key);
      const row = createElement("button", {
        className: `ui-select-option${isSelected ? " is-selected" : ""}${isActiveOption(item) ? " is-active" : ""}`,
        attrs: {
          type: "button",
          role: "option",
          id: `${listId}-option-${index}`,
          "aria-selected": isSelected ? "true" : "false",
        },
      });
      if (currentOptions.multiple) {
        row.classList.add("is-multiple");
        row.appendChild(createElement("span", {
          className: "ui-select-option-check",
          html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
        }));
        row.appendChild(createElement("span", {
          className: "ui-select-option-label",
          text: item.label,
        }));
      } else {
        row.textContent = item.label;
      }
      row.dataset.index = String(index);
      events.on(row, "click", () => {
        toggleSelected(key);
        emitChange();
        if (!currentOptions.multiple && currentOptions.closeOnSelect) {
          closeMenu();
          return;
        }
        render();
      });
      events.on(row, "mouseenter", () => {
        const index = Number(row.dataset.index);
        if (Number.isFinite(index)) {
          activeIndex = index;
          syncActiveOption();
        }
      });
      list.appendChild(row);
    });
    clampActiveIndex();
    syncActiveOption();
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
    const maxMenuHeight = Math.max(160, Math.min(openUpward ? spaceAbove : spaceBelow, 320));

    menu.style.position = "fixed";
    menu.style.left = `${Math.round(rect.left)}px`;
    menu.style.width = `${Math.round(rect.width)}px`;
    menu.style.maxWidth = `${Math.round(rect.width)}px`;
    menu.style.top = openUpward ? "auto" : `${Math.round(rect.bottom + 6)}px`;
    menu.style.bottom = openUpward ? `${Math.round(viewportHeight - rect.top + 6)}px` : "auto";

    const listNode = menu.querySelector(".ui-select-list");
    if (listNode) {
      listNode.style.maxHeight = `${Math.round(Math.max(96, maxMenuHeight - (currentOptions.searchable ? 52 : 12)))}px`;
    }
  }

  function toggleSelected(key) {
    if (currentOptions.multiple) {
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.add(key);
      }
      return;
    }
    selected.clear();
    selected.add(key);
  }

  function getDisplayValue() {
    if (!selected.size) {
      return currentOptions.placeholder;
    }
    const selectedItems = currentItems.filter((item) => selected.has(String(item.value)));
    if (!selectedItems.length) {
      return currentOptions.placeholder;
    }
    if (!currentOptions.multiple) {
      return selectedItems[0].label;
    }
    if (selectedItems.length <= 2) {
      return selectedItems.map((item) => item.label).join(", ");
    }
    return `${selectedItems.length} selected`;
  }

  function getFilteredItems() {
    const needle = String(search || "").trim().toLowerCase();
    if (!needle) {
      return currentItems;
    }
    return currentItems.filter((item) =>
      String(item.label || "").toLowerCase().includes(needle)
    );
  }

  function openMenu() {
    open = true;
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
    const filtered = getFilteredItems();
    if (!filtered.length) {
      activeIndex = -1;
      return;
    }
    const selectedIndex = filtered.findIndex((item) => selected.has(String(item.value)));
    activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  }

  function clampActiveIndex() {
    const filtered = getFilteredItems();
    if (!filtered.length) {
      activeIndex = -1;
      return;
    }
    if (activeIndex < 0) {
      activeIndex = 0;
      return;
    }
    if (activeIndex > filtered.length - 1) {
      activeIndex = filtered.length - 1;
    }
  }

  function setActiveIndex(nextIndex) {
    const filtered = getFilteredItems();
    if (!filtered.length) {
      activeIndex = -1;
      syncActiveOption();
      return;
    }
    activeIndex = Math.max(0, Math.min(filtered.length - 1, Number(nextIndex) || 0));
    syncActiveOption();
  }

  function moveActive(delta) {
    const filtered = getFilteredItems();
    if (!filtered.length) {
      activeIndex = -1;
      syncActiveOption();
      return;
    }
    if (activeIndex < 0) {
      activeIndex = 0;
    } else {
      activeIndex = (activeIndex + delta + filtered.length) % filtered.length;
    }
    syncActiveOption();
  }

  function selectActiveOption(config = {}) {
    const closeAfterSelect = config.close !== undefined ? Boolean(config.close) : (!currentOptions.multiple && currentOptions.closeOnSelect);
    const restoreFocus = config.restoreFocus !== undefined ? Boolean(config.restoreFocus) : true;
    const filtered = getFilteredItems();
    if (!filtered.length) {
      return;
    }
    clampActiveIndex();
    const active = filtered[activeIndex];
    if (!active) {
      return;
    }
    toggleSelected(String(active.value));
    emitChange();
    if (closeAfterSelect) {
      closeMenu({ restoreFocus });
      return;
    }
    render();
  }

  function isActiveOption(item) {
    const filtered = getFilteredItems();
    if (activeIndex < 0 || activeIndex >= filtered.length) {
      return false;
    }
    return filtered[activeIndex]?.value === item?.value;
  }

  function syncActiveOption() {
    if (!list) {
      return;
    }
    const options = Array.from(list.querySelectorAll(".ui-select-option"));
    options.forEach((optionNode) => optionNode.classList.remove("is-active"));
    if (activeIndex < 0 || activeIndex >= options.length) {
      trigger?.removeAttribute("aria-activedescendant");
      return;
    }
    const active = options[activeIndex];
    active?.classList.add("is-active");
    if (active?.id) {
      trigger?.setAttribute("aria-activedescendant", active.id);
    }
    active?.scrollIntoView?.({ block: "nearest" });
  }

  function emitChange() {
    const values = Array.from(selected);
    const selectedItems = currentItems.filter((item) => selected.has(String(item.value)));
    if (currentOptions.multiple) {
      currentOptions.onChange?.(values, selectedItems);
    } else {
      currentOptions.onChange?.(values[0] ?? null, selectedItems[0] ?? null);
    }
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
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key === "Tab" && currentOptions.selectOnTab) {
        selectActiveOption({ close: true, restoreFocus: false });
        return;
      }
      if (!currentOptions.searchable && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        moveActive(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (!currentOptions.searchable && event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (!currentOptions.searchable && event.key === "End") {
        event.preventDefault();
        const filtered = getFilteredItems();
        setActiveIndex(filtered.length - 1);
        return;
      }
      if (!currentOptions.searchable && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        selectActiveOption();
      }
    });
  }

  function update(nextItems = [], nextOptions = {}) {
    currentItems = normalizeItems(nextItems);
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    selected = new Set(normalizeSelected(nextOptions.selected ?? Array.from(selected), currentOptions.multiple));
    clampActiveIndex();
    render();
  }

  function setValue(nextValue) {
    const values = normalizeSelected(nextValue, currentOptions.multiple);
    selected = new Set(values);
    emitChange();
    render();
  }

  function getValue() {
    const values = Array.from(selected);
    return currentOptions.multiple ? values : (values[0] ?? null);
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

  function getState() {
    return {
      open,
      search,
      selected: Array.from(selected),
      options: { ...currentOptions },
      items: currentItems.map((item) => ({ ...item })),
    };
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
  next.ariaLabel = String(next.ariaLabel || "Select");
  return next;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item, index) => {
    if (item && typeof item === "object") {
      return {
        value: item.value ?? item.id ?? String(index),
        label: String(item.label ?? item.name ?? item.value ?? item.id ?? `Option ${index + 1}`),
      };
    }
    return {
      value: String(item),
      label: String(item),
    };
  });
}

function normalizeSelected(selected, multiple) {
  if (selected == null) {
    return [];
  }
  if (Array.isArray(selected)) {
    return multiple ? selected.map((value) => String(value)) : [String(selected[0])];
  }
  return [String(selected)];
}

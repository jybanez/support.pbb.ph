import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  placement: "bottom-start", // bottom-start | bottom-end | top-start | top-end
  align: null, // null | left | right
  offset: 6,
  ariaLabel: "Menu",
  closeOnSelect: true,
  closeOnOutsideClick: true,
  closeOnEscape: true,
  matchTriggerWidth: false,
  className: "",
  onOpenChange: null,
  onSelect: null,
};

export function createMenu(triggerEl, items = [], options = {}) {
  const events = createEventBag();
  let currentItems = Array.isArray(items) ? items : [];
  let currentOptions = normalizeOptions(options);
  let open = false;
  let root = null;
  let listEl = null;
  let activeIndex = -1;
  let closeTimer = null;
  const rootId = `ui-menu-${Math.random().toString(36).slice(2, 10)}`;

  function build() {
    if (root) {
      return;
    }
    root = createElement("div", {
      className: `ui-menu ${currentOptions.className}`.trim(),
      attrs: { role: "menu", tabindex: "-1", id: rootId, "aria-label": currentOptions.ariaLabel },
    });
    listEl = createElement("div", { className: "ui-menu-list" });
    root.appendChild(listEl);
    renderItems();
  }

  function renderItems() {
    if (!listEl) {
      return;
    }
    clearNode(listEl);
    activeIndex = -1;
    currentItems.forEach((item, index) => {
      const disabled = Boolean(item?.disabled);
      const row = createElement("button", {
        className: `ui-menu-item${disabled ? " is-disabled" : ""}${item?.danger ? " is-danger" : ""}${item?.className ? ` ${String(item.className).trim()}` : ""}`,
        attrs: {
          type: "button",
          role: "menuitem",
          tabindex: "-1",
          "data-index": String(index),
          ...(disabled ? { disabled: "disabled" } : {}),
        },
      });
      if (item?.icon) {
        const icon = createElement("span", { className: "ui-menu-item-icon", html: String(item.icon) });
        row.appendChild(icon);
      }
      row.appendChild(createElement("span", { className: "ui-menu-item-label", text: item?.label ?? String(item?.id ?? index) }));
      if (item?.shortcut) {
        row.appendChild(createElement("kbd", { className: "ui-menu-item-shortcut", text: String(item.shortcut) }));
      }
      events.on(row, "click", () => {
        if (disabled) {
          return;
        }
        currentOptions.onSelect?.(item, { index, source: "menu" });
        if (currentOptions.closeOnSelect) {
          close();
        }
      });
      events.on(row, "mouseenter", () => setActiveIndex(index));
      listEl.appendChild(row);
    });
  }

  function setActiveIndex(index) {
    if (!listEl) {
      return;
    }
    const children = Array.from(listEl.querySelectorAll(".ui-menu-item"));
    children.forEach((node) => node.classList.remove("is-active"));
    const target = children[index];
    if (target && !target.disabled) {
      target.classList.add("is-active");
      target.focus();
      activeIndex = index;
    }
  }

  function moveActive(delta) {
    const enabledIndexes = currentItems
      .map((item, index) => ({ item, index }))
      .filter((entry) => !entry.item?.disabled)
      .map((entry) => entry.index);
    if (!enabledIndexes.length) {
      return;
    }
    const currentPos = Math.max(0, enabledIndexes.indexOf(activeIndex));
    const nextPos = (currentPos + delta + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPos]);
  }

  function position() {
    if (!root || !triggerEl) {
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    const measuredRect = root.getBoundingClientRect();
    const menuWidth = root.offsetWidth || measuredRect.width;
    const menuHeight = root.offsetHeight || measuredRect.height;
    const gap = Math.max(0, Number(currentOptions.offset) || 0);
    const placement = resolvePlacement(currentOptions);
    let top = rect.bottom + gap;
    let left = rect.left;

    if (placement.startsWith("top")) {
      top = rect.top - menuHeight - gap;
    }
    if (placement.endsWith("end")) {
      left = rect.right - menuWidth;
    }

    const maxLeft = window.innerWidth - menuWidth - 8;
    const maxTop = window.innerHeight - menuHeight - 8;
    root.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
    root.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
    root.dataset.placement = placement;
    if (currentOptions.matchTriggerWidth) {
      root.style.minWidth = `${Math.round(rect.width)}px`;
    } else {
      root.style.minWidth = "";
    }
  }

  function openMenu() {
    if (open) {
      return;
    }
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    build();
    if (!root.parentNode) {
      document.body.appendChild(root);
    }
    open = true;
    if (triggerEl && typeof triggerEl.setAttribute === "function") {
      triggerEl.setAttribute("aria-expanded", "true");
      triggerEl.setAttribute("aria-controls", rootId);
      triggerEl.setAttribute("aria-haspopup", "menu");
    }
    root.classList.remove("is-closing");
    position();
    requestAnimationFrame(() => {
      if (!open) {
        return;
      }
      root?.classList.add("is-open");
    });
    currentOptions.onOpenChange?.(true);
    bindGlobal();
    const firstEnabled = currentItems.findIndex((item) => !item?.disabled);
    if (firstEnabled >= 0) {
      setActiveIndex(firstEnabled);
    }
  }

  function close() {
    if (!open) {
      return;
    }
    open = false;
    if (triggerEl && typeof triggerEl.setAttribute === "function") {
      triggerEl.setAttribute("aria-expanded", "false");
    }
    currentOptions.onOpenChange?.(false);
    unbindGlobal();
    activeIndex = -1;
    if (!root) {
      return;
    }
    root.classList.remove("is-open");
    root.classList.add("is-closing");

    const finalizeClose = () => {
      if (open || !root) {
        return;
      }
      root.classList.remove("is-closing");
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
      triggerEl?.focus?.();
    };

    const onTransitionEnd = (event) => {
      if (event.target !== root) {
        return;
      }
      root?.removeEventListener("transitionend", onTransitionEnd);
      finalizeClose();
    };

    root.addEventListener("transitionend", onTransitionEnd);
    closeTimer = setTimeout(() => {
      root?.removeEventListener("transitionend", onTransitionEnd);
      finalizeClose();
      closeTimer = null;
    }, 260);
  }

  function toggle() {
    if (open) {
      close();
    } else {
      openMenu();
    }
  }

  const globalEvents = createEventBag();
  function bindGlobal() {
    if (currentOptions.closeOnOutsideClick) {
      globalEvents.on(document, "mousedown", (event) => {
        const target = event.target;
        if (!open) {
          return;
        }
        if (target && (target === triggerEl || triggerEl.contains(target) || root?.contains(target))) {
          return;
        }
        close();
      });
    }
    if (currentOptions.closeOnEscape) {
      globalEvents.on(document, "keydown", (event) => {
        if (!open) {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          triggerEl?.focus?.();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(-1);
          return;
        }
        if (event.key === "Home") {
          event.preventDefault();
          moveActiveToBoundary("start");
          return;
        }
        if (event.key === "End") {
          event.preventDefault();
          moveActiveToBoundary("end");
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          const item = currentItems[activeIndex];
          if (item && !item.disabled) {
            event.preventDefault();
            currentOptions.onSelect?.(item, { index: activeIndex, source: "keyboard" });
            if (currentOptions.closeOnSelect) {
              close();
            }
          }
        }
      });
    }
    globalEvents.on(window, "resize", () => {
      if (open) {
        position();
      }
    });
    globalEvents.on(window, "scroll", () => {
      if (open) {
        position();
      }
    }, true);
  }

  function unbindGlobal() {
    globalEvents.clear();
  }

  function moveActiveToBoundary(edge) {
    const enabledIndexes = currentItems
      .map((item, index) => ({ item, index }))
      .filter((entry) => !entry.item?.disabled)
      .map((entry) => entry.index);
    if (!enabledIndexes.length) {
      return;
    }
    setActiveIndex(edge === "end" ? enabledIndexes[enabledIndexes.length - 1] : enabledIndexes[0]);
  }

  function update(nextItems = [], nextOptions = {}) {
    currentItems = Array.isArray(nextItems) ? nextItems : [];
    currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
    if (open) {
      renderItems();
      position();
    }
  }

  function destroy() {
    close();
    events.clear();
    unbindGlobal();
    if (triggerElEvents) {
      triggerElEvents.clear();
    }
    root = null;
    listEl = null;
  }

  function getState() {
    return {
      open,
      activeIndex,
      placement: resolvePlacement(currentOptions),
      items: [...currentItems],
    };
  }

  const triggerElEvents = createEventBag();
  if (triggerEl && typeof triggerEl.addEventListener === "function") {
    if (typeof triggerEl.setAttribute === "function") {
      triggerEl.setAttribute("aria-haspopup", "menu");
      triggerEl.setAttribute("aria-expanded", "false");
    }
    triggerElEvents.on(triggerEl, "click", (event) => {
      event.preventDefault();
      toggle();
    });
  }

  return {
    open: openMenu,
    close,
    toggle,
    update,
    destroy,
    getState,
  };
}

function normalizeOptions(options) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
}

function resolvePlacement(options = {}) {
  const basePlacement = String(options.placement || "bottom-start").toLowerCase();
  const vertical = basePlacement.startsWith("top") ? "top" : "bottom";
  const align = String(options.align || "").toLowerCase();
  if (align === "right") {
    return `${vertical}-end`;
  }
  if (align === "left") {
    return `${vertical}-start`;
  }
  return basePlacement;
}

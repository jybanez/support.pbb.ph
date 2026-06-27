import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createMenu } from "./ui.menu.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Primary navigation",
  brandText: "App",
  brandSubtitle: "",
  brandMedia: null,
  items: [],
  actions: [],
  contentStart: null,
  contentCenter: null,
  contentEnd: null,
  contentStartMobile: null,
  contentCenterMobile: null,
  contentEndMobile: null,
  statusContent: null,
  statusContentLabel: "Status",
  sticky: false,
  mobileCollapse: true,
  mobileLayout: "auto",
  activeId: "",
  iconPosition: "start", // start | end
  iconOnly: false,
  onNavigate: null,
  onItemMenuSelect: null,
  onItemMenuOpenChange: null,
  onAction: null,
  onActionMenuSelect: null,
  onActionMenuOpenChange: null,
};

const MOBILE_TOGGLE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
  </svg>
`;

const MOBILE_COLLAPSE_QUERY = "(max-width: 720px)";
const MOBILE_LAYOUTS = new Set(["auto", "collapse", "stack", "scroll"]);

export function createNavbar(container, data = {}, options = {}) {
  const events = createEventBag();
  let currentOptions = { ...DEFAULT_OPTIONS, ...(options || {}) };
  let navMenus = [];

  function destroyMenus() {
    navMenus.forEach((menuApi) => menuApi?.destroy?.());
    navMenus = [];
  }

  function appendIconLabel(target, item = {}) {
    const label = item?.label ?? String(item?.id ?? "");
    const hasIcon = Boolean(item?.icon);
    const iconPosition = String(item?.iconPosition || currentOptions.iconPosition || "start").toLowerCase() === "end" ? "end" : "start";
    const iconOnly = Boolean(item?.iconOnly ?? currentOptions.iconOnly);

    target.classList.toggle("is-icon-only", iconOnly && hasIcon);
    if (iconOnly && hasIcon) {
      target.setAttribute("aria-label", String(label || item?.ariaLabel || item?.id || "menu item"));
      target.setAttribute("title", String(label || ""));
    }

    const content = createElement("span", {
      className: `ui-nav-content${iconPosition === "end" ? " is-end" : ""}`,
    });
    if (hasIcon) {
      content.appendChild(createElement("span", { className: "ui-nav-icon", html: String(item.icon) }));
    }
    if (!iconOnly || !hasIcon) {
      content.appendChild(createElement("span", { className: "ui-nav-label", text: label }));
    }
    target.appendChild(content);
  }

  function resolveRenderableValue(value, meta = {}) {
    if (typeof value === "function") {
      return value({
        ...meta,
        options: { ...currentOptions },
        createElement,
      });
    }
    return value;
  }

  function appendRenderable(target, value, meta = {}) {
    if (!target) {
      return;
    }

    const resolved = resolveRenderableValue(value, meta);

    if (resolved == null || resolved === false) {
      return;
    }

    if (Array.isArray(resolved)) {
      resolved.forEach((entry) => appendRenderable(target, entry, meta));
      return;
    }

    if (resolved instanceof Node) {
      target.appendChild(resolved);
      return;
    }

    target.appendChild(createElement("span", {
      className: meta?.className || "",
      ...(meta?.asHtml ? { html: String(resolved) } : { text: String(resolved) }),
    }));
  }

  function createTextFallbackMobileEntry(label, id) {
    const value = String(label || "").trim();
    if (!value) {
      return null;
    }
    return {
      id: id || `mobile:${value.toLowerCase().replace(/\s+/g, "-")}`,
      label: value,
      disabled: true,
    };
  }

  function normalizeMobileContentEntries(value, slotName) {
    const resolved = resolveRenderableValue(value, { slot: slotName });
    if (resolved == null || resolved === false) {
      return [];
    }
    if (Array.isArray(resolved)) {
      return resolved.flatMap((entry, index) => normalizeMobileContentEntries(entry, `${slotName}:${index}`));
    }
    if (resolved instanceof Node) {
      const entry = createTextFallbackMobileEntry(resolved.textContent, `mobile:${slotName}`);
      return entry ? [entry] : [];
    }
    if (typeof resolved === "object") {
      if (typeof resolved.label === "string" && resolved.label.trim()) {
        return [{ ...resolved }];
      }
      return [];
    }
    const entry = createTextFallbackMobileEntry(resolved, `mobile:${slotName}`);
    return entry ? [entry] : [];
  }

  function buildMobileMenuItems() {
    const entries = [];
    const pushEntries = (items) => {
      items.forEach((item) => {
        if (item && item.label) {
          entries.push(item);
        }
      });
    };

    pushEntries(normalizeMobileContentEntries(
      currentOptions.contentStartMobile ?? currentOptions.contentStart,
      "start"
    ));
    pushEntries(normalizeMobileContentEntries(
      currentOptions.contentCenterMobile ?? currentOptions.contentCenter,
      "center"
    ));
    pushEntries(normalizeMobileContentEntries(
      currentOptions.contentEndMobile ?? currentOptions.contentEnd,
      "end"
    ));

    (Array.isArray(currentOptions.items) ? currentOptions.items : []).forEach((item) => {
      if (!item) {
        return;
      }
      const menuItems = Array.isArray(item.menuItems) ? item.menuItems : [];
      if (menuItems.length) {
        entries.push({
          id: `mobile-group:${item.id || entries.length}`,
          label: item.label ?? String(item.id ?? "Menu"),
          icon: item.icon || "",
          disabled: true,
          className: "ui-navbar-mobile-menu-group",
          __mobileKind: "group-label",
        });
        menuItems.forEach((menuItem, index) => {
          entries.push({
            id: menuItem?.id || `${item.id || "item"}:${index}`,
            label: menuItem?.label ?? menuItem?.id ?? String(index),
            icon: menuItem?.icon || "",
            className: "ui-navbar-mobile-menu-child",
            disabled: Boolean(menuItem?.disabled),
            danger: Boolean(menuItem?.danger),
            __mobileKind: "item-menu",
            __item: item,
            __menuItem: menuItem,
          });
        });
        return;
      }
      entries.push({
        id: item.id || `item:${entries.length}`,
        label: item.label ?? String(item.id ?? "Item"),
        icon: item.icon || "",
        disabled: Boolean(item.disabled),
        __mobileKind: "item",
        __item: item,
      });
    });

    (Array.isArray(currentOptions.actions) ? currentOptions.actions : []).forEach((action) => {
      if (!action) {
        return;
      }
      const menuItems = Array.isArray(action.menuItems) ? action.menuItems : [];
      if (menuItems.length) {
        entries.push({
          id: `mobile-group:${action.id || entries.length}`,
          label: action.label ?? String(action.id ?? "Action"),
          icon: action.icon || "",
          disabled: true,
          className: "ui-navbar-mobile-menu-group",
          __mobileKind: "group-label",
        });
        menuItems.forEach((menuItem, index) => {
          entries.push({
            id: menuItem?.id || `${action.id || "action"}:${index}`,
            label: menuItem?.label ?? menuItem?.id ?? String(index),
            icon: menuItem?.icon || "",
            className: "ui-navbar-mobile-menu-child",
            disabled: Boolean(menuItem?.disabled),
            danger: Boolean(menuItem?.danger),
            __mobileKind: "action-menu",
            __action: action,
            __menuItem: menuItem,
          });
        });
        return;
      }
      entries.push({
        id: action.id || `action:${entries.length}`,
        label: action.label ?? String(action.id ?? "Action"),
        icon: action.icon || "",
        disabled: Boolean(action.disabled),
        danger: Boolean(action.danger),
        __mobileKind: "action",
        __action: action,
      });
    });

    return entries;
  }

  function renderSlot(slotName, value) {
    if (value == null || value === false) {
      return null;
    }
    const slot = createElement("div", {
      className: `ui-navbar-slot ui-navbar-slot-${slotName}`,
    });
    appendRenderable(slot, value, {
      slot: slotName,
      className: "ui-navbar-slot-text",
      asText: true,
    });
    if (!slot.childNodes.length) {
      return null;
    }
    return slot;
  }

  function renderStatusContent() {
    if (currentOptions.statusContent == null || currentOptions.statusContent === false) {
      return null;
    }
    const label = String(currentOptions.statusContentLabel || "Status").trim() || "Status";
    const status = createElement("div", {
      className: "ui-navbar-status",
      attrs: {
        role: "group",
        "aria-label": label,
      },
    });
    appendRenderable(status, currentOptions.statusContent, {
      slot: "status",
      className: "ui-navbar-status-text",
    });
    if (!status.childNodes.length) {
      return null;
    }
    return status;
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    destroyMenus();
    events.clear();
    clearNode(container);

    const mobileLayout = resolveMobileLayout();
    const root = createElement("nav", {
      className: `ui-navbar ${currentOptions.className || ""}`.trim(),
      attrs: { role: "navigation", "aria-label": currentOptions.ariaLabel },
    });
    root.classList.add(`is-mobile-layout-${mobileLayout}`);
    if (currentOptions.sticky) {
      root.classList.add("is-sticky");
    }

    const brand = createElement("button", {
      className: "ui-navbar-brand",
      attrs: { type: "button" },
    });
    const brandText = createElement("span", { className: "ui-navbar-brand-text" });
    if (currentOptions.brandMedia != null && currentOptions.brandMedia !== false) {
      const brandMedia = createElement("span", { className: "ui-navbar-brand-media" });
      appendRenderable(brandMedia, currentOptions.brandMedia, {
        slot: "brandMedia",
        className: "ui-navbar-brand-media-content",
        asHtml: true,
      });
      if (brandMedia.childNodes.length) {
        brand.appendChild(brandMedia);
      }
    }
    const brandLabel = createElement("span", {
      className: "ui-navbar-brand-label",
      text: currentOptions.brandText,
    });
    brandText.appendChild(brandLabel);
    if (String(currentOptions.brandSubtitle || "").trim()) {
      brand.classList.add("has-subtitle");
      brandText.appendChild(createElement("span", {
        className: "ui-navbar-brand-subtitle",
        text: String(currentOptions.brandSubtitle).trim(),
      }));
    }
    brand.appendChild(brandText);
    events.on(brand, "click", () => currentOptions.onNavigate?.({ id: "brand", label: currentOptions.brandText }));

    const itemDefs = Array.isArray(currentOptions.items) ? currentOptions.items : [];
    let list = null;
    itemDefs.forEach((item) => {
      if (!list) {
        list = createElement("div", { className: "ui-navbar-items" });
      }
      const btn = createElement("button", {
        className: [
          "ui-button",
          "ui-navbar-item",
          String(item?.id) === String(currentOptions.activeId) ? "is-active" : "",
          item?.className || "",
        ].filter(Boolean).join(" "),
        attrs: {
          type: "button",
          ...(item?.disabled ? { disabled: "disabled" } : {}),
          ...(String(item?.id) === String(currentOptions.activeId) ? { "aria-current": "page" } : {}),
        },
      });
      appendIconLabel(btn, item);
      const menuItems = Array.isArray(item?.menuItems) ? item.menuItems : [];
      if (menuItems.length) {
        const menuApi = createMenu(btn, menuItems, {
          placement: "bottom-start",
          ...((item?.menuOptions && typeof item.menuOptions === "object") ? item.menuOptions : {}),
          onSelect: (menuItem, meta) => {
            currentOptions.onItemMenuSelect?.(item, menuItem, meta);
          },
          onOpenChange: (open) => {
            currentOptions.onItemMenuOpenChange?.(item, open);
          },
        });
        navMenus.push(menuApi);
      } else {
        events.on(btn, "click", () => currentOptions.onNavigate?.(item));
      }
      list.appendChild(btn);
    });

    const actionDefs = Array.isArray(currentOptions.actions) ? currentOptions.actions : [];
    let actions = null;
    actionDefs.forEach((action) => {
      if (!actions) {
        actions = createElement("div", { className: "ui-navbar-actions" });
      }
      const btn = createElement("button", {
        className: [
          "ui-button",
          "ui-navbar-action",
          action?.className || "",
        ].filter(Boolean).join(" "),
        attrs: { type: "button", ...(action?.disabled ? { disabled: "disabled" } : {}) },
      });
      appendIconLabel(btn, action);
      const menuItems = Array.isArray(action?.menuItems) ? action.menuItems : [];
      if (menuItems.length) {
        const menuApi = createMenu(btn, menuItems, {
          placement: "bottom-end",
          ...((action?.menuOptions && typeof action.menuOptions === "object") ? action.menuOptions : {}),
          onSelect: (item, meta) => {
            currentOptions.onActionMenuSelect?.(action, item, meta);
          },
          onOpenChange: (open) => {
            currentOptions.onActionMenuOpenChange?.(action, open);
          },
        });
        navMenus.push(menuApi);
      } else {
        events.on(btn, "click", () => currentOptions.onAction?.(action));
      }
      actions.appendChild(btn);
    });

    const start = createElement("div", { className: "ui-navbar-start" });
    const center = createElement("div", { className: "ui-navbar-center" });
    const end = createElement("div", { className: "ui-navbar-end" });

    start.appendChild(brand);
    const contentStart = renderSlot("start", currentOptions.contentStart);
    if (contentStart) {
      start.appendChild(contentStart);
    }
    if (list) {
      start.appendChild(list);
    }
    const statusContent = renderStatusContent();

    let mobileToggle = null;
    const mobileMenuItems = mobileLayout === "collapse" ? buildMobileMenuItems() : [];
    if (mobileMenuItems.length) {
      mobileToggle = createElement("button", {
        className: "ui-button ui-navbar-mobile-toggle",
        attrs: {
          type: "button",
          "aria-label": "Open navigation menu",
          title: "Menu",
        },
      });
      mobileToggle.appendChild(createElement("span", {
        className: "ui-nav-icon ui-navbar-mobile-toggle-icon",
        html: MOBILE_TOGGLE_ICON,
      }));
      const mobileMenu = createMenu(mobileToggle, mobileMenuItems, {
        placement: "bottom-end",
        onSelect: (entry, meta) => {
          switch (entry?.__mobileKind) {
            case "item":
              currentOptions.onNavigate?.(entry.__item);
              break;
            case "item-menu":
              currentOptions.onItemMenuSelect?.(entry.__item, entry.__menuItem, { ...meta, source: "mobile-menu" });
              break;
            case "action":
              currentOptions.onAction?.(entry.__action);
              break;
            case "action-menu":
              currentOptions.onActionMenuSelect?.(entry.__action, entry.__menuItem, { ...meta, source: "mobile-menu" });
              break;
            default:
              break;
          }
        },
      });
      navMenus.push(mobileMenu);
      root.classList.add("is-mobile-collapsible", "has-mobile-menu");
      const syncMobileCollapseState = () => {
        const isMobileViewport = typeof window !== "undefined"
          && typeof window.matchMedia === "function"
          && window.matchMedia(MOBILE_COLLAPSE_QUERY).matches;
        root.classList.toggle("is-mobile-active", isMobileViewport);
        mobileToggle.disabled = !isMobileViewport;
        if (!isMobileViewport) {
          mobileMenu.close();
        }
      };
      syncMobileCollapseState();
      events.on(window, "resize", syncMobileCollapseState);
    }

    const contentCenter = renderSlot("center", currentOptions.contentCenter);
    if (contentCenter) {
      center.appendChild(contentCenter);
      center.classList.add("has-content");
    }

    const contentEnd = renderSlot("end", currentOptions.contentEnd);
    if (contentEnd) {
      end.appendChild(contentEnd);
    }
    if (actions) {
      end.appendChild(actions);
    }

    if (brand.childNodes.length) {
      root.classList.add("has-brand");
    }
    if (contentStart) {
      root.classList.add("has-start-slot");
    }
    if (list) {
      root.classList.add("has-items");
    }
    if (statusContent) {
      root.classList.add("has-status");
    }
    if (contentCenter) {
      root.classList.add("has-center-slot");
    }
    if (contentEnd) {
      root.classList.add("has-end-slot");
    }
    if (actions) {
      root.classList.add("has-actions");
    }

    if (start.childNodes.length) {
      root.appendChild(start);
    }
    if (center.childNodes.length) {
      root.appendChild(center);
    }
    if (statusContent) {
      root.appendChild(statusContent);
    }
    if (mobileToggle) {
      root.appendChild(mobileToggle);
    }
    if (end.childNodes.length) {
      root.appendChild(end);
    }
    container.appendChild(root);
  }

  function update(_nextData = {}, nextOptions = {}) {
    currentOptions = { ...currentOptions, ...(nextOptions || {}) };
    render();
  }

  function destroy() {
    destroyMenus();
    events.clear();
    clearNode(container);
  }

  function getState() {
    return {
      options: { ...currentOptions },
      mobileLayout: resolveMobileLayout(),
    };
  }

  function resolveMobileLayout() {
    const requested = String(currentOptions.mobileLayout || "auto").trim().toLowerCase();
    if (requested !== "auto" && MOBILE_LAYOUTS.has(requested)) {
      return requested;
    }
    return Boolean(currentOptions.mobileCollapse) ? "collapse" : "stack";
  }

  render();
  return { destroy, update, getState };
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Sidebar navigation",
  title: "Navigation",
  items: [],
  activeId: "",
  collapsed: false,
  iconPosition: "start", // start | end
  iconOnly: false,
  onNavigate: null,
  onToggleCollapsed: null,
};

export function createSidebar(container, data = {}, options = {}) {
  const events = createEventBag();
  let currentOptions = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const titleId = `ui-sidebar-title-${Math.random().toString(36).slice(2, 10)}`;

  function getToggleIcon(collapsed) {
    if (collapsed) {
      // Expand: point to the right.
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    }
    // Collapse: point to the left.
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  }

  function appendIconLabel(target, item = {}) {
    const label = item?.label ?? String(item?.id ?? "");
    const hasIcon = Boolean(item?.icon);
    const iconPosition = String(item?.iconPosition || currentOptions.iconPosition || "start").toLowerCase() === "end" ? "end" : "start";
    const requestedIconOnly = item?.iconOnly ?? currentOptions.iconOnly;
    const iconOnly = Boolean(requestedIconOnly);

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

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    const root = createElement("aside", {
      className: `ui-sidebar ${currentOptions.className || ""}`.trim(),
      attrs: { role: "navigation", "aria-label": currentOptions.ariaLabel, "aria-labelledby": titleId },
    });
    root.classList.toggle("is-collapsed", Boolean(currentOptions.collapsed));
    const header = createElement("div", { className: "ui-sidebar-header" });
    const title = createElement("h4", { className: "ui-title", text: currentOptions.title, attrs: { id: titleId } });
    const toggle = createElement("button", {
      className: "ui-button ui-sidebar-toggle",
      html: getToggleIcon(Boolean(currentOptions.collapsed)),
      attrs: {
        type: "button",
        "aria-label": currentOptions.collapsed ? "Expand sidebar" : "Collapse sidebar",
        title: currentOptions.collapsed ? "Expand sidebar" : "Collapse sidebar",
      },
    });
    const applyCollapsedState = (collapsed) => {
      root.classList.toggle("is-collapsed", Boolean(collapsed));
      toggle.innerHTML = getToggleIcon(Boolean(collapsed));
      const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("title", label);
    };
    events.on(toggle, "click", () => {
      const next = !currentOptions.collapsed;
      currentOptions.collapsed = next;
      currentOptions.onToggleCollapsed?.(next);
      applyCollapsedState(next);
    });
    header.append(title, toggle);
    root.appendChild(header);

    const body = createElement("div", { className: "ui-sidebar-body" });
    (currentOptions.items || []).forEach((item) => {
      const row = createElement("button", {
        className: `ui-sidebar-item${String(item?.id) === String(currentOptions.activeId) ? " is-active" : ""}`,
        attrs: {
          type: "button",
          ...(item?.disabled ? { disabled: "disabled" } : {}),
          ...(String(item?.id) === String(currentOptions.activeId) ? { "aria-current": "page" } : {}),
        },
      });
      appendIconLabel(row, item);
      events.on(row, "click", () => currentOptions.onNavigate?.(item));
      body.appendChild(row);
    });
    root.appendChild(body);

    container.appendChild(root);
  }

  function update(_nextData = {}, nextOptions = {}) {
    currentOptions = { ...currentOptions, ...(nextOptions || {}) };
    render();
  }

  function destroy() {
    events.clear();
    clearNode(container);
  }

  function getState() {
    return { options: { ...currentOptions } };
  }

  render();
  return { destroy, update, getState };
}

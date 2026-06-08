import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  items: [],
  autoTruncateOnNavigate: false,
  separator: "/",
  iconPosition: "start", // start | end
  iconOnly: false,
  onNavigate: null,
};

export function createBreadcrumbs(container, data = {}, options = {}) {
  const events = createEventBag();
  let currentOptions = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const initialItems = Array.isArray(currentOptions.items) ? [...currentOptions.items] : [];
  let currentItems = [...initialItems];

  function appendIconLabel(target, item = {}) {
    const label = item?.label ?? String(item?.id ?? "");
    const hasIcon = Boolean(item?.icon);
    const iconPosition = String(item?.iconPosition || currentOptions.iconPosition || "start").toLowerCase() === "end" ? "end" : "start";
    const iconOnly = Boolean(item?.iconOnly ?? currentOptions.iconOnly);
    const content = createElement("span", {
      className: `ui-breadcrumbs-content${iconPosition === "end" ? " is-end" : ""}`,
    });

    target.classList.toggle("is-icon-only", iconOnly && hasIcon);
    if (iconOnly && hasIcon) {
      target.setAttribute("aria-label", String(label || item?.ariaLabel || item?.id || "breadcrumb"));
      target.setAttribute("title", String(label || ""));
    }

    if (hasIcon) {
      content.appendChild(createElement("span", { className: "ui-breadcrumbs-icon", html: String(item.icon) }));
    }
    if (!iconOnly || !hasIcon) {
      content.appendChild(createElement("span", { className: "ui-breadcrumbs-label", text: label }));
    }
    target.appendChild(content);
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    const root = createElement("nav", {
      className: `ui-breadcrumbs ${currentOptions.className || ""}`.trim(),
      attrs: { "aria-label": "Breadcrumb" },
    });
    const list = createElement("ol", { className: "ui-breadcrumbs-list" });

    currentItems.forEach((item, index) => {
      const li = createElement("li", { className: "ui-breadcrumbs-item" });
      const last = index === currentItems.length - 1;
      if (last) {
        const current = createElement("span", { className: "ui-breadcrumbs-current", attrs: { "aria-current": "page" } });
        appendIconLabel(current, item);
        li.appendChild(current);
      } else {
        const btn = createElement("button", {
          className: "ui-breadcrumbs-link",
          attrs: { type: "button" },
        });
        appendIconLabel(btn, item);
        events.on(btn, "click", () => {
          if (currentOptions.autoTruncateOnNavigate) {
            currentItems = currentItems.slice(0, index + 1);
            render();
          }
          currentOptions.onNavigate?.(item, index, [...currentItems]);
        });
        li.appendChild(btn);
        li.appendChild(createElement("span", { className: "ui-breadcrumbs-sep", text: currentOptions.separator }));
      }
      list.appendChild(li);
    });

    root.appendChild(list);
    container.appendChild(root);
  }

  function update(_nextData = {}, nextOptions = {}) {
    currentOptions = { ...currentOptions, ...(nextOptions || {}) };
    if (Object.prototype.hasOwnProperty.call(nextOptions || {}, "items")) {
      currentItems = Array.isArray(nextOptions.items) ? [...nextOptions.items] : [];
    }
    render();
  }

  function setItems(items = []) {
    currentItems = Array.isArray(items) ? [...items] : [];
    render();
  }

  function addCrumb(item) {
    if (!item || typeof item !== "object") {
      return;
    }
    currentItems = [...currentItems, item];
    render();
  }

  function getItems() {
    return [...currentItems];
  }

  function reset() {
    currentItems = [...initialItems];
    render();
  }

  function destroy() {
    events.clear();
    clearNode(container);
  }

  function getState() {
    return { options: { ...currentOptions }, items: [...currentItems] };
  }

  render();
  return { destroy, update, getState, setItems, addCrumb, getItems, reset };
}

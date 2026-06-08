import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

export function createTabs(container, options = {}) {
  const events = createEventBag();
  const tabs = Array.isArray(options.tabs) ? options.tabs : [];
  const onChange = typeof options.onChange === "function" ? options.onChange : null;
  let activeId = String(options.activeId ?? tabs[0]?.id ?? "");
  const tabsetId = `ui-tabs-${Math.random().toString(36).slice(2, 10)}`;
  let root = null;
  let tablist = null;
  let panel = null;

  function getIndexById(id) {
    return tabs.findIndex((item) => String(item?.id) === String(id));
  }

  function getActiveTab() {
    return tabs[getIndexById(activeId)] || null;
  }

  function setActive(nextId, emit = true) {
    if (!tabs.length) {
      activeId = "";
      render();
      return;
    }
    const exists = getIndexById(nextId) >= 0;
    activeId = exists ? String(nextId) : String(tabs[0]?.id ?? "");
    render();
    if (emit) {
      onChange?.(getActiveTab(), activeId);
    }
  }

  function focusTabByIndex(index) {
    const buttons = tablist?.querySelectorAll?.('[role="tab"]');
    if (!buttons?.length) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(buttons.length - 1, index));
    buttons[safeIndex]?.focus();
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("div", { className: "ui-tabs" });
    tablist = createElement("div", {
      className: "ui-tablist",
      attrs: { role: "tablist", "aria-label": options.ariaLabel || "Tabs" },
    });
    panel = createElement("div", {
      className: "ui-tabpanel",
      attrs: { role: "tabpanel", tabindex: "0" },
    });

    tabs.forEach((tab, index) => {
      const id = String(tab?.id ?? `tab-${index}`);
      const isActive = id === activeId;
      const button = createElement("button", {
        className: `ui-tab${isActive ? " is-active" : ""}`,
        text: tab?.label ?? id,
        attrs: {
          type: "button",
          role: "tab",
          id: `${tabsetId}-tab-${id}`,
          "aria-controls": `${tabsetId}-panel-${id}`,
          "aria-selected": isActive ? "true" : "false",
          tabindex: isActive ? "0" : "-1",
        },
        dataset: { tabId: id },
      });

      events.on(button, "click", () => setActive(id, true));
      events.on(button, "keydown", (event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          focusTabByIndex(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          focusTabByIndex(index - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          focusTabByIndex(0);
        } else if (event.key === "End") {
          event.preventDefault();
          focusTabByIndex(tabs.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActive(id, true);
        }
      });

      tablist.appendChild(button);
    });

    const active = getActiveTab();
    if (active) {
      panel.id = `${tabsetId}-panel-${String(active.id)}`;
      panel.setAttribute("aria-labelledby", `${tabsetId}-tab-${String(active.id)}`);
    } else {
      panel.removeAttribute("aria-labelledby");
    }
    if (active && typeof active.render === "function") {
      active.render(panel, active);
    } else if (active) {
      panel.textContent = String(active.content ?? "");
    }

    root.append(tablist, panel);
    container.appendChild(root);
  }

  render();

  return {
    setActive,
    getActiveId() {
      return activeId;
    },
    update(nextTabs = [], nextOptions = {}) {
      if (Array.isArray(nextTabs)) {
        tabs.length = 0;
        nextTabs.forEach((item) => tabs.push(item));
      }
      if (nextOptions.activeId !== undefined) {
        activeId = String(nextOptions.activeId ?? "");
      } else if (tabs.length && getIndexById(activeId) < 0) {
        activeId = String(tabs[0]?.id ?? "");
      }
      render();
    },
    destroy() {
      events.clear();
      clearNode(container);
      root = null;
      tablist = null;
      panel = null;
    },
  };
}

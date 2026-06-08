import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

export function createStrip(container, items = [], options = {}) {
  const events = createEventBag();
  const multi = Boolean(options.multi);
  const onChange = typeof options.onChange === "function" ? options.onChange : null;
  let selected = normalizeSelection(options.selected, multi);
  let root = null;

  function isSelected(id) {
    return selected.includes(String(id));
  }

  function toggle(id) {
    const key = String(id);
    if (multi) {
      selected = isSelected(key)
        ? selected.filter((item) => item !== key)
        : [...selected, key];
    } else {
      selected = [key];
    }
    render();
    onChange?.(getSelected(), selected);
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("div", { className: "ui-strip" });
    items.forEach((item, index) => {
      const id = String(item?.id ?? index);
      const active = isSelected(id);
      const button = createElement("button", {
        className: `ui-strip-item${active ? " is-active" : ""}`,
        text: item?.label ?? id,
        attrs: {
          type: "button",
          "aria-pressed": active ? "true" : "false",
        },
        dataset: { stripId: id },
      });
      events.on(button, "click", () => toggle(id));
      root.appendChild(button);
    });

    container.appendChild(root);
  }

  function getSelected() {
    return items.filter((item, index) => {
      const id = String(item?.id ?? index);
      return selected.includes(id);
    });
  }

  render();

  return {
    getSelected,
    setSelected(nextSelected = []) {
      selected = normalizeSelection(nextSelected, multi);
      render();
    },
    update(nextItems = [], nextOptions = {}) {
      if (Array.isArray(nextItems)) {
        items.length = 0;
        nextItems.forEach((item) => items.push(item));
      }
      if (nextOptions.selected !== undefined) {
        selected = normalizeSelection(nextOptions.selected, multi);
      }
      render();
    },
    destroy() {
      events.clear();
      clearNode(container);
      root = null;
    },
  };
}

function normalizeSelection(value, multi) {
  const list = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];
  const normalized = list.map((item) => String(item));
  return multi ? [...new Set(normalized)] : normalized.slice(0, 1);
}

import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";
import { createToggleButton } from "./ui.toggle.button.js";

const DEFAULT_OPTIONS = {
  items: [],
  variant: "pill",
  tone: "neutral",
  size: "md",
  multi: true,
  allowNone: true,
  quiet: false,
  disabled: false,
  leadingDot: false,
  className: "",
  name: "",
  onChange: null,
};

export function createToggleGroup(container, options = {}) {
  const events = createEventBag();
  let currentOptions = normalizeOptions(options);
  let items = normalizeItems(currentOptions.items);
  let root = null;
  let buttons = [];

  function normalizeOptions(nextOptions) {
    return {
      ...DEFAULT_OPTIONS,
      ...(nextOptions || {}),
      multi: nextOptions?.multi !== undefined ? Boolean(nextOptions.multi) : DEFAULT_OPTIONS.multi,
      allowNone: nextOptions?.allowNone !== undefined ? Boolean(nextOptions.allowNone) : DEFAULT_OPTIONS.allowNone,
      quiet: Boolean(nextOptions?.quiet),
      disabled: Boolean(nextOptions?.disabled),
      leadingDot: Boolean(nextOptions?.leadingDot),
      className: nextOptions?.className == null ? "" : String(nextOptions.className),
      name: nextOptions?.name == null ? "" : String(nextOptions.name),
    };
  }

  function normalizeItems(nextItems) {
    return Array.isArray(nextItems)
      ? nextItems.map((item, index) => ({
          id: String(item?.id ?? `toggle-${index}`),
          label: item?.label == null ? "" : String(item.label),
          pressed: Boolean(item?.pressed),
          icon: item?.icon ?? "",
          ariaLabel: item?.ariaLabel == null ? "" : String(item.ariaLabel),
          tone: item?.tone ?? null,
          variant: item?.variant ?? null,
          size: item?.size ?? null,
          quiet: item?.quiet,
          disabled: Boolean(item?.disabled),
          leadingDot: item?.leadingDot,
          iconPosition: item?.iconPosition,
          count: item?.count ?? null,
          loading: Boolean(item?.loading),
          tooltip: item?.tooltip == null ? "" : String(item.tooltip),
          className: item?.className == null ? "" : String(item.className),
        }))
      : [];
  }

  function enforceSelectionRules(changedId = null) {
    if (currentOptions.multi) {
      return;
    }
    const pressedItems = items.filter((item) => item.pressed);
    if (pressedItems.length <= 1) {
      if (!pressedItems.length && !currentOptions.allowNone && items.length) {
        const fallback = items.find((item) => item.id === changedId) || items[0];
        fallback.pressed = true;
      }
      return;
    }
    const keepId = changedId && items.some((item) => item.id === changedId && item.pressed)
      ? changedId
      : pressedItems[pressedItems.length - 1].id;
    items.forEach((item) => {
      item.pressed = item.id === keepId;
    });
  }

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }

    destroyButtons();
    events.clear();
    clearNode(container);

    root = createElement("div", {
      className: [
        "ui-toggle-group",
        `ui-toggle-group--${currentOptions.variant}`,
        `ui-toggle-group--${currentOptions.size}`,
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
      attrs: {
        role: currentOptions.multi ? "group" : "toolbar",
        "aria-label": currentOptions.name || "Toggle group",
      },
    });

    buttons = items.map((item, index) => {
      const slot = createElement("div", { className: "ui-toggle-group__item" });
      const button = createToggleButton(slot, {
        id: item.id,
        label: item.label,
        pressed: item.pressed,
        icon: item.icon,
        ariaLabel: item.ariaLabel,
        variant: item.variant || currentOptions.variant,
        tone: item.tone || currentOptions.tone,
        size: item.size || currentOptions.size,
        quiet: item.quiet !== undefined ? item.quiet : currentOptions.quiet,
        disabled: currentOptions.disabled || item.disabled,
        leadingDot: item.leadingDot !== undefined ? item.leadingDot : currentOptions.leadingDot,
        iconPosition: item.iconPosition,
        count: item.count,
        loading: item.loading,
        tooltip: item.tooltip,
        className: item.className,
        onChange(payload) {
          handleButtonChange(index, payload);
        },
      });
      root.appendChild(slot);
      return { slot, button };
    });

    container.appendChild(root);
  }

  function handleButtonChange(index, payload) {
    const item = items[index];
    if (!item) {
      return;
    }

    if (currentOptions.multi) {
      item.pressed = payload.pressed;
    } else {
      const nextPressed = payload.pressed;
      if (!nextPressed && !currentOptions.allowNone) {
        item.pressed = true;
      } else {
        items.forEach((entry, entryIndex) => {
          entry.pressed = entryIndex === index ? nextPressed : false;
        });
      }
    }

    enforceSelectionRules(item.id);
    syncButtons();
    emitChange(index);
  }

  function syncButtons() {
    buttons.forEach((entry, index) => {
      entry.button.setPressed(Boolean(items[index]?.pressed));
    });
  }

  function emitChange(index) {
    if (typeof currentOptions.onChange !== "function") {
      return;
    }
    const changedItem = cloneItem(items[index]);
    currentOptions.onChange({
      items: items.map(cloneItem),
      changedItem,
      changedIndex: index,
      group: api,
      value: api.getValue(),
    });
  }

  function destroyButtons() {
    buttons.forEach((entry) => entry.button.destroy());
    buttons = [];
  }

  function findIndexById(id) {
    return items.findIndex((item) => item.id === String(id));
  }

  const api = {
    getItems() {
      return items.map(cloneItem);
    },
    getValue() {
      const pressed = items.filter((item) => item.pressed).map((item) => item.id);
      return currentOptions.multi ? pressed : (pressed[0] ?? null);
    },
    setItems(nextItems = []) {
      items = normalizeItems(nextItems);
      enforceSelectionRules();
      render();
    },
    updateItem(id, patch = {}) {
      const index = findIndexById(id);
      if (index < 0) {
        return false;
      }
      items[index] = {
        ...items[index],
        ...(patch || {}),
        id: items[index].id,
      };
      enforceSelectionRules(items[index].id);
      render();
      return true;
    },
    setPressed(id, nextPressed, emit = false) {
      const index = findIndexById(id);
      if (index < 0) {
        return false;
      }
      if (currentOptions.multi) {
        items[index].pressed = Boolean(nextPressed);
      } else {
        const pressed = Boolean(nextPressed);
        if (!pressed && !currentOptions.allowNone) {
          items[index].pressed = true;
        } else {
          items.forEach((item, itemIndex) => {
            item.pressed = itemIndex === index ? pressed : false;
          });
        }
      }
      enforceSelectionRules(String(id));
      render();
      if (emit) {
        emitChange(index);
      }
      return true;
    },
    update(nextOptions = {}) {
      currentOptions = normalizeOptions({
        ...currentOptions,
        ...(nextOptions || {}),
      });
      if (nextOptions.items) {
        items = normalizeItems(nextOptions.items);
      }
      enforceSelectionRules();
      render();
    },
    destroy() {
      destroyButtons();
      events.clear();
      clearNode(container);
      root = null;
    },
  };

  enforceSelectionRules();
  render();
  return api;
}

function cloneItem(item) {
  return { ...item };
}

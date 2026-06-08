import { createElement } from "./ui.dom.js";

export function createSearchField(config = {}) {
  const classPrefix = config.classPrefix || "ui-search";
  const wrap = createElement("div", { className: `${classPrefix}-wrap` });
  const input = createElement("input", {
    className: config.inputClass || "ui-input",
    attrs: { placeholder: config.placeholder || "Search" },
  });
  const clearButton = createElement("button", {
    className: `${classPrefix}-clear`,
    text: config.clearText || "Clear",
    attrs: { type: "button", "aria-label": config.clearLabel || "Clear search" },
  });

  function setValue(nextValue) {
    const normalized = String(nextValue || "");
    input.value = normalized;
    clearButton.hidden = !normalized;
  }

  function notifyChange() {
    config.onChange?.(input.value);
  }

  function bind(events) {
    if (!events || typeof events.on !== "function") {
      return;
    }

    events.on(input, "input", () => {
      setValue(input.value);
      notifyChange();
    });

    events.on(input, "keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (!input.value) {
        return;
      }
      setValue("");
      notifyChange();
    });

    events.on(clearButton, "click", () => {
      setValue("");
      notifyChange();
      input.focus();
    });
  }

  setValue(config.value || "");
  wrap.append(input, clearButton);

  return {
    wrap,
    input,
    clearButton,
    setValue,
    bind,
  };
}

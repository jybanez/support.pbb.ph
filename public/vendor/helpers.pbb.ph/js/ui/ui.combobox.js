import { createElement, clearNode } from "./ui.dom.js";

const DEFAULT_OPTIONS = {
  value: "",
  placeholder: "",
  name: "",
  id: "",
  required: false,
  disabled: false,
  readonly: false,
  ariaLabel: "Text suggestions",
  suggestions: [],
  storageKey: "",
  maxSuggestions: 20,
  minChars: 0,
  noResultsText: "No saved entries",
  onInput: null,
  onChange: null,
};

export function createCombobox(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error("createCombobox(container, options) requires a valid container element.");
  }

  let currentOptions = normalizeOptions(options);
  let currentValue = String(currentOptions.value || "");
  let activeIndex = -1;
  let open = false;
  let renderedSuggestions = [];
  const listeners = [];
  const listId = currentOptions.id ? `${currentOptions.id}-listbox` : `ui-combobox-${Math.random().toString(36).slice(2)}-listbox`;

  const root = createElement("div", { className: "ui-combobox" });
  const input = createElement("input", {
    className: "ui-input ui-combobox-input",
    attrs: {
      type: "text",
      role: "combobox",
      autocomplete: "off",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-controls": listId,
      value: currentValue,
    },
  });
  const listbox = createElement("div", {
    className: "ui-combobox-listbox",
    attrs: { id: listId, role: "listbox" },
  });

  root.append(input, listbox);
  container.appendChild(root);

  applyOptions();
  syncList();

  on(input, "focus", () => {
    openList();
  });
  on(input, "input", () => {
    currentValue = input.value;
    currentOptions.onInput?.(currentValue, api);
    openList();
  });
  on(input, "change", () => {
    commitValue({ notify: true });
  });
  on(input, "blur", () => {
    window.setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        commitValue({ notify: true });
        closeList();
      }
    }, 0);
  });
  on(input, "keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openList();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      openList();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(renderedSuggestions[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
    }
  });
  on(root, "mousedown", (event) => {
    if (event.target === input) {
      return;
    }
    event.preventDefault();
  });

  function applyOptions() {
    input.value = currentValue;
    input.placeholder = currentOptions.placeholder || "";
    input.required = Boolean(currentOptions.required);
    input.disabled = Boolean(currentOptions.disabled);
    input.readOnly = Boolean(currentOptions.readonly);
    if (currentOptions.id) {
      input.id = currentOptions.id;
    } else {
      input.removeAttribute("id");
    }
    if (currentOptions.name) {
      input.name = currentOptions.name;
    } else {
      input.removeAttribute("name");
    }
    if (currentOptions.ariaLabel) {
      input.setAttribute("aria-label", currentOptions.ariaLabel);
    } else {
      input.removeAttribute("aria-label");
    }
  }

  function getSuggestions() {
    const term = String(input.value || "").trim().toLowerCase();
    if (term.length < currentOptions.minChars) {
      return [];
    }
    const values = uniqueValues([
      ...readHistory(),
      ...currentOptions.suggestions,
    ]);
    const filtered = term
      ? values.filter((value) => String(value).toLowerCase().includes(term))
      : values;
    return filtered.slice(0, currentOptions.maxSuggestions);
  }

  function syncList() {
    renderedSuggestions = getSuggestions();
    clearNode(listbox);
    activeIndex = renderedSuggestions.length ? Math.min(Math.max(activeIndex, -1), renderedSuggestions.length - 1) : -1;
    if (!renderedSuggestions.length) {
      const empty = createElement("div", {
        className: "ui-combobox-empty",
        text: currentOptions.noResultsText,
      });
      listbox.appendChild(empty);
      return;
    }
    renderedSuggestions.forEach((suggestion, index) => {
      const option = createElement("button", {
        className: `ui-combobox-option${index === activeIndex ? " is-active" : ""}`,
        text: suggestion,
        attrs: {
          type: "button",
          role: "option",
          "aria-selected": index === activeIndex ? "true" : "false",
        },
      });
      on(option, "click", () => selectSuggestion(suggestion));
      listbox.appendChild(option);
    });
  }

  function openList() {
    if (currentOptions.disabled || currentOptions.readonly) {
      return;
    }
    open = true;
    root.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
    syncList();
  }

  function closeList() {
    open = false;
    activeIndex = -1;
    root.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function moveActive(delta) {
    syncList();
    if (!renderedSuggestions.length) {
      activeIndex = -1;
      return;
    }
    activeIndex = (activeIndex + delta + renderedSuggestions.length) % renderedSuggestions.length;
    syncList();
  }

  function selectSuggestion(suggestion) {
    const previous = currentValue;
    currentValue = String(suggestion || "");
    input.value = currentValue;
    rememberValue(currentValue);
    closeList();
    if (currentValue !== previous) {
      currentOptions.onChange?.(currentValue, api);
    }
  }

  function commitValue({ notify = false } = {}) {
    const previous = currentValue;
    currentValue = String(input.value || "");
    rememberValue(currentValue);
    if (notify && currentValue !== previous) {
      currentOptions.onChange?.(currentValue, api);
    }
  }

  function setValue(nextValue) {
    currentValue = String(nextValue || "");
    input.value = currentValue;
    syncList();
  }

  function update(nextOptions = {}) {
    const hasValue = Object.prototype.hasOwnProperty.call(nextOptions || {}, "value");
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    if (hasValue) {
      currentValue = String(nextOptions.value || "");
    }
    applyOptions();
    syncList();
  }

  function readHistory() {
    if (!currentOptions.storageKey || typeof window === "undefined" || !window.localStorage) {
      return [];
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(currentOptions.storageKey) || "[]");
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function rememberValue(value) {
    const normalized = String(value || "").trim();
    if (!normalized || !currentOptions.storageKey || typeof window === "undefined" || !window.localStorage) {
      return;
    }
    const values = uniqueValues([normalized, ...readHistory()]).slice(0, currentOptions.maxSuggestions);
    try {
      window.localStorage.setItem(currentOptions.storageKey, JSON.stringify(values));
    } catch (_) {
      // Ignore quota or unavailable storage failures; the input remains usable.
    }
  }

  function clearHistory() {
    if (!currentOptions.storageKey || typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.removeItem(currentOptions.storageKey);
    syncList();
  }

  function on(el, event, handler) {
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  }

  const api = {
    root,
    input,
    listbox,
    getValue() {
      return currentValue;
    },
    setValue,
    getSuggestions,
    clearHistory,
    update,
    focus() {
      input.focus();
    },
    destroy() {
      listeners.splice(0).forEach((off) => off());
      clearNode(container);
    },
  };

  return api;
}

function normalizeOptions(options = {}) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.suggestions = uniqueValues(next.suggestions);
  next.storageKey = String(next.storageKey || next.historyStorageKey || "");
  next.maxSuggestions = Math.max(1, Number(next.maxSuggestions || 20));
  next.minChars = Math.max(0, Number(next.minChars || 0));
  next.required = Boolean(next.required);
  next.disabled = Boolean(next.disabled);
  next.readonly = Boolean(next.readonly);
  return next;
}

function uniqueValues(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

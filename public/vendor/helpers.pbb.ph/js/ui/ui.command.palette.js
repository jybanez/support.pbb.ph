import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  commands: [],
  providers: [], // [(ctx) => command[] | Promise<command[]>]
  providerDebounceMs: 120,
  placeholder: "Search commands...",
  emptyText: "No matching commands.",
  loadingText: "Loading commands...",
  title: "Command Palette",
  ariaLabel: "Command palette",
  shortcut: "k",
  metaKey: true,
  ctrlKey: true,
  className: "",
  groupBySection: true,
  showPinned: true,
  showRecent: true,
  pinnedCommandIds: [],
  recentCommandIds: [],
  maxRecent: 8,
  historyStorageKey: "",
  onRun: null,
  onHistoryChange: null,
};

export function createCommandPalette(options = {}) {
  const events = createEventBag();
  const listEvents = createEventBag();
  const docEvents = createEventBag();
  let currentOptions = normalizeOptions(options);
  let baseCommands = normalizeCommands(currentOptions.commands);
  let providerCommands = [];
  let open = false;
  let query = "";
  let activeIndex = 0;
  let loading = false;
  let providerTimer = null;
  let resolveToken = 0;
  let root = null;
  let panel = null;
  let input = null;
  let list = null;
  let recentIds = hydrateRecentIds(currentOptions);
  let lastFocusedElement = null;
  const titleId = `ui-command-palette-title-${Math.random().toString(36).slice(2, 10)}`;

  function ensureDom() {
    if (root) {
      return;
    }
    root = createElement("div", {
      className: `ui-command-palette ${currentOptions.className || ""}`.trim(),
      attrs: { "aria-hidden": "true" },
    });
    panel = createElement("section", { className: "ui-command-palette-panel", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-label": currentOptions.ariaLabel } });
    const header = createElement("header", { className: "ui-command-palette-header" });
    header.appendChild(createElement("h3", { className: "ui-title", text: currentOptions.title, attrs: { id: titleId } }));

    input = createElement("input", {
      className: "ui-input ui-command-palette-input",
      attrs: { type: "search", placeholder: currentOptions.placeholder, autocomplete: "off" },
    });
    list = createElement("div", { className: "ui-command-palette-list", attrs: { role: "listbox" } });

    panel.append(header, input, list);
    root.appendChild(panel);
    document.body.appendChild(root);

    events.on(root, "click", (event) => {
      if (event.target === root) {
        close({ reason: "backdrop" });
      }
    });
    events.on(input, "input", () => {
      query = String(input.value || "");
      activeIndex = 0;
      scheduleProvidersResolve();
      renderList();
    });
    events.on(input, "keydown", onInputKeyDown);
    scheduleProvidersResolve();
    renderList();
  }

  function scheduleProvidersResolve() {
    if (providerTimer != null) {
      clearTimeout(providerTimer);
      providerTimer = null;
    }
    providerTimer = setTimeout(() => {
      providerTimer = null;
      resolveProviders();
    }, Math.max(0, Number(currentOptions.providerDebounceMs) || 0));
  }

  async function resolveProviders() {
    const providers = Array.isArray(currentOptions.providers) ? currentOptions.providers : [];
    if (!providers.length) {
      providerCommands = [];
      loading = false;
      renderList();
      return;
    }
    const token = ++resolveToken;
    loading = true;
    renderList();
    const context = {
      query: query.trim(),
      state: getState(),
      open,
    };
    const resolved = await Promise.all(providers.map(async (provider) => {
      if (typeof provider !== "function") {
        return [];
      }
      try {
        const value = await provider(context);
        return normalizeCommands(value);
      } catch (_error) {
        return [];
      }
    }));
    if (token !== resolveToken) {
      return;
    }
    providerCommands = dedupeCommands(resolved.flat());
    loading = false;
    renderList();
  }

  function getDisplayGroups() {
    const merged = dedupeCommands(baseCommands.concat(providerCommands));
    const needle = query.trim().toLowerCase();
    if (needle) {
      const filtered = merged.filter((cmd) => {
        const haystack = [cmd.label, cmd.section, cmd.keywords.join(" ")].join(" ").toLowerCase();
        return haystack.includes(needle);
      });
      return groupCommands(filtered, currentOptions.groupBySection);
    }

    const groups = [];
    const pinned = resolvePinnedCommands(merged, currentOptions.pinnedCommandIds);
    const recent = resolveRecentCommands(merged, recentIds);
    const excludedIds = new Set();

    if (currentOptions.showPinned && pinned.length) {
      groups.push({ id: "__pinned__", label: "Pinned", commands: pinned });
      pinned.forEach((cmd) => excludedIds.add(cmd.id));
    }
    if (currentOptions.showRecent && recent.length) {
      groups.push({ id: "__recent__", label: "Recent", commands: recent.filter((cmd) => !excludedIds.has(cmd.id)) });
      recent.forEach((cmd) => excludedIds.add(cmd.id));
    }
    const remainder = merged.filter((cmd) => !excludedIds.has(cmd.id));
    groups.push(...groupCommands(remainder, currentOptions.groupBySection));
    return groups.filter((group) => Array.isArray(group.commands) && group.commands.length);
  }

  function flattenGroups(groups) {
    return groups.reduce((acc, group) => acc.concat(group.commands), []);
  }

  function renderList() {
    if (!list) {
      return;
    }
    listEvents.clear();
    clearNode(list);
    const groups = getDisplayGroups();
    const flat = flattenGroups(groups);

    if (loading) {
      list.appendChild(createElement("p", { className: "ui-command-palette-loading", text: currentOptions.loadingText }));
    }

    if (!flat.length && !loading) {
      list.appendChild(createElement("p", { className: "ui-command-palette-empty", text: currentOptions.emptyText }));
      return;
    }

    activeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, flat.length - 1)));

    let offset = 0;
    groups.forEach((group) => {
      if (currentOptions.groupBySection || group.id === "__pinned__" || group.id === "__recent__") {
        list.appendChild(createElement("p", {
          className: "ui-command-palette-group",
          text: group.label || "Commands",
        }));
      }
      group.commands.forEach((command, index) => {
        const globalIndex = offset + index;
        const row = createElement("button", {
          className: `ui-command-palette-item${globalIndex === activeIndex ? " is-active" : ""}${command.disabled ? " is-disabled" : ""}`,
          attrs: {
            type: "button",
            role: "option",
            "aria-selected": globalIndex === activeIndex ? "true" : "false",
            ...(command.disabled ? { disabled: "disabled" } : {}),
          },
        });
        const left = createElement("span", { className: "ui-command-palette-item-left" });
        if (command.icon) {
          left.appendChild(createElement("span", { className: "ui-command-palette-item-icon", html: command.icon }));
        }
        const textWrap = createElement("span", { className: "ui-command-palette-item-text" });
        textWrap.appendChild(createElement("span", { className: "ui-command-palette-item-label", text: command.label }));
        if (command.section) {
          textWrap.appendChild(createElement("span", { className: "ui-command-palette-item-section", text: command.section }));
        }
        left.appendChild(textWrap);
        row.appendChild(left);
        if (command.shortcut) {
          row.appendChild(createElement("kbd", { className: "ui-command-palette-item-shortcut", text: command.shortcut }));
        }
        listEvents.on(row, "mouseenter", () => {
          activeIndex = globalIndex;
          renderList();
        });
        listEvents.on(row, "click", () => runCommand(command));
        list.appendChild(row);
      });
      offset += group.commands.length;
    });
    ensureActiveVisible();
  }

  function ensureActiveVisible() {
    const active = list?.querySelector?.(".ui-command-palette-item.is-active");
    active?.scrollIntoView?.({ block: "nearest" });
  }

  function onInputKeyDown(event) {
    const flat = flattenGroups(getDisplayGroups());
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (flat.length) {
        activeIndex = (activeIndex + 1) % flat.length;
        renderList();
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (flat.length) {
        activeIndex = (activeIndex - 1 + flat.length) % flat.length;
        renderList();
      }
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      activeIndex = 0;
      renderList();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (flat.length) {
        activeIndex = flat.length - 1;
        renderList();
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = flat[activeIndex];
      if (active) {
        runCommand(active);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close({ reason: "escape" });
    }
  }

  function runCommand(command) {
    if (!command || command.disabled) {
      return;
    }
    touchRecent(command.id);
    currentOptions.onRun?.(command);
    if (typeof command.run === "function") {
      command.run(command);
    }
    close({ reason: "run", commandId: command.id });
  }

  function touchRecent(commandId) {
    recentIds = [commandId, ...recentIds.filter((id) => id !== commandId)].slice(0, Math.max(1, currentOptions.maxRecent));
    persistRecentIds(currentOptions, recentIds);
    currentOptions.onHistoryChange?.(recentIds.slice(), getState());
  }

  function openPalette() {
    ensureDom();
    if (open) {
      return;
    }
    open = true;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.setAttribute("aria-hidden", "false");
    root.classList.add("is-open");
    input.value = query;
    input.focus();
    input.select();
    scheduleProvidersResolve();
    renderList();
  }

  function close(_meta = {}) {
    if (!open || !root) {
      return;
    }
    open = false;
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      try {
        lastFocusedElement.focus();
      } catch (_error) {
        // Ignore focus restore failures.
      }
    }
    lastFocusedElement = null;
  }

  function bindShortcut() {
    docEvents.clear();
    docEvents.on(document, "keydown", (event) => {
      const keyMatch = String(event.key || "").toLowerCase() === String(currentOptions.shortcut || "k").toLowerCase();
      if (!keyMatch) {
        return;
      }
      const metaOk = currentOptions.metaKey ? Boolean(event.metaKey) : true;
      const ctrlOk = currentOptions.ctrlKey ? Boolean(event.ctrlKey) : true;
      if (!metaOk && !ctrlOk) {
        return;
      }
      event.preventDefault();
      if (open) {
        close({ reason: "shortcut-toggle" });
      } else {
        openPalette();
      }
    });
  }

  function update(nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    baseCommands = normalizeCommands(currentOptions.commands);
    recentIds = hydrateRecentIds(currentOptions, recentIds);
    if (input) {
      input.setAttribute("placeholder", currentOptions.placeholder);
    }
    bindShortcut();
    scheduleProvidersResolve();
    renderList();
  }

  function destroy() {
    if (providerTimer != null) {
      clearTimeout(providerTimer);
      providerTimer = null;
    }
    resolveToken += 1;
    docEvents.clear();
    listEvents.clear();
    events.clear();
    if (root?.parentNode) {
      root.parentNode.removeChild(root);
    }
    root = null;
    panel = null;
    input = null;
    list = null;
    open = false;
  }

  function getState() {
    const merged = dedupeCommands(baseCommands.concat(providerCommands));
    return {
      open,
      query,
      loading,
      activeIndex,
      commands: merged.map((cmd) => ({ ...cmd })),
      recentCommandIds: recentIds.slice(),
      options: { ...currentOptions },
    };
  }

  bindShortcut();

  return {
    open: openPalette,
    close,
    update,
    setQuery(nextQuery) {
      query = String(nextQuery || "");
      if (input) {
        input.value = query;
      }
      activeIndex = 0;
      scheduleProvidersResolve();
      renderList();
    },
    getState,
    destroy,
  };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.ariaLabel = String(next.ariaLabel || "Command palette");
  next.providers = Array.isArray(next.providers) ? next.providers : [];
  next.providerDebounceMs = Math.max(0, Number(next.providerDebounceMs) || 0);
  next.groupBySection = Boolean(next.groupBySection);
  next.showPinned = Boolean(next.showPinned);
  next.showRecent = Boolean(next.showRecent);
  next.maxRecent = Math.max(1, Number(next.maxRecent) || 8);
  next.pinnedCommandIds = Array.isArray(next.pinnedCommandIds) ? next.pinnedCommandIds.map((id) => String(id)) : [];
  next.recentCommandIds = Array.isArray(next.recentCommandIds) ? next.recentCommandIds.map((id) => String(id)) : [];
  next.historyStorageKey = next.historyStorageKey == null ? "" : String(next.historyStorageKey);
  return next;
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands)) {
    return [];
  }
  return commands
    .map((command, index) => {
      if (!command || typeof command !== "object") {
        return null;
      }
      return {
        id: String(command.id ?? `cmd-${index}`),
        label: String(command.label ?? command.id ?? `Command ${index + 1}`),
        section: command.section == null ? "" : String(command.section),
        keywords: Array.isArray(command.keywords) ? command.keywords.map((k) => String(k)) : [],
        shortcut: command.shortcut == null ? "" : String(command.shortcut),
        icon: command.icon == null ? "" : String(command.icon),
        disabled: Boolean(command.disabled),
        run: typeof command.run === "function" ? command.run : null,
      };
    })
    .filter(Boolean);
}

function dedupeCommands(commands) {
  const byId = new Map();
  commands.forEach((command) => {
    if (!command || !command.id) {
      return;
    }
    byId.set(command.id, command);
  });
  return Array.from(byId.values());
}

function groupCommands(commands, grouped) {
  if (!grouped) {
    return [{ id: "__all__", label: "Commands", commands }];
  }
  const bySection = new Map();
  commands.forEach((command) => {
    const section = command.section || "General";
    if (!bySection.has(section)) {
      bySection.set(section, []);
    }
    bySection.get(section).push(command);
  });
  return Array.from(bySection.entries()).map(([label, sectionCommands], index) => ({
    id: `section-${index}`,
    label,
    commands: sectionCommands,
  }));
}

function resolvePinnedCommands(commands, pinnedIds) {
  const byId = new Map(commands.map((command) => [command.id, command]));
  return pinnedIds.map((id) => byId.get(id)).filter(Boolean);
}

function resolveRecentCommands(commands, recentIds) {
  const byId = new Map(commands.map((command) => [command.id, command]));
  return recentIds.map((id) => byId.get(id)).filter(Boolean);
}

function hydrateRecentIds(options, fallback = []) {
  const merged = Array.isArray(options.recentCommandIds) ? options.recentCommandIds.slice() : [];
  if (!options.historyStorageKey) {
    return merged.length ? merged : fallback.slice();
  }
  try {
    const raw = window.localStorage.getItem(options.historyStorageKey);
    if (!raw) {
      return merged.length ? merged : fallback.slice();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value));
    }
    return merged.length ? merged : fallback.slice();
  } catch (_error) {
    return merged.length ? merged : fallback.slice();
  }
}

function persistRecentIds(options, ids) {
  if (!options.historyStorageKey) {
    return;
  }
  try {
    window.localStorage.setItem(options.historyStorageKey, JSON.stringify(ids));
  } catch (_error) {
    // best effort
  }
}

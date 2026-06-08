import { normalizeIncidentOptions, renderEmpty, safeArray } from "./incident.base.js";
import { incidentTeamsAssignmentsEditor } from "./incident.teams.assignments.editor.js";
import { incidentTeamsAssignmentsViewer } from "./incident.teams.assignments.viewer.js";
import { createEventBag } from "../ui/ui.events.js";
import { createDrawer } from "../ui/ui.drawer.js";
import { createElement } from "../ui/ui.dom.js";
import { createSearchField } from "../ui/ui.search.js";

const REQUIRED_OPTION_KEYS = [
  "categories",
  "teams",
  "noticeAlreadyExist",
  "incident_id",
  "operator_id",
];

const DEFAULT_LIST_OPTIONS = {
  headerText: "Dispatch Details",
  drawerHeaderText: "Select Teams to Dispatch",
  editable: true,
};

let assignmentClientKeySeed = 0;

export function incidentTeamsAssignments(container, data, options = {}) {
  let currentData = data;
  let currentOptions = normalizeListOptions(options);
  let busyAssignments = normalizeBusyAssignments(currentOptions.busyAssignments);
  let listItems = getAssignments(currentData);
  let childMap = new Map(); // key -> { instance, li, mode }
  let orderKeys = [];

  let drawerState = { open: false, category: "all", search: "" };
  let headerEvents = createEventBag();
  let drawerEvents = null;
  let drawerApi = null;
  let drawerElements = null;

  let rootEl = null;
  let headerEl = null;
  let bodyEl = null;
  let listEl = null;
  let lastShellSignature = "";

  function replaceListItemByKey(key, nextItem) {
    const normalizedItem = normalizeAssignmentItem(nextItem);
    listItems = listItems.map((item, index) => (getItemKey(item, index) === key ? normalizedItem : item));
    return normalizedItem;
  }

  function buildListProposalByKey(key, nextItem, meta = {}) {
    if (meta.reason === "remove") {
      return cloneData(listItems).filter((item, index) => getItemKey(item, index) !== key);
    }
    return cloneData(listItems).map((item, index) => (
      getItemKey(item, index) === key ? cloneData(nextItem) : cloneData(item)
    ));
  }

  function emitNormalizedChange(nextItem, meta = {}) {
    const nextList = Array.isArray(meta.nextList) ? meta.nextList : cloneData(listItems);
    const nextMeta = {
      ...meta,
      item: nextItem ? cloneData(nextItem) : null,
      key: meta.key || null,
    };
    if (nextItem) {
      currentOptions.onItemChange?.(cloneData(nextItem), nextMeta);
    }
    currentOptions.onChange?.(cloneData(nextList), nextMeta);
  }

  function shellSignature(optionsValue) {
    return JSON.stringify({
      editable: !!optionsValue.editable,
      headerText: optionsValue.headerText,
      theme: optionsValue.theme,
      className: optionsValue.className || "",
    });
  }

  function ensureRoot() {
    const signature = shellSignature(currentOptions);
    const shouldRebuildShell = !rootEl || signature !== lastShellSignature;
    if (!shouldRebuildShell) {
      applyRootAttrs();
      return;
    }

    destroyChildren();
    closeDrawer();
    headerEvents.clear();

    if (container && container.nodeType === 1) {
      container.innerHTML = "";
    }
    rootEl = document.createElement("div");
    rootEl.className = "hh-incident-teams-assignments";
    headerEl = document.createElement("div");
    headerEl.className = "hh-team-list-header";
    bodyEl = document.createElement("div");
    bodyEl.className = "hh-team-list-body";
    rootEl.append(headerEl, bodyEl);
    if (container && container.nodeType === 1) {
      container.appendChild(rootEl);
    }
    applyRootAttrs();
    renderHeader();
    ensureListContainer();
    lastShellSignature = signature;
  }

  function applyRootAttrs() {
    if (!rootEl) {
      return;
    }
    rootEl.dataset.theme = currentOptions.theme === "light" ? "light" : "dark";
    rootEl.className = "hh-incident-teams-assignments";
    if (currentOptions.className) {
      rootEl.classList.add(currentOptions.className);
    }
  }

  function ensureListContainer() {
    if (!bodyEl) {
      return;
    }
    bodyEl.innerHTML = "";
    listEl = document.createElement("ul");
    listEl.className = "hh-list";
    bodyEl.appendChild(listEl);
  }

  function closeDrawer() {
    drawerEvents?.clear();
    drawerEvents = null;
    drawerApi?.close();
    drawerApi = null;
    drawerElements = null;
  }

  function ensureDrawer() {
    if (!currentOptions.editable) {
      return;
    }
    if (drawerApi) {
      drawerApi.open(document.body);
      focusDrawerSearch();
      return;
    }

    drawerApi = createDrawer({
      title: currentOptions.drawerHeaderText,
      backdropClass: "hh-team-drawer-backdrop",
      panelClass: "hh-team-drawer",
      headerClass: "hh-team-drawer-header",
      titleClass: "hh-title ui-title",
      closeClass: "hh-drawer-close ui-drawer-close",
      bodyClass: "hh-team-drawer-body",
      onClose() {
        if (drawerState.open) {
          drawerState.open = false;
          currentOptions.onCloseDrawer?.();
        }
      },
    });

    const left = createElement("div", { className: "hh-team-categories" });
    const right = createElement("div", { className: "hh-team-chooser" });
    const searchField = createSearchField({
      classPrefix: "hh-team-search",
      inputClass: "hh-input ui-input",
      placeholder: "Search teams",
      value: drawerState.search,
      onChange(value) {
        drawerState.search = value;
        renderDrawerContent(left, chips);
      },
    });
    const chips = createElement("div", { className: "hh-team-chips" });

    right.append(searchField.wrap, chips);
    drawerApi.body.append(left, right);
    drawerApi.open(document.body);

    drawerEvents = createEventBag();
    searchField.bind(drawerEvents);

    drawerElements = { left, chips, searchInput: searchField.input };
    renderDrawerContent(left, chips);
    focusDrawerSearch();
  }

  function focusDrawerSearch() {
    focusElementSoon(() => drawerElements?.searchInput, {
      scope: drawerApi?.panel,
      allowFocusedElement: drawerApi?.closeButton,
    });
  }

  function renderDrawerContent(left, chips) {
    left.innerHTML = "";
    chips.innerHTML = "";

    const allCard = createCategoryCard("all", "All Categories", drawerState.category === "all");
    left.appendChild(allCard);

    safeArray(currentOptions.categories).forEach((category) => {
      const card = createCategoryCard(
        String(category?.id),
        category?.name || `Category #${category?.id ?? "-"}`,
        String(drawerState.category) === String(category?.id)
      );
      left.appendChild(card);
    });

    const selectedCategory = String(drawerState.category);
    const term = String(drawerState.search || "").trim().toLowerCase();
    const teams = safeArray(currentOptions.teams).filter((team) => {
      const categoryMatch =
        selectedCategory === "all" || String(team?.team_category_id) === selectedCategory;
      if (!categoryMatch) {
        return false;
      }
      if (!term) {
        return true;
      }
      return String(team?.name || "").toLowerCase().includes(term);
    });

    teams.forEach((team) => {
      const exists = teamExistsInList(team?.id);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `hh-team-chip${exists ? " is-existing" : ""}`;
      chip.textContent = team?.name || `Team #${team?.id ?? "-"}`;
      drawerEvents?.on(chip, "click", () => {
        if (exists) {
          currentOptions.noticeAlreadyExist(team);
          return;
        }
        const assignment = normalizeAssignmentItem({
          incident_id: currentOptions.incident_id,
          team_id: team?.id,
          assigned_by_operator_id: currentOptions.operator_id,
          status: "assigned",
          team,
        });
        listItems = [...listItems, assignment];
        const nextIndex = listItems.length - 1;
        const nextKey = getItemKey(assignment, nextIndex);
        const nextAnchor = getAssignmentAnchor(assignment, nextIndex);
        currentOptions.onAssignTeam?.(assignment);
        emitNormalizedChange(assignment, {
          reason: "add",
          localStateChanged: true,
          key: nextKey,
          nextList: cloneData(listItems),
        });
        closeDrawer();
        reconcileList();
        focusChildFirstFieldByAnchor(nextAnchor);
      });
      chips.appendChild(chip);
    });
  }

  function createCategoryCard(value, label, active) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `hh-team-category-card${active ? " is-active" : ""}`;
    card.textContent = label;
    drawerEvents?.on(card, "click", () => {
      drawerState.category = value;
      if (drawerElements) {
        renderDrawerContent(drawerElements.left, drawerElements.chips);
      }
    });
    return card;
  }

  function openDrawer() {
    if (!currentOptions.editable) {
      return;
    }
    drawerState.open = true;
    currentOptions.onOpenDrawer?.();
    ensureDrawer();
  }

  function renderHeader() {
    if (!headerEl) {
      return;
    }
    headerEvents.clear();
    headerEl.innerHTML = "";
    const hasHeaderText = String(currentOptions.headerText || "").trim().length > 0;
    if (!hasHeaderText) {
      headerEl.hidden = true;
      return;
    }

    headerEl.hidden = false;
    const title = document.createElement("h4");
    title.className = "hh-title ui-title";
    title.textContent = currentOptions.headerText;
    headerEl.appendChild(title);

    if (currentOptions.editable) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "hh-button ui-button";
      action.textContent = "Assign Teams";
      headerEvents.on(action, "click", openDrawer);
      headerEl.appendChild(action);
    }
  }

  function buildItemOptions(item) {
    const busyState = resolveBusyForItem(item);
    return {
      ...currentOptions,
      className: "",
      incident_id: item?.incident_id ?? currentOptions.incident_id,
      team_id: item?.team_id ?? currentOptions.team_id,
      assigned_by_operator_id: item?.assigned_by_operator_id ?? currentOptions.operator_id,
      busy: busyState.busy,
      busyAction: busyState.action,
      busyMessage: busyState.message,
    };
  }

  function buildChildOptions(item, key) {
    const itemOptions = buildItemOptions(item);
    itemOptions.onItemChange = (nextItem, meta = {}) => {
      const nextMeta = { ...meta, key };
      if (meta.localStateChanged !== false) {
        replaceListItemByKey(key, nextItem);
      }
      const nextList = meta.localStateChanged === false
        ? buildListProposalByKey(key, nextItem, meta)
        : cloneData(listItems);
      emitNormalizedChange(nextItem, {
        ...nextMeta,
        nextList,
      });
    };
    return itemOptions;
  }

  function itemMode() {
    return currentOptions.editable ? "editor" : "viewer";
  }

  function createChild(item, key, index) {
    const li = document.createElement("li");
    li.className = "hh-item";
    li.setAttribute("data-assignment-anchor", getAssignmentAnchor(item, index));
    const mount = document.createElement("div");
    mount.className = "hh-item-viewer";
    li.appendChild(mount);

    const mode = itemMode();
    const itemOptions = buildChildOptions(item, key);

    const instance =
      mode === "editor"
        ? incidentTeamsAssignmentsEditor(mount, item, itemOptions)
        : incidentTeamsAssignmentsViewer(mount, item, itemOptions);

    childMap.set(key, { instance, li, mode });
    return li;
  }

  function reconcileList() {
    if (!bodyEl) {
      return;
    }
    const activeAnchorId = getActiveAssignmentAnchorId();
    const previousScrollY = typeof window !== "undefined" ? window.scrollY : 0;

    if (!listItems.length) {
      destroyChildren();
      bodyEl.innerHTML = "";
      renderEmpty(bodyEl, currentOptions.emptyText);
      restoreAnchorPosition(activeAnchorId, previousScrollY);
      return;
    }

    if (!listEl || !listEl.parentNode) {
      ensureListContainer();
    } else if (bodyEl.firstChild !== listEl) {
      bodyEl.innerHTML = "";
      bodyEl.appendChild(listEl);
    }

    const nextKeys = [];
    const nextKeySet = new Set();
    const mode = itemMode();

    listItems.forEach((item, index) => {
      const key = getItemKey(item, index);
      nextKeys.push(key);
      nextKeySet.add(key);

      const existing = childMap.get(key);
      if (existing && existing.mode === mode) {
        existing.li.setAttribute("data-assignment-anchor", getAssignmentAnchor(item, index));
        existing.instance.update(item, buildChildOptions(item, key));
      } else {
        if (existing) {
          existing.instance.destroy?.();
          existing.li.remove();
          childMap.delete(key);
        }
        createChild(item, key, index);
      }
    });

    // Remove stale children
    [...childMap.entries()].forEach(([key, entry]) => {
      if (!nextKeySet.has(key)) {
        entry.instance.destroy?.();
        entry.li.remove();
        childMap.delete(key);
      }
    });

    // Reorder DOM
    nextKeys.forEach((key) => {
      const entry = childMap.get(key);
      if (entry) {
        listEl.appendChild(entry.li);
      }
    });

    orderKeys = nextKeys;
    restoreAnchorPosition(activeAnchorId, previousScrollY);
  }

  function teamExistsInList(teamId) {
    return listItems.some((item) => {
      const sameTeam = String(item?.team_id) === String(teamId);
      const active = normalizeStatus(item?.status) !== "cancelled";
      return sameTeam && active;
    });
  }

  function resolveBusyForItem(item) {
    const itemBusy = normalizeBusyEntry({
      busy: item?.busy,
      action: item?.busyAction ?? item?.busy_action,
      message: item?.busyMessage ?? item?.busy_message,
    }, Boolean(item?.busy));
    if (itemBusy.busy) {
      return itemBusy;
    }
    const keys = [
      item?.id,
      item?._client_key,
      item?.client_key,
      item?.team_assignment_id,
    ].map((value) => String(value ?? "").trim()).filter(Boolean);
    for (const key of keys) {
      if (busyAssignments[key]?.busy) {
        return busyAssignments[key];
      }
    }
    return { busy: false, action: "", message: "" };
  }

  function destroyChildren() {
    childMap.forEach((entry) => entry.instance.destroy?.());
    childMap.clear();
    orderKeys = [];
    if (listEl) {
      listEl.innerHTML = "";
    }
  }

  function validateRequiredOptions() {
    return REQUIRED_OPTION_KEYS.filter((key) => {
      const value = currentOptions?.[key];
      if (key === "noticeAlreadyExist") {
        return typeof value !== "function";
      }
      if (key === "categories" || key === "teams") {
        return !Array.isArray(value);
      }
      return value === undefined || value === null || value === "";
    });
  }

  function renderFull() {
    const missingRequired = validateRequiredOptions();
    if (missingRequired.length) {
      if (container && container.nodeType === 1) {
        container.innerHTML = "";
      }
      rootEl = null;
      headerEl = null;
      bodyEl = null;
      listEl = null;
      destroyChildren();
      closeDrawer();
      headerEvents.clear();
      console.error(
        `[incident.teams.assignments] Missing required options: ${missingRequired.join(", ")}`
      );
      return;
    }
    ensureRoot();
    renderHeader();
    reconcileList();
  }

  function setList(items = []) {
    listItems = safeArray(items).map((item) => normalizeAssignmentItem(item));
    renderFull();
  }

  function setItemBusy(assignmentId, busy = true, options = {}) {
    const key = String(assignmentId ?? "").trim();
    if (!key) {
      return;
    }
    if (busy) {
      busyAssignments[key] = normalizeBusyEntry(options, true);
    } else {
      delete busyAssignments[key];
    }
    currentOptions = {
      ...currentOptions,
      busyAssignments: cloneData(busyAssignments),
    };
    renderFull();
  }

  function focusChildFirstFieldByAnchor(anchorId) {
    focusElementAfterDelay(() => {
      const child = findElementByDataAttribute(listEl, "data-assignment-anchor", anchorId);
      return getFirstFieldControl(child);
    }, 280);
  }

  function clearItemBusy(assignmentId) {
    setItemBusy(assignmentId, false);
  }

  renderFull();

  return {
    destroy() {
      destroyChildren();
      closeDrawer();
      headerEvents.clear();
      if (container && container.nodeType === 1) {
        container.innerHTML = "";
      }
      rootEl = null;
      headerEl = null;
      bodyEl = null;
      listEl = null;
      headerEvents = createEventBag();
    },
    update(nextData, nextOptions = {}) {
      currentData = nextData;
      currentOptions = normalizeListOptions({ ...currentOptions, ...nextOptions });
      if (Object.prototype.hasOwnProperty.call(nextOptions || {}, "busyAssignments")) {
        busyAssignments = normalizeBusyAssignments(currentOptions.busyAssignments);
      }
      listItems = getAssignments(currentData);
      renderFull();
    },
    setItemBusy,
    clearItemBusy,
    setList,
    getData() {
      if (!orderKeys.length) {
        return cloneData(listItems);
      }
      return orderKeys.map((key, index) => {
        const entry = childMap.get(key);
        if (entry?.instance?.getData) {
          return cloneData(entry.instance.getData());
        }
        return cloneData(listItems[index] || null);
      });
    },
    getState() {
      return {
        list: cloneData(listItems),
        options: cloneData(currentOptions),
        busyAssignments: cloneData(busyAssignments),
        drawerState: cloneData(drawerState),
      };
    },
  };
}

function getAssignments(source) {
  if (Array.isArray(source)) {
    return source.map((item) => normalizeAssignmentItem(item));
  }
  return safeArray(source?.team_assignments).map((item) => normalizeAssignmentItem(item));
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeListOptions(options = {}) {
  const normalized = normalizeIncidentOptions(options);
  return {
    ...normalized,
    ...DEFAULT_LIST_OPTIONS,
    ...options,
    busyAssignments: normalizeBusyAssignments(options.busyAssignments),
  };
}

function normalizeBusyAssignments(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((map, [key, entry]) => {
    const normalizedKey = String(key ?? "").trim();
    if (!normalizedKey) {
      return map;
    }
    const normalizedEntry = normalizeBusyEntry(entry, Boolean(entry));
    if (normalizedEntry.busy) {
      map[normalizedKey] = normalizedEntry;
    }
    return map;
  }, {});
}

function normalizeBusyEntry(entry = {}, fallbackBusy = false) {
  if (entry === true) {
    return { busy: true, action: "", message: "" };
  }
  if (!entry || typeof entry !== "object") {
    return { busy: Boolean(fallbackBusy), action: "", message: "" };
  }
  return {
    busy: entry.busy == null ? Boolean(fallbackBusy) : entry.busy !== false,
    action: entry.action == null ? "" : String(entry.action),
    message: entry.message == null ? "" : String(entry.message),
  };
}

function getItemKey(item, index) {
  if (item?.id !== undefined && item?.id !== null) {
    return `id:${item.id}`;
  }
  if (item?._client_key) {
    return `client:${item._client_key}`;
  }
  return `fallback:${item?.incident_id ?? "i"}:${item?.team_id ?? "t"}:${item?.assigned_by_operator_id ?? "o"}:${index}`;
}

function normalizeAssignmentItem(item) {
  const source = item && typeof item === "object" ? item : {};
  return {
    ...source,
    _client_key:
      source._client_key ??
      source.client_key ??
      (source.id == null ? createAssignmentClientKey() : null),
  };
}

function getAssignmentAnchor(item, index) {
  if (item?.id !== undefined && item?.id !== null) {
    return `assignment-${item.id}`;
  }
  return `assignment-fallback-${index}-${item?.team_id ?? "none"}`;
}

function getActiveAssignmentAnchorId() {
  if (typeof document === "undefined") {
    return "";
  }
  const active = document.activeElement;
  const card = active?.closest?.("[data-assignment-anchor]");
  return card?.getAttribute("data-assignment-anchor") || "";
}

function restoreAnchorPosition(anchorId, previousScrollY) {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => {
    if (anchorId && typeof document !== "undefined") {
      const anchor = document.querySelector(`[data-assignment-anchor="${anchorId}"]`);
      if (anchor) {
        anchor.scrollIntoView({ block: "center", inline: "nearest" });
        return;
      }
    }
    window.scrollTo({ top: previousScrollY, left: window.scrollX });
  });
}

function cloneData(value) {
  try {
    return structuredClone(value);
  } catch (_) {
    return JSON.parse(JSON.stringify(value));
  }
}

function focusElementSoon(target, options = {}) {
  const resolve = typeof target === "function" ? target : () => target;
  const run = () => {
    const element = resolve();
    if (element && typeof element.focus === "function") {
      const scope = options?.scope;
      const active = typeof document !== "undefined" ? document.activeElement : null;
      const activeInsideScope = Boolean(scope && active && scope.contains?.(active));
      if (
        activeInsideScope &&
        active !== element &&
        active !== options?.allowFocusedElement
      ) {
        return;
      }
      element.focus({ preventScroll: true });
    }
  };
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(run);
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
    window.setTimeout(run, 24);
    window.setTimeout(run, 60);
    window.setTimeout(run, 120);
    window.setTimeout(run, 240);
    return;
  }
  setTimeout(run, 0);
}

function focusElementAfterDelay(target, delayMs = 0) {
  const resolve = typeof target === "function" ? target : () => target;
  setTimeout(() => {
    const element = resolve();
    if (element && typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }
  }, Math.max(0, Number(delayMs) || 0));
}

function getFirstFieldControl(root) {
  if (!root || typeof root.querySelector !== "function") {
    return null;
  }
  return root.querySelector(
    "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable='true']"
  ) || root.querySelector("button:not([disabled])");
}

function findElementByDataAttribute(root, attribute, value) {
  if (!root || !attribute || !value || typeof root.querySelectorAll !== "function") {
    return null;
  }
  return Array.from(root.querySelectorAll(`[${attribute}]`)).find(
    (node) => node.getAttribute(attribute) === value
  ) || null;
}

function createAssignmentClientKey() {
  assignmentClientKeySeed += 1;
  return `assignment-${assignmentClientKeySeed}`;
}

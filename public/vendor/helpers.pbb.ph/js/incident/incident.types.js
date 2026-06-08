import {
  normalizeIncidentOptions,
  renderEmpty,
  safeArray,
} from "./incident.base.js";
import { incidentTypesDetailsEditor } from "./incident.types.details.editor.js";
import { incidentTypesDetailsViewer } from "./incident.types.details.viewer.js";
import { createEventBag } from "../ui/ui.events.js";
import { createDrawer } from "../ui/ui.drawer.js";
import { createElement } from "../ui/ui.dom.js";
import { createSearchField } from "../ui/ui.search.js";

const REQUIRED_OPTION_KEYS = ["categories", "incidentTypes"];

const DEFAULT_OPTIONS = {
  editable: true,
  headerText: "Incident Details",
  drawerHeaderText: "Select Reported Incidents",
};

let incidentTypeClientKeySeed = 0;

export function incidentTypes(container, data, options = {}) {
  let currentData = data;
  let currentOptions = normalizeOptions(options);
  let list = getIncidentTypeItems(currentData, currentOptions);
  let childMap = new Map(); // key -> { instance, li, mode }
  let orderKeys = [];
  let rootEl = null;
  let headerEl = null;
  let bodyEl = null;
  let listEl = null;
  let lastShellSignature = "";
  let drawerState = { open: false, category: "all", search: "" };
  let headerEvents = createEventBag();
  let drawerEvents = null;
  let drawerApi = null;
  let drawerElements = null;

  function replaceListItemByKey(key, nextItem) {
    const normalizedItem = normalizeIncidentTypeItem(nextItem, currentOptions);
    list = list.map((item, index) => (getItemKey(item, index) === key ? normalizedItem : item));
    return normalizedItem;
  }

  function buildListProposalByKey(key, nextItem, meta = {}) {
    if (meta.reason === "remove") {
      return cloneData(list).filter((item, index) => getItemKey(item, index) !== key);
    }
    return cloneData(list).map((item, index) => (
      getItemKey(item, index) === key ? cloneData(nextItem) : cloneData(item)
    ));
  }

  function emitNormalizedChange(nextItem, meta = {}) {
    const nextList = Array.isArray(meta.nextList) ? meta.nextList : cloneData(list);
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

  function ensureShell() {
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
    rootEl.className = "hh-incident-types";
    headerEl = document.createElement("div");
    headerEl.className = "hh-incident-types-header";
    bodyEl = document.createElement("div");
    bodyEl.className = "hh-incident-types-body";
    listEl = document.createElement("ul");
    listEl.className = "hh-list";
    bodyEl.appendChild(listEl);
    rootEl.append(headerEl, bodyEl);
    if (container && container.nodeType === 1) {
      container.appendChild(rootEl);
    }
    applyRootAttrs();
    renderHeader();
    lastShellSignature = signature;
  }

  function applyRootAttrs() {
    if (!rootEl) {
      return;
    }
    rootEl.dataset.theme = currentOptions.theme === "light" ? "light" : "dark";
    rootEl.className = "hh-incident-types";
    if (currentOptions.className) {
      rootEl.classList.add(currentOptions.className);
    }
  }

  function itemMode() {
    return currentOptions.editable ? "editor" : "viewer";
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
      backdropClass: "hh-incident-type-drawer-backdrop",
      panelClass: "hh-incident-type-drawer",
      headerClass: "hh-incident-type-drawer-header",
      titleClass: "hh-title ui-title",
      closeClass: "hh-drawer-close ui-drawer-close",
      bodyClass: "hh-incident-type-drawer-body",
      onClose() {
        if (drawerState.open) {
          drawerState.open = false;
          currentOptions.onCloseDrawer?.();
        }
      },
    });

    const left = createElement("div", { className: "hh-incident-type-categories" });
    const right = createElement("div", { className: "hh-incident-type-chooser" });
    const searchField = createSearchField({
      classPrefix: "hh-incident-type-search",
      inputClass: "hh-input ui-input",
      placeholder: "Search incident types",
      value: drawerState.search,
      onChange(value) {
        drawerState.search = value;
        renderDrawerContent(left, chips);
      },
    });
    const chips = createElement("div", { className: "hh-incident-type-chips" });

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
    const incidentTypes = safeArray(currentOptions.incidentTypes).filter((incidentType) => {
      const categoryMatch =
        selectedCategory === "all" || String(incidentType?.category_id) === selectedCategory;
      if (!categoryMatch) {
        return false;
      }
      if (!term) {
        return true;
      }
      return String(incidentType?.name || "").toLowerCase().includes(term);
    });

    incidentTypes.forEach((incidentType) => {
      const exists = incidentTypeExistsInList(incidentType?.id);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `hh-incident-type-chip${exists ? " is-existing" : ""}`;
      chip.textContent = incidentType?.name || `Incident #${incidentType?.id ?? "-"}`;

      drawerEvents?.on(chip, "click", () => {
        if (exists) {
          currentOptions.noticeAlreadyExists?.(incidentType);
          return;
        }

        const payload = createInitialPayload(incidentType);
        list = [...list, payload];
        const nextIndex = list.length - 1;
        const nextKey = getItemKey(payload, nextIndex);
        const nextAnchor = getIncidentTypeAnchor(payload, nextIndex);
        currentOptions.onAddIncidentType?.(cloneData(payload));
        emitNormalizedChange(payload, {
          reason: "add",
          localStateChanged: true,
          key: nextKey,
          nextList: cloneData(list),
        });
        closeDrawer();
        reconcile();
        focusChildFirstFieldByAnchor(listEl, nextAnchor);
      });
      chips.appendChild(chip);
    });
  }

  function createCategoryCard(value, label, active) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `hh-incident-type-category-card${active ? " is-active" : ""}`;
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
      action.textContent = "Add Incidents";
      headerEvents.on(action, "click", openDrawer);
      headerEl.appendChild(action);
    }
  }

  function createInitialPayload(incidentType) {
    const resourceLookup = safeArray(currentOptions.resources);
    const resources = safeArray(incidentType?.resource_defaults).map((item) => {
      const resourceTypeId = item?.resource_type_id;
      const lookup = resourceLookup.find((resource) => String(resource?.id) === String(resourceTypeId));
      return {
        id: resourceTypeId,
        resource_type_id: resourceTypeId,
        name: lookup?.name || item?.resource_type?.name || "",
        sort_order: item?.sort_order ?? 0,
      };
    });

    const incidentId =
      currentOptions.incident_id ??
      currentData?.id ??
      currentData?.incident?.id ??
      list[0]?.incident_id ??
      null;

    return normalizeIncidentTypeItem(
      {
        incident_id: incidentId,
        incident_type_id: incidentType?.id ?? null,
        incident_type_category_id: incidentType?.category_id ?? null,
        incident_type_category_name: incidentType?.category?.name || "",
        name: incidentType?.name || "",
        description: incidentType?.description || "",
        fields: safeArray(incidentType?.fields).map((field) => ({ ...field })),
        detail_entries: [],
        resources,
        resources_needed: [],
      },
      currentOptions
    );
  }

  function incidentTypeExistsInList(incidentTypeId) {
    return list.some((item) => String(item?.incident_type_id) === String(incidentTypeId));
  }

  function createChild(item, key, index) {
    const li = document.createElement("li");
    li.className = "hh-item";
    li.setAttribute("data-incident-type-anchor", getIncidentTypeAnchor(item, index));
    const mount = document.createElement("div");
    mount.className = "hh-item-viewer";
    li.appendChild(mount);
    const childOptions = {
      ...currentOptions,
      removeIncidentType: (incidentTypeData) => currentOptions.removeIncidentType?.(incidentTypeData),
      onFieldChange: (...args) => currentOptions.onFieldChange?.(...args),
      onResourceChange: (...args) => currentOptions.onResourceChange?.(...args),
      onItemChange: (nextItem, meta = {}) => {
        const nextMeta = { ...meta, key };
        if (meta.localStateChanged !== false) {
          replaceListItemByKey(key, nextItem);
        }
        if (meta.reason === "remove") {
          emitNormalizedChange(nextItem, {
            ...nextMeta,
            nextList: buildListProposalByKey(key, nextItem, meta),
            localStateChanged: false,
          });
          return;
        }
        const nextList = meta.localStateChanged === false
          ? buildListProposalByKey(key, nextItem, meta)
          : cloneData(list);
        emitNormalizedChange(nextItem, {
          ...nextMeta,
          nextList,
        });
      },
    };
    const mode = itemMode();
    const instance = mode === "editor"
      ? incidentTypesDetailsEditor(mount, item, childOptions)
      : incidentTypesDetailsViewer(mount, item, childOptions);
    childMap.set(key, { instance, li, mode });
  }

  function reconcile() {
    ensureShell();
    if (!rootEl || !listEl || !bodyEl) {
      return;
    }
    applyRootAttrs();
    renderHeader();
    const activeAnchorId = getActiveIncidentTypeAnchorId();
    const previousScrollY = typeof window !== "undefined" ? window.scrollY : 0;

    if (!list.length) {
      destroyChildren();
      bodyEl.innerHTML = "";
      renderEmpty(bodyEl, currentOptions.emptyText);
      restoreAnchorPosition(activeAnchorId, previousScrollY);
      return;
    }

    if (!listEl.parentNode) {
      bodyEl.innerHTML = "";
      listEl = document.createElement("ul");
      listEl.className = "hh-list";
      bodyEl.appendChild(listEl);
    } else if (bodyEl.firstChild !== listEl) {
      bodyEl.innerHTML = "";
      bodyEl.appendChild(listEl);
    }

    const nextKeys = [];
    const nextKeySet = new Set();
    const mode = itemMode();
    list.forEach((item, index) => {
      const key = getItemKey(item, index);
      nextKeys.push(key);
      nextKeySet.add(key);
      const existing = childMap.get(key);
      if (existing && existing.mode === mode) {
        existing.li.setAttribute("data-incident-type-anchor", getIncidentTypeAnchor(item, index));
        existing.instance.update(item, {
          ...currentOptions,
          removeIncidentType: (incidentTypeData) => currentOptions.removeIncidentType?.(incidentTypeData),
          onFieldChange: (...args) => currentOptions.onFieldChange?.(...args),
          onResourceChange: (...args) => currentOptions.onResourceChange?.(...args),
        });
      } else {
        if (existing) {
          existing.instance.destroy?.();
          existing.li.remove();
          childMap.delete(key);
        }
        createChild(item, key, index);
      }
    });

    [...childMap.entries()].forEach(([key, entry]) => {
      if (!nextKeySet.has(key)) {
        entry.instance.destroy?.();
        entry.li.remove();
        childMap.delete(key);
      }
    });

    nextKeys.forEach((key) => {
      const child = childMap.get(key);
      if (child) {
        listEl.appendChild(child.li);
      }
    });
    orderKeys = nextKeys;
    restoreAnchorPosition(activeAnchorId, previousScrollY);
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
    const missing = REQUIRED_OPTION_KEYS.filter((key) => {
      const value = currentOptions?.[key];
      if (key === "categories" || key === "incidentTypes") {
        return !Array.isArray(value);
      }
      return value === undefined || value === null || value === "";
    });
    if (currentOptions.editable && typeof currentOptions.removeIncidentType !== "function") {
      missing.push("removeIncidentType");
    }
    return missing;
  }

  function renderFull() {
    const missingRequired = validateRequiredOptions();
    if (missingRequired.length) {
      if (container && container.nodeType === 1) {
        container.innerHTML = "";
      }
      destroyChildren();
      closeDrawer();
      rootEl = null;
      headerEl = null;
      bodyEl = null;
      listEl = null;
      lastShellSignature = "";
      console.error(`[incident.types] Missing required options: ${missingRequired.join(", ")}`);
      return;
    }
    reconcile();
  }

  function setList(items = []) {
    list = safeArray(items).map((item) => normalizeIncidentTypeItem(item, currentOptions));
    renderFull();
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
      lastShellSignature = "";
      headerEvents = createEventBag();
    },
    update(nextData, nextOptions = {}) {
      currentData = nextData;
      currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
      list = getIncidentTypeItems(currentData, currentOptions);
      renderFull();
    },
    setList,
    getData() {
      if (!orderKeys.length) {
        return cloneData(list);
      }
      return orderKeys.map((key, index) => {
        const entry = childMap.get(key);
        if (entry?.instance?.getData) {
          return cloneData(entry.instance.getData());
        }
        return cloneData(list[index] || null);
      });
    },
    getState() {
      return {
        list: cloneData(list),
        options: cloneData(currentOptions),
        drawerState: cloneData(drawerState),
      };
    },
  };
}

function normalizeOptions(options = {}) {
  const normalized = normalizeIncidentOptions(options);
  return {
    ...normalized,
    ...DEFAULT_OPTIONS,
    ...options,
  };
}

function getIncidentTypeItems(source, options) {
  if (Array.isArray(source)) {
    return source.map((item) => normalizeIncidentTypeItem(item, options));
  }

  const incidentTypes = safeArray(source?.incident_types);
  if (!incidentTypes.length) {
    return [];
  }

  const detailEntries = safeArray(source?.detail_entries);
  const resourcesNeeded = safeArray(source?.resources_needed);
  const lookupTypes = safeArray(options?.incidentTypes).length
    ? safeArray(options?.incidentTypes)
    : safeArray(options?.lookups?.incidentTypes);

  return incidentTypes.map((type) => {
    const lookupType = lookupTypes.find((item) => String(item?.id) === String(type?.id));
    const fields = safeArray(type?.fields).length ? safeArray(type?.fields) : safeArray(lookupType?.fields);
    const categoryName =
      type?.category?.name ||
      lookupType?.category?.name ||
      lookupType?.category_name ||
      "";

    const itemResourcesNeeded = resourcesNeeded.filter(
      (resource) => String(resource?.incident_type_id) === String(type?.id)
    );

    const resources = inferResources(type, lookupType, itemResourcesNeeded, options);
    return normalizeIncidentTypeItem(
      {
        id: type?.pivot?.id ?? type?.id ?? null,
        incident_id: source?.id ?? source?.incident?.id ?? source?.incident_id ?? null,
        incident_type_id: type?.id ?? null,
        incident_type_category_id: type?.category_id ?? lookupType?.category_id ?? null,
        incident_type_category_name: categoryName,
        name: type?.name ?? lookupType?.name ?? "",
        description: type?.description ?? lookupType?.description ?? "",
        fields,
        detail_entries: detailEntries.filter(
          (entry) => String(entry?.incident_type_id) === String(type?.id)
        ),
        resources,
        resources_needed: itemResourcesNeeded,
      },
      options
    );
  });
}

function inferResources(type, lookupType, resourcesNeeded, options) {
  if (safeArray(type?.resources).length) {
    return safeArray(type.resources);
  }

  const lookupResourceDefaults = safeArray(lookupType?.resource_defaults);
  if (lookupResourceDefaults.length) {
    return lookupResourceDefaults.map((item) => ({
      id: item?.resource_type_id,
      name: item?.resource_type?.name || "",
      resource_type_id: item?.resource_type_id,
      sort_order: item?.sort_order ?? 0,
    }));
  }

  const lookupResourceTypes = safeArray(options?.lookups?.resourceTypes);
  return safeArray(resourcesNeeded).map((item) => {
    const lookup = lookupResourceTypes.find((resource) => String(resource?.id) === String(item?.resource_type_id));
    return {
      id: item?.resource_type_id,
      resource_type_id: item?.resource_type_id,
      name: item?.resource_type?.name || lookup?.name || "",
    };
  });
}

function normalizeIncidentTypeItem(item, options) {
  const source = item && typeof item === "object" ? item : {};
  const lookupType = resolveIncidentTypeLookup(source.incident_type_id ?? source.id, options);
  const resources = safeArray(source.resources)
    .map((resource) => ({
      ...resource,
      id: resource?.id ?? resource?.resource_type_id,
      resource_type_id: resource?.resource_type_id ?? resource?.id,
      name: resource?.name || resource?.resource_type?.name || "",
    }))
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));

  return {
    id: source.id ?? source.incident_type_id ?? null,
    _client_key:
      source._client_key ??
      source.client_key ??
      (source.id == null ? createIncidentTypeClientKey() : null),
    incident_id: source.incident_id ?? null,
    incident_type_id: source.incident_type_id ?? source.id ?? null,
    incident_type_category_id: source.incident_type_category_id ?? null,
    incident_type_category_name:
      source.incident_type_category_name ||
      source.category_name ||
      resolveCategoryName(source.incident_type_category_id, options) ||
      "",
    name: source.name || "",
    description: source.description || lookupType?.description || "",
    fields: safeArray(source.fields).map((field) => ({ ...field })),
    detail_entries: safeArray(source.detail_entries).map((entry) => ({ ...entry })),
    resources,
    resources_needed: safeArray(source.resources_needed).map((entry) => ({ ...entry })),
  };
}

function resolveIncidentTypeLookup(incidentTypeId, options) {
  if (incidentTypeId === undefined || incidentTypeId === null || incidentTypeId === "") {
    return null;
  }
  const list = safeArray(options?.incidentTypes).length
    ? safeArray(options?.incidentTypes)
    : safeArray(options?.lookups?.incidentTypes);
  return list.find((item) => String(item?.id) === String(incidentTypeId)) || null;
}

function resolveCategoryName(categoryId, options) {
  if (!categoryId) {
    return "";
  }
  const list = safeArray(options?.categories).length
    ? safeArray(options?.categories)
    : safeArray(options?.lookups?.incidentCategories);
  const found = list.find((item) => String(item?.id) === String(categoryId));
  return found?.name || "";
}

function getItemKey(item, index) {
  if (item?.id !== undefined && item?.id !== null) {
    return `id:${item.id}`;
  }
  if (item?._client_key) {
    return `client:${item._client_key}`;
  }
  return `fallback:${item?.incident_id ?? "i"}:${item?.incident_type_id ?? "t"}:${index}`;
}

function getIncidentTypeAnchor(item, index) {
  if (item?.id !== undefined && item?.id !== null) {
    return `incident-type-${item.id}`;
  }
  return `incident-type-fallback-${index}-${item?.incident_type_id ?? "none"}`;
}

function getActiveIncidentTypeAnchorId() {
  if (typeof document === "undefined") {
    return "";
  }
  const active = document.activeElement;
  const card = active?.closest?.("[data-incident-type-anchor]");
  return card?.getAttribute("data-incident-type-anchor") || "";
}

function restoreAnchorPosition(anchorId, previousScrollY) {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => {
    if (anchorId && typeof document !== "undefined") {
      const anchor = document.querySelector(`[data-incident-type-anchor="${anchorId}"]`);
      if (anchor) {
        anchor.scrollIntoView({ block: "center", inline: "nearest" });
        return;
      }
    }
    window.scrollTo({ top: previousScrollY, left: window.scrollX });
  });
}

function focusChildFirstFieldByAnchor(root, anchorId) {
  focusElementAfterDelay(() => {
    const child = findElementByDataAttribute(root, "data-incident-type-anchor", anchorId);
    return getFirstFieldControl(child);
  }, 280);
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

function createIncidentTypeClientKey() {
  incidentTypeClientKeySeed += 1;
  return `incident-type-${incidentTypeClientKeySeed}`;
}

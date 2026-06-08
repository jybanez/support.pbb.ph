const INCIDENT_LOOKUP_KEYS = [
  "teamStatuses",
  "incidentStatuses",
  "alertLevels",
  "incidentTypes",
  "incidentCategories",
  "teams",
  "resourceTypes",
  "operators",
];

const DEFAULT_OPTIONS = {
  theme: "dark",
  className: "",
  emptyText: "No data available.",
  locale: undefined,
  timezone: undefined,
  debug: false,
  allowContactEditAfterDispatch: true,
  lookups: {},
};

export function incidentBase(container, data, options = {}) {
  let currentData = data;
  let currentOptions = normalizeIncidentOptions(options);
  const lookupApi = createLookupApi(() => currentOptions);

  return {
    destroy() {
      clearContainer(container);
    },
    update(nextData, nextOptions = {}) {
      currentData = nextData;
      currentOptions = normalizeIncidentOptions({
        ...currentOptions,
        ...nextOptions,
      });
      if (currentOptions.debug) {
        logDebug("incidentBase update", { data: currentData, options: currentOptions });
      }
    },
    lookups: lookupApi,
  };
}

export function normalizeIncidentOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    lookups: options.lookups && typeof options.lookups === "object" ? options.lookups : {},
  };
}

export function isElement(value) {
  return !!value && value.nodeType === 1;
}

export function clearContainer(container) {
  if (isElement(container)) {
    container.innerHTML = "";
  }
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createRoot(container, rootClass, options = {}) {
  if (!isElement(container)) {
    return null;
  }

  const normalized = normalizeIncidentOptions(options);
  const root = document.createElement("div");
  root.className = rootClass;

  if (normalized.className) {
    root.classList.add(normalized.className);
  }

  root.dataset.theme = normalized.theme === "light" ? "light" : "dark";

  clearContainer(container);
  container.appendChild(root);
  return root;
}

export function renderEmpty(root, text) {
  if (!root) {
    return;
  }
  const p = document.createElement("p");
  p.className = "hh-empty";
  p.textContent = text;
  root.appendChild(p);
}

export function logDebug(message, payload, options = {}) {
  const normalized = normalizeIncidentOptions(options);
  if (normalized.debug) {
    console.debug(`[incident] ${message}`, payload);
  }
}

export function warnMissingReference(lookupKey, value) {
  console.warn(`[incident.base] Missing reference in "${lookupKey}" for value:`, value);
}

export function getLookupList(options, lookupKey) {
  const normalized = normalizeIncidentOptions(options);
  return safeArray(normalized.lookups?.[lookupKey]);
}

export function resolveById(options, lookupKey, id) {
  const list = getLookupList(options, lookupKey);
  const found = list.find((item) => item && String(item.id) === String(id));
  if (!found && id !== null && id !== undefined && id !== "") {
    warnMissingReference(lookupKey, id);
  }
  return found || null;
}

export function resolveByKey(options, lookupKey, key, keyField = "key") {
  const list = getLookupList(options, lookupKey);
  const found = list.find((item) => item && String(item[keyField]) === String(key));
  if (!found && key !== null && key !== undefined && key !== "") {
    warnMissingReference(lookupKey, key);
  }
  return found || null;
}

export function formatDateTime(value, options = {}) {
  if (!value) {
    return "";
  }

  const normalized = normalizeIncidentOptions(options);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(normalized.locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: normalized.timezone || undefined,
    }).format(date);
  } catch (_) {
    return date.toISOString();
  }
}

export function createLookupApi(optionsOrGetter = {}) {
  const getOptions =
    typeof optionsOrGetter === "function"
      ? optionsOrGetter
      : () => normalizeIncidentOptions(optionsOrGetter);
  const api = {};

  INCIDENT_LOOKUP_KEYS.forEach((lookupKey) => {
    api[lookupKey] = (value, mode = "id") => {
      const normalized = normalizeIncidentOptions(getOptions());
      if (mode === "key") {
        return resolveByKey(normalized, lookupKey, value);
      }
      return resolveById(normalized, lookupKey, value);
    };
  });

  return api;
}

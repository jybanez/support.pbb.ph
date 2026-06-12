import { createElement, clearNode } from "./ui.dom.js";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Navigation stack",
  initialPages: [],
  transition: "slide",
  duration: 180,
  easing: "ease",
  destroyOnPop: true,
  onChange: null,
  onPush: null,
  onPop: null,
  onReplace: null,
  onReset: null,
};

let nextStackId = 0;

export function createNavigationStack(container, options = {}) {
  if (!(container instanceof HTMLElement)) {
    throw new Error("createNavigationStack(container, options) requires a valid container element.");
  }

  let currentOptions = normalizeOptions(options);
  let pages = [];
  let currentIndex = -1;
  let destroyed = false;
  let sequence = 0;
  const stackId = `ui-navigation-stack-${++nextStackId}`;

  const root = createElement("section", {
    className: buildRootClassName(),
    attrs: {
      "aria-label": currentOptions.ariaLabel,
      "data-transition": currentOptions.transition,
    },
  });
  const viewport = createElement("div", { className: "ui-navigation-stack-viewport" });
  root.appendChild(viewport);
  container.appendChild(root);
  applyMotionVars();

  const api = {
    root,
    viewport,
    push,
    pop,
    replace,
    goTo,
    reset,
    update,
    getState,
    destroy,
  };

  reset(currentOptions.initialPages, { emit: false, animate: false });

  function push(page, actionOptions = {}) {
    assertActive();
    const entry = createPageEntry(page);
    if (currentIndex < pages.length - 1) {
      const removed = pages.splice(currentIndex + 1);
      destroyEntries(removed);
    }
    const from = getCurrentEntry();
    pages.push(entry);
    currentIndex = pages.length - 1;
    viewport.appendChild(entry.element);
    showEntry(entry, from, "push", actionOptions);
    currentOptions.onPush?.(entry.config, createContext("push", entry, from));
    emitChange("push", entry, from);
    return entry.config;
  }

  function pop(actionOptions = {}) {
    assertActive();
    if (currentIndex <= 0 || !pages.length) {
      return null;
    }
    const from = getCurrentEntry();
    const targetIndex = currentIndex - 1;
    const to = pages[targetIndex];
    currentIndex = targetIndex;
    showEntry(to, from, "pop", actionOptions);
    pages.splice(targetIndex + 1, 1);
    if (resolveDestroyOnPop(actionOptions)) {
      scheduleDestroyEntry(from, actionOptions);
    } else {
      from.element.classList.add("is-hidden");
      from.element.hidden = true;
    }
    currentOptions.onPop?.(from.config, createContext("pop", to, from));
    emitChange("pop", to, from);
    return from.config;
  }

  function replace(page, actionOptions = {}) {
    assertActive();
    const from = getCurrentEntry();
    const entry = createPageEntry(page);
    if (currentIndex < 0) {
      pages.push(entry);
      currentIndex = 0;
    } else {
      pages[currentIndex] = entry;
    }
    viewport.appendChild(entry.element);
    showEntry(entry, from, "replace", actionOptions);
    if (from) {
      scheduleDestroyEntry(from, actionOptions);
    }
    currentOptions.onReplace?.(entry.config, createContext("replace", entry, from));
    emitChange("replace", entry, from);
    return entry.config;
  }

  function goTo(idOrIndex, actionOptions = {}) {
    assertActive();
    const index = resolvePageIndex(idOrIndex);
    if (index < 0 || index >= pages.length || index === currentIndex) {
      return null;
    }
    const from = getCurrentEntry();
    const to = pages[index];
    const direction = index > currentIndex ? "push" : "pop";
    const removed = pages.splice(index + 1);
    currentIndex = index;
    showEntry(to, from, direction, actionOptions);
    removed.filter((entry) => entry !== to).forEach((entry) => {
      if (entry === from) {
        scheduleDestroyEntry(entry, actionOptions);
      } else {
        destroyEntry(entry);
      }
    });
    emitChange("goTo", to, from);
    return to.config;
  }

  function reset(nextPages = [], actionOptions = {}) {
    assertActive();
    const from = getCurrentEntry();
    destroyEntries(pages);
    clearNode(viewport);
    pages = normalizePages(nextPages).map((page) => createPageEntry(page));
    pages.forEach((entry) => viewport.appendChild(entry.element));
    currentIndex = pages.length ? pages.length - 1 : -1;
    pages.forEach((entry, index) => {
      const active = index === currentIndex;
      entry.element.classList.toggle("is-active", active);
      entry.element.classList.toggle("is-hidden", !active);
      entry.element.hidden = !active;
      entry.element.setAttribute("aria-hidden", active ? "false" : "true");
    });
    const to = getCurrentEntry();
    if (to && actionOptions.animate !== false) {
      showEntry(to, from, "replace", actionOptions);
    }
    currentOptions.onReset?.(getState(), createContext("reset", to, from));
    if (actionOptions.emit !== false) {
      emitChange("reset", to, from);
    }
    return getState();
  }

  function update(nextOptions = {}) {
    assertActive();
    currentOptions = normalizeOptions({
      ...currentOptions,
      ...(nextOptions || {}),
      initialPages: Object.prototype.hasOwnProperty.call(nextOptions, "initialPages")
        ? nextOptions.initialPages
        : currentOptions.initialPages,
    });
    root.className = buildRootClassName();
    root.setAttribute("aria-label", currentOptions.ariaLabel);
    root.dataset.transition = currentOptions.transition;
    applyMotionVars();
    if (Object.prototype.hasOwnProperty.call(nextOptions, "initialPages")) {
      reset(currentOptions.initialPages, { animate: false });
    }
  }

  function getState() {
    return {
      currentIndex,
      currentPage: getCurrentEntry()?.config || null,
      pages: pages.map((entry) => entry.config),
      depth: pages.length,
      transition: currentOptions.transition,
    };
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    destroyEntries(pages);
    pages = [];
    currentIndex = -1;
    root.remove();
  }

  function createPageEntry(page) {
    const config = normalizePage(page);
    const pageId = `${stackId}-page-${++sequence}`;
    const element = createElement("article", {
      className: ["ui-navigation-stack-page", config.className].filter(Boolean).join(" "),
      attrs: {
        id: pageId,
        role: "group",
        "aria-label": config.title || config.id,
        "aria-hidden": "true",
        "data-page-id": config.id,
      },
    });
    const body = createElement("div", { className: "ui-navigation-stack-page-body" });
    element.appendChild(body);
    mountPageContent(config, body);
    element.hidden = true;
    element.classList.add("is-hidden");
    return {
      config,
      element,
      body,
      pageId,
    };
  }

  function mountPageContent(config, body) {
    if (typeof config.render === "function") {
      const result = config.render({ page: config, api });
      setContentResult(body, result);
      return;
    }
    if (typeof config.mount === "function") {
      config.mount(body, { page: config, api });
      return;
    }
    setContentResult(body, config.content);
  }

  function setContentResult(host, content) {
    if (content == null) {
      return;
    }
    if (content instanceof Node) {
      host.appendChild(content);
      return;
    }
    if (Array.isArray(content)) {
      content.forEach((item) => setContentResult(host, item));
      return;
    }
    host.textContent = String(content);
  }

  function showEntry(to, from, direction, actionOptions = {}) {
    if (!to || to === from) {
      return;
    }
    const transition = normalizeTransition(actionOptions.transition || currentOptions.transition);
    const animate = actionOptions.animate !== false && transition !== "none" && currentOptions.duration > 0;
    const directionClass = direction === "pop" ? "is-pop" : direction === "replace" ? "is-replace" : "is-push";

    to.config.onBeforeShow?.(to.config, createContext(direction, to, from));
    from?.config?.onBeforeHide?.(from.config, createContext(direction, to, from));

    to.element.hidden = false;
    to.element.classList.remove("is-hidden", "is-exiting", "is-entering", "is-push", "is-pop", "is-replace");
    to.element.classList.add("is-active");
    to.element.setAttribute("aria-hidden", "false");

    pages.forEach((entry) => {
      if (entry !== to && entry !== from) {
        entry.element.classList.remove("is-active", "is-entering", "is-exiting", "is-push", "is-pop", "is-replace");
        entry.element.classList.add("is-hidden");
        entry.element.hidden = true;
        entry.element.setAttribute("aria-hidden", "true");
      }
    });

    if (!from || !animate) {
      finishTransition(to, from, direction);
      return;
    }

    from.element.hidden = false;
    from.element.classList.remove("is-hidden", "is-entering", "is-exiting", "is-push", "is-pop", "is-replace");
    from.element.classList.add("is-exiting", directionClass);
    from.element.setAttribute("aria-hidden", "true");
    to.element.classList.add("is-entering", directionClass);
    root.dataset.transitioning = "true";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        to.element.classList.add("is-active");
        to.element.classList.remove("is-entering");
        from.element.classList.add("is-hidden");
      });
    });

    window.setTimeout(() => finishTransition(to, from, direction), currentOptions.duration + 40);
  }

  function finishTransition(to, from, direction) {
    delete root.dataset.transitioning;
    to.element.classList.remove("is-entering", "is-exiting", "is-push", "is-pop", "is-replace", "is-hidden");
    to.element.classList.add("is-active");
    to.element.hidden = false;
    to.element.setAttribute("aria-hidden", "false");
    if (from && pages.includes(from)) {
      from.element.classList.remove("is-active", "is-entering", "is-exiting", "is-push", "is-pop", "is-replace");
      from.element.classList.add("is-hidden");
      from.element.hidden = true;
      from.element.setAttribute("aria-hidden", "true");
    }
    to.config.onShow?.(to.config, createContext(direction, to, from));
    from?.config?.onHide?.(from.config, createContext(direction, to, from));
  }

  function emitChange(action, to, from) {
    currentOptions.onChange?.({
      action,
      currentPage: to?.config || null,
      previousPage: from?.config || null,
      state: getState(),
      api,
    });
  }

  function createContext(action, to, from) {
    return {
      action,
      currentPage: to?.config || null,
      previousPage: from?.config || null,
      state: getState(),
      api,
    };
  }

  function getCurrentEntry() {
    return pages[currentIndex] || null;
  }

  function resolvePageIndex(idOrIndex) {
    if (typeof idOrIndex === "number" && Number.isFinite(idOrIndex)) {
      return Math.trunc(idOrIndex);
    }
    const id = String(idOrIndex || "");
    return pages.findIndex((entry) => entry.config.id === id);
  }

  function destroyEntries(entries) {
    entries.forEach((entry) => destroyEntry(entry));
  }

  function destroyEntry(entry) {
    if (!entry) {
      return;
    }
    entry.config.onDestroy?.(entry.config, createContext("destroy", getCurrentEntry(), entry));
    entry.element.remove();
  }

  function scheduleDestroyEntry(entry, actionOptions = {}) {
    if (!entry) {
      return;
    }
    const transition = normalizeTransition(actionOptions.transition || currentOptions.transition);
    const delay = actionOptions.animate === false || transition === "none" ? 0 : currentOptions.duration + 50;
    window.setTimeout(() => destroyEntry(entry), delay);
  }

  function resolveDestroyOnPop(actionOptions) {
    if (Object.prototype.hasOwnProperty.call(actionOptions, "destroy")) {
      return actionOptions.destroy !== false;
    }
    return currentOptions.destroyOnPop !== false;
  }

  function applyMotionVars() {
    root.style.setProperty("--ui-navigation-stack-duration", `${currentOptions.duration}ms`);
    root.style.setProperty("--ui-navigation-stack-easing", currentOptions.easing);
  }

  function buildRootClassName() {
    return [
      "ui-navigation-stack",
      `ui-navigation-stack--${currentOptions.transition}`,
      currentOptions.className,
    ].filter(Boolean).join(" ");
  }

  function assertActive() {
    if (destroyed) {
      throw new Error("createNavigationStack instance has been destroyed.");
    }
  }

  return api;
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    className: String(options.className || "").trim(),
    ariaLabel: String(options.ariaLabel || DEFAULT_OPTIONS.ariaLabel),
    initialPages: normalizePages(options.initialPages),
    transition: normalizeTransition(options.transition),
    duration: normalizeDuration(options.duration),
    easing: String(options.easing || DEFAULT_OPTIONS.easing).trim() || DEFAULT_OPTIONS.easing,
    destroyOnPop: options.destroyOnPop !== false,
    onChange: typeof options.onChange === "function" ? options.onChange : null,
    onPush: typeof options.onPush === "function" ? options.onPush : null,
    onPop: typeof options.onPop === "function" ? options.onPop : null,
    onReplace: typeof options.onReplace === "function" ? options.onReplace : null,
    onReset: typeof options.onReset === "function" ? options.onReset : null,
  };
}

function normalizePages(pages) {
  return Array.isArray(pages) ? pages.filter(Boolean) : [];
}

function normalizePage(page) {
  const source = page && typeof page === "object" ? page : { content: page };
  const id = String(source.id || `page-${Math.random().toString(36).slice(2, 10)}`);
  return {
    ...source,
    id,
    title: String(source.title || source.label || id),
    className: String(source.className || "").trim(),
  };
}

function normalizeTransition(value) {
  const transition = String(value || DEFAULT_OPTIONS.transition).trim().toLowerCase();
  return transition === "fade" || transition === "none" ? transition : "slide";
}

function normalizeDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : DEFAULT_OPTIONS.duration;
}

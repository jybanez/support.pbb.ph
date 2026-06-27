const DEMO_GROUPS = [
  {
    label: "Start",
    items: [
      { href: "./index.html", label: "Home", home: true },
      { href: "./cookbook.html", label: "Cookbook" },
      { href: "./guide.which-helper.html", label: "Which Helper?" },
    ],
  },
  {
    label: "Modals",
    items: [
      { href: "./demo.modal.html", label: "Modal" },
      { href: "./demo.action.modal.html", label: "Action Modal" },
      { href: "./demo.form.modal.html", label: "Form Modal" },
      { href: "./demo.form.modal.login.html", label: "Login Preset" },
      { href: "./demo.form.modal.reauth.html", label: "Re-auth Preset" },
      { href: "./demo.form.modal.status.html", label: "Status Preset" },
      { href: "./demo.form.modal.reason.html", label: "Reason Preset" },
      { href: "./demo.form.modal.account.html", label: "Account Preset" },
      { href: "./demo.form.modal.change.password.html", label: "Change Password Preset" },
      { href: "./demo.file.input.html", label: "File Input" },
    ],
  },
  {
    label: "Dialogs",
    items: [
      { href: "./demo.dialog.alert.html", label: "Alert Dialog" },
      { href: "./demo.dialog.confirm.html", label: "Confirm Dialog" },
      { href: "./demo.dialog.prompt.html", label: "Prompt Dialog" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "./demo.grid.html", label: "Grid" },
      { href: "./demo.datepicker.html", label: "Datepicker" },
      { href: "./demo.path.picker.html", label: "Path Picker" },
      { href: "./demo.file.uploader.html", label: "File Uploader" },
      { href: "./demo.tree.html", label: "Tree" },
      { href: "./demo.tree.grid.html", label: "Tree Grid" },
      { href: "./demo.hierarchy.map.html", label: "Hierarchy Map" },
      { href: "./demo.tree.mind.map.html", label: "Tree Mind Map" },
      { href: "./demo.kanban.html", label: "Kanban" },
      { href: "./demo.virtual.list.html", label: "Virtual List" },
      { href: "./demo.scheduler.html", label: "Scheduler" },
      { href: "./demo.elapsed.time.html", label: "Elapsed Time" },
      { href: "./demo.clock.html", label: "Clock" },
      { href: "./demo.signal.strength.html", label: "Signal Strength" },
      { href: "./demo.heartbeat.strip.html", label: "Heartbeat Strip" },
      { href: "./demo.stat.cards.html", label: "Stat Cards" },
      { href: "./demo.icon.grid.html", label: "Icon Grid" },
      { href: "./demo.map.controls.html", label: "Map Controls" },
      { href: "./demo.map.legend.html", label: "Map Legend" },
      { href: "./demo.map.markers.html", label: "Map Markers" },
      { href: "./demo.map.drawing.html", label: "Map Drawing" },
      { href: "./demo.charts.html", label: "Charts" },
      { href: "./demo.activity.chart.html", label: "Activity Chart" },
      { href: "./demo.inspector.html", label: "Inspector" },
    ],
  },
  {
    label: "Media",
    items: [
      { href: "./demo.audio.html", label: "Audio" },
      { href: "./demo.audio.timeline.html", label: "Audio Timeline" },
      { href: "./demo.audio.audiograph.stream.html", label: "Audio Graph Stream" },
      { href: "./demo.media.strip.html", label: "Media Strip" },
      { href: "./demo.media.viewer.html", label: "Media Viewer" },
      { href: "./demo.timeline.html", label: "Timeline" },
      { href: "./demo.timeline.scrubber.html", label: "Timeline Scrubber" },
    ],
  },
  {
    label: "Gaming",
    items: [
      { href: "./demo.game.session.html", label: "Game Session" },
      { href: "./demo.game.dpad.html", label: "Game D-pad" },
      { href: "./demo.game.joystick.html", label: "Game Joystick" },
      { href: "./demo.game.action.button.html", label: "Game Action" },
      { href: "./demo.game.action.group.html", label: "Game Action Group" },
      { href: "./demo.game.audio.html", label: "Game Audio" },
      { href: "./demo.game.state.chrome.html", label: "Game State Chrome" },
      { href: "./demo.game.core.html", label: "Game Core" },
    ],
  },
  {
    label: "Game Objects",
    items: [
      { href: "./demo.game.objects.html", label: "Overview" },
      { href: "./demo.game.object.html", label: "Game Object" },
      { href: "./demo.game.object.layer.html", label: "Game Object Layer" },
      { href: "./demo.game.flip.card.html", label: "Flip Card" },
      { href: "./demo.game.tetromino.html", label: "Tetromino" },
      { href: "./demo.game.grid.html", label: "Game Grid" },
    ],
  },
  {
    label: "Communication",
    items: [
      { href: "./demo.chat.thread.html", label: "Chat Thread" },
      { href: "./demo.chat.composer.html", label: "Chat Composer" },
      { href: "./demo.chat.upload.queue.html", label: "Chat Upload Queue" },
    ],
  },
  {
    label: "Navigation",
    items: [
      { href: "./demo.nav.html", label: "Overview" },
      { href: "./demo.navbar.html", label: "Navbar" },
      { href: "./demo.sidebar.html", label: "Sidebar" },
      { href: "./demo.breadcrumbs.html", label: "Breadcrumbs" },
      { href: "./demo.dropdown.html", label: "Dropdown" },
      { href: "./demo.dropup.html", label: "Dropup" },
      { href: "./demo.stepper.html", label: "Stepper" },
      { href: "./demo.splitter.html", label: "Splitter" },
      { href: "./demo.navigation.stack.html", label: "Navigation Stack" },
    ],
  },
  {
    label: "Window",
    items: [
      { href: "./demo.window.html", label: "Window" },
      { href: "./demo.window.manager.html", label: "Window Manager" },
      { href: "./demo.iframe.host.html", label: "Iframe Host" },
      { href: "./demo.workspace.bridge.html", label: "Workspace Bridge" },
      { href: "./demo.workspace.bridge.cross.origin.html", label: "Workspace Bridge X-Origin" },
    ],
  },
  {
    label: "Utilities",
    items: [
      { href: "./demo.command.palette.html", label: "Command Palette" },
      { href: "./demo.drawers.html", label: "Drawers" },
      { href: "./demo.ui.html", label: "Overview" },
      { href: "./demo.toast.html", label: "Toast" },
      { href: "./demo.busy.overlay.html", label: "Busy Overlay" },
      { href: "./demo.select.html", label: "Select" },
      { href: "./demo.tree.select.html", label: "Tree Select" },
      { href: "./demo.field.group.html", label: "Field Group" },
      { href: "./demo.field.group.preset.person.html", label: "Person Preset" },
      { href: "./demo.field.group.preset.address.html", label: "Address Preset" },
      { href: "./demo.field.group.preset.missing-person.html", label: "Missing Person Preset" },
      { href: "./demo.field.group.preset.evacuee.html", label: "Evacuee Preset" },
      { href: "./demo.field.group.preset.family.html", label: "Family Preset" },
      { href: "./demo.field.group.preset.casualty-patient.html", label: "Casualty / Patient Preset" },
      { href: "./demo.field.group.preset.infrastructure-damage.html", label: "Infrastructure Damage Preset" },
      { href: "./demo.field.group.preset.shelter-damage.html", label: "Shelter Damage Preset" },
      { href: "./demo.field.group.preset.road-access-status.html", label: "Road / Access Status Preset" },
      { href: "./demo.field.group.preset.vehicle-involved.html", label: "Vehicle Involved Preset" },
      { href: "./demo.fieldset.html", label: "Fieldset" },
      { href: "./demo.device.primer.html", label: "Device Primer" },
      { href: "./demo.device.selector.html", label: "Device Selector" },
      { href: "./demo.loader.bundle.html", label: "Loader Bundle" },
      { href: "./demo.property.editor.html", label: "Property Editor" },
      { href: "./demo.toggle.button.html", label: "Toggle Button" },
      { href: "./demo.toggle.group.html", label: "Toggle Group" },
      { href: "./demo.checkbox.html", label: "Checkbox" },
      { href: "./demo.checkbox.group.html", label: "Checkbox Group" },
      { href: "./demo.combobox.html", label: "Combobox" },
      { href: "./demo.number.stepper.html", label: "Number Stepper" },
      { href: "./demo.buttons.html", label: "Buttons" },
      { href: "./demo.password.html", label: "Password Field" },
      { href: "./demo.icons.html", label: "Icons" },
      { href: "./demo.tabs.html", label: "Tabs" },
      { href: "./demo.strips.html", label: "Strips" },
      { href: "./demo.progress.html", label: "Progress" },
      { href: "./demo.empty.state.html", label: "Empty State" },
      { href: "./demo.skeleton.html", label: "Skeleton" },
      { href: "./demo.team.assignments.html", label: "Team Assignments" },
      { href: "./demo.incident.types.html", label: "Incident Types" },
    ],
  },
];
const DOC_LINKS = [
  { href: "./readme.html", label: "README" },
  { href: "./changelog.html", label: "Changelog" },
  { href: "./playbook.html", label: "Playbook" },
];
const NAV_SCROLL_STORAGE_KEY = "demo-shell.nav.scroll.v1";
const NAV_COLLAPSED_STORAGE_KEY = "demo-shell.nav.collapsed.v1";

function readNavScrollState() {
  try {
    const raw = window.localStorage.getItem(NAV_SCROLL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      top: Number.isFinite(parsed.top) ? parsed.top : 0,
      left: Number.isFinite(parsed.left) ? parsed.left : 0,
    };
  } catch (_error) {
    return null;
  }
}

function writeNavScrollState(container) {
  if (!container) {
    return;
  }
  try {
    window.localStorage.setItem(
      NAV_SCROLL_STORAGE_KEY,
      JSON.stringify({
        top: container.scrollTop || 0,
        left: container.scrollLeft || 0,
      }),
    );
  } catch (_error) {
    // Ignore storage failures; the nav should still function normally.
  }
}

function bindNavScrollPersistence(container) {
  if (!container) {
    return;
  }
  const restored = readNavScrollState();
  if (restored) {
    requestAnimationFrame(() => {
      container.scrollTop = restored.top;
      container.scrollLeft = restored.left;
    });
  }
  container.addEventListener("scroll", () => {
    writeNavScrollState(container);
  }, { passive: true });
}

function readNavCollapsedState() {
  try {
    const raw = window.localStorage.getItem(NAV_COLLAPSED_STORAGE_KEY);
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
  } catch (_error) {
    // Ignore storage failures; responsive defaults still apply.
  }
  return null;
}

function writeNavCollapsedState(collapsed) {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
  } catch (_error) {
    // Ignore storage failures; the toggle should still work normally.
  }
}

function isCompactNavViewport() {
  return window.matchMedia?.("(max-width: 900px)")?.matches === true;
}

function setNavCollapsed(nav, toggle, collapsed, persist = true) {
  nav.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.setAttribute("aria-label", collapsed ? "Show demo navigation" : "Hide demo navigation");
  toggle.title = collapsed ? "Show demo navigation" : "Hide demo navigation";
  if (persist) {
    writeNavCollapsedState(collapsed);
  }
}

function buildDemoShell() {
  const nav = document.createElement("nav");
  nav.className = "demo-shell-nav";
  nav.setAttribute("aria-label", "Demo navigation");

  const inner = document.createElement("div");
  inner.className = "demo-shell-nav__inner";

  const title = document.createElement("div");
  title.className = "demo-shell-nav__title";

  const titleGroup = document.createElement("div");
  titleGroup.className = "demo-shell-nav__title-group";

  const headingLink = document.createElement("a");
  headingLink.href = "./index.html";
  headingLink.textContent = "helpers.pbb.ph demos";

  const hint = document.createElement("small");
  hint.textContent = "Jump between demos without returning to the home page.";

  const currentPage = document.createElement("div");
  currentPage.className = "demo-shell-nav__current";

  titleGroup.append(headingLink, hint, currentPage);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "demo-shell-nav__toggle";
  toggle.setAttribute("aria-expanded", "true");
  toggle.setAttribute("aria-label", "Hide demo navigation");
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>';

  title.append(titleGroup, toggle);

  const links = document.createElement("div");
  links.className = "demo-shell-nav__groups";
  links.dataset.role = "demo-links";

  const docs = document.createElement("div");
  docs.className = "demo-shell-nav__docs";
  docs.dataset.role = "doc-links";

  const currentPath = normalizePath(window.location.pathname);
  DEMO_GROUPS.forEach((group) => {
    const groupEl = document.createElement("section");
    groupEl.className = "demo-shell-nav__group";

    const label = document.createElement("div");
    label.className = "demo-shell-nav__group-label";
    label.textContent = group.label;

    const row = document.createElement("div");
    row.className = "demo-shell-nav__links";

    group.items.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.label;
      if (item.home) {
        link.classList.add("is-home");
      }
      if (normalizePath(new URL(item.href, window.location.href).pathname) === currentPath) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
        groupEl.classList.add("is-current-group");
        currentPage.textContent = `${group.label} / ${item.label}`;
      }
      row.appendChild(link);
    });

    groupEl.append(label, row);
    links.appendChild(groupEl);
  });

  if (!currentPage.textContent) {
    currentPage.textContent = "Browse Demos";
  }

  DOC_LINKS.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    if (normalizePath(new URL(item.href, window.location.href).pathname) === currentPath) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
    docs.appendChild(link);
  });

  const storedCollapsed = readNavCollapsedState();
  setNavCollapsed(nav, toggle, storedCollapsed ?? isCompactNavViewport(), false);

  toggle.addEventListener("click", () => {
    setNavCollapsed(nav, toggle, !nav.classList.contains("is-collapsed"));
  });

  nav.addEventListener("click", (event) => {
    if (isCompactNavViewport() && event.target?.closest?.("a")) {
      setNavCollapsed(nav, toggle, true);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isCompactNavViewport() || nav.classList.contains("is-collapsed")) {
      return;
    }
    if (!nav.contains(event.target)) {
      setNavCollapsed(nav, toggle, true);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isCompactNavViewport() && !nav.classList.contains("is-collapsed")) {
      setNavCollapsed(nav, toggle, true);
      toggle.focus({ preventScroll: true });
    }
  });

  window.matchMedia?.("(max-width: 900px)")?.addEventListener?.("change", (event) => {
    const stored = readNavCollapsedState();
    setNavCollapsed(nav, toggle, stored ?? event.matches, false);
  });

  inner.append(title, links, docs);
  nav.appendChild(inner);
  bindNavScrollPersistence(links);
  nav.addEventListener("click", () => {
    writeNavScrollState(links);
  });
  return nav;
}

function normalizePath(pathname) {
  return String(pathname || "").replace(/\\/g, "/").toLowerCase();
}

function mountDemoShell() {
  if (!document.body || document.querySelector(".demo-shell-nav")) {
    return;
  }
  document.body.insertBefore(buildDemoShell(), document.body.firstChild);
  mountDemoWorkbench();
}

function mountDemoWorkbench() {
  if (!document.body || !document.body.classList.contains("demo-shell-sidebar")) {
    return;
  }
  if (document.querySelector(".demo-workbench")) {
    return;
  }
  const main = document.querySelector("main.page");
  if (!main) {
    return;
  }
  const meta = normalizeDemoMeta(window.demoMeta || {});
  const workbench = document.createElement("main");
  workbench.className = "demo-workbench demo-workbench--auto";

  const center = document.createElement("section");
  center.className = "demo-workbench__center";

  const content = document.createElement("aside");
  content.className = "demo-workbench__content";
  buildDocPanels(meta).forEach((panel) => content.appendChild(panel));

  main.classList.add("demo-page-legacy");
  transformLegacyDemoPage(main, meta);
  main.parentNode.replaceChild(workbench, main);
  center.appendChild(main);
  workbench.append(center, content);
}

function transformLegacyDemoPage(main, meta) {
  if (!main || main.dataset.demoStructured === "true") {
    return;
  }
  const childElements = Array.from(main.children).filter((node) => node.nodeType === 1);
  const panels = childElements.filter((node) => node.classList.contains("panel"));
  const passthroughNodes = childElements.filter((node) => !node.classList.contains("panel"));
  if (!panels.length) {
    return;
  }
  main.dataset.demoStructured = "true";
  const supportHost = document.createElement("div");
  supportHost.className = "demo-support-nodes";

  const fragment = document.createDocumentFragment();
  let introAssigned = false;
  let guidanceAssigned = false;

  passthroughNodes.forEach((node) => {
    fragment.appendChild(node);
  });

  panels.forEach((panel) => {
    const heading = panel.querySelector(":scope > h1, :scope > h2, :scope > h3");
    const headingText = heading ? heading.textContent.trim().toLowerCase() : "";

    if (!introAssigned && heading && heading.matches("h1")) {
      stripIntroChrome(panel, supportHost);
      panel.classList.add("demo-auto-panel", "demo-auto-panel--intro");
      fragment.appendChild(panel);
      introAssigned = true;
      return;
    }

    if (!guidanceAssigned && headingText === "use this when") {
      guidanceAssigned = true;
      supportHost.appendChild(panel);
      return;
    }

    if (headingText === "event log") {
      supportHost.appendChild(panel);
      return;
    }

    fragment.appendChild(buildDemoStackFromPanel(panel, headingText, meta));
  });

  fragment.appendChild(supportHost);
  main.replaceChildren(fragment);
}

function buildDemoStackFromPanel(panel, headingText, meta) {
  const stack = document.createElement("article");
  stack.className = "demo-auto-stack";

  const liveRow = document.createElement("div");
  liveRow.className = "demo-auto-stack__row demo-auto-stack__row--live";
  const codeRow = document.createElement("div");
  codeRow.className = "demo-auto-stack__row";
  const logRow = document.createElement("div");
  logRow.className = "demo-auto-stack__row";

  const liveNodes = [];
  const codeNodes = [];
  const logNodes = [];

  Array.from(panel.childNodes).forEach((node) => {
    if (node.nodeType === 1 && node.matches("pre.log, #log")) {
      logNodes.push(node);
      return;
    }
    if (node.nodeType === 1 && node.matches("pre")) {
      codeNodes.push(node);
      return;
    }
    if (
      node.nodeType === 1 &&
      node.matches(".log") &&
      (node.tagName === "DIV" || node.tagName === "SECTION")
    ) {
      logNodes.push(node);
      return;
    }
    liveNodes.push(node);
  });

  if (liveNodes.length) {
    const heading = liveNodes.find((node) => node.nodeType === 1 && /^H[1-6]$/.test(node.tagName));
    if (heading) {
      const headingWrap = document.createElement("div");
      headingWrap.className = "demo-auto-stack__heading";
      headingWrap.appendChild(heading);
      liveRow.appendChild(headingWrap);
      liveNodes.splice(liveNodes.indexOf(heading), 1);
    }
    liveNodes.forEach((node) => liveRow.appendChild(node));
  }

  if (codeNodes.length) {
    codeNodes.forEach((node) => {
      node.classList.add("demo-auto-stack__code");
      codeRow.appendChild(node);
    });
  } else {
    const placeholder = document.createElement("pre");
    placeholder.className = "demo-auto-stack__code";
    placeholder.textContent = resolveSampleCode(meta, headingText) || "Sample code is not documented inline on this page yet.";
    codeRow.appendChild(placeholder);
  }

  if (logNodes.length) {
    logNodes.forEach((node) => {
      node.classList.add("demo-auto-stack__log");
      logRow.appendChild(node);
    });
  } else {
    const placeholder = document.createElement("pre");
    placeholder.className = "demo-auto-stack__log";
    placeholder.textContent = headingText === "event log"
      ? "No events yet."
      : "This demo section does not expose a dedicated per-section event log on this page.";
    logRow.appendChild(placeholder);
  }

  stack.append(liveRow, codeRow, logRow);
  return stack;
}

function stripIntroChrome(panel, supportHost) {
  Array.from(panel.querySelectorAll(":scope > .row")).forEach((row) => {
    if (row.querySelector(".back") || row.querySelector("#themeToggle")) {
      supportHost.appendChild(row);
    }
  });
}

function normalizeDemoMeta(meta) {
  return {
    title: String(meta.title || document.title || "Demo"),
    overview: String(meta.overview || meta.description || ""),
    useWhen: Array.isArray(meta.useWhen) ? meta.useWhen : [],
    avoidWhen: Array.isArray(meta.avoidWhen) ? meta.avoidWhen : [],
    description: String(meta.description || ""),
    constructor: Array.isArray(meta.constructor) ? meta.constructor : [],
    options: Array.isArray(meta.options) ? meta.options : [],
    properties: Array.isArray(meta.properties) ? meta.properties : [],
    propertiesText: String(meta.propertiesText || ""),
    events: Array.isArray(meta.events) ? meta.events : [],
    methods: Array.isArray(meta.methods) ? meta.methods : [],
    sectionSamples: meta.sectionSamples && typeof meta.sectionSamples === "object" ? meta.sectionSamples : {},
    defaultSampleCode: String(meta.defaultSampleCode || ""),
  };
}

function resolveSampleCode(meta, headingText) {
  const key = String(headingText || "").trim().toLowerCase();
  if (key && meta.sectionSamples && meta.sectionSamples[key]) {
    return String(meta.sectionSamples[key]);
  }
  return String(meta.defaultSampleCode || "");
}

function buildDocPanels(meta) {
  const panels = [];
  panels.push(buildPanel("overview", "Reference", meta.title, meta.overview || meta.description, [
    ["Overview", "#overview"],
    ["Constructor", "#constructor"],
    ["Options", "#options"],
    ["Properties", "#properties"],
    ["Events", "#events"],
    ["Methods", "#methods"],
  ]));
  panels.push(buildListPanel("use-this-when", "Use This When", meta.useWhen));
  panels.push(buildListPanel("do-not-use-this-when", "Do Not Use This When", meta.avoidWhen));
  panels.push(buildTextPanel("description", "Description", meta.description));
  panels.push(buildTablePanel("constructor", "Constructor / Initialization", ["Factory", "Arguments", "Returns"], meta.constructor, ["factory", "arguments", "returns"]));
  panels.push(buildTablePanel("options", "Options", ["Option", "Default", "Description"], meta.options, ["option", "default", "description"]));
  panels.push(buildPropertiesPanel("properties", "Properties", meta.propertiesText, meta.properties));
  panels.push(buildTablePanel("events", "Events", ["Event", "Arguments", "Return Effect"], meta.events, ["event", "arguments", "returns"]));
  panels.push(buildTablePanel("methods", "Methods", ["Method", "Arguments", "Returns"], meta.methods, ["method", "arguments", "returns"]));
  return panels.filter(Boolean);
}

function buildPanel(id, eyebrow, title, description, anchors) {
  const panel = document.createElement("section");
  panel.className = "demo-doc-panel";
  panel.id = id;

  const eyebrowEl = document.createElement("span");
  eyebrowEl.className = "demo-doc-panel__eyebrow";
  eyebrowEl.textContent = eyebrow;

  const heading = document.createElement("h2");
  heading.textContent = title;

  const body = document.createElement("p");
  body.textContent = description || "";

  const anchorWrap = document.createElement("div");
  anchorWrap.className = "demo-doc-panel__anchors";
  (anchors || []).forEach(([label, href]) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    anchorWrap.appendChild(link);
  });

  panel.append(eyebrowEl, heading, body, anchorWrap);
  return panel;
}

function buildListPanel(id, title, items) {
  const panel = document.createElement("section");
  panel.className = "demo-doc-panel";
  panel.id = id;
  const heading = document.createElement("h2");
  heading.textContent = title;
  panel.appendChild(heading);
  if (!items.length) {
    const empty = document.createElement("p");
    empty.textContent = "No documented notes for this section.";
    panel.appendChild(empty);
    return panel;
  }
  const list = document.createElement("ul");
  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = item;
    list.appendChild(li);
  });
  panel.appendChild(list);
  return panel;
}

function buildTextPanel(id, title, text) {
  const panel = document.createElement("section");
  panel.className = "demo-doc-panel";
  panel.id = id;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const body = document.createElement("p");
  body.innerHTML = text || "No documented description.";
  panel.append(heading, body);
  return panel;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inferOptionValues(row) {
  if (Array.isArray(row?.values) && row.values.length) {
    return row.values;
  }
  const normalizedDefault = String(row?.default || "").replace(/<[^>]+>/g, "").trim();
  if (normalizedDefault === "true" || normalizedDefault === "false") {
    return ["true", "false"];
  }
  return [];
}

function formatTableCell(row, key) {
  const value = row?.[key] || "";
  if (key !== "description") {
    return value;
  }
  const values = inferOptionValues(row);
  if (!values.length) {
    return value;
  }
  const renderedValues = values.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ");
  return `${value}<div class="demo-doc-panel__cell-meta">Allowed values: ${renderedValues}</div>`;
}

function buildTablePanel(id, title, headers, rows, keys) {
  const panel = document.createElement("section");
  panel.className = "demo-doc-panel";
  panel.id = id;
  const heading = document.createElement("h2");
  heading.textContent = title;
  panel.appendChild(heading);

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "No documented entries for this section.";
    panel.appendChild(empty);
    return panel;
  }

  const wrap = document.createElement("div");
  wrap.className = "demo-doc-panel__table-wrap";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    keys.forEach((key) => {
      const td = document.createElement("td");
      td.innerHTML = formatTableCell(row, key);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  wrap.appendChild(table);
  panel.appendChild(wrap);
  return panel;
}

function buildPropertiesPanel(id, title, text, rows) {
  if (!text && !rows.length) {
    text = "No stable public instance properties are documented for this helper. Use the instance methods and state helpers instead of reading fields directly.";
  }
  if (rows.length) {
    return buildTablePanel(id, title, ["Property", "Type", "Description"], rows, ["property", "type", "description"]);
  }
  return buildTextPanel(id, title, text);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountDemoShell, { once: true });
} else {
  mountDemoShell();
}



import { ICON_DEFINITIONS } from "./ui.icons.catalog.js?v=0.21.88";

const SVG_NS = "http://www.w3.org/2000/svg";

export function createIcon(name, options = {}) {
  const definition = getIconDefinition(name);
  if (!definition) {
    throw new Error(`[createIcon] Unknown icon "${name}".`);
  }

  const size = normalizeSize(options.size);
  const decorative = options.decorative !== false && !options.ariaLabel && !options.title;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", definition.viewBox || "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(normalizeStrokeWidth(options.strokeWidth)));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("data-icon", name);
  svg.setAttribute("data-icon-category", definition.category);
  svg.setAttribute("class", ["ui-icon", `is-${definition.category}`, options.className || ""].filter(Boolean).join(" "));

  if (decorative) {
    svg.setAttribute("aria-hidden", "true");
  } else {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", String(options.ariaLabel || options.title || name).trim());
  }

  if (options.title) {
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = String(options.title);
    svg.appendChild(title);
  }

  definition.nodes.forEach((node) => {
    const child = document.createElementNS(SVG_NS, node.tag);
    Object.entries(node.attrs || {}).forEach(([key, value]) => {
      child.setAttribute(key, String(value));
    });
    svg.appendChild(child);
  });

  return svg;
}

export function getIconDefinition(name) {
  const key = String(name || "").trim();
  if (!ICON_DEFINITIONS[key]) {
    return null;
  }
  const definition = ICON_DEFINITIONS[key];
  return {
    ...definition,
    nodes: definition.nodes.map((node) => ({ ...node, attrs: { ...node.attrs } })),
  };
}

export function listIcons() {
  return Object.keys(ICON_DEFINITIONS).sort();
}

export function listIconCategories() {
  return Array.from(new Set(listIcons().map((name) => ICON_DEFINITIONS[name].category))).sort();
}

function normalizeSize(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 16;
}

function normalizeStrokeWidth(value) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 1.8;
}

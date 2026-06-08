import { createMenu } from "./ui.menu.js";

export function createDropdown(triggerEl, items = [], options = {}) {
  const align = normalizeAlign(options?.align);
  const resolvedPlacement = options?.placement || `bottom-${align === "right" ? "end" : "start"}`;
  const api = createMenu(triggerEl, items, {
    placement: resolvedPlacement,
    ...options,
  });
  return {
    ...api,
  };
}

function normalizeAlign(value) {
  const normalized = String(value || "left").toLowerCase();
  return normalized === "right" ? "right" : "left";
}

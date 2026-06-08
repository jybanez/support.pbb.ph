export const SEMANTIC_STATUS_ICONS = {
  success: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75a9.25 9.25 0 1 1 0 18.5a9.25 9.25 0 0 1 0-18.5Zm4.48 5.93a1 1 0 0 0-1.41.02l-4.86 5.01l-2.02-1.98a1 1 0 1 0-1.4 1.43l2.74 2.68a1 1 0 0 0 1.42-.01l5.56-5.73a1 1 0 0 0-.03-1.42Z" fill="currentColor"></path></svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75a9.25 9.25 0 1 1 0 18.5a9.25 9.25 0 0 1 0-18.5Zm0 4.15a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5Zm1.2 4.35h-2.4a.85.85 0 0 0 0 1.7h.35v4.1h-.35a.85.85 0 0 0 0 1.7h2.4a.85.85 0 0 0 0-1.7h-.35v-5.8a.85.85 0 0 0-.85-.85Z" fill="currentColor"></path></svg>`,
  warning: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.94 3.92a1.25 1.25 0 0 1 2.12 0l8.11 13.76A1.25 1.25 0 0 1 20.11 19H3.89a1.25 1.25 0 0 1-1.07-1.92L10.94 3.92Zm1.06 4.08a1 1 0 0 0-1 1v4.35a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm0 8.2a1.15 1.15 0 1 0 0 2.3a1.15 1.15 0 0 0 0-2.3Z" fill="currentColor"></path></svg>`,
  error: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75a9.25 9.25 0 1 1 0 18.5a9.25 9.25 0 0 1 0-18.5Zm-2.97 6.28a1 1 0 0 0 0 1.41L10.59 12l-1.56 1.56a1 1 0 1 0 1.41 1.41L12 13.41l1.56 1.56a1 1 0 0 0 1.41-1.41L13.41 12l1.56-1.56a1 1 0 1 0-1.41-1.41L12 10.59l-1.56-1.56a1 1 0 0 0-1.41 0Z" fill="currentColor"></path></svg>`,
  neutral: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75a9.25 9.25 0 1 1 0 18.5a9.25 9.25 0 0 1 0-18.5Zm0 4.4a1 1 0 0 0-1 1v5.2a1 1 0 1 0 2 0v-5.2a1 1 0 0 0-1-1Zm0 8.6a1.15 1.15 0 1 0 0 2.3a1.15 1.15 0 0 0 0-2.3Z" fill="currentColor"></path></svg>`,
};

export function getSemanticStatusIcon(type) {
  const normalized = normalizeSemanticStatusType(type);
  return SEMANTIC_STATUS_ICONS[normalized] || "";
}

function normalizeSemanticStatusType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "warn") {
    return "warning";
  }
  return value;
}

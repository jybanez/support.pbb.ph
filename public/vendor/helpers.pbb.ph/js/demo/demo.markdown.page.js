import { marked } from "../vendor/marked.esm.js";

function resolveMarkdownPath() {
  return String(document.body?.dataset.markdownPath || "").trim();
}

function resolveMarkdownTitle() {
  return String(document.body?.dataset.markdownTitle || document.title || "Documentation").trim();
}

function isRelativeReference(value) {
  if (!value) {
    return false;
  }
  return !/^(?:[a-z]+:|\/\/|#)/i.test(value);
}

function absolutizeMarkdownReferences(root, markdownUrl) {
  if (!root || !markdownUrl) {
    return;
  }
  root.querySelectorAll("a[href]").forEach((link) => {
    const rawHref = link.getAttribute("href");
    if (!isRelativeReference(rawHref)) {
      return;
    }
    link.href = new URL(rawHref, markdownUrl).href;
  });
  root.querySelectorAll("img[src]").forEach((image) => {
    const rawSrc = image.getAttribute("src");
    if (!isRelativeReference(rawSrc)) {
      return;
    }
    image.src = new URL(rawSrc, markdownUrl).href;
  });
}

async function renderMarkdownPage() {
  const host = document.querySelector("[data-markdown-host]");
  const status = document.querySelector("[data-markdown-status]");
  const titleEl = document.querySelector("h1[data-markdown-title]");
  const markdownPath = resolveMarkdownPath();

  if (titleEl) {
    titleEl.textContent = resolveMarkdownTitle();
  }
  if (!host || !markdownPath) {
    if (status) {
      status.textContent = "Markdown source is not configured for this page.";
    }
    return;
  }

  try {
    const response = await fetch(markdownPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const markdown = await response.text();
    host.innerHTML = marked.parse(markdown);
    absolutizeMarkdownReferences(host, new URL(markdownPath, window.location.href));
    if (status) {
      status.remove();
    }
  } catch (error) {
    if (status) {
      status.textContent = `Unable to load markdown source: ${error instanceof Error ? error.message : String(error)}`;
      status.dataset.state = "error";
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderMarkdownPage, { once: true });
} else {
  renderMarkdownPage();
}


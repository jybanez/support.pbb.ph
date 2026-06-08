import { createElement, clearNode } from "./ui.dom.js";

const DEFAULT_OPTIONS = {
  className: "",
  style: "linear", // linear | striped | gradient | segmented | steps | radial | ring | indeterminate
  size: "md", // sm | md | lg
  showLabel: true,
  showPercent: true,
  animate: true,
  rounded: true,
  glow: false,
  indeterminate: false,
  min: 0,
  max: 100,
  segments: 10,
  totalSteps: 5,
  color: "",
  trackColor: "",
  ariaLabel: "Progress",
};

export function createProgress(container, data = {}, options = {}) {
  let currentData = normalizeData(data);
  let currentOptions = normalizeOptions(options);
  let root = null;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    clearNode(container);

    const normalized = resolveProgress(currentData, currentOptions);
    const style = normalizeStyle(currentOptions.style);
    const size = normalizeSize(currentOptions.size);
    const isIndeterminate = Boolean(currentOptions.indeterminate || style === "indeterminate");
    const percentText = `${Math.round(normalized.percent)}%`;

    root = createElement("section", {
      className: [
        "ui-progress",
        `ui-progress--${style}`,
        `ui-progress--${size}`,
        currentOptions.rounded ? "is-rounded" : "",
        currentOptions.glow ? "is-glow" : "",
        currentOptions.animate ? "is-animated" : "is-static",
        isIndeterminate ? "is-indeterminate" : "",
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
      attrs: {
        role: "progressbar",
        "aria-label": String(currentOptions.ariaLabel || "Progress"),
        "aria-valuemin": String(normalized.min),
        "aria-valuemax": String(normalized.max),
        ...(isIndeterminate ? {} : { "aria-valuenow": String(normalized.value) }),
      },
    });
    root.style.setProperty("--ui-progress-pct", String(normalized.percent));
    if (currentOptions.color) {
      root.style.setProperty("--ui-progress-color", String(currentOptions.color));
    }
    if (currentOptions.trackColor) {
      root.style.setProperty("--ui-progress-track", String(currentOptions.trackColor));
    }

    if (currentOptions.showLabel || currentOptions.showPercent) {
      const header = createElement("div", { className: "ui-progress-header" });
      if (currentOptions.showLabel) {
        header.appendChild(createElement("span", {
          className: "ui-progress-label",
          text: String(currentData.label || "Progress"),
        }));
      }
      if (currentOptions.showPercent) {
        header.appendChild(createElement("span", {
          className: "ui-progress-percent",
          text: isIndeterminate ? "..." : percentText,
        }));
      }
      root.appendChild(header);
    }

    if (style === "radial" || style === "ring") {
      root.appendChild(buildRadial(style, percentText));
    } else if (style === "steps") {
      root.appendChild(buildSteps(normalized, isIndeterminate));
    } else if (style === "segmented") {
      root.appendChild(buildSegmented(normalized, isIndeterminate));
    } else {
      root.appendChild(buildLinear(isIndeterminate));
    }

    container.appendChild(root);
  }

  function buildLinear(isIndeterminate) {
    const track = createElement("div", { className: "ui-progress-track" });
    const fill = createElement("div", { className: "ui-progress-fill" });
    if (isIndeterminate) {
      fill.classList.add("is-indeterminate");
    } else {
      fill.style.width = `${clampPercent(resolveProgress(currentData, currentOptions).percent)}%`;
    }
    track.appendChild(fill);
    return track;
  }

  function buildSegmented(normalized, isIndeterminate) {
    const segments = Math.max(2, Number(currentOptions.segments) || 10);
    const wrap = createElement("div", { className: "ui-progress-segments" });
    const activeCount = isIndeterminate
      ? Math.max(1, Math.floor(segments * 0.45))
      : Math.round((normalized.percent / 100) * segments);
    for (let index = 0; index < segments; index += 1) {
      const segment = createElement("span", {
        className: `ui-progress-segment${index < activeCount ? " is-active" : ""}`,
      });
      if (isIndeterminate) {
        segment.style.animationDelay = `${index * 60}ms`;
      }
      wrap.appendChild(segment);
    }
    return wrap;
  }

  function buildSteps(normalized, isIndeterminate) {
    const totalSteps = Math.max(2, Number(currentData.totalSteps || currentOptions.totalSteps) || 5);
    const currentStep = isIndeterminate
      ? 0
      : Math.min(
        totalSteps,
        Math.max(0, Number(currentData.currentStep) || Math.round((normalized.percent / 100) * totalSteps))
      );
    const wrap = createElement("div", { className: "ui-progress-steps" });
    for (let index = 1; index <= totalSteps; index += 1) {
      const step = createElement("span", {
        className: `ui-progress-step${index <= currentStep ? " is-active" : ""}`,
        text: String(index),
      });
      wrap.appendChild(step);
    }
    return wrap;
  }

  function buildRadial(style, percentText) {
    const visual = createElement("div", {
      className: `ui-progress-radial ui-progress-radial--${style}`,
    });
    visual.appendChild(createElement("span", {
      className: "ui-progress-radial-text",
      text: String(percentText),
    }));
    return visual;
  }

  function update(nextData = {}, nextOptions = {}) {
    currentData = normalizeData({ ...currentData, ...(nextData || {}) });
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function setValue(value) {
    update({ value });
  }

  function destroy() {
    clearNode(container);
    root = null;
  }

  function getState() {
    const normalized = resolveProgress(currentData, currentOptions);
    return {
      data: { ...currentData },
      options: { ...currentOptions },
      value: normalized.value,
      percent: normalized.percent,
    };
  }

  render();

  return {
    destroy,
    update,
    setValue,
    getState,
  };
}

function normalizeData(input) {
  const next = (input && typeof input === "object") ? input : {};
  return {
    value: Number(next.value ?? 0),
    label: next.label ?? "Progress",
    currentStep: next.currentStep ?? null,
    totalSteps: next.totalSteps ?? null,
  };
}

function normalizeOptions(input) {
  return {
    ...DEFAULT_OPTIONS,
    ...(input || {}),
  };
}

function resolveProgress(data, options) {
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 100;
  const boundedMax = max <= min ? min + 1 : max;
  const rawValue = Number.isFinite(Number(data.value)) ? Number(data.value) : min;
  const value = Math.min(boundedMax, Math.max(min, rawValue));
  const percent = ((value - min) / (boundedMax - min)) * 100;
  return {
    min,
    max: boundedMax,
    value,
    percent: clampPercent(percent),
  };
}

function clampPercent(value) {
  const next = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.min(100, Math.max(0, next));
}

function normalizeStyle(style) {
  const value = String(style || "linear").toLowerCase();
  const allowed = ["linear", "striped", "gradient", "segmented", "steps", "radial", "ring", "indeterminate"];
  return allowed.includes(value) ? value : "linear";
}

function normalizeSize(size) {
  const value = String(size || "md").toLowerCase();
  return value === "sm" || value === "lg" ? value : "md";
}

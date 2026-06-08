import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_OPTIONS = {
  className: "",
  orientation: "horizontal", // horizontal | vertical
  clickable: true,
  currentStepId: null,
  onStepClick: null,
};

export function createStepper(container, steps = [], options = {}) {
  const events = createEventBag();
  let currentSteps = normalizeSteps(steps);
  let currentOptions = normalizeOptions(options);

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    const hasExplicitActiveId = currentOptions.currentStepId != null;
    const activeId = hasExplicitActiveId ? currentOptions.currentStepId : inferActiveStepId(currentSteps);
    const root = createElement("section", {
      className: [
        "ui-stepper",
        `ui-stepper--${currentOptions.orientation}`,
        currentOptions.className || "",
      ].filter(Boolean).join(" "),
    });

    const list = createElement("ol", { className: "ui-stepper-list" });
    const activeIndex = currentSteps.findIndex((step) => step.id === activeId);

    currentSteps.forEach((step, index) => {
      const stateClass = resolveStateClass(step, index, activeIndex, hasExplicitActiveId);
      const item = createElement("li", {
        className: `ui-stepper-item ${stateClass}`.trim(),
      });
      const trigger = createElement("button", {
        className: "ui-stepper-trigger",
        attrs: { type: "button", disabled: step.disabled ? "disabled" : null },
      });
      trigger.appendChild(createElement("span", {
        className: "ui-stepper-marker",
        text: step.icon || String(index + 1),
      }));
      const labels = createElement("span", { className: "ui-stepper-labels" });
      labels.appendChild(createElement("span", { className: "ui-stepper-title", text: step.title }));
      if (step.subtitle) {
        labels.appendChild(createElement("span", { className: "ui-stepper-subtitle", text: step.subtitle }));
      }
      trigger.appendChild(labels);
      if (currentOptions.clickable) {
        events.on(trigger, "click", () => currentOptions.onStepClick?.(step, index, getState()));
      } else {
        trigger.disabled = true;
      }
      item.appendChild(trigger);
      list.appendChild(item);
    });

    root.appendChild(list);
    container.appendChild(root);
  }

  function update(nextSteps = currentSteps, nextOptions = {}) {
    currentSteps = normalizeSteps(nextSteps);
    currentOptions = normalizeOptions({ ...currentOptions, ...(nextOptions || {}) });
    render();
  }

  function setCurrentStep(stepId) {
    currentOptions.currentStepId = stepId;
    render();
  }

  function getState() {
    return {
      steps: currentSteps.map((step) => ({ ...step })),
      options: { ...currentOptions },
    };
  }

  function destroy() {
    events.clear();
    clearNode(container);
  }

  render();
  return { update, setCurrentStep, getState, destroy };
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS, ...(options || {}) };
  next.orientation = String(next.orientation || "horizontal").toLowerCase() === "vertical"
    ? "vertical"
    : "horizontal";
  next.clickable = Boolean(next.clickable);
  return next;
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps
    .map((step, index) => {
      if (!step || typeof step !== "object") {
        return null;
      }
      return {
        id: step.id ?? `step-${index + 1}`,
        title: String(step.title ?? `Step ${index + 1}`),
        subtitle: step.subtitle == null ? "" : String(step.subtitle),
        status: String(step.status || "").toLowerCase(),
        disabled: Boolean(step.disabled),
        icon: step.icon == null ? "" : String(step.icon),
      };
    })
    .filter(Boolean);
}

function inferActiveStepId(steps) {
  const explicit = steps.find((step) => step.status === "current");
  if (explicit) {
    return explicit.id;
  }
  const firstPending = steps.find((step) => step.status !== "complete" && step.status !== "completed");
  return firstPending ? firstPending.id : (steps[0]?.id ?? null);
}

function resolveStateClass(step, index, activeIndex, hasExplicitActiveId = false) {
  if (step.status === "error") {
    return "is-error";
  }
  if (hasExplicitActiveId && activeIndex >= 0) {
    if (index === activeIndex) {
      return "is-current";
    }
    if (index < activeIndex || step.status === "complete" || step.status === "completed") {
      return "is-complete";
    }
    return "is-future";
  }
  if (step.status === "complete" || step.status === "completed") {
    return "is-complete";
  }
  if (step.status === "current") {
    return "is-current";
  }
  if (activeIndex >= 0) {
    if (index < activeIndex) {
      return "is-complete";
    }
    if (index === activeIndex) {
      return "is-current";
    }
  }
  return "is-future";
}

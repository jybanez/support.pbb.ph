import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_DATA = {
  isPlaying: false,
  currentMs: 0,
  durationMs: 0,
};

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Audio player",
  seekLabel: "Seek audio",
  playLabel: "Play",
  pauseLabel: "Pause",
  onTogglePlay: null,
  onSeek: null,
};

export function createAudioPlayer(container, data = {}, options = {}) {
  const events = createEventBag();
  let currentData = normalizeData(data);
  let currentOptions = normalizeOptions(options);

  let root = null;
  let playButton = null;
  let timeLabel = null;
  let seekInput = null;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("div", {
      className: `ui-audio-player ${currentOptions.className}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });

    const topRow = createElement("div", { className: "ui-audio-player-row" });
    const bottomRow = createElement("div", { className: "ui-audio-player-row" });

    playButton = createElement("button", {
      className: "ui-button ui-audio-player-toggle",
      attrs: { type: "button" },
    });
    timeLabel = createElement("span", { className: "ui-audio-player-time" });
    seekInput = createElement("input", {
      className: "ui-audio-player-seek",
      attrs: {
        type: "range",
        min: "0",
        max: String(currentData.durationMs || 0),
        step: "10",
        value: String(currentData.currentMs || 0),
      },
    });

    topRow.append(playButton, timeLabel);
    bottomRow.appendChild(seekInput);
    root.append(topRow, bottomRow);
    container.appendChild(root);

    events.on(playButton, "click", () => {
      currentOptions.onTogglePlay?.(!currentData.isPlaying, getState());
    });

    const handleSeek = (eventName) => {
      const nextMs = clampMs(Number(seekInput.value), currentData.durationMs);
      currentOptions.onSeek?.(nextMs, { eventName, state: getState() });
    };
    events.on(seekInput, "input", () => handleSeek("input"));
    events.on(seekInput, "change", () => handleSeek("change"));

    applyState();
  }

  function applyState() {
    if (!playButton || !timeLabel || !seekInput) {
      return;
    }
    playButton.textContent = currentData.isPlaying ? currentOptions.pauseLabel : currentOptions.playLabel;
    playButton.setAttribute("aria-label", currentData.isPlaying ? currentOptions.pauseLabel : currentOptions.playLabel);
    playButton.setAttribute("aria-pressed", currentData.isPlaying ? "true" : "false");
    timeLabel.textContent = `${formatClock(currentData.currentMs)} / ${formatClock(currentData.durationMs)}`;
    seekInput.max = String(currentData.durationMs || 0);
    seekInput.value = String(clampMs(currentData.currentMs, currentData.durationMs));
    seekInput.setAttribute("aria-label", currentOptions.seekLabel);
    seekInput.setAttribute("aria-valuetext", `${formatClock(currentData.currentMs)} of ${formatClock(currentData.durationMs)}`);
  }

  function update(nextData = {}, nextOptions = {}) {
    currentData = normalizeData({ ...currentData, ...nextData });
    currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
    applyState();
  }

  function setPlaying(isPlaying) {
    update({ isPlaying: Boolean(isPlaying) });
  }

  function setCurrent(currentMs) {
    update({ currentMs });
  }

  function setDuration(durationMs) {
    update({ durationMs });
  }

  function destroy() {
    events.clear();
    clearNode(container);
    root = null;
    playButton = null;
    timeLabel = null;
    seekInput = null;
  }

  function getState() {
    return { ...currentData };
  }

  render();

  return {
    destroy,
    update,
    setPlaying,
    setCurrent,
    setDuration,
    getState,
  };
}

function normalizeData(data) {
  return {
    isPlaying: Boolean(data?.isPlaying),
    currentMs: clampMs(Number(data?.currentMs) || 0, Number(data?.durationMs) || 0),
    durationMs: Math.max(0, Number(data?.durationMs) || 0),
  };
}

function normalizeOptions(options) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
}

function clampMs(value, max) {
  const safeMax = Math.max(0, Number(max) || 0);
  const safeValue = Math.max(0, Number(value) || 0);
  return Math.min(safeValue, safeMax);
}

function formatClock(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

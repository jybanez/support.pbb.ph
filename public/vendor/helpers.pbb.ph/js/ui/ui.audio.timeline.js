import { createElement, clearNode } from "./ui.dom.js";
import { createAudioPlayer } from "./ui.audio.player.js?v=0.21.60";
import { createAudioGraph } from "./ui.audio.audiograph.js?v=0.21.60";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Audio timeline",
  autoplay: false,
  baseUrl: "",
  audiographStyle: "vu",
  sensitivity: 3.4,
  trackStyles: {},
  showMute: true,
  onError: null,
  onStateChange: null,
};

export function createAudioTimeline(container, data = {}, options = {}) {
  let currentData = normalizeData(data, options?.baseUrl || "");
  let currentOptions = normalizeOptions(options);
  let root = null;
  let playerHost = null;
  let tracksHost = null;
  let playerApi = null;
  const trackApis = new Map();

  let rafId = 0;
  let isPlaying = false;
  let currentMs = 0;
  let durationMs = 0;
  let clockBaseMs = 0;
  let clockStartPerf = 0;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    clearNode(container);
    root = createElement("section", {
      className: `ui-audio-session ui-audio-timeline ${currentOptions.className}`.trim(),
      attrs: {
        role: "region",
        "aria-label": currentOptions.ariaLabel,
      },
    });
    playerHost = createElement("div", { className: "ui-audio-session-player" });
    tracksHost = createElement("div", {
      className: "ui-audio-session-tracks",
      attrs: {
        role: "list",
        "aria-label": "Audio tracks",
      },
    });
    root.append(playerHost, tracksHost);
    container.appendChild(root);
  }

  async function build() {
    cleanupInstances();
    clearNode(playerHost);
    clearNode(tracksHost);
    durationMs = Math.max(0, currentData.durationMs || 0);
    currentMs = 0;
    isPlaying = false;
    applyRootState();

    playerApi = createAudioPlayer(
      playerHost,
      { isPlaying: false, currentMs: 0, durationMs },
      {
        ariaLabel: `${currentOptions.ariaLabel} playback controls`,
        onTogglePlay(nextPlaying) {
          if (nextPlaying) {
            play();
          } else {
            pause();
          }
        },
        onSeek(nextMs) {
          seek(nextMs);
        },
      }
    );
    applyPlayerAvailability();

    currentData.tracks.forEach((track) => {
      const trackWrap = createElement("div", {
        className: [
          "ui-audio-session-track",
          track.hasPending ? "is-processing" : "",
          track.hasPlayable ? "has-playable" : "is-pending-only",
        ].filter(Boolean).join(" "),
        dataset: {
          trackId: track.id,
          role: track.id,
          processing: track.hasPending ? "true" : "false",
        },
        attrs: { role: "listitem" },
      });
      tracksHost.appendChild(trackWrap);

      const graphApi = createAudioGraph(
        trackWrap,
        {
          role: track.id,
          roleLabel: track.label,
          muted: track.muted,
          isPlaying: false,
          currentMs: 0,
          durationMs,
        },
        {
          ariaLabel: `${track.label} audio graph`,
          style: currentOptions.trackStyles[track.id] || currentOptions.audiographStyle,
          sensitivity: currentOptions.sensitivity,
          showMute: Boolean(currentOptions.showMute && track.hasPlayable),
          onToggleMute(nextMuted) {
            track.muted = nextMuted;
            if (track.audioEl) {
              track.audioEl.muted = nextMuted;
            }
          },
        }
      );

      if (track.hasPlayable) {
        track.audioEl = createTrackAudioElement();
        track.audioEl.muted = track.muted;
        graphApi.attachAudio(track.audioEl);
      }
      if (track.hasPending) {
        const graphRoot = trackWrap.querySelector(".ui-audiograph");
        (graphRoot || trackWrap).appendChild(createProcessingNotice(track));
      }
      trackApis.set(track.id, graphApi);
    });

    await preloadDurations(currentData, (error) => currentOptions.onError?.(error));
    durationMs = currentData.durationMs;
    playerApi.setDuration(durationMs);
    applyRootState();
    applyPlayerAvailability();
    trackApis.forEach((api) => {
      api.setPlayback({ isPlaying: false, currentMs: 0, durationMs });
    });

    if (currentOptions.autoplay && currentData.hasPlayable) {
      play();
    }
    emitState();
  }

  function tick() {
    if (!isPlaying) {
      return;
    }
    currentMs = clampMs(clockBaseMs + (performance.now() - clockStartPerf), durationMs);
    syncAllTracks();
    playerApi.setCurrent(currentMs);
    trackApis.forEach((api) => {
      api.setPlayback({ isPlaying: true, currentMs, durationMs });
    });
    emitState();

    if (currentMs >= durationMs) {
      pause();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  async function play() {
    if (isPlaying || !currentData?.hasPlayable || durationMs <= 0) {
      playerApi?.setPlaying(false);
      applyPlayerAvailability();
      return;
    }
    await Promise.all(
      Array.from(trackApis.values()).map((api) => api.unlockAudioContext?.() || Promise.resolve(false))
    );
    isPlaying = true;
    clockBaseMs = currentMs;
    clockStartPerf = performance.now();
    syncAllTracks();
    trackApis.forEach((api) => {
      api.setPlayback({ isPlaying: true, currentMs, durationMs });
    });
    playerApi.setPlaying(true);
    rafId = requestAnimationFrame(tick);
    emitState();
  }

  function pause() {
    if (!isPlaying) {
      return;
    }
    isPlaying = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    currentData.tracks.forEach((track) => track.audioEl?.pause());
    playerApi.setPlaying(false);
    trackApis.forEach((api) => {
      api.setPlayback({ isPlaying: false, currentMs, durationMs });
    });
    emitState();
  }

  function seek(nextMs) {
    if (!currentData?.hasPlayable || durationMs <= 0) {
      currentMs = 0;
      playerApi?.setCurrent(0);
      emitState();
      return;
    }
    currentMs = clampMs(nextMs, durationMs);
    if (isPlaying) {
      clockBaseMs = currentMs;
      clockStartPerf = performance.now();
    }
    syncAllTracks();
    playerApi.setCurrent(currentMs);
    trackApis.forEach((api) => {
      api.setPlayback({ isPlaying, currentMs, durationMs });
    });
    emitState();
  }

  function syncAllTracks() {
    currentData.tracks.forEach((track) => syncTrack(track, currentMs, isPlaying));
  }

  function syncTrack(track, timelineMs, shouldPlay) {
    const mediaEl = track.audioEl;
    if (!mediaEl) {
      return;
    }
    mediaEl.muted = Boolean(track.muted);
    const index = findSegmentIndexByTime(track.segments, timelineMs);
    if (index < 0) {
      mediaEl.pause();
      track.activeSegmentIndex = -1;
      return;
    }

    const segment = track.segments[index];
    if (!segment.playable || !segment.srcUrl) {
      mediaEl.pause();
      track.activeSegmentIndex = -1;
      return;
    }
    const localMs = Math.max(0, timelineMs - segment.startOffsetMs);
    const localSec = localMs / 1000;

    if (track.activeSegmentIndex !== index || track.activeSrc !== segment.srcUrl) {
      track.activeSegmentIndex = index;
      track.activeSrc = segment.srcUrl;
      mediaEl.src = segment.srcUrl;
      syncMediaTime(mediaEl, localSec);
    } else {
      const drift = Math.abs((mediaEl.currentTime || 0) - localSec);
      if (drift > 0.2) {
        syncMediaTime(mediaEl, localSec);
      }
    }

    if (shouldPlay) {
      mediaEl.play?.().catch(() => {});
    } else {
      mediaEl.pause();
    }
  }

  function update(nextData = {}, nextOptions = {}) {
    currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
    currentData = normalizeData(nextData || {}, currentOptions.baseUrl);
    pause();
    return build();
  }

  function destroy() {
    pause();
    cleanupInstances();
    clearNode(container);
    root = null;
    playerHost = null;
    tracksHost = null;
  }

  function cleanupInstances() {
    if (playerApi) {
      playerApi.destroy();
      playerApi = null;
    }
    trackApis.forEach((api) => api.destroy());
    trackApis.clear();
    if (currentData?.tracks) {
      currentData.tracks.forEach((track) => {
        if (track.audioEl) {
          track.audioEl.pause();
          track.audioEl.src = "";
          track.audioEl.removeAttribute("src");
          track.audioEl.load();
          track.audioEl = null;
        }
      });
    }
  }

  function emitState() {
    currentOptions.onStateChange?.(getState());
  }

  function getState() {
    return {
      isPlaying,
      currentMs,
      durationMs,
      hasPending: Boolean(currentData?.hasPending),
      hasPlayable: Boolean(currentData?.hasPlayable),
      tracks: (currentData?.tracks || []).map((track) => ({
        id: track.id,
        label: track.label,
        muted: track.muted,
        processing: track.hasPending,
        playable: track.hasPlayable,
        segments: track.segments.map((segment) => ({
          id: segment.id,
          startOffsetMs: segment.startOffsetMs,
          durationMs: segment.durationMs,
          endOffsetMs: segment.endOffsetMs,
          srcUrl: segment.srcUrl,
          processing: segment.processing,
          processingLabel: segment.processingLabel,
          playable: segment.playable,
          meta: { ...segment.meta },
        })),
      })),
    };
  }

  function applyRootState() {
    if (!root || !currentData) {
      return;
    }
    root.classList.toggle("has-processing", currentData.hasPending);
    root.classList.toggle("has-playable", currentData.hasPlayable);
    root.classList.toggle("is-processing-only", currentData.hasPending && !currentData.hasPlayable);
  }

  function applyPlayerAvailability() {
    const disabled = !currentData?.hasPlayable || durationMs <= 0;
    if (!playerHost) {
      return;
    }
    playerHost.classList.toggle("is-disabled", disabled);
    playerHost.querySelectorAll("button, input").forEach((control) => {
      control.disabled = disabled;
      control.setAttribute("aria-disabled", disabled ? "true" : "false");
    });
  }

  render();
  build().catch((error) => currentOptions.onError?.(error));

  return {
    destroy,
    update,
    play,
    pause,
    seek,
    getState,
  };
}

function normalizeOptions(options = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    trackStyles: options?.trackStyles && typeof options.trackStyles === "object" ? { ...options.trackStyles } : {},
  };
}

function normalizeData(data = {}, baseUrl = "") {
  const tracks = (Array.isArray(data?.tracks) ? data.tracks : [])
    .map((track, index) => normalizeTrack(track, index, baseUrl))
    .filter(Boolean);
  const hasPending = tracks.some((track) => track.hasPending);
  const hasPlayable = tracks.some((track) => track.hasPlayable);
  const explicitDurationMs = Math.max(0, Number(data?.durationMs) || 0);
  const computedDurationMs = tracks.reduce((max, track) => {
    const trackMax = track.segments.reduce((segmentMax, segment) => {
      return segment.playable ? Math.max(segmentMax, segment.endOffsetMs || 0) : segmentMax;
    }, 0);
    return Math.max(max, trackMax);
  }, 0);
  return {
    tracks,
    hasPending,
    hasPlayable,
    explicitDurationMs,
    durationMs: hasPlayable ? (explicitDurationMs > 0 ? explicitDurationMs : computedDurationMs) : 0,
  };
}

function normalizeTrack(track = {}, index = 0, baseUrl = "") {
  const id = String(track?.id || track?.role || `track-${index + 1}`).trim();
  if (!id) {
    return null;
  }
  const segments = (Array.isArray(track?.segments) ? track.segments : [])
    .map((segment, segmentIndex) => normalizeSegment(segment, segmentIndex, baseUrl))
    .filter(Boolean)
    .sort((a, b) => a.startOffsetMs - b.startOffsetMs);
  if (!segments.length) {
    return null;
  }
  const hasPending = segments.some((segment) => segment.processing);
  const hasPlayable = segments.some((segment) => segment.playable);
  return {
    id,
    label: String(track?.label || track?.roleLabel || id),
    muted: Boolean(track?.muted),
    segments,
    hasPending,
    hasPlayable,
    activeSegmentIndex: -1,
    activeSrc: "",
    audioEl: null,
  };
}

function normalizeSegment(segment = {}, index = 0, baseUrl = "") {
  const srcUrl = resolveMediaPath(segment?.srcUrl || segment?.src || segment?.path || "", baseUrl);
  const processing = Boolean(segment?.processing || segment?.metadata?.processing) && !srcUrl;
  if (!processing && !srcUrl) {
    return null;
  }
  const startOffsetMs = Math.max(0, Number(segment?.startOffsetMs) || 0);
  const durationMs = Math.max(0, Number(segment?.durationMs) || Math.round((Number(segment?.duration_seconds) || 0) * 1000));
  const safeDurationMs = Math.max(1, durationMs || (processing ? 15000 : 0));
  return {
    id: segment?.id ?? `segment-${index + 1}`,
    startOffsetMs,
    durationMs: safeDurationMs,
    endOffsetMs: startOffsetMs + safeDurationMs,
    srcUrl,
    processing,
    processingLabel: String(segment?.processingLabel || segment?.processing_label || segment?.metadata?.processingLabel || segment?.metadata?.processing_label || "").trim(),
    playable: !processing && Boolean(srcUrl),
    meta: segment?.meta && typeof segment.meta === "object" ? { ...segment.meta } : {},
  };
}

async function preloadDurations(data, onError) {
  const tasks = [];
  data.tracks.forEach((track) => {
    track.segments.forEach((segment) => {
      if (segment.processing || !segment.srcUrl || segment.durationMs > 1) {
        return;
      }
      tasks.push(
        loadAudioDurationMs(segment.srcUrl)
          .then((durationMs) => {
            segment.durationMs = Math.max(1, durationMs);
            segment.endOffsetMs = segment.startOffsetMs + segment.durationMs;
          })
          .catch((error) => {
            onError?.(new Error(`Failed to load audio duration for ${segment.srcUrl}: ${error.message}`));
          })
      );
    });
  });
  if (!tasks.length) {
    return;
  }
  await Promise.all(tasks);
  if (data.hasPlayable) {
    const computedDurationMs = data.tracks.reduce((max, track) => {
      return Math.max(max, ...track.segments.filter((segment) => segment.playable).map((segment) => segment.endOffsetMs));
    }, 0);
    data.durationMs = data.explicitDurationMs > 0 ? data.explicitDurationMs : computedDurationMs;
  }
}

function createTrackAudioElement() {
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.playsInline = true;
  audio.crossOrigin = "anonymous";
  return audio;
}

function createProcessingNotice(track) {
  const label = track.segments.find((segment) => segment.processing && segment.processingLabel)?.processingLabel || "Preparing audio...";
  const notice = createElement("div", {
    className: "ui-audio-session-processing",
    attrs: {
      role: "status",
      "aria-live": "polite",
    },
  });
  notice.append(
    createElement("span", {
      className: "ui-audio-session-processing-spinner",
      attrs: { "aria-hidden": "true" },
    }),
    createElement("span", {
      className: "ui-audio-session-processing-label",
      text: label,
    })
  );
  return notice;
}

function findSegmentIndexByTime(segments, timelineMs) {
  for (let i = 0; i < segments.length; i += 1) {
    const item = segments[i];
    const next = segments[i + 1];
    const hardEnd = Number.isFinite(item.endOffsetMs) ? item.endOffsetMs : item.startOffsetMs;
    const inferredEnd = next ? next.startOffsetMs : Number.MAX_SAFE_INTEGER;
    const end = Math.max(hardEnd, inferredEnd);
    if (timelineMs >= item.startOffsetMs && timelineMs < end) {
      return i;
    }
  }
  return -1;
}

function resolveMediaPath(path, baseUrl) {
  const value = String(path || "").trim();
  if (!value) {
    return "";
  }
  if (/^(https?:)?\/\//i.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return value;
  }
  if (!baseUrl) {
    return `./${value}`;
  }
  return `${String(baseUrl).replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
}

function syncMediaTime(mediaEl, seconds) {
  if (!Number.isFinite(seconds)) {
    return;
  }
  try {
    mediaEl.currentTime = Math.max(0, seconds);
  } catch (_error) {
    const once = () => {
      try {
        mediaEl.currentTime = Math.max(0, seconds);
      } catch (_innerError) {}
      mediaEl.removeEventListener("loadedmetadata", once);
    };
    mediaEl.addEventListener("loadedmetadata", once);
  }
}

function clampMs(value, max) {
  const safeValue = Math.max(0, Number(value) || 0);
  const safeMax = Math.max(0, Number(max) || 0);
  return Math.min(safeValue, safeMax);
}

function loadAudioDurationMs(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error("Missing audio URL"));
      return;
    }
    const audio = document.createElement("audio");
    let done = false;
    const finalize = (fn) => {
      if (done) {
        return;
      }
      done = true;
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
      clearTimeout(timer);
      fn();
    };
    const onLoaded = () => {
      const duration = Number(audio.duration);
      finalize(() => resolve(Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0));
    };
    const onError = () => finalize(() => reject(new Error("Unable to load metadata")));
    const timer = setTimeout(() => finalize(() => reject(new Error("Timeout while loading metadata"))), 8000);
    audio.preload = "metadata";
    audio.src = url;
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
  });
}

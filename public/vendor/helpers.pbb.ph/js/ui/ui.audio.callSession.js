import { createAudioTimeline } from "./ui.audio.timeline.js?v=0.21.60";

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "Audio call session",
  debug: false,
  autoplay: false,
  baseUrl: "",
  audiographStyle: "vu",
  sensitivity: 3.4,
  roleStyles: {},
  showMute: true,
  onError: null,
  onStateChange: null,
};

export function createAudioCallSession(container, incident = {}, options = {}) {
  let currentIncident = incident || {};
  let currentOptions = normalizeOptions(options);
  let timelineApi = createAudioTimeline(container, normalizeIncident(currentIncident, currentOptions.baseUrl), toTimelineOptions(currentOptions));

  function update(nextIncident = {}, nextOptions = {}) {
    currentIncident = nextIncident || {};
    currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
    return timelineApi.update(normalizeIncident(currentIncident, currentOptions.baseUrl), toTimelineOptions(currentOptions));
  }

  function getState() {
    return toCallSessionState(timelineApi.getState());
  }

  return {
    destroy() {
      timelineApi.destroy();
    },
    update,
    play() {
      return timelineApi.play();
    },
    pause() {
      return timelineApi.pause();
    },
    seek(nextMs) {
      return timelineApi.seek(nextMs);
    },
    getState,
    getTimeline() {
      return timelineApi;
    },
  };
}

function toTimelineOptions(options) {
  return {
    className: options.className,
    ariaLabel: options.ariaLabel,
    autoplay: options.autoplay,
    baseUrl: "",
    audiographStyle: options.audiographStyle,
    sensitivity: options.sensitivity,
    trackStyles: options.roleStyles,
    showMute: options.showMute,
    onError: options.onError,
    onStateChange(state) {
      options.onStateChange?.(toCallSessionState(state));
    },
  };
}

function toCallSessionState(state = {}) {
  return {
    isPlaying: Boolean(state.isPlaying),
    currentMs: Math.max(0, Number(state.currentMs) || 0),
    durationMs: Math.max(0, Number(state.durationMs) || 0),
    roles: (state.tracks || []).map((track) => ({
      role: track.id,
      roleLabel: track.label,
      muted: Boolean(track.muted),
      processing: Boolean(track.processing),
      playable: Boolean(track.playable),
      segments: (track.segments || []).map((segment) => ({
        id: segment.id,
        callId: segment.meta?.callId || "",
        startOffsetMs: segment.startOffsetMs,
        durationMs: segment.durationMs,
        endOffsetMs: segment.endOffsetMs,
        srcUrl: segment.srcUrl,
        processing: Boolean(segment.processing),
        processingLabel: segment.processingLabel || "",
        playable: Boolean(segment.playable),
      })),
    })),
    hasPending: Boolean(state.hasPending),
    hasPlayable: Boolean(state.hasPlayable),
  };
}

function normalizeOptions(options) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
    roleStyles: options?.roleStyles && typeof options.roleStyles === "object" ? { ...options.roleStyles } : {},
  };
}

function normalizeIncident(incident, baseUrl) {
  const safeIncident = incident || {};
  const explicitDurationMs = Math.max(0, Math.round((Number(safeIncident.call_duration_seconds) || 0) * 1000));
  const mediaList = Array.isArray(safeIncident.media) ? safeIncident.media : [];
  const parsed = mediaList
    .filter((row) => String(row?.type || "").toLowerCase() === "audio")
    .map((row) => parseMediaRow(row, baseUrl))
    .filter(Boolean)
    .sort((a, b) => a.startAt - b.startAt);
  const allStart = parsed.length ? parsed[0].startAt : 0;
  const rolesMap = new Map();

  parsed.forEach((segment) => {
    const role = segment.role;
    if (!rolesMap.has(role)) {
      rolesMap.set(role, {
        id: role,
        label: segment.peerLabel || resolveRoleLabel(safeIncident, role),
        muted: false,
        segments: [],
      });
    }
    const startOffsetMs = Math.max(0, segment.startAt - allStart);
    const normalizedSegment = {
      id: segment.id,
      srcUrl: segment.srcUrl,
      startOffsetMs,
      durationMs: segment.durationMs || 0,
      processing: segment.processing,
      processingLabel: segment.processingLabel,
      meta: { callId: segment.callId },
    };
    rolesMap.get(role).segments.push(normalizedSegment);
  });

  Array.from(rolesMap.values()).forEach((track) => {
    track.segments = track.segments.map((segment, index, list) => {
      if (segment.durationMs > 0) {
        return segment;
      }
      const next = list[index + 1];
      const nextStartOffsetMs = next ? Math.max(0, next.startOffsetMs) : null;
      return {
        ...segment,
        durationMs: nextStartOffsetMs !== null ? Math.max(1000, nextStartOffsetMs - segment.startOffsetMs) : 15000,
      };
    });
  });

  return {
    durationMs: explicitDurationMs,
    tracks: Array.from(rolesMap.values()),
  };
}

function parseMediaRow(row, baseUrl) {
  const parsedToken = parseRecordingRoleToken(row?.metadata?.recording_role);
  const role = parsedToken?.role || normalizeRole(row?.peer_role || row?.metadata?.peer_role || row?.metadata?.role);
  if (!role) {
    return null;
  }
  const callId = parsedToken?.callId || String(row?.call_session_id || row?.metadata?.call_session_id || "");
  const startAt = parsedToken?.startAt ?? resolveMediaStartAt(row);
  if (!Number.isFinite(startAt)) {
    return null;
  }
  const srcUrl = resolveMediaPath(row?.srcUrl || row?.src || row?.path || "", baseUrl);
  const processing = Boolean(row?.processing || row?.metadata?.processing) && !srcUrl;
  if (!processing && !srcUrl) {
    return null;
  }
  const durationSeconds = Number(row?.duration_seconds);
  return {
    id: row?.id ?? null,
    role,
    callId,
    startAt,
    durationMs: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : 0,
    srcUrl,
    processing,
    processingLabel: String(row?.processingLabel || row?.processing_label || row?.metadata?.processingLabel || row?.metadata?.processing_label || "").trim(),
    peerLabel: String(row?.peer_label || row?.metadata?.peer_label || "").trim(),
  };
}

function parseRecordingRoleToken(token) {
  if (typeof token !== "string") {
    return null;
  }
  const match = token.match(/^([a-zA-Z_]+)-([0-9]+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/);
  if (!match) {
    return null;
  }
  const startAt = Date.parse(match[3].replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/,
    "$1T$2:$3:$4Z"
  ));
  if (!Number.isFinite(startAt)) {
    return null;
  }
  return {
    role: normalizeRole(match[1]),
    callId: String(match[2] || ""),
    startAt,
  };
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function resolveMediaStartAt(row) {
  const candidates = [
    row?.recorded_at,
    row?.started_at,
    row?.created_at,
    row?.timestamp,
    row?.metadata?.recorded_at,
    row?.metadata?.started_at,
    row?.metadata?.created_at,
    row?.metadata?.timestamp,
  ];
  for (const candidate of candidates) {
    const parsed = Date.parse(String(candidate || ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return NaN;
}

function resolveRoleLabel(incident, role) {
  if (role === "caller") {
    return incident?.caller?.name || role;
  }
  if (role === "operator") {
    return incident?.operator?.name || role;
  }
  return role;
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

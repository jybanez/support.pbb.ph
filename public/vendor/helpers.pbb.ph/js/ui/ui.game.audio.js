const DEFAULT_AUDIO_OPTIONS = {
  masterVolume: 1,
  muted: false,
  sounds: {},
  tones: {
    move: { frequency: 440, duration: 0.045, type: "square", volume: 0.18, category: "sfx" },
    select: { frequency: 660, duration: 0.07, type: "sine", volume: 0.22, category: "ui" },
    score: { frequency: [523.25, 659.25, 783.99], duration: 0.14, type: "triangle", volume: 0.24, category: "sfx" },
    error: { frequency: 146.83, duration: 0.14, type: "sawtooth", volume: 0.16, category: "ui" },
  },
  categoryVolumes: {
    master: 1,
    sfx: 1,
    ui: 1,
    music: 1,
  },
};

export const STARTER_GAME_SOUND_NAMES = Object.freeze([
  "move",
  "select",
  "rotate",
  "drop",
  "score",
  "match",
  "error",
  "win",
  "lose",
  "pause",
]);

const DEFAULT_STARTER_SOUND_OPTIONS = {
  baseUrl: "https://helpers.pbb.ph/current/assets/sounds/game/",
  version: "",
  extension: "wav",
  preload: "auto",
  pool: 3,
  category: "sfx",
  cacheBust: "",
  volumes: {
    move: 0.55,
    select: 0.62,
    rotate: 0.58,
    drop: 0.64,
    score: 0.72,
    match: 0.72,
    error: 0.56,
    win: 0.78,
    lose: 0.68,
    pause: 0.5,
  },
};

const DEFAULT_SOUND_OPTIONS = {
  src: "",
  volume: 1,
  category: "sfx",
  preload: "auto",
  pool: 3,
};

const DEFAULT_TONE_OPTIONS = {
  frequency: 440,
  duration: 0.08,
  type: "sine",
  volume: 1,
  category: "sfx",
  attack: 0.004,
  release: 0.03,
};

export function createStarterGameSounds(options = {}) {
  const config = normalizeStarterSoundOptions(options);
  return Object.fromEntries(config.names.map((name) => [
    name,
    {
      src: `${config.baseUrl}${name}.${config.extension}${config.cacheBust}`,
      category: config.category,
      volume: normalizeVolume(config.volumes[name] ?? 1),
      preload: config.preload,
      pool: config.pool,
    },
  ]));
}

export function createGameAudio(options = {}) {
  const state = normalizeAudioOptions(options);
  const sounds = new Map();
  const tones = new Map();
  const activeMedia = new Set();
  const activeToneNodes = new Set();
  let audioContext = null;
  let unlocked = false;
  let destroyed = false;

  const api = {
    destroy,
    getState,
    play,
    playTone,
    preload,
    registerSound,
    registerTone,
    setCategoryVolume,
    setMasterVolume,
    setMuted,
    stopAll,
    unlock,
  };

  Object.entries(state.sounds).forEach(([id, sound]) => registerSound(id, sound));
  Object.entries(state.tones).forEach(([id, tone]) => registerTone(id, tone));

  function registerSound(id, soundOptions = {}) {
    assertLive();
    const key = normalizeId(id);
    if (!key) {
      throw new Error("[createGameAudio] registerSound requires a sound id.");
    }
    const sound = normalizeSoundOptions(soundOptions);
    const pool = createAudioPool(sound);
    sounds.set(key, {
      ...sound,
      pool,
      cursor: 0,
      ready: false,
      error: null,
    });
    return api;
  }

  function registerTone(id, toneOptions = {}) {
    assertLive();
    const key = normalizeId(id);
    if (!key) {
      throw new Error("[createGameAudio] registerTone requires a tone id.");
    }
    tones.set(key, normalizeToneOptions(toneOptions));
    return api;
  }

  async function unlock() {
    assertLive();
    const context = ensureAudioContext();
    if (!context) {
      unlocked = true;
      return false;
    }
    if (typeof context.resume === "function" && context.state !== "running") {
      await context.resume();
    }
    playSilentTick(context);
    unlocked = true;
    return true;
  }

  async function preload(ids = null) {
    assertLive();
    const targets = normalizeIdList(ids, sounds.keys());
    const results = await Promise.allSettled(targets.map((id) => preloadSound(id)));
    return {
      total: targets.length,
      loaded: results.filter((result) => result.status === "fulfilled").length,
      failed: results.filter((result) => result.status === "rejected").length,
      results,
    };
  }

  async function preloadSound(id) {
    const sound = sounds.get(normalizeId(id));
    if (!sound) {
      throw new Error(`[createGameAudio] Unknown sound "${id}".`);
    }
    if (sound.ready) {
      return sound;
    }
    const entries = sound.pool.length ? sound.pool : createAudioPool(sound);
    sound.pool = entries;
    await Promise.all(entries.map((audio) => loadAudioElement(audio)));
    sound.ready = true;
    sound.error = null;
    return sound;
  }

  function play(id, playOptions = {}) {
    assertLive();
    const soundId = normalizeId(id);
    if (tones.has(soundId) && !sounds.has(soundId)) {
      return playTone(soundId, playOptions);
    }
    const sound = sounds.get(soundId);
    if (!sound) {
      throw new Error(`[createGameAudio] Unknown sound "${id}".`);
    }
    const volume = effectiveVolume(sound, playOptions);
    if (state.muted || volume <= 0) {
      return null;
    }
    const audio = nextAudio(sound);
    if (!audio) {
      return null;
    }
    audio.volume = volume;
    if (playOptions.loop != null) {
      audio.loop = Boolean(playOptions.loop);
    }
    try {
      audio.currentTime = 0;
    } catch (_error) {
      // Some browser media implementations do not allow seeking before metadata loads.
    }
    activeMedia.add(audio);
    const cleanup = () => activeMedia.delete(audio);
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("pause", cleanup, { once: true });
    const promise = audio.play?.();
    if (promise?.catch) {
      promise.catch((error) => {
        sound.error = error;
        activeMedia.delete(audio);
      });
    }
    return audio;
  }

  function playTone(idOrOptions = "select", playOptions = {}) {
    assertLive();
    const tone = typeof idOrOptions === "string"
      ? { ...(tones.get(normalizeId(idOrOptions)) || normalizeToneOptions({ frequency: idOrOptions })), ...playOptions }
      : normalizeToneOptions(idOrOptions);
    const context = ensureAudioContext();
    const volume = effectiveVolume(tone, playOptions);
    if (!context || state.muted || volume <= 0) {
      return null;
    }
    const now = Number(context.currentTime) || 0;
    const duration = normalizeNumber(playOptions.duration ?? tone.duration, DEFAULT_TONE_OPTIONS.duration, 0.01, 5);
    const attack = Math.min(duration, normalizeNumber(tone.attack, DEFAULT_TONE_OPTIONS.attack, 0, 1));
    const release = Math.min(duration, normalizeNumber(tone.release, DEFAULT_TONE_OPTIONS.release, 0, 1));
    const frequencies = Array.isArray(tone.frequency) ? tone.frequency : [tone.frequency];
    const output = context.createGain();
    output.gain.setValueAtTime?.(0.0001, now);
    output.gain.exponentialRampToValueAtTime?.(Math.max(0.0001, volume), now + attack);
    output.gain.exponentialRampToValueAtTime?.(0.0001, now + duration + release);
    output.connect(context.destination);

    const nodes = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = normalizeOscillatorType(tone.type);
      oscillator.frequency.setValueAtTime?.(normalizeFrequency(frequency), now + index * duration);
      oscillator.connect(output);
      oscillator.start(now + index * duration);
      oscillator.stop(now + (index + 1) * duration + release);
      oscillator.addEventListener?.("ended", () => activeToneNodes.delete(oscillator), { once: true });
      activeToneNodes.add(oscillator);
      return oscillator;
    });
    return { output, nodes };
  }

  function stopAll() {
    activeMedia.forEach((audio) => {
      try {
        audio.pause?.();
        audio.currentTime = 0;
      } catch (_error) {
        // Ignore media cleanup failures during teardown.
      }
    });
    activeMedia.clear();
    activeToneNodes.forEach((node) => {
      try {
        node.stop?.();
      } catch (_error) {
        // Oscillators may already be stopped.
      }
    });
    activeToneNodes.clear();
  }

  function setMuted(muted) {
    state.muted = Boolean(muted);
    if (state.muted) {
      stopAll();
    }
    return api;
  }

  function setMasterVolume(volume) {
    state.masterVolume = normalizeVolume(volume);
    updateActiveMediaVolume();
    return api;
  }

  function setCategoryVolume(category, volume) {
    const key = normalizeId(category) || "master";
    state.categoryVolumes[key] = normalizeVolume(volume);
    updateActiveMediaVolume();
    return api;
  }

  function updateActiveMediaVolume() {
    activeMedia.forEach((audio) => {
      const sound = Array.from(sounds.values()).find((entry) => entry.pool.includes(audio));
      if (sound) {
        audio.volume = state.muted ? 0 : effectiveVolume(sound);
      }
    });
  }

  function effectiveVolume(entry, overrides = {}) {
    const category = normalizeId(overrides.category || entry.category || "sfx") || "sfx";
    return normalizeVolume(overrides.volume ?? entry.volume)
      * state.masterVolume
      * normalizeVolume(state.categoryVolumes.master)
      * normalizeVolume(state.categoryVolumes[category] ?? 1);
  }

  function getState() {
    return {
      destroyed,
      unlocked,
      muted: state.muted,
      masterVolume: state.masterVolume,
      categoryVolumes: { ...state.categoryVolumes },
      soundCount: sounds.size,
      toneCount: tones.size,
      activeMediaCount: activeMedia.size,
      activeToneCount: activeToneNodes.size,
      soundIds: Array.from(sounds.keys()),
      toneIds: Array.from(tones.keys()),
    };
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    stopAll();
    sounds.clear();
    tones.clear();
    destroyed = true;
  }

  function ensureAudioContext() {
    if (audioContext) {
      return audioContext;
    }
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioContextCtor !== "function") {
      return null;
    }
    audioContext = new AudioContextCtor();
    return audioContext;
  }

  function assertLive() {
    if (destroyed) {
      throw new Error("[createGameAudio] Audio controller has been destroyed.");
    }
  }

  return api;
}

function createAudioPool(sound) {
  if (!sound.src || typeof Audio !== "function") {
    return [];
  }
  return Array.from({ length: sound.pool }, () => {
    const audio = new Audio(sound.src);
    audio.preload = sound.preload;
    audio.crossOrigin = sound.crossOrigin || null;
    return audio;
  });
}

function loadAudioElement(audio) {
  return new Promise((resolve, reject) => {
    if (!audio) {
      resolve(null);
      return;
    }
    if (audio.readyState >= 2) {
      resolve(audio);
      return;
    }
    const cleanup = () => {
      audio.removeEventListener("canplaythrough", handleLoad);
      audio.removeEventListener("loadeddata", handleLoad);
      audio.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      resolve(audio);
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Unable to preload audio ${audio.currentSrc || audio.src || ""}`));
    };
    audio.addEventListener("canplaythrough", handleLoad, { once: true });
    audio.addEventListener("loadeddata", handleLoad, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.load?.();
  });
}

function nextAudio(sound) {
  if (!sound.pool.length) {
    sound.pool = createAudioPool(sound);
  }
  if (!sound.pool.length) {
    return null;
  }
  const audio = sound.pool[sound.cursor % sound.pool.length];
  sound.cursor += 1;
  return audio;
}

function normalizeAudioOptions(input = {}) {
  const next = { ...DEFAULT_AUDIO_OPTIONS, ...(input || {}) };
  const categoryVolumes = { ...DEFAULT_AUDIO_OPTIONS.categoryVolumes, ...(next.categoryVolumes || {}) };
  return {
    ...next,
    masterVolume: normalizeVolume(next.masterVolume),
    muted: next.muted === true,
    sounds: next.sounds && typeof next.sounds === "object" ? next.sounds : {},
    tones: { ...DEFAULT_AUDIO_OPTIONS.tones, ...(next.tones && typeof next.tones === "object" ? next.tones : {}) },
    categoryVolumes: Object.fromEntries(Object.entries(categoryVolumes).map(([key, value]) => [key, normalizeVolume(value)])),
  };
}

function normalizeStarterSoundOptions(input = {}) {
  const isStringInput = typeof input === "string";
  const raw = isStringInput ? { baseUrl: input } : (input || {});
  const next = { ...DEFAULT_STARTER_SOUND_OPTIONS, ...raw };
  const version = String(next.version || "").trim();
  const hasExplicitBaseUrl = isStringInput || Object.prototype.hasOwnProperty.call(raw, "baseUrl");
  const baseUrl = normalizeBaseUrl(hasExplicitBaseUrl ? next.baseUrl : (version ? `https://helpers.pbb.ph/releases/${version}/assets/sounds/game/` : DEFAULT_STARTER_SOUND_OPTIONS.baseUrl));
  const extension = String(next.extension || DEFAULT_STARTER_SOUND_OPTIONS.extension).replace(/^\.+/, "") || DEFAULT_STARTER_SOUND_OPTIONS.extension;
  const names = (Array.isArray(next.names) && next.names.length ? next.names : STARTER_GAME_SOUND_NAMES)
    .map(normalizeId)
    .filter((name, index, list) => name && STARTER_GAME_SOUND_NAMES.includes(name) && list.indexOf(name) === index);
  return {
    baseUrl,
    version,
    extension,
    names: names.length ? names : [...STARTER_GAME_SOUND_NAMES],
    category: normalizeId(next.category) || DEFAULT_STARTER_SOUND_OPTIONS.category,
    preload: ["none", "metadata", "auto"].includes(String(next.preload)) ? String(next.preload) : DEFAULT_STARTER_SOUND_OPTIONS.preload,
    pool: Math.max(1, Math.min(12, Math.round(Number(next.pool) || DEFAULT_STARTER_SOUND_OPTIONS.pool))),
    cacheBust: normalizeCacheBust(next.cacheBust),
    volumes: { ...DEFAULT_STARTER_SOUND_OPTIONS.volumes, ...(next.volumes || {}) },
  };
}

function normalizeBaseUrl(value) {
  const base = String(value || DEFAULT_STARTER_SOUND_OPTIONS.baseUrl).trim() || DEFAULT_STARTER_SOUND_OPTIONS.baseUrl;
  return base.endsWith("/") ? base : `${base}/`;
}

function normalizeCacheBust(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.startsWith("?") ? text : `?${text}`;
}

function normalizeSoundOptions(input = {}) {
  const next = typeof input === "string" ? { src: input } : { ...DEFAULT_SOUND_OPTIONS, ...(input || {}) };
  return {
    ...next,
    src: String(next.src || ""),
    volume: normalizeVolume(next.volume),
    category: normalizeId(next.category) || DEFAULT_SOUND_OPTIONS.category,
    preload: ["none", "metadata", "auto"].includes(String(next.preload)) ? String(next.preload) : DEFAULT_SOUND_OPTIONS.preload,
    pool: Math.max(1, Math.min(12, Math.round(Number(next.pool) || DEFAULT_SOUND_OPTIONS.pool))),
    crossOrigin: next.crossOrigin == null ? "" : String(next.crossOrigin),
  };
}

function normalizeToneOptions(input = {}) {
  const next = { ...DEFAULT_TONE_OPTIONS, ...(input || {}) };
  return {
    ...next,
    frequency: Array.isArray(next.frequency) ? next.frequency.map(normalizeFrequency) : normalizeFrequency(next.frequency),
    duration: normalizeNumber(next.duration, DEFAULT_TONE_OPTIONS.duration, 0.01, 5),
    type: normalizeOscillatorType(next.type),
    volume: normalizeVolume(next.volume),
    category: normalizeId(next.category) || DEFAULT_TONE_OPTIONS.category,
    attack: normalizeNumber(next.attack, DEFAULT_TONE_OPTIONS.attack, 0, 1),
    release: normalizeNumber(next.release, DEFAULT_TONE_OPTIONS.release, 0, 1),
  };
}

function normalizeFrequency(value) {
  return normalizeNumber(value, 440, 20, 20000);
}

function normalizeOscillatorType(value) {
  const type = String(value || DEFAULT_TONE_OPTIONS.type).toLowerCase();
  return ["sine", "square", "sawtooth", "triangle"].includes(type) ? type : DEFAULT_TONE_OPTIONS.type;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeIdList(ids, fallbackIterator) {
  if (ids == null) {
    return Array.from(fallbackIterator);
  }
  return (Array.isArray(ids) ? ids : [ids]).map(normalizeId).filter(Boolean);
}

function normalizeVolume(value) {
  return normalizeNumber(value, 1, 0, 1);
}

function normalizeNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function playSilentTick(context) {
  if (!context?.createGain || !context?.createOscillator) {
    return;
  }
  const now = Number(context.currentTime) || 0;
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  gain.gain.setValueAtTime?.(0.0001, now);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.01);
}

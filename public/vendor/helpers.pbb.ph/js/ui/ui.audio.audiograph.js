import { createElement, clearNode } from "./ui.dom.js";
import { createEventBag } from "./ui.events.js";

const DEFAULT_DATA = {
  role: "role",
  roleLabel: "Role",
  muted: false,
  isPlaying: false,
  isLive: false,
  isActive: false,
  currentMs: 0,
  durationMs: 0,
};

const DEFAULT_OPTIONS = {
  className: "",
  ariaLabel: "",
  style: "vu", // vu | dots | mirrored | spectrum | classic-waveform
  overlayHeader: true,
  transparentBackground: false,
  headerInsetPx: 30,
  sensitivity: 3.4,
  gateThreshold: 0.06,
  attackMs: 45,
  releaseMs: 260,
  intensityCurve: 1.7,
  freezeOnPause: true,
  showMute: true,
  muteLabel: "Mute",
  unmuteLabel: "Unmute",
  onToggleMute: null,
};

export function createAudioGraph(container, data = {}, options = {}) {
  const events = createEventBag();
  let currentData = normalizeData(data);
  let currentOptions = normalizeOptions(options);

  let root = null;
  let roleLabelEl = null;
  let muteButton = null;
  let canvas = null;
  let ctx = null;
  let roleLabelId = "";
  let rafId = 0;
  let audioEl = null;
  let mediaStream = null;
  let attachedAudioNode = null;
  let audioContext = null;
  let ownsAudioContext = false;
  let analyser = null;
  let analyserData = null;
  let analyserTimeData = null;
  let sourceNode = null;
  let sourceType = "none";
  let particleState = [];
  let burstLevels = [];
  let envelopeLevel = 0;
  let lastPaintAt = performance.now();
  let peakHoldLevel = 0;

  function render() {
    if (!container || container.nodeType !== 1) {
      return;
    }
    events.clear();
    clearNode(container);

    root = createElement("section", {
      className: `ui-audiograph ${currentOptions.className}`.trim(),
      dataset: { role: currentData.role || "" },
    });
    roleLabelId = `ui-audiograph-role-${toDomIdToken(currentData.role || currentData.roleLabel || "role")}`;
    const header = createElement("div", { className: "ui-audiograph-header" });
    roleLabelEl = createElement("p", {
      className: "ui-audiograph-role",
      attrs: { id: roleLabelId },
    });
    muteButton = createElement("button", {
      className: "ui-button ui-audiograph-mute",
      attrs: { type: "button" },
    });
    canvas = createElement("canvas", {
      className: "ui-audiograph-canvas",
      attrs: { "aria-hidden": "true" },
    });
    ctx = canvas.getContext("2d");

    header.append(roleLabelEl);
    if (currentOptions.showMute) {
      header.appendChild(muteButton);
    }
    if (currentOptions.overlayHeader) {
      root.append(canvas, header);
    } else {
      root.append(header, canvas);
    }
    container.appendChild(root);

    if (currentOptions.showMute) {
      events.on(muteButton, "click", () => {
        const next = !currentData.muted;
        setMuted(next, { notify: true });
      });
    }

    applyState();
    startPaintLoop();
  }

  function applyState() {
    if (!roleLabelEl || !canvas) {
      return;
    }
    roleLabelEl.textContent = String(currentData.roleLabel || currentData.role || "Role");
    if (muteButton) {
      muteButton.textContent = currentData.muted ? currentOptions.unmuteLabel : currentOptions.muteLabel;
      muteButton.setAttribute("aria-label", currentData.muted ? currentOptions.unmuteLabel : currentOptions.muteLabel);
      muteButton.setAttribute("aria-pressed", currentData.muted ? "true" : "false");
    }
    if (root) {
      root.setAttribute("role", "region");
      if (currentOptions.ariaLabel) {
        root.setAttribute("aria-label", currentOptions.ariaLabel);
        root.removeAttribute("aria-labelledby");
      } else {
        root.setAttribute("aria-labelledby", roleLabelId);
        root.removeAttribute("aria-label");
      }
      root.classList.toggle("is-muted", currentData.muted);
      root.classList.toggle("is-playing", currentData.isPlaying);
      root.classList.toggle("is-overlay-header", Boolean(currentOptions.overlayHeader));
      root.classList.toggle("is-transparent-background", Boolean(currentOptions.transparentBackground));
      root.style.setProperty("--ui-audiograph-header-inset", `${Math.max(0, Number(currentOptions.headerInsetPx) || 30)}px`);
    }
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !ctx) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(120, Math.floor(canvas.clientWidth || 280));
    const height = Math.max(48, Math.floor(canvas.clientHeight || 58));
    const nextWidth = Math.floor(width * ratio);
    const nextHeight = Math.floor(height * ratio);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }

  function startPaintLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    const paint = () => {
      drawGraph();
      rafId = requestAnimationFrame(paint);
    };
    rafId = requestAnimationFrame(paint);
  }

  function drawGraph() {
    if (!ctx || !canvas) {
      return;
    }
    resizeCanvas();
    const width = Math.floor(canvas.clientWidth || 280);
    const height = Math.floor(canvas.clientHeight || 58);
    const rawLevel = getLevel();
    const level = getResponsiveLevel(rawLevel);
    const style = normalizeStyle(currentOptions.style);
    const graphTop = currentOptions.overlayHeader ? Math.max(0, Number(currentOptions.headerInsetPx) || 30) : 0;
    const graphHeight = Math.max(20, height - graphTop);
    const baselineY = resolveBaselineY(style, graphTop, graphHeight, level);

    ctx.clearRect(0, 0, width, height);

    if (!currentOptions.transparentBackground && style !== "classic-waveform") {
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "rgba(255, 186, 61, 0.14)");
      gradient.addColorStop(1, "rgba(255, 94, 94, 0.08)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    const baselineAlpha = getBaselineAlpha(style, level);
    ctx.strokeStyle = `rgba(255, 156, 102, ${baselineAlpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(width, baselineY);
    ctx.stroke();

    if (style === "dots") {
      drawDots(width, baselineY, level);
      return;
    }
    if (style === "mirrored") {
      drawMirrored(width, baselineY, graphHeight, level);
      return;
    }
    if (style === "classic-waveform") {
      drawClassicWaveform(width, baselineY, graphTop, graphHeight, level);
      return;
    }
    if (style === "spectrum") {
      drawSpectrum(width, baselineY, level);
      return;
    }
    if (style === "neon") {
      drawNeon(width, graphHeight, baselineY, level);
      return;
    }
    if (style === "particle") {
      drawParticle(width, height, baselineY, level);
      return;
    }
    if (style === "shockwave") {
      drawShockwave(width, graphHeight, baselineY, level);
      return;
    }
    if (style === "tsunami") {
      drawTsunami(width, graphHeight, baselineY, level);
      return;
    }
    if (style === "plasma") {
      drawPlasma(width, graphHeight, baselineY, level);
      return;
    }
    if (style === "burst") {
      drawBurst(width, graphHeight, baselineY, level);
      return;
    }
    if (style === "heartbeat") {
      drawHeartbeat(width, graphHeight, baselineY, level);
      return;
    }
    drawVu(width, baselineY, level);
  }

  function drawVu(width, baselineY, level) {
    const safeLevel = Math.max(0.02, level);
    const maxBars = 10;
    const activeBars = Math.max(1, Math.round(safeLevel * maxBars));
    const barWidth = 5;
    const gap = 3;
    const maxHeight = 40;
    const startX = 4;
    for (let i = 0; i < maxBars; i += 1) {
      const h = Math.max(2, Math.round(maxHeight * ((activeBars - i) / maxBars)));
      const x = startX + i * (barWidth + gap);
      const y = baselineY - h;
      ctx.fillStyle = i < activeBars ? "#ffc341" : "rgba(255,195,65,0.25)";
      ctx.fillRect(x, y, barWidth, h);
    }
    drawPeakMarker(ctx, 6 + ((activeBars - 1) * (barWidth + gap)), baselineY - Math.max(2, Math.round(maxHeight * (activeBars / maxBars))), "rgba(255, 245, 172, 0.95)");
  }

  function drawDots(width, baselineY, level) {
    const dots = 44;
    const gap = width / dots;
    const pulse = Math.max(0.2, level);
    for (let i = 0; i < dots; i += 1) {
      const t = i / dots;
      const wobble = Math.sin((t * 16) + ((currentData.currentMs || 0) / 240)) * 8 * pulse;
      const y = baselineY - 10 - wobble;
      const alpha = 0.25 + (0.75 * pulse * (1 - t));
      ctx.fillStyle = `rgba(255,195,65,${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc((i * gap) + 2, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMirrored(width, centerY, graphHeight, level) {
    const bars = 48;
    const barWidth = width / bars;
    const power = Math.max(0.08, level);
    for (let i = 0; i < bars; i += 1) {
      const phase = (i / bars) * Math.PI * 6 + ((currentData.currentMs || 0) / 170);
      const amp = Math.abs(Math.sin(phase)) * (graphHeight * 0.6) * power;
      const x = i * barWidth;
      ctx.fillStyle = i % 2 ? "rgba(255,186,61,0.82)" : "rgba(255,126,90,0.52)";
      ctx.fillRect(x, centerY - amp, Math.max(1, barWidth - 1), amp * 2);
    }
  }

  function drawSpectrum(width, baselineY, level) {
    const bins = 24;
    const gap = 2;
    const barWidth = Math.floor((width - (bins * gap)) / bins);
    let peakX = 0;
    let peakY = baselineY;
    let peakH = 0;
    for (let i = 0; i < bins; i += 1) {
      const t = i / bins;
      const dynamic = Math.sin(((currentData.currentMs || 0) / 220) + (i * 0.56));
      const amp = Math.max(0, dynamic * 0.5 + 0.5) * Math.max(0.12, level);
      const h = Math.max(3, amp * 44);
      const x = i * (barWidth + gap);
      const y = baselineY - h;
      ctx.fillStyle = t < 0.5 ? "rgba(255,195,65,0.9)" : "rgba(255,126,90,0.86)";
      ctx.fillRect(x, y, barWidth, h);
      if (h > peakH) {
        peakH = h;
        peakX = x + (barWidth / 2);
        peakY = y;
      }
    }
    drawPeakMarker(ctx, peakX, peakY, "rgba(255, 230, 166, 0.95)");
  }

  function drawClassicWaveform(width, baselineY, graphTop, graphHeight, level) {
    const ms = currentData.currentMs || 0;
    const pointCount = hasUsableTimeDomainData() ? analyserTimeData.length : Math.max(180, Math.floor(width * 0.8));
    const sliceWidth = width / Math.max(1, pointCount - 1);
    const sensitivityGain = Math.max(0.5, Number(currentOptions.sensitivity) || 3.4);
    const waveScale = (graphHeight * 0.46) * sensitivityGain;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(92, 221, 255, 0.30)";
    ctx.shadowBlur = 6;
    ctx.strokeStyle = "rgba(228, 248, 255, 0.96)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();

    for (let i = 0; i < pointCount; i += 1) {
      const x = i * sliceWidth;
      const sample = resolveClassicWaveformSample(i, pointCount, ms);
      const y = baselineY + (sample * waveScale);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.scale(1, -1);
    ctx.translate(0, -(baselineY * 2));
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(92, 221, 255, 0.70)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < pointCount; i += 1) {
      const x = i * sliceWidth;
      const sample = resolveClassicWaveformSample(i, pointCount, ms);
      const y = baselineY + (sample * waveScale);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(230, 248, 255, 0.34)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(baselineY) + 0.5);
    ctx.lineTo(width, Math.round(baselineY) + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawNeon(width, graphHeight, baselineY, level) {
    const points = 72;
    const step = width / Math.max(1, points - 1);
    const ms = currentData.currentMs || 0;
    const pulse = Math.max(0.1, Math.min(1, level));
    const amp = Math.max(6, (graphHeight * 0.4) * pulse);

    let peakX = 0;
    let peakY = baselineY;
    let peakAbs = 0;
    const drawLine = (lineWidth, alpha, phaseShift, capturePeak = false) => {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = `rgba(106, 220, 255, ${alpha})`;
      ctx.beginPath();
      for (let i = 0; i < points; i += 1) {
        const t = i / (points - 1);
        const x = i * step;
        const baseWave = Math.sin((t * Math.PI * 8) + (ms / 180) + phaseShift);
        const detailWave = Math.sin((t * Math.PI * 22) + (ms / 110) + phaseShift) * 0.35;
        const y = baselineY - 8 - ((baseWave + detailWave) * amp);
        if (capturePeak) {
          const distance = Math.abs(y - baselineY);
          if (distance > peakAbs) {
            peakAbs = distance;
            peakX = x;
            peakY = y;
          }
        }
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    ctx.shadowColor = "rgba(85, 224, 255, 0.95)";
    ctx.shadowBlur = 16;
    drawLine(5, 0.16, 0.6, false);
    drawLine(3, 0.36, 0.2, false);
    drawLine(1.8, 0.94, 0, true);
    ctx.shadowBlur = 0;
    drawPeakMarker(ctx, peakX, peakY, "rgba(195, 243, 255, 0.96)");
  }

  function drawParticle(width, height, baselineY, level) {
    const ms = currentData.currentMs || 0;
    const pulse = Math.max(0.03, Math.min(1, level));
    const spawnCount = Math.max(1, Math.round(pulse * 6));
    const maxParticles = 110;

    for (let i = 0; i < spawnCount; i += 1) {
      if (particleState.length >= maxParticles) {
        break;
      }
      const x = 10 + (Math.random() * Math.max(10, width - 20));
      const velX = (Math.random() - 0.5) * 0.4;
      const velY = -(0.6 + (Math.random() * 1.8) * pulse);
      const life = 18 + Math.round(Math.random() * 26);
      const size = 1.4 + Math.random() * 2.4;
      particleState.push({
        x,
        y: baselineY - 2,
        vx: velX,
        vy: velY,
        life,
        ttl: life,
        size,
      });
    }

    const next = [];
    for (let i = 0; i < particleState.length; i += 1) {
      const p = particleState[i];
      p.life -= 1;
      if (p.life <= 0) {
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.015;
      if (p.x < -8 || p.x > width + 8 || p.y < -8 || p.y > height + 8) {
        continue;
      }
      next.push(p);
      const a = Math.max(0.06, p.life / p.ttl);
      const hueMix = 30 + Math.floor((1 - a) * 40);
      ctx.fillStyle = `rgba(255, ${180 + hueMix}, 96, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    particleState = next;

    const cols = 40;
    const step = width / cols;
    const amp = Math.max(8, (height * 0.35) * pulse);
    for (let i = 0; i < cols; i += 1) {
      const t = i / cols;
      const wave = Math.sin((t * Math.PI * 10) + (ms / 220));
      const h = Math.max(2, Math.abs(wave) * amp);
      const x = i * step;
      const y = baselineY - h;
      ctx.fillStyle = i % 2 ? "rgba(255,208,112,0.85)" : "rgba(255,130,96,0.82)";
      ctx.fillRect(x, y, Math.max(1, step - 1), h);
    }
  }

  function drawShockwave(width, graphHeight, baselineY, level) {
    const gate = Math.max(0, Number(currentOptions.gateThreshold) || 0.06);

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(255, 167, 88, 0.95)";
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(width, baselineY);
    ctx.stroke();

    if (level <= gate) {
      return;
    }

    const active = Math.min(1, (level - gate) / Math.max(0.001, 1 - gate));
    const ms = currentData.currentMs || 0;
    const spikes = 64;
    const dx = width / spikes;
    const amp = (graphHeight * 0.72) * active;

    ctx.shadowColor = "rgba(255, 175, 92, 0.95)";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "rgba(255, 198, 118, 0.98)";
    ctx.beginPath();
    for (let i = 0; i <= spikes; i += 1) {
      const x = i * dx;
      const t = i / spikes;
      const pulse = Math.sin((t * Math.PI * 26) + (ms / 95));
      const chaos = Math.sin((t * Math.PI * 61) + (ms / 41)) * 0.35;
      const y = baselineY - ((pulse + chaos) * amp);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    const bursts = Math.max(4, Math.round(active * 14));
    let peakH = 0;
    let peakX = 0;
    for (let i = 0; i < bursts; i += 1) {
      const t = ((i / bursts) + ((ms % 600) / 600)) % 1;
      const x = t * width;
      const h = 8 + (active * 26 * (0.35 + Math.random() * 0.65));
      ctx.fillStyle = "rgba(255, 135, 94, 0.74)";
      ctx.fillRect(x, baselineY - h, 2, h);
      if (h > peakH) {
        peakH = h;
        peakX = x;
      }
    }
    drawPeakMarker(ctx, peakX, baselineY - peakH, "rgba(255, 229, 178, 0.95)");
  }

  function drawTsunami(width, graphHeight, baselineY, level) {
    const gate = Math.max(0, Number(currentOptions.gateThreshold) || 0.06);
    if (level <= gate) {
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(109, 208, 255, 0.55)";
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      ctx.lineTo(width, baselineY);
      ctx.stroke();
      return;
    }
    const active = Math.min(1, (level - gate) / Math.max(0.001, 1 - gate));
    const ms = currentData.currentMs || 0;
    const layers = [
      { color: "rgba(96, 212, 255, 0.30)", amp: 0.86, freq: 6.5, speed: 130, width: 5 },
      { color: "rgba(73, 194, 255, 0.52)", amp: 0.62, freq: 9.2, speed: 150, width: 3.2 },
      { color: "rgba(163, 232, 255, 0.94)", amp: 0.44, freq: 12.6, speed: 180, width: 1.9 },
    ];
    const points = 90;
    const step = width / (points - 1);
    let peakX = 0;
    let peakY = baselineY;
    let peakAbs = 0;
    for (let l = 0; l < layers.length; l += 1) {
      const layer = layers[l];
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width;
      ctx.beginPath();
      for (let i = 0; i < points; i += 1) {
        const t = i / (points - 1);
        const x = i * step;
        const wave1 = Math.sin((t * Math.PI * layer.freq) + (ms / layer.speed));
        const wave2 = Math.sin((t * Math.PI * (layer.freq * 1.9)) + (ms / (layer.speed * 0.7))) * 0.24;
        const y = baselineY - ((wave1 + wave2) * (graphHeight * layer.amp) * active * 0.48);
        const distance = Math.abs(y - baselineY);
        if (distance > peakAbs) {
          peakAbs = distance;
          peakX = x;
          peakY = y;
        }
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    drawPeakMarker(ctx, peakX, peakY, "rgba(221, 246, 255, 0.95)");
  }

  function drawPlasma(width, graphHeight, baselineY, level) {
    const gate = Math.max(0, Number(currentOptions.gateThreshold) || 0.06);
    const ms = currentData.currentMs || 0;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = "rgba(189, 153, 255, 0.5)";
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(width, baselineY);
    ctx.stroke();
    if (level <= gate) {
      return;
    }
    const active = Math.min(1, (level - gate) / Math.max(0.001, 1 - gate));
    const points = 82;
    const dx = width / (points - 1);
    const amp = graphHeight * 0.62 * active;
    const pts = [];
    let peakX = 0;
    let peakY = baselineY;
    let peakAbs = 0;
    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const jitter = (Math.sin((t * 80) + (ms / 28)) + Math.sin((t * 43) + (ms / 19))) * 0.5;
      const y = baselineY - (jitter * amp);
      pts.push([i * dx, y]);
      const distance = Math.abs(y - baselineY);
      if (distance > peakAbs) {
        peakAbs = distance;
        peakX = i * dx;
        peakY = y;
      }
    }
    ctx.shadowColor = "rgba(180, 120, 255, 0.95)";
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(216, 166, 255, 0.98)";
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 1) {
      const [x, y] = pts[i];
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      if (i % 8 === 0 && i > 2) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.sin(ms / 90 + i) * 8), y - (6 + active * 12));
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawPeakMarker(ctx, peakX, peakY, "rgba(242, 214, 255, 0.95)");
  }

  function drawBurst(width, graphHeight, baselineY, level) {
    const gate = Math.max(0, Number(currentOptions.gateThreshold) || 0.06);
    const bins = 36;
    if (burstLevels.length !== bins) {
      burstLevels = new Array(bins).fill(0);
    }
    const gap = 2;
    const barWidth = Math.max(1, Math.floor((width - (bins * gap)) / bins));
    const active = level <= gate ? 0 : Math.min(1, (level - gate) / Math.max(0.001, 1 - gate));
    const rise = 0.68;
    const decay = 0.09;
    const ms = currentData.currentMs || 0;
    let peakX = 0;
    let peakY = baselineY;
    let peakH = 0;
    for (let i = 0; i < bins; i += 1) {
      const pulse = Math.abs(Math.sin((i * 0.43) + (ms / 120)));
      const target = active * (0.22 + (0.78 * pulse));
      if (target > burstLevels[i]) {
        burstLevels[i] += (target - burstLevels[i]) * rise;
      } else {
        burstLevels[i] += (target - burstLevels[i]) * decay;
      }
      burstLevels[i] = Math.max(0, Math.min(1, burstLevels[i]));
      const h = burstLevels[i] * (graphHeight * 0.78);
      const x = i * (barWidth + gap);
      const y = baselineY - h;
      ctx.fillStyle = i % 3 === 0
        ? "rgba(255, 216, 118, 0.95)"
        : i % 3 === 1
          ? "rgba(255, 162, 96, 0.9)"
          : "rgba(255, 106, 106, 0.86)";
      ctx.fillRect(x, y, barWidth, Math.max(1, h));
      if (h > peakH) {
        peakH = h;
        peakX = x + (barWidth / 2);
        peakY = y;
      }
    }
    ctx.strokeStyle = "rgba(255, 162, 96, 0.75)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(width, baselineY);
    ctx.stroke();
    drawPeakMarker(ctx, peakX, peakY, "rgba(255, 232, 175, 0.95)");
  }

  function drawHeartbeat(width, graphHeight, baselineY, level) {
    const gate = Math.max(0, Number(currentOptions.gateThreshold) || 0.06);
    const active = level <= gate ? 0 : Math.min(1, (level - gate) / Math.max(0.001, 1 - gate));
    const ms = currentData.currentMs || 0;
    const period = 820 - (active * 280);
    const phase = ((ms % period) / period);

    ctx.strokeStyle = "rgba(135, 255, 186, 0.52)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(width, baselineY);
    ctx.stroke();

    if (active <= 0) {
      return;
    }

    const points = 88;
    const dx = width / (points - 1);
    const amp = (graphHeight * 0.8) * active;
    let peakX = 0;
    let peakY = baselineY;
    let peakAbs = 0;

    function heartbeatAt(t) {
      const p = (t + phase) % 1;
      if (p < 0.04) return -0.03 * amp;
      if (p < 0.055) return 0.22 * amp;
      if (p < 0.075) return -0.82 * amp;
      if (p < 0.11) return 0.48 * amp;
      if (p < 0.15) return -0.08 * amp;
      return Math.sin((p * Math.PI * 12) + (ms / 140)) * 0.05 * amp;
    }

    ctx.shadowColor = "rgba(135, 255, 186, 0.92)";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(172, 255, 204, 0.98)";
    ctx.beginPath();
    for (let i = 0; i < points; i += 1) {
      const t = i / (points - 1);
      const x = i * dx;
      const y = baselineY + heartbeatAt(t);
      const distance = Math.abs(y - baselineY);
      if (distance > peakAbs) {
        peakAbs = distance;
        peakX = x;
        peakY = y;
      }
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    drawPeakMarker(ctx, peakX, peakY, "rgba(214, 255, 228, 0.95)");
  }

  function getLevel() {
    if (currentData.muted) {
      return 0;
    }
    if (analyser && analyserData) {
      analyser.getByteFrequencyData(analyserData);
      let total = 0;
      for (let i = 0; i < analyserData.length; i += 1) {
        total += analyserData[i];
      }
      let rms = 0;
      if (analyserTimeData) {
        analyser.getByteTimeDomainData(analyserTimeData);
        let sumSquares = 0;
        for (let i = 0; i < analyserTimeData.length; i += 1) {
          const centered = (analyserTimeData[i] - 128) / 128;
          sumSquares += centered * centered;
        }
        rms = Math.sqrt(sumSquares / analyserTimeData.length);
      }
      const freqLevel = total / (analyserData.length * 255);
      const rawLevel = Math.max(freqLevel, rms * 1.75);
      const gain = Math.max(0.5, Number(currentOptions.sensitivity) || 3.4);
      return Math.min(1, rawLevel * gain);
    }
    if (currentData.isPlaying) {
      const wave = Math.sin((currentData.currentMs || 0) / 170) * 0.5 + 0.5;
      const gain = Math.max(0.5, Number(currentOptions.sensitivity) || 3.4);
      return Math.min(1, Math.max(0.1, wave * 0.8) * (gain / 1.8));
    }
    return 0.04;
  }

  function getResponsiveLevel(rawLevel) {
    if (currentOptions.freezeOnPause && !currentData.isPlaying) {
      return envelopeLevel;
    }
    const now = performance.now();
    const dt = Math.max(1, now - lastPaintAt);
    lastPaintAt = now;
    const attackMs = Math.max(8, Number(currentOptions.attackMs) || 45);
    const releaseMs = Math.max(16, Number(currentOptions.releaseMs) || 260);
    const curve = Math.max(1, Number(currentOptions.intensityCurve) || 1.7);
    const shaped = Math.pow(Math.max(0, Math.min(1, rawLevel)), curve);
    const isRising = shaped > envelopeLevel;
    const tau = isRising ? attackMs : releaseMs;
    const alpha = Math.min(1, dt / tau);
    envelopeLevel += (shaped - envelopeLevel) * alpha;
    peakHoldLevel = Math.max(shaped, peakHoldLevel * 0.95);
    return Math.max(0, Math.min(1, envelopeLevel));
  }

  function resetVisualState() {
    clearAnalyser();
    envelopeLevel = 0;
    particleState = [];
    burstLevels = [];
    peakHoldLevel = 0;
    lastPaintAt = performance.now();
  }

  function resetSourceState() {
    audioEl = null;
    mediaStream = null;
    attachedAudioNode = null;
    currentData.isLive = false;
    currentData.isActive = false;
    disconnectSourceNode();
    clearAnalyser();
    sourceType = "none";
  }

  function clearAnalyser() {
    analyser = null;
    analyserData = null;
    analyserTimeData = null;
  }

  function disconnectSourceNode() {
    if (sourceNode && analyser) {
      try {
        sourceNode.disconnect(analyser);
      } catch (_error) {
        // Ignore disconnect failures from stale graphs.
      }
    }
    if (sourceNode && sourceType === "media-element" && audioContext?.destination) {
      try {
        sourceNode.disconnect(audioContext.destination);
      } catch (_error) {
        // Ignore disconnect failures from stale graphs.
      }
    }
    sourceNode = null;
  }

  function resolveSourceType() {
    if (attachedAudioNode) {
      return "audio-node";
    }
    if (mediaStream) {
      return "media-stream";
    }
    if (audioEl) {
      return "media-element";
    }
    return "none";
  }

  function resolveAudioContextForSource(resolvedType) {
    if (resolvedType === "audio-node") {
      ownsAudioContext = false;
      return attachedAudioNode?.context || null;
    }
    if (!audioContext || !ownsAudioContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }
      audioContext = new AudioContextCtor();
      ownsAudioContext = true;
    }
    return audioContext;
  }

  function ensureAnalyser(context) {
    if (analyser && audioContext === context) {
      return;
    }
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    analyserData = new Uint8Array(analyser.frequencyBinCount);
    analyserTimeData = new Uint8Array(analyser.fftSize);
  }

  function attachResolvedSource(resolvedType) {
    disconnectSourceNode();
    if (!audioContext || !analyser) {
      return;
    }
    if (resolvedType === "media-element") {
      if (!audioEl) {
        return;
      }
      const source = audioEl.__uiAudioGraphSourceMap?.get(audioContext)
        || audioEl.__uiAudioGraphSource
        || audioContext.createMediaElementSource(audioEl);
      if (!audioEl.__uiAudioGraphSourceMap) {
        audioEl.__uiAudioGraphSourceMap = new Map();
      }
      audioEl.__uiAudioGraphSourceMap.set(audioContext, source);
      audioEl.__uiAudioGraphSource = source;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      sourceNode = source;
      currentData.isLive = false;
      currentData.isActive = !audioEl.paused;
      sourceType = "media-element";
      return;
    }
    if (resolvedType === "media-stream") {
      if (!mediaStream) {
        return;
      }
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNode.connect(analyser);
      currentData.isLive = true;
      currentData.isActive = mediaStream.getAudioTracks().some((track) => track.readyState === "live");
      sourceType = "media-stream";
      return;
    }
    if (resolvedType === "audio-node") {
      if (!attachedAudioNode) {
        return;
      }
      sourceNode = attachedAudioNode;
      sourceNode.connect(analyser);
      currentData.isLive = true;
      currentData.isActive = true;
      sourceType = "audio-node";
    }
  }

  function attachAudio(nextAudioEl) {
    resetSourceState();
    audioEl = nextAudioEl instanceof HTMLMediaElement ? nextAudioEl : null;
    sourceType = audioEl ? "media-element" : "none";
    resetVisualState();
  }

  function attachMediaStream(nextStream) {
    resetSourceState();
    mediaStream = nextStream instanceof MediaStream ? nextStream : null;
    sourceType = mediaStream ? "media-stream" : "none";
    currentData.isLive = Boolean(mediaStream);
    currentData.isActive = Boolean(mediaStream);
    applyState();
    resetVisualState();
  }

  function attachAudioNode(nextNode) {
    resetSourceState();
    attachedAudioNode = isAudioNodeLike(nextNode) ? nextNode : null;
    sourceType = attachedAudioNode ? "audio-node" : "none";
    currentData.isLive = Boolean(attachedAudioNode);
    currentData.isActive = Boolean(attachedAudioNode);
    applyState();
    resetVisualState();
  }

  function unlockAudioContext() {
    return resume();
  }

  function resume() {
    const resolvedType = resolveSourceType();
    if (resolvedType === "none") {
      return Promise.resolve(false);
    }
    try {
      const context = resolveAudioContextForSource(resolvedType);
      if (!context) {
        return Promise.resolve(false);
      }
      audioContext = context;
      ensureAnalyser(audioContext);
      attachResolvedSource(resolvedType);
      if (audioContext.state === "suspended") {
        return audioContext.resume().then(() => true).catch(() => false);
      }
      return Promise.resolve(true);
    } catch (error) {
      disconnectSourceNode();
      clearAnalyser();
      return Promise.resolve(false);
    }
  }

  function setMuted(muted, options = {}) {
    currentData.muted = Boolean(muted);
    if (audioEl) {
      audioEl.muted = currentData.muted;
    }
    applyState();
    if (options.notify) {
      currentOptions.onToggleMute?.(currentData.muted, getState());
    }
  }

  function setPlayback(playback = {}) {
    currentData.isPlaying = Boolean(playback.isPlaying);
    if (Object.prototype.hasOwnProperty.call(playback || {}, "isLive")) {
      currentData.isLive = Boolean(playback.isLive);
    }
    if (Object.prototype.hasOwnProperty.call(playback || {}, "isActive")) {
      currentData.isActive = Boolean(playback.isActive);
    }
    currentData.currentMs = Math.max(0, Number(playback.currentMs) || 0);
    currentData.durationMs = Math.max(0, Number(playback.durationMs) || currentData.durationMs || 0);
    applyState();
  }

  function update(nextData = {}, nextOptions = {}) {
    currentData = normalizeData({ ...currentData, ...nextData });
    currentOptions = normalizeOptions({ ...currentOptions, ...nextOptions });
    applyState();
  }

  function destroy() {
    events.clear();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    clearNode(container);
    root = null;
    roleLabelEl = null;
    muteButton = null;
    canvas = null;
    ctx = null;
    audioEl = null;
    mediaStream = null;
    attachedAudioNode = null;
    disconnectSourceNode();
    clearAnalyser();
    analyser = null;
    analyserData = null;
    analyserTimeData = null;
    sourceType = "none";
    particleState = [];
    burstLevels = [];
    peakHoldLevel = 0;
  }

  function getState() {
    return { ...currentData, style: currentOptions.style, sourceType };
  }

  function hasUsableTimeDomainData() {
    return Boolean(analyserTimeData && analyser && analyserTimeData.length > 0);
  }

  function resolveClassicWaveformSample(index, pointCount, ms) {
    if (hasUsableTimeDomainData()) {
      const sampleIndex = Math.min(analyserTimeData.length - 1, Math.floor((index / Math.max(1, pointCount - 1)) * analyserTimeData.length));
      return (analyserTimeData[sampleIndex] - 128) / 128;
    }
    if (sourceType === "none") {
      return 0;
    }
    const t = index / Math.max(1, pointCount - 1);
    const baseWave = Math.sin((t * Math.PI * 18) + (ms / 180));
    const detailWave = Math.sin((t * Math.PI * 54) + (ms / 80)) * 0.28;
    return (baseWave * 0.6) + detailWave;
  }

  render();

  return {
    destroy,
    update,
    setMuted,
    setPlayback,
    attachAudio,
    attachMediaStream,
    attachAudioNode,
    resume,
    unlockAudioContext,
    getState,
  };
}

function normalizeData(data) {
  return {
    ...DEFAULT_DATA,
    ...(data || {}),
    muted: Boolean(data?.muted),
    isPlaying: Boolean(data?.isPlaying),
    isLive: Boolean(data?.isLive),
    isActive: Boolean(data?.isActive),
    currentMs: Math.max(0, Number(data?.currentMs) || 0),
    durationMs: Math.max(0, Number(data?.durationMs) || 0),
  };
}

function normalizeOptions(options) {
  return {
    ...DEFAULT_OPTIONS,
    ...(options || {}),
  };
}

function normalizeStyle(style) {
  const value = String(style || "").toLowerCase();
  if (value === "dot" || value === "dots" || value === "dotmatrix") {
    return "dots";
  }
  if (value === "mirror" || value === "mirrored" || value === "waveform") {
    return "mirrored";
  }
  if (value === "classic-waveform" || value === "classicwaveform" || value === "classic_waveform" || value === "oscilloscope") {
    return "classic-waveform";
  }
  if (value === "spectrum" || value === "bars") {
    return "spectrum";
  }
  if (value === "neon" || value === "ribbon") {
    return "neon";
  }
  if (value === "particle" || value === "particles") {
    return "particle";
  }
  if (value === "shockwave" || value === "shock") {
    return "shockwave";
  }
  if (value === "tsunami" || value === "ribbonwave") {
    return "tsunami";
  }
  if (value === "plasma" || value === "arc") {
    return "plasma";
  }
  if (value === "burst" || value === "columns") {
    return "burst";
  }
  if (value === "heartbeat" || value === "ecg") {
    return "heartbeat";
  }
  return "vu";
}

function resolveBaselineY(style, graphTop, graphHeight, level) {
  const centeredStyles = new Set(["mirrored", "classic-waveform", "neon", "tsunami", "plasma", "heartbeat"]);
  if (centeredStyles.has(style)) {
    return Math.floor(graphTop + (graphHeight * 0.5));
  }
  if (style === "shockwave") {
    const active = Math.max(0, Math.min(1, Number(level) || 0));
    return Math.floor((graphTop + (graphHeight * 0.78)) - (active * graphHeight * 0.12));
  }
  return Math.floor(graphTop + graphHeight - 10);
}

function getBaselineAlpha(style, level) {
  const centeredStyles = new Set(["mirrored", "classic-waveform", "neon", "tsunami", "plasma", "heartbeat"]);
  const base = centeredStyles.has(style) ? 0.12 : 0.18;
  return Math.min(0.32, base + (Math.max(0, Math.min(1, Number(level) || 0)) * 0.14));
}

function drawPeakMarker(drawCtx, x, y, color) {
  if (!drawCtx) {
    return;
  }
  drawCtx.save();
  drawCtx.shadowColor = color;
  drawCtx.shadowBlur = 8;
  drawCtx.fillStyle = color;
  drawCtx.beginPath();
  drawCtx.arc(x, y, 2.5, 0, Math.PI * 2);
  drawCtx.fill();
  drawCtx.restore();
}

function toDomIdToken(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "item";
}

function isAudioNodeLike(value) {
  return Boolean(value && typeof value === "object" && typeof value.connect === "function" && value.context);
}

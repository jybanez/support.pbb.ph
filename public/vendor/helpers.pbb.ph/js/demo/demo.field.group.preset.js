import { createFieldGroup } from "../ui/ui.field.group.js";
import { fieldGroupPresets } from "../ui/ui.field.group.presets.js";

window.__demoLoaderReady?.catch?.(() => {});

const config = window.fieldGroupPresetDemo || {};
const presetFactory = fieldGroupPresets?.[config.presetKey];
const host = document.getElementById("presetHost");
const log = document.getElementById("presetLog");
const schema = document.getElementById("presetSchema");
const sampleBtn = document.getElementById("sampleBtn");
const clearBtn = document.getElementById("clearBtn");
const validateBtn = document.getElementById("validateBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const themeToggle = document.getElementById("themeToggle");
const page = document.querySelector("main.page");

if (!presetFactory || !host) {
  throw new Error("Field group preset demo requires a valid presetKey and host.");
}

const preset = presetFactory({
  label: config.label,
  ...(config.presetOptions || {}),
});

const group = createFieldGroup(host, {
  name: config.name,
  ...preset,
  value: config.initialValue,
  onChange(value, meta) {
    writeLog("changed", { value, validation: meta.validation });
  },
});

if (schema) {
  const factoryExample = `const group = createFieldGroup(host, ${JSON.stringify({
    name: config.name,
    ...preset,
  }, null, 2)});`;
  const metadataExample = `const group = createFieldGroup(host, ${JSON.stringify({
    name: config.name,
    label: config.label || preset.label,
    type: "group",
    config_json: JSON.stringify({
      preset: config.presetKey,
      preset_label: config.label || preset.label,
      ...(preset.repeatable ? { repeatable: true } : {}),
    }),
  }, null, 2)});`;
  schema.textContent = `Factory spread\n${factoryExample}\n\nMetadata-only preset\n${metadataExample}`;
}

sampleBtn?.addEventListener("click", () => {
  group.setValue(config.sampleValue);
  writeLog("sample set", group.getValue());
});

clearBtn?.addEventListener("click", () => {
  group.setValue(preset.repeatable ? [] : {});
  writeLog("cleared", group.getValue());
});

validateBtn?.addEventListener("click", () => {
  writeLog("validation", group.validate());
});

snapshotBtn?.addEventListener("click", () => {
  writeLog("snapshot", group.getValue());
});

themeToggle?.addEventListener("click", () => {
  page.dataset.theme = page.dataset.theme === "light" ? "dark" : "light";
  document.body.style.background = page.dataset.theme === "light" ? "#edf2f8" : "#0c1017";
});

writeLog("initial", group.getValue());

function writeLog(label, payload) {
  if (!log) {
    return;
  }
  const line = `[${new Date().toISOString()}] ${label}\n${JSON.stringify(payload, null, 2)}\n`;
  log.textContent = log.textContent.startsWith("No ") ? line : `${line}\n${log.textContent}`;
}

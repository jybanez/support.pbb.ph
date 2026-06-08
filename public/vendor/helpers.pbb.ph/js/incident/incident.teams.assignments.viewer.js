import { createRoot, normalizeIncidentOptions, safeArray } from "./incident.base.js";

const REQUIRED_OPTION_KEYS = ["incident_id", "team_id", "assigned_by_operator_id"];
const TIMELINE_STEPS = ["requested", "accepted", "en_route", "on_scene"];
const STEP_LABELS = {
  assigned: "Assigned",
  requested: "Requested",
  accepted: "Accepted",
  en_route: "En Route",
  on_scene: "On Scene",
  completed: "Completed",
  cancelled: "Cancelled",
};
const CANCELLATION_REASONS = {
  mechanical_issue: "Mechanical issue",
  rerouted_higher_priority: "Rerouted to higher priority",
  safety_risk: "Safety risk",
  no_contact: "No contact with team",
  resource_unavailable: "Resource unavailable",
  incorrect_dispatch: "Duplicate/incorrect dispatch",
  other: "Other",
};

export function incidentTeamsAssignmentsViewer(container, data, options = {}) {
  let currentData = data || {};
  let currentOptions = normalizeIncidentOptions(options);

  function getTeamResources() {
    const direct = safeArray(currentData?.team?.resources);
    if (direct.length) {
      return direct;
    }
    return safeArray(currentData?.team?.resource_inventories);
  }

  function canShowResources() {
    const status = String(currentData?.status || "assigned");
    const allow = ["accepted", "en_route", "on_scene", "completed"].includes(status);
    return allow && getTeamResources().length > 0;
  }

  function getTimelineState(step, status) {
    const normalizedStatus = normalizeStatus(status);
    const stepIndex = TIMELINE_STEPS.indexOf(step);

    if (normalizedStatus === "cancelled") {
      const cancelledFrom = normalizeStatus(currentData?.cancelled_from_status);
      const cancelledIndex = TIMELINE_STEPS.indexOf(cancelledFrom);
      if (cancelledIndex === -1) {
        return "is-future";
      }
      if (stepIndex < cancelledIndex) {
        return "is-complete";
      }
      if (stepIndex === cancelledIndex) {
        return "is-cancelled";
      }
      return "is-future";
    }
    if (normalizedStatus === "completed") {
      return "is-complete";
    }
    const currentIndex = TIMELINE_STEPS.indexOf(normalizedStatus);
    if (currentIndex === -1) {
      return "is-future";
    }
    if (stepIndex < currentIndex) {
      return "is-complete";
    }
    if (stepIndex === currentIndex) {
      return "is-current";
    }
    return "is-future";
  }

  function getStepIcon(state) {
    if (state === "is-complete") {
      return "✔";
    }
    if (state === "is-current") {
      return "◌";
    }
    if (state === "is-cancelled") {
      return "✖";
    }
    return "○";
  }

  function renderHeader(root) {
    const header = document.createElement("div");
    header.className = "hh-card-header";

    const left = document.createElement("div");
    left.className = "hh-head-main";
    const title = document.createElement("h4");
    title.className = "hh-title ui-title";
    title.textContent = currentData?.team?.name || `Team #${currentData?.team_id ?? "-"}`;
    const subtitle = document.createElement("p");
    subtitle.className = "hh-meta";
    subtitle.textContent = currentData?.team?.category?.name || "Uncategorized";
    left.append(title, subtitle);

    header.appendChild(left);
    root.appendChild(header);
  }

  function renderTimeline(root) {
    const wrap = document.createElement("div");
    wrap.className = "hh-team-status";

    const timeline = document.createElement("ol");
    timeline.className = "hh-stepper";
    const status = String(currentData?.status || "assigned");

    TIMELINE_STEPS.forEach((step) => {
      const li = document.createElement("li");
      const state = getTimelineState(step, status);
      li.className = `hh-step ${state}`;

      const icon = document.createElement("span");
      icon.className = "hh-step-icon";
      icon.textContent = getStepIcon(state);

      const label = document.createElement("span");
      label.className = "hh-step-label";
      label.textContent = STEP_LABELS[step] || step;

      li.append(icon, label);
      timeline.appendChild(li);
    });

    wrap.appendChild(timeline);
    root.appendChild(wrap);
  }

  function renderCancellationBlock(root) {
    if (currentData?.status !== "cancelled") {
      return;
    }
    const block = document.createElement("div");
    block.className = "hh-cancelled-block";

    const reasonLabel =
      CANCELLATION_REASONS[currentData?.cancel_reason_code] ||
      currentData?.cancel_reason_code ||
      "-";

    const rows = [
      `Reason: ${reasonLabel}`,
      `From Status: ${STEP_LABELS[currentData?.cancelled_from_status] || currentData?.cancelled_from_status || "-"}`,
    ];
    if (currentData?.cancel_reason_note) {
      rows.push(`Details: ${currentData.cancel_reason_note}`);
    }

    rows.forEach((text) => {
      const p = document.createElement("p");
      p.className = "hh-row";
      p.textContent = text;
      block.appendChild(p);
    });

    root.appendChild(block);
  }

  function renderResources(root) {
    if (!canShowResources()) {
      return;
    }

    const allocationMap = buildAllocationMap(currentData);
    const wrapper = document.createElement("div");
    wrapper.className = "hh-allocations";
    const title = document.createElement("h5");
    title.className = "hh-subtitle ui-title";
    title.textContent = "Resource Allocation";
    wrapper.appendChild(title);

    const table = document.createElement("table");
    table.className = "hh-table";
    table.innerHTML =
      "<thead><tr><th>Resource</th><th>Available</th><th>Allocated</th></tr></thead>";
    const tbody = document.createElement("tbody");

    getTeamResources().forEach((resource) => {
      const resourceType = resource?.resource_type || {};
      const resourceTypeId = resource?.resource_type_id ?? resourceType?.id;
      const available = Number(resource?.quantity_available || 0);
      const allocated = Number(allocationMap[String(resourceTypeId)] || 0);

      const tr = document.createElement("tr");
      const resourceCell = document.createElement("td");
      resourceCell.textContent = resourceType?.name || `Resource #${resourceTypeId ?? "-"}`;
      const availableCell = document.createElement("td");
      availableCell.textContent = String(available);
      const allocatedCell = document.createElement("td");
      allocatedCell.textContent = String(allocated);
      tr.append(resourceCell, availableCell, allocatedCell);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    root.appendChild(wrapper);
  }

  function renderNotes(root) {
    const notes = [...resolveNotes(currentData)].sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime();
      const bTime = new Date(b?.created_at || 0).getTime();
      return aTime - bTime;
    });

    if (!notes.length) {
      return;
    }

    const notesWrap = document.createElement("div");
    notesWrap.className = "hh-notes";
    const list = document.createElement("div");
    list.className = "hh-notes-list";

    notes.forEach((note) => {
      const row = document.createElement("p");
      row.className = "hh-row";
      row.textContent = note?.note || "";
      list.appendChild(row);
    });

    notesWrap.appendChild(list);
    root.appendChild(notesWrap);
  }

  function render() {
    const root = createRoot(container, "hh-incident-teams-assignments-viewer", currentOptions);
    if (!root) {
      return;
    }

    const missingRequired = REQUIRED_OPTION_KEYS.filter((key) => {
      const value = currentOptions?.[key];
      return value === undefined || value === null || value === "";
    });
    if (missingRequired.length) {
      console.error(
        `[incident.teams.assignments.viewer] Missing required options: ${missingRequired.join(", ")}`
      );
      return;
    }

    renderHeader(root);

    const body = document.createElement("div");
    body.className = "hh-viewer-body";

    const contactRow = document.createElement("p");
    contactRow.className = "hh-row";
    contactRow.textContent = `Contact Person: ${currentData?.contact_person || "-"}`;
    body.appendChild(contactRow);

    renderTimeline(body);
    renderCancellationBlock(body);
    renderResources(body);
    renderNotes(body);

    root.appendChild(body);
  }

  render();

  return {
    destroy() {
      if (container && container.nodeType === 1) {
        container.innerHTML = "";
      }
    },
    update(nextData, nextOptions = {}) {
      currentData = nextData || {};
      currentOptions = normalizeIncidentOptions({ ...currentOptions, ...nextOptions });
      render();
    },
    getData() {
      return cloneData(currentData);
    },
  };
}

function buildAllocationMap(data) {
  const map = {};
  safeArray(data?.allocated_resources).forEach((item) => {
    const key = String(item?.resource_type_id ?? "");
    if (!key) {
      return;
    }
    map[key] = Number(item?.quantity_allocated || 0);
  });
  return map;
}

function resolveNotes(data) {
  return safeArray(data?.notes_log || data?.notes_thread || data?.notes);
}

function cloneData(value) {
  try {
    return structuredClone(value);
  } catch (_) {
    return JSON.parse(JSON.stringify(value));
  }
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

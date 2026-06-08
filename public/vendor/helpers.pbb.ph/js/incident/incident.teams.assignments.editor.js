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
const NEXT_STATUS = {
  assigned: "requested",
  requested: "accepted",
  accepted: "en_route",
  en_route: "on_scene",
  on_scene: "completed",
};
const CANCELLATION_REASONS = [
  { value: "mechanical_issue", label: "Mechanical issue" },
  { value: "rerouted_higher_priority", label: "Rerouted to higher priority" },
  { value: "safety_risk", label: "Safety risk" },
  { value: "no_contact", label: "No contact with team" },
  { value: "resource_unavailable", label: "Resource unavailable" },
  { value: "incorrect_dispatch", label: "Duplicate/incorrect dispatch" },
  { value: "other", label: "Other" },
];

export function incidentTeamsAssignmentsEditor(container, data, options = {}) {
  let currentData = normalizeAssignmentData(data);
  let currentOptions = normalizeIncidentOptions(options);
  let allocationMap = buildAllocationMap(currentData);
  let isContactOverrideEditing = false;
  let contactDraft = String(currentData?.contact_person || "");
  const listeners = [];

  function getBusyState() {
    const itemBusy = currentData?.busy || currentData?.busy_state;
    const optionBusy = currentOptions?.busy;
    const busy = Boolean(optionBusy || itemBusy);
    return {
      busy,
      action: currentOptions?.busyAction ?? currentData?.busyAction ?? currentData?.busy_action ?? "",
      message: currentOptions?.busyMessage ?? currentData?.busyMessage ?? currentData?.busy_message ?? "",
    };
  }

  function isBusy() {
    return getBusyState().busy;
  }

  function destroyListeners() {
    listeners.splice(0).forEach((off) => off());
  }

  function bind(el, event, handler) {
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  }

  async function collectCancelReason(fromStatus) {
    const requestCancelReason = currentOptions.requestCancelReason;
    if (typeof requestCancelReason === "function") {
      let result;
      try {
        result = await requestCancelReason(fromStatus, {
          assignmentId: currentData?.id ?? null,
          item: cloneData(currentData),
          reasonOptions: CANCELLATION_REASONS.map((item) => ({ ...item })),
        });
      } catch (error) {
        console.error("[incident.teams.assignments.editor] requestCancelReason failed.", error);
        return null;
      }
      return normalizeCancelReasonResult(result);
    }

    const reasonCode = promptReasonCode();
    if (!reasonCode) {
      return null;
    }
    let reasonNote = "";
    if (reasonCode === "other") {
      reasonNote = String(window.prompt("Provide cancellation details:", "") || "").trim();
      if (!reasonNote) {
        showGuardMessage("Cancellation details are required for Other.");
        return null;
      }
    }
    return { reasonCode, reasonNote };
  }

  function emitItemChange(reason, meta = {}) {
    const nextItem = meta.nextItem ? cloneData(meta.nextItem) : cloneData(currentData);
    currentOptions.onItemChange?.(nextItem, {
      reason,
      ...meta,
    });
  }

  function showGuardMessage(message) {
    // Guard uses modal style messaging.
    if (typeof currentOptions.showModalMessage === "function") {
      currentOptions.showModalMessage(message);
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
      return;
    }
    console.error(`[incident.teams.assignments.editor] ${message}`);
  }

  function renderBusyState(root) {
    const busyState = getBusyState();
    if (!busyState.busy) {
      return;
    }
    const row = document.createElement("div");
    row.className = "hh-assignment-busy";
    row.setAttribute("role", "status");
    row.setAttribute("aria-live", "polite");
    const spinner = document.createElement("span");
    spinner.className = "hh-assignment-busy-spinner";
    spinner.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "hh-assignment-busy-text";
    text.textContent = String(busyState.message || "Updating assignment...");
    row.append(spinner, text);
    root.appendChild(row);
  }

  function applyBusyState(root) {
    const busyState = getBusyState();
    if (!busyState.busy || !root) {
      return;
    }
    root.classList.add("is-busy");
    root.setAttribute("aria-busy", "true");
    if (busyState.action) {
      root.dataset.busyAction = String(busyState.action);
    }
    root.querySelectorAll("button, input, textarea, select").forEach((control) => {
      control.disabled = true;
    });
  }

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

  async function runConfirm(handler, args, label) {
    if (typeof handler !== "function") {
      console.error(`[incident.teams.assignments.editor] Missing required ${label} handler.`);
      return false;
    }

    try {
      return Boolean(await handler(...args));
    } catch (error) {
      console.error(`[incident.teams.assignments.editor] ${label} failed.`, error);
      return false;
    }
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
      CANCELLATION_REASONS.find((item) => item.value === currentData?.cancel_reason_code)?.label ||
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

  function renderNotes(root) {
    const notesWrap = document.createElement("div");
    notesWrap.className = "hh-notes";

    const notesTitle = document.createElement("h5");
    notesTitle.className = "hh-subtitle ui-title";
    notesTitle.textContent = "Notes";
    notesWrap.appendChild(notesTitle);

    const list = document.createElement("div");
    list.className = "hh-notes-list";
    const notes = [...resolveNotes(currentData)].sort((a, b) => {
      const aTime = new Date(a?.created_at || 0).getTime();
      const bTime = new Date(b?.created_at || 0).getTime();
      return aTime - bTime;
    });

    if (notes.length) {
      notes.forEach((note) => {
        const row = document.createElement("p");
        row.className = "hh-row";
        row.textContent = `${note?.note || ""}`;
        list.appendChild(row);
      });
      notesWrap.appendChild(list);
    }

    const inputWrap = document.createElement("div");
    inputWrap.className = "hh-note-input";
    const noteInput = document.createElement("textarea");
    noteInput.className = "hh-input ui-input";
    noteInput.placeholder = "Write a note";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "hh-button ui-button";
    addButton.textContent = "Add Note";
    addButton.disabled = true;

    bind(noteInput, "input", () => {
      addButton.disabled = !String(noteInput.value || "").trim();
    });
    bind(noteInput, "keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      event.preventDefault();
      if (!addButton.disabled) {
        addButton.click();
      }
    });

      bind(addButton, "click", () => {
      if (isBusy()) {
        return;
      }
      const note = String(noteInput.value || "").trim();
      if (!note) {
        return;
      }
      currentData = {
        ...currentData,
        notes: [...resolveNotes(currentData), { note }],
      };
      currentOptions.onNoteAdd?.(currentData?.id, note);
      emitItemChange("note", {
        note,
        localStateChanged: false,
      });
      noteInput.value = "";
      addButton.disabled = true;
    });

    inputWrap.append(noteInput, addButton);
    notesWrap.appendChild(inputWrap);
    root.appendChild(notesWrap);
  }

  function renderResources(root) {
    if (!canShowResources()) {
      return;
    }

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
      const input = document.createElement("input");
      input.type = "number";
      input.className = "hh-input ui-input hh-alloc-input";
      input.min = "0";
      input.max = String(Math.max(0, available));
      input.value = String(allocated);

      bind(input, "change", () => {
        if (isBusy()) {
          return;
        }
        const next = clampInt(input.value, 0, available);
        input.value = String(next);
        allocationMap[String(resourceTypeId)] = next;
        currentData = {
          ...currentData,
          allocated_resources: buildAllocatedResources(currentData, allocationMap),
        };
        currentOptions.onAllocateChange?.(currentData?.id, resourceTypeId, next);
        emitItemChange("allocation", {
          resourceTypeId,
          allocated: next,
          localStateChanged: true,
        });
      });

      allocatedCell.appendChild(input);
      tr.append(resourceCell, availableCell, allocatedCell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    root.appendChild(wrapper);
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

    const status = String(currentData?.status || "assigned");
    if (!["completed", "cancelled"].includes(status)) {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "hh-icon-button ui-button";
      cancelButton.textContent = "Cancel";
      bind(cancelButton, "click", async () => {
        if (isBusy()) {
          return;
        }
        if (status === "assigned") {
          const ok = await runConfirm(currentOptions.confirmDelete, [], "options.confirmDelete");
          if (ok) {
            currentOptions.onDelete?.(currentData?.id);
            emitItemChange("remove", {
              localStateChanged: false,
            });
          }
          return;
        }

        const cancelReason = await collectCancelReason(status);
        if (!cancelReason) {
          return;
        }
        const { reasonCode, reasonNote } = cancelReason;
        const ok = await runConfirm(
          currentOptions.confirmCancel,
          [status, reasonCode, reasonNote],
          "options.confirmCancel"
        );
        if (ok) {
          currentOptions.onCancel?.(currentData?.id, status, reasonCode, reasonNote);
          emitItemChange("cancel", {
            fromStatus: status,
            reasonCode,
            reasonNote,
            localStateChanged: false,
            nextItem: {
              ...currentData,
              status: "cancelled",
              cancelled_from_status: status,
              cancel_reason_code: reasonCode,
              cancel_reason_note: reasonNote,
            },
          });
        }
      });
      header.appendChild(cancelButton);
    }

    root.appendChild(header);
  }

  function renderFooterActions(root, contactInput) {
    const status = String(currentData?.status || "assigned");
    const nextStatus = NEXT_STATUS[status];
    if (!nextStatus || ["completed", "cancelled"].includes(status)) {
      return;
    }

    const actions = document.createElement("div");
    actions.className = "hh-actions";

    const left = document.createElement("span");
    left.className = "hh-meta";
    left.textContent = `Current: ${STEP_LABELS[status] || status}`;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "hh-button ui-button";
    next.textContent = `Mark ${STEP_LABELS[nextStatus] || nextStatus}`;
    bind(next, "click", async () => {
      if (isBusy()) {
        return;
      }
      if (status === "accepted" && !String(contactInput?.value || "").trim()) {
        showGuardMessage("Contact person is required before moving to En Route.");
        if (contactInput) {
          contactInput.focus();
        }
        return;
      }
      const ok = await runConfirm(currentOptions.confirmStatus, [nextStatus], "options.confirmStatus");
      if (ok) {
        currentOptions.onStatusNext?.(currentData?.id, nextStatus);
        emitItemChange("status", {
          fromStatus: status,
          toStatus: nextStatus,
          localStateChanged: false,
          nextItem: {
            ...currentData,
            status: nextStatus,
          },
        });
      }
    });

    actions.append(left, next);
    root.appendChild(actions);
  }

  function render() {
    const root = createRoot(container, "hh-incident-teams-assignments-editor", currentOptions);
    if (!root) {
      return;
    }

    destroyListeners();
    allocationMap = buildAllocationMap(currentData);

    const missingRequired = REQUIRED_OPTION_KEYS.filter((key) => {
      const value = currentOptions?.[key];
      return value === undefined || value === null || value === "";
    });
    if (missingRequired.length) {
      console.error(
        `[incident.teams.assignments.editor] Missing required options: ${missingRequired.join(", ")}`
      );
      return;
    }

    renderHeader(root);
    renderBusyState(root);

    const body = document.createElement("div");
    body.className = "hh-editor-body";

    const status = String(currentData?.status || "assigned");
    const contact = renderContactSection(body, status);

    renderTimeline(body);
    renderFooterActions(body, contact);
    renderCancellationBlock(body);
    renderResources(body);
    renderNotes(body);

    root.appendChild(body);
    applyBusyState(root);
  }

  render();

  return {
    destroy() {
      destroyListeners();
      if (container && container.nodeType === 1) {
        container.innerHTML = "";
      }
    },
    update(nextData, nextOptions = {}) {
      const prevStatus = String(currentData?.status || "");
      currentData = normalizeAssignmentData(nextData);
      currentOptions = normalizeIncidentOptions({ ...currentOptions, ...nextOptions });
      contactDraft = String(currentData?.contact_person || "");
      const nextStatus = String(currentData?.status || "");
      if (prevStatus !== nextStatus && isContactLockedStatus(nextStatus)) {
        isContactOverrideEditing = false;
      }
      render();
    },
    getData() {
      return cloneData(currentData);
    },
  };

  function renderContactSection(root, status) {
    const normalizedStatus = normalizeStatus(status);
    const canInlineEdit = isContactInlineEditableStatus(normalizedStatus);
    const isTerminalStatus = ["completed", "cancelled"].includes(normalizedStatus);
    const allowOverride = Boolean(currentOptions.allowContactEditAfterDispatch);
    if (!allowOverride || isTerminalStatus) {
      isContactOverrideEditing = false;
    }

    const wrap = document.createElement("div");
    wrap.className = "hh-contact-wrap";

    const labelRow = document.createElement("div");
    labelRow.className = "hh-contact-label-row";
    const label = document.createElement("label");
    label.className = "hh-field-label";
    label.textContent = "Contact Person";
    labelRow.appendChild(label);

    const tools = document.createElement("div");
    tools.className = "hh-contact-tools";
    const locked = isContactLockedStatus(normalizedStatus) && !isContactOverrideEditing;
    if (locked) {
      const badge = document.createElement("span");
      badge.className = "hh-lock-badge";
      badge.textContent = "Locked";
      tools.appendChild(badge);
    }

    if (allowOverride && !isTerminalStatus && isContactLockedStatus(normalizedStatus)) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "hh-button ui-button hh-contact-edit";
      edit.textContent = "Edit";
      bind(edit, "click", async () => {
        if (isBusy()) {
          return;
        }
        const ok = await runConfirm(
          currentOptions.confirmContactEdit || (() => window.confirm("Edit locked contact person?")),
          [],
          "options.confirmContactEdit"
        );
        if (!ok) {
          return;
        }
        isContactOverrideEditing = true;
        contactDraft = String(currentData?.contact_person || "");
        render();
      });
      tools.appendChild(edit);
    }

    if (tools.childNodes.length) {
      labelRow.appendChild(tools);
    }
    wrap.appendChild(labelRow);

    if (canInlineEdit || (isContactOverrideEditing && allowOverride && !isTerminalStatus)) {
      const input = document.createElement("input");
      input.className = "hh-input ui-input";
      input.type = "text";
      input.placeholder = "Enter contact person";
      input.value = isContactOverrideEditing ? contactDraft : String(currentData?.contact_person || "");

      bind(input, "input", () => {
        if (isBusy()) {
          return;
        }
        contactDraft = input.value;
        if (canInlineEdit) {
          currentData = { ...currentData, contact_person: input.value };
          currentOptions.onContactChange?.(currentData?.id, input.value);
          emitItemChange("contact", {
            value: input.value,
            localStateChanged: true,
          });
        }
      });

      wrap.appendChild(input);

      if (isContactOverrideEditing) {
        const actions = document.createElement("div");
        actions.className = "hh-contact-actions";

        const save = document.createElement("button");
        save.type = "button";
        save.className = "hh-button ui-button";
        save.textContent = "Save Contact";
        bind(save, "click", () => {
          if (isBusy()) {
            return;
          }
          currentData = { ...currentData, contact_person: String(contactDraft || "").trim() };
          currentOptions.onContactChange?.(currentData?.id, currentData.contact_person);
          emitItemChange("contact", {
            value: currentData.contact_person,
            localStateChanged: true,
          });
          isContactOverrideEditing = false;
          render();
        });

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "hh-button ui-button";
        cancel.textContent = "Cancel";
        bind(cancel, "click", () => {
          if (isBusy()) {
            return;
          }
          isContactOverrideEditing = false;
          contactDraft = String(currentData?.contact_person || "");
          render();
        });

        actions.append(save, cancel);
        wrap.appendChild(actions);
      }

      root.appendChild(wrap);
      return input;
    }

    const value = document.createElement("p");
    value.className = "hh-row";
    value.textContent = currentData?.contact_person || "-";
    wrap.appendChild(value);

    root.appendChild(wrap);
    return null;
  }
}

function cloneData(value) {
  try {
    return structuredClone(value);
  } catch (_) {
    return JSON.parse(JSON.stringify(value));
  }
}

function resolveNotes(data) {
  return safeArray(data?.notes_log || data?.notes_thread || data?.notes);
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

function buildAllocatedResources(data, map) {
  const sourceByType = new Map(
    safeArray(data?.allocated_resources).map((item) => [String(item?.resource_type_id ?? ""), item])
  );
  return Object.entries(map)
    .filter(([, quantityAllocated]) => Number(quantityAllocated) > 0)
    .map(([resourceTypeId, quantityAllocated]) => ({
      ...(sourceByType.get(String(resourceTypeId)) || {}),
      resource_type_id: Number.isNaN(Number(resourceTypeId)) ? resourceTypeId : Number(resourceTypeId),
      quantity_allocated: Number(quantityAllocated) || 0,
    }));
}

function normalizeAssignmentData(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    ...source,
    _client_key: source._client_key ?? source.client_key ?? null,
    notes: safeArray(resolveNotes(source)).map((item) => ({ ...item })),
    allocated_resources: safeArray(source.allocated_resources).map((item) => ({ ...item })),
  };
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return min;
  }
  return Math.max(min, Math.min(max, parsed));
}

function isContactInlineEditableStatus(status) {
  return ["assigned", "requested", "accepted"].includes(normalizeStatus(status));
}

function isContactLockedStatus(status) {
  return ["en_route", "on_scene", "completed", "cancelled"].includes(normalizeStatus(status));
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function promptReasonCode() {
  const options = CANCELLATION_REASONS.map((item) => `${item.value} (${item.label})`).join("\n");
  const code = String(window.prompt(`Cancellation reason code:\n${options}`, "") || "").trim();
  if (!code) {
    return "";
  }
  const exists = CANCELLATION_REASONS.some((item) => item.value === code);
  if (!exists) {
    window.alert("Invalid cancellation reason.");
    return "";
  }
  return code;
}

function normalizeCancelReasonResult(result) {
  if (result == null) {
    return null;
  }
  if (typeof result !== "object") {
    window.alert("Invalid cancellation reason result.");
    return null;
  }

  const reasonCode = String(result.reasonCode || "").trim();
  if (!reasonCode) {
    return null;
  }
  const exists = CANCELLATION_REASONS.some((item) => item.value === reasonCode);
  if (!exists) {
    window.alert("Invalid cancellation reason.");
    return null;
  }
  const reasonNote = String(result.reasonNote || "").trim();
  if (reasonCode === "other" && !reasonNote) {
    window.alert("Cancellation details are required for Other.");
    return null;
  }
  return { reasonCode, reasonNote };
}

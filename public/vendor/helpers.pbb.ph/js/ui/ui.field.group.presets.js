const PERSON_FIELDS = [
  { key: "name", label: "Complete name", type: "text", computed: { template: "{last_name}, {first_name}", fallbackKey: "name" }, hidden: true },
  [
    { key: "last_name", label: "Last name / Family name", type: "text", required: true },
    { key: "first_name", label: "First name", type: "text", required: true },
  ],
  [
    { key: "gender", label: "Gender", type: "select", options: ["Male", "Female"] },
    { key: "age", label: "Age", type: "number-stepper", min: 0, max: 120 },
  ],
];

const ADDRESS_FIELDS = [
  [
    { key: "neighborhood", label: "Neighborhood", type: "text" },
    { key: "barangay", label: "Barangay", type: "text" },
  ],
  [
    { key: "town", label: "Town", type: "text" },
    { key: "city", label: "City", type: "text" },
  ],
  [
    { key: "state", label: "State", type: "text" },
    { key: "country", label: "Country", type: "text", default_value: "Philippines" },
  ],
];

const MISSING_PERSON_FIELDS = [
  ...PERSON_FIELDS,
  [
    { key: "last_seen_days", label: "Last seen days", type: "number-stepper", min: 0 },
    { key: "last_seen_location", label: "Last seen location", type: "combobox", storageKey: "helpers.fieldGroup.missingPerson.lastSeenLocation", maxSuggestions: 20, placeholder: "Type or choose a saved location" },
  ],
];

const EVACUEE_FIELDS = [
  ...PERSON_FIELDS,
  { key: "local_citizen", label: "Local citizen", type: "select", options: ["Yes", "No"] },
  { key: "needs", label: "Needs", type: "textarea" },
];

const DAMAGE_LEVEL_OPTIONS = ["Minor", "Partial", "Major", "Total"];
const YES_NO_OPTIONS = ["Yes", "No"];

const FAMILY_FIELDS = [
  { key: "household_head", label: "Household head", type: "text", required: true },
  [
    {
      key: "adult_count",
      label: "Adult count",
      type: "number-stepper",
      min: 0,
      allowEmpty: false,
      breakdown: {
        label: "Adult breakdown",
        fields: [
          [
            { key: "adult_male_count", label: "Male", type: "number-stepper", min: 0 },
            { key: "adult_female_count", label: "Female", type: "number-stepper", min: 0 },
          ],
          [
            { key: "adult_senior_count", label: "Senior", type: "number-stepper", min: 0 },
            { key: "adult_pwd_count", label: "PWD", type: "number-stepper", min: 0 },
          ],
          [
            { key: "adult_pregnant_count", label: "Pregnant", type: "number-stepper", min: 0 },
            null,
          ],
        ],
      },
    },
    {
      key: "children_count",
      label: "Children count",
      type: "number-stepper",
      min: 0,
      allowEmpty: false,
      breakdown: {
        label: "Children breakdown",
        fields: [
          [
            { key: "children_male_count", label: "Male", type: "number-stepper", min: 0 },
            { key: "children_female_count", label: "Female", type: "number-stepper", min: 0 },
          ],
          [
            { key: "children_pwd_count", label: "PWD", type: "number-stepper", min: 0 },
            null,
          ],
        ],
      },
    },
  ],
  [
    { key: "member_count", label: "Member count", type: "number-stepper", min: 0, readonly: true, allowEmpty: false, computed: "adult_count + children_count", hidden: true },
    { key: "displaced", label: "Displaced", type: "select", options: YES_NO_OPTIONS },
  ],
  { key: "address", label: "Address", type: "combobox", storageKey: "helpers.fieldGroup.family.address", maxSuggestions: 20, placeholder: "Type or choose a saved address/sitio/purok" },
];

const FAMILY_VALIDATIONS = [
  {
    type: "sum_eq",
    fields: ["adult_male_count", "adult_female_count"],
    maxField: "adult_count",
    message: "Adult male + female counts should equal adult count.",
  },
  {
    type: "lte",
    field: "adult_senior_count",
    maxField: "adult_count",
    message: "Senior adult count should not exceed adult count.",
  },
  {
    type: "lte",
    field: "adult_pwd_count",
    maxField: "adult_count",
    message: "Adult PWD count should not exceed adult count.",
  },
  {
    type: "lte",
    field: "adult_pregnant_count",
    maxField: "adult_female_count",
    message: "Pregnant adult count should not exceed adult female count.",
  },
  {
    type: "sum_eq",
    fields: ["children_male_count", "children_female_count"],
    maxField: "children_count",
    message: "Child male + female counts should equal children count.",
  },
  {
    type: "lte",
    field: "children_pwd_count",
    maxField: "children_count",
    message: "Child PWD count should not exceed children count.",
  },
];

const CASUALTY_PATIENT_FIELDS = [
  ...PERSON_FIELDS,
  [
    { key: "condition", label: "Condition", type: "select", options: ["Stable", "Serious", "Critical", "Deceased"] },
    { key: "injury_type", label: "Injury type", type: "select", options: ["Fracture", "Burn", "Laceration", "Head injury", "Respiratory", "Other"] },
  ],
  [
    { key: "consciousness", label: "Consciousness", type: "select", options: ["Conscious", "Unconscious", "Unknown"], visibleWhen: { condition: { not: "Deceased" } } },
    { key: "triage_color", label: "Priority / triage color", type: "select", options: ["Green", "Yellow", "Red", "Black"], visibleWhen: { condition: { not: "Deceased" } } },
  ],
  [
    { key: "transported", label: "Transported", type: "select", options: YES_NO_OPTIONS, visibleWhen: { condition: { not: "Deceased" } } },
    { key: "destination_facility", label: "Destination facility", type: "combobox", storageKey: "helpers.fieldGroup.casualtyPatient.destinationFacility", maxSuggestions: 20, placeholder: "Type or choose a saved facility", visibleWhen: { condition: { not: "Deceased" }, transported: "Yes" } },
  ],
];

const INFRASTRUCTURE_DAMAGE_FIELDS = [
  [
    { key: "asset_type", label: "Asset type", type: "select", options: ["Road", "Bridge", "Power", "Water", "School", "Health Facility", "Government Facility", "Communications", "Other"] },
    { key: "name_location", label: "Name / location", type: "combobox", required: true, storageKey: "helpers.fieldGroup.infrastructureDamage.nameLocation", maxSuggestions: 20, placeholder: "Type or choose a saved asset/location" },
  ],
  [
    { key: "damage_level", label: "Damage level", type: "select", options: DAMAGE_LEVEL_OPTIONS },
    { key: "operational_status", label: "Operational status", type: "select", options: ["Usable", "Limited", "Not usable"] },
  ],
  { key: "estimated_affected_users", label: "Estimated affected users", type: "number-stepper", min: 0 },
];

const SHELTER_DAMAGE_FIELDS = [
  [
    { key: "structure_type", label: "Structure type", type: "select", options: ["House", "Apartment / Boarding House", "Temporary Shelter", "Evacuation Center", "Other"] },
    { key: "damage_level", label: "Damage level", type: "select", options: DAMAGE_LEVEL_OPTIONS },
  ],
  [
    { key: "families_affected", label: "Families affected", type: "number-stepper", min: 0 },
    { key: "persons_affected", label: "Persons affected", type: "number-stepper", min: 0 },
  ],
  { key: "habitable", label: "Habitable", type: "select", options: YES_NO_OPTIONS },
];

const ROAD_ACCESS_STATUS_FIELDS = [
  [
    { key: "route_location", label: "Route / location", type: "combobox", required: true, storageKey: "helpers.fieldGroup.roadAccessStatus.routeLocation", maxSuggestions: 20, placeholder: "Type or choose a saved route/location" },
    { key: "status", label: "Access", type: "select", options: ["Open", "Limited", "Blocked", "Closed", "Cleared"], required: true },
  ],
  { key: "obstruction_type", label: "Obstruction type", type: "select", options: ["Flooding", "Landslide", "Fallen tree", "Debris", "Collapsed structure", "Vehicle obstruction", "Other"], required: true, visibleWhen: { status: ["Blocked", "Closed"] } },
  { key: "passable_by_vehicle_type", label: "Passable by vehicle type", type: "checkbox-group", options: ["Pedestrian", "Motorcycle", "Light vehicle", "Truck", "Emergency vehicle"], visibleWhen: { status: { not: "Closed" } } },
  { key: "passability_warning", label: "Passable by vehicle type", type: "notice", tone: "warning", message: "Closed access is not passable and may pose risks to responders.", visibleWhen: { status: "Closed" } },
];

const ROAD_ACCESS_STATUS_VALIDATIONS = [
  {
    type: "required",
    field: "route_location",
    message: "Route / location is required for responder routing.",
  },
  {
    type: "required",
    field: "status",
    message: "Access is required for responder routing.",
  },
  {
    type: "required_when",
    field: "obstruction_type",
    when: { status: ["Blocked", "Closed"] },
    message: "Obstruction type is required when access is blocked or closed.",
  },
  {
    type: "empty_when",
    field: "passable_by_vehicle_type",
    when: { status: "Closed" },
    message: "Closed access should not list passable vehicle types.",
  },
];

const VEHICLE_INVOLVED_FIELDS = [
  { key: "vehicle_type", label: "Vehicle type", type: "select", options: ["Motorcycle", "Car", "SUV", "Van", "Pick-up", "Truck", "Bus", "Jeepney", "Tricycle", "Bicycle", "Heavy Equipment", "Other"] },
  { key: "plate_number", label: "Plate number", type: "text" },
  [
    { key: "color", label: "Color", type: "select", options: ["White", "Black", "Silver", "Gray", "Red", "Blue", "Green", "Yellow", "Brown", "Orange", "Other", "Unknown"] },
    { key: "damage_level", label: "Damage level", type: "select", options: ["None visible", "Minor", "Major", "Severe", "Unknown"] },
  ],
  [
    { key: "passenger_count", label: "Passenger count", type: "number-stepper", min: 0 },
    { key: "flammable_hazardous_cargo", label: "Flammable / hazardous cargo", type: "select", options: YES_NO_OPTIONS },
  ],
];

export const fieldGroupPresets = {
  person(overrides = {}) {
    return buildPreset({
      label: "Person",
      fields: PERSON_FIELDS,
    }, overrides);
  },

  address(overrides = {}) {
    return buildPreset({
      label: "Address",
      fields: ADDRESS_FIELDS,
    }, overrides);
  },

  missingPerson(overrides = {}) {
    return buildPreset({
      label: "Missing Person",
      repeatable: true,
      fields: MISSING_PERSON_FIELDS,
    }, overrides);
  },

  evacuee(overrides = {}) {
    return buildPreset({
      label: "Evacuee",
      repeatable: true,
      fields: EVACUEE_FIELDS,
    }, overrides);
  },

  family(overrides = {}) {
    return buildPreset({
      label: "Family",
      repeatable: true,
      fields: FAMILY_FIELDS,
      validations: FAMILY_VALIDATIONS,
      sitrep: ["affected_families", "affected_persons", "vulnerable_population"],
    }, overrides);
  },

  casualtyPatient(overrides = {}) {
    return buildPreset({
      label: "Casualty / Patient",
      repeatable: true,
      fields: CASUALTY_PATIENT_FIELDS,
      sitrep: ["injured_count", "critical_count", "transported_count"],
    }, overrides);
  },

  infrastructureDamage(overrides = {}) {
    return buildPreset({
      label: "Infrastructure Damage",
      repeatable: true,
      fields: INFRASTRUCTURE_DAMAGE_FIELDS,
      sitrep: ["damaged_infrastructure_count", "impassable_roads_bridges"],
    }, overrides);
  },

  shelterDamage(overrides = {}) {
    return buildPreset({
      label: "Shelter Damage",
      repeatable: true,
      fields: SHELTER_DAMAGE_FIELDS,
      sitrep: ["partially_damaged_houses", "totally_damaged_houses", "displaced_families"],
    }, overrides);
  },

  roadAccessStatus(overrides = {}) {
    return buildPreset({
      label: "Road / Access Status",
      repeatable: true,
      fields: ROAD_ACCESS_STATUS_FIELDS,
      validations: ROAD_ACCESS_STATUS_VALIDATIONS,
      sitrep: ["blocked_routes"],
    }, overrides);
  },

  vehicleInvolved(overrides = {}) {
    return buildPreset({
      label: "Vehicle Involved",
      repeatable: true,
      fields: VEHICLE_INVOLVED_FIELDS,
      sitrep: ["vehicles_involved_count"],
    }, overrides);
  },
};

export function createPersonFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.person(overrides);
}

export function createAddressFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.address(overrides);
}

export function createMissingPersonFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.missingPerson(overrides);
}

export function createEvacueeFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.evacuee(overrides);
}

export function createFamilyFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.family(overrides);
}

export function createCasualtyPatientFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.casualtyPatient(overrides);
}

export function createInfrastructureDamageFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.infrastructureDamage(overrides);
}

export function createShelterDamageFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.shelterDamage(overrides);
}

export function createRoadAccessStatusFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.roadAccessStatus(overrides);
}

export function createVehicleInvolvedFieldGroupPreset(overrides = {}) {
  return fieldGroupPresets.vehicleInvolved(overrides);
}

function buildPreset(base, overrides) {
  const normalizedOverrides = overrides && typeof overrides === "object" ? overrides : {};
  const fieldOverrides = normalizeFieldOverrides(normalizedOverrides.fields);
  const baseFields = applyFieldOverrides(cloneFields(base.fields), fieldOverrides);
  const extraFields = normalizeExtraFields(normalizedOverrides.extraFields);
  const fields = Array.isArray(normalizedOverrides.fields)
    ? cloneFields(normalizedOverrides.fields)
    : [...baseFields, ...extraFields];

  return {
    ...base,
    ...normalizedOverrides,
    fields,
  };
}

function cloneFields(fields) {
  return Array.isArray(fields)
    ? fields.map((field) => (Array.isArray(field) ? field.map(cloneField).filter(Boolean) : cloneField(field))).filter(Boolean)
    : [];
}

function cloneField(field) {
  return field && typeof field === "object" && !Array.isArray(field) ? { ...field } : null;
}

function applyFieldOverrides(fields, overrides) {
  return cloneFields(fields).map((field) => {
    if (Array.isArray(field)) {
      return field.map((child) => ({
        ...child,
        ...(overrides[getFieldKey(child)] || {}),
      }));
    }
    return {
      ...field,
      ...(overrides[getFieldKey(field)] || {}),
    };
  });
}

function normalizeFieldOverrides(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return {};
  }
  return Object.keys(fields).reduce((acc, key) => {
    const value = fields[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      acc[key] = { ...value };
    }
    return acc;
  }, {});
}

function normalizeExtraFields(fields) {
  return cloneFields(fields);
}

function getFieldKey(field) {
  return String(field?.key ?? field?.field_key ?? field?.name ?? "");
}

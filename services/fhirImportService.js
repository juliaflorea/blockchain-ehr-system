"use strict";

function cloneResource(resource) {
  return resource ? JSON.parse(JSON.stringify(resource)) : resource;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstCodingCode(concept) {
  const coding = asArray(concept && concept.coding);
  return coding[0] && coding[0].code ? coding[0].code : "";
}

function firstCodingDisplay(concept) {
  const coding = asArray(concept && concept.coding);
  return coding[0] && (coding[0].display || coding[0].code) ? (coding[0].display || coding[0].code) : "";
}

function firstHumanName(patientResource) {
  const names = asArray(patientResource && patientResource.name);
  return names[0] || {};
}

function firstTelecomValue(resource, system) {
  return asArray(resource && resource.telecom).find((item) => item && item.system === system)?.value || "";
}

function firstAddressLine(resource) {
  const address = asArray(resource && resource.address)[0];
  return asArray(address && address.line).join(", ");
}

function stringifyDoseQuantity(quantity) {
  if (!quantity || typeof quantity !== "object") return "";

  const value = quantity.value != null && !isNaN(quantity.value)
    ? String(quantity.value)
    : "";

  const unit = quantity.unit || quantity.code || "";

  return [value, unit].filter(Boolean).join(" ").trim();
}

function extractMedicationName(resource) {
  if (resource.medicationCodeableConcept) {
    return resource.medicationCodeableConcept.text || firstCodingDisplay(resource.medicationCodeableConcept) || "";
  }
  return resource.medicationReference?.display || "";
}

function mapPatientResource(patientResource) {
  const name = firstHumanName(patientResource);

  let firstName = "";
  let lastName = "";

  //  R4
  if (name.given || name.family) {
  if (Array.isArray(name.given)) {
    firstName = name.given.join(" ");
  } else if (typeof name.given === "string") {
    firstName = name.given;
  }

  lastName = name.family || "";
}
  //  STU3
  else if (name.text) {
    const parts = name.text.split(" ");
    firstName = parts.slice(0, -1).join(" ") || "";
    lastName = parts.slice(-1).join(" ") || "";
  }

  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ").trim(),
    gender: patientResource.gender || "",
    birthDate: patientResource.birthDate || "",
    phoneNumber: firstTelecomValue(patientResource, "phone"),
    email: firstTelecomValue(patientResource, "email"),
    address: firstAddressLine(patientResource),
  };
}

function mapConditionResource(resource, fhirVersion) {
  let clinicalStatus = "";

if (fhirVersion === "STU3") {
  clinicalStatus = resource.clinicalStatus || "";
} else {
  clinicalStatus = firstCodingCode(resource.clinicalStatus) || firstCodingDisplay(resource.clinicalStatus) || "";
}
  const severity = firstCodingCode(resource.severity) || firstCodingDisplay(resource.severity) || "";
  const details = asArray(resource.note).map((note) => note && note.text).filter(Boolean).join("\n");

  return {
    doctor: resource.recorder?.display || resource.asserter?.display || "",
    datetime: resource.recordedDate || resource.onsetDateTime || "",
    diagnosed: resource.code?.text || firstCodingDisplay(resource.code) || "",
    clinicalStatus,
    severity,
    affectedArea: asArray(resource.bodySite)
  .map(b => b?.text || firstCodingDisplay(b))
  .filter(Boolean)
  .join(", "),
    details,
    fhirConditionResource: cloneResource(resource),
  };
}

function mapMedicationRequestResource(resource) {
  const dosageInstruction = asArray(resource.dosageInstruction)[0] || {};
  const doseQuantity = asArray(dosageInstruction.doseAndRate)[0]?.doseQuantity;
  const boundsDuration = dosageInstruction.timing?.repeat?.boundsDuration;
  const expectedSupplyDuration = resource.dispenseRequest?.expectedSupplyDuration;
  const durationQuantity = expectedSupplyDuration || boundsDuration;
  const duration = durationQuantity
    ? [durationQuantity.value, durationQuantity.unit || durationQuantity.code].filter(Boolean).join(" ").trim()
    : "";
  const freq = Number.isFinite(dosageInstruction.timing?.repeat?.frequency)
  ? String(dosageInstruction.timing.repeat.frequency)
  : "";
  return {
    datetime: resource.authoredOn || "",
    doctor: resource.requester?.display || "",
    medicationName: extractMedicationName(resource),
    dose: stringifyDoseQuantity(doseQuantity),
    route: dosageInstruction.route?.text || firstCodingDisplay(dosageInstruction.route) || "",
    frequency:
  dosageInstruction.text ||
  dosageInstruction.timing?.code?.text ||
  (freq !== "" ? String(freq) : ""),
    duration,
    instructions: dosageInstruction.patientInstruction || dosageInstruction.text || asArray(resource.note).map((note) => note && note.text).filter(Boolean).join("\n"),
    fhirMedicationRequest: cloneResource(resource),
  };
}

function mapAllergyResource(resource) {
  const firstReaction = asArray(resource.reaction)[0] || {};
  const manifestation = asArray(firstReaction.manifestation)[0] || {};

  return {
    substance: resource.code?.text || firstCodingDisplay(resource.code) || "",
    reaction: manifestation.text || firstCodingDisplay(manifestation) || "",
    criticality: resource.criticality || "",
    recordedDate: resource.recordedDate || "",
    status: resource.clinicalStatus?.text || firstCodingCode(resource.clinicalStatus) || resource.verificationStatus?.text || firstCodingCode(resource.verificationStatus) || "",
    fhirAllergyIntoleranceResource: cloneResource(resource),
  };
}

function mapEncounterResource(resource) {
  const period = resource.period || {};
  return {
    datetime: period.start || resource.actualPeriod?.start || "",
    endDatetime: period.end || resource.actualPeriod?.end || "",
    status: resource.status || "",
    encounterType: asArray(resource.type)[0]?.text || firstCodingDisplay(asArray(resource.type)[0]) || "",
    reason: asArray(resource.reasonCode)[0]?.text || firstCodingDisplay(asArray(resource.reasonCode)[0]) || "",
    fhirEncounterResource: cloneResource(resource),
  };
}

function detectFHIRVersion(bundle) {
  const patient = (bundle.entry || [])
    .map(e => e.resource)
    .find(r => r?.resourceType === "Patient");

  if (!patient) return "R4"; // default

  if (Array.isArray(patient.name?.[0]?.given)) {
  return "R4";
}

  if (patient.name?.[0]?.text) {
    return "STU3";
  }

  return "R4";
}

function parseFHIRBundle(bundleJson) {
  const bundle = typeof bundleJson === "string" ? JSON.parse(bundleJson) : bundleJson;
  const fhirVersion = detectFHIRVersion(bundle);

  if (!bundle || bundle.resourceType !== "Bundle") {
    throw new Error("Invalid FHIR Bundle: resourceType must be 'Bundle'.");
  }

  const normalizedRecord = {
    resourceType: "Patient",
    personalInfo: {},
    allergies: [],
    diagnosis: [],
    treatmentPlan: [],
    encounters: [],
  };

  let patientResource = null;

  for (const entry of asArray(bundle.entry)) {
    const resource = entry && entry.resource;
    if (!resource || !resource.resourceType) continue;

    switch (resource.resourceType) {
      case "Patient":
        patientResource = cloneResource(resource);
        break;
      case "Condition":
        normalizedRecord.diagnosis.push(mapConditionResource(resource, fhirVersion));
        break;
      case "MedicationRequest":
        normalizedRecord.treatmentPlan.push(mapMedicationRequestResource(resource));
        break;
      case "AllergyIntolerance":
        normalizedRecord.allergies.push(mapAllergyResource(resource));
        break;
      case "Encounter":
        normalizedRecord.encounters.push(mapEncounterResource(resource));
        break;
      default:
        break;
    }
  }

  if (!patientResource) {
    throw new Error("FHIR Bundle import requires a Patient resource.");
  }

  normalizedRecord.fhirPatientResource = patientResource;
  normalizedRecord.personalInfo = mapPatientResource(patientResource);

  normalizedRecord.id = patientResource.id || normalizedRecord.id;
  normalizedRecord.name = cloneResource(patientResource.name) || [];
  normalizedRecord.gender = patientResource.gender || "";
  normalizedRecord.birthDate = patientResource.birthDate || "";
  normalizedRecord.telecom = cloneResource(patientResource.telecom) || [];
  normalizedRecord.address = cloneResource(patientResource.address) || [];

  return  normalizeEmptyStrings(normalizedRecord);;
}

function normalizeEmptyStrings(obj) {
  if (Array.isArray(obj)) return obj.map(normalizeEmptyStrings);
  if (obj && typeof obj === "object") {
    for (const k in obj) {
      if (obj[k] === "") obj[k] = null;
      else obj[k] = normalizeEmptyStrings(obj[k]);
    }
  }
  return obj;
}

module.exports = {
  parseFHIRBundle,
};

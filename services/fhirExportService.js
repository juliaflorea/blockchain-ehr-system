"use strict";
const { mapToSNOMED } = require("./semanticMappingService");
const { formatCondition } = require("../utils/fhirFormatter");

function cloneResource(resource) {
  return resource ? JSON.parse(JSON.stringify(resource)) : resource;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstCodingValue(concept) {
  const coding = asArray(concept && concept.coding);
  return coding[0] && (coding[0].code || coding[0].display) ? (coding[0].code || coding[0].display) : "";
}

function cloneIfPresent(value) {
  return value == null ? value : cloneResource(value);
}

function sanitizeIdSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/(^|-)stu3(?=-|$)/g, "$1")
    .replace(/(^|-)r4(?=-|$)/g, "$1")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .replace(/[^a-z0-9]+/g, "-");
}

function normalizeResourceId(prefix, value, fallback) {
  const normalized = sanitizeIdSegment(value);
  if (!normalized) return `${prefix}-${fallback}`;
  if (normalized.startsWith(`${prefix}-`)) return normalized;
  return `${prefix}-${normalized}`;
}

async function normalizeConditionCode(resourceCode, diagnosedText) {
  const mappedCoding = await mapToSNOMED(diagnosedText);

  if (mappedCoding.length > 0) {
    return {
      text: diagnosedText,
      coding: mappedCoding,
    };
  }

  if (resourceCode && typeof resourceCode === "object") {
    return {
      ...cloneResource(resourceCode),
      text: resourceCode.text || diagnosedText || resourceCode.text,
    };
  }

  return {
    text: diagnosedText || "Unspecified condition",
    coding: [],
  };
}

async function buildCanonicalCondition(diagnosis, index) {
  const source = diagnosis && diagnosis.fhirConditionResource ? diagnosis.fhirConditionResource : {};
  const diagnosedText =
    diagnosis?.diagnosed ||
    source.code?.text ||
    firstCodingValue(source.code) ||
    "Unspecified condition";

  const bodySite = diagnosis?.affectedArea
    ? [{ text: diagnosis.affectedArea }]
    : asArray(source.bodySite);
  const note = diagnosis?.details
    ? [{ text: diagnosis.details }]
    : asArray(source.note);

  return {
    resourceType: "Condition",
    id: normalizeResourceId("condition", diagnosis?.id || source.id, index + 1),
    clinicalStatus: diagnosis?.clinicalStatus
      ? {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
              code: diagnosis.clinicalStatus,
              display: diagnosis.clinicalStatus,
            },
          ],
        }
      : typeof source.clinicalStatus === "string"
        ? {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
                code: source.clinicalStatus,
                display: source.clinicalStatus,
              },
            ],
          }
        : cloneIfPresent(source.clinicalStatus) || {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
                code: "unknown",
                display: "unknown",
              },
            ],
          },
    severity: diagnosis?.severity
      ? {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/condition-severity",
              code: diagnosis.severity,
              display: diagnosis.severity,
            },
          ],
        }
      : typeof source.severity === "string"
        ? {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/condition-severity",
                code: source.severity,
                display: source.severity,
              },
            ],
          }
        : cloneIfPresent(source.severity) || {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/condition-severity",
                code: "unknown",
                display: "unknown",
              },
            ],
          },
    code: await normalizeConditionCode(source.code, diagnosedText),
    bodySite: cloneIfPresent(bodySite) || [],
    recordedDate: diagnosis?.datetime || source.recordedDate || source.onsetDateTime,
    note: cloneIfPresent(note) || [],
  };
}

function normalizePersonalInfo(record) {
  const personalInfo = record.personalInfo || {};
  const fallbackName = asArray(record.name)[0] || {};
  const firstName = personalInfo.firstName || asArray(fallbackName.given)[0] || "";
  const lastName = personalInfo.lastName || fallbackName.family || "";

  return {
    firstName,
    lastName,
    gender: personalInfo.gender || record.gender || "",
    birthDate: personalInfo.birthDate || record.birthDate || "",
    phoneNumber: personalInfo.phoneNumber || asArray(record.telecom).find((item) => item && item.system === "phone")?.value || "",
    email: personalInfo.email || asArray(record.telecom).find((item) => item && item.system === "email")?.value || "",
    address: personalInfo.address || asArray(asArray(record.address)[0]?.line).join(", "),
  };
}

function buildDurationQuantity(durationText) {
  if (!durationText) return undefined;
  const match = String(durationText).trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) {
    return {
      value: 1,
      unit: String(durationText).trim(),
    };
  }

  return {
    value: Number(match[1]),
    unit: match[2] || "days",
  };
}

function buildPatientResource(record) {
  const personalInfo = normalizePersonalInfo(record);
  const patientResource = record.fhirPatientResource
    ? cloneResource(record.fhirPatientResource)
    : {
    resourceType: "Patient",
    name: [
      {
        family: personalInfo.lastName || undefined,
        given: personalInfo.firstName ? [personalInfo.firstName] : [],
      },
    ],
    gender: personalInfo.gender || undefined,
    birthDate: personalInfo.birthDate || undefined,
    telecom: [
      personalInfo.phoneNumber ? { system: "phone", value: personalInfo.phoneNumber } : null,
      personalInfo.email ? { system: "email", value: personalInfo.email } : null,
    ].filter(Boolean),
    address: personalInfo.address
      ? [
          {
            use: "home",
            line: [personalInfo.address],
          },
        ]
      : [],
  };

  patientResource.id = normalizeResourceId("patient", record.id || patientResource.id, "record");

  return patientResource;
}

async function buildConditionResource(diagnosis, index, version) {
  return formatCondition(await buildCanonicalCondition(diagnosis, index), version);
}

function buildMedicationRequestResource(treatment, index) {
  if (treatment && treatment.fhirMedicationRequest) {
    return cloneResource(treatment.fhirMedicationRequest);
  }

  const dosageTextParts = [treatment.dose, treatment.frequency, treatment.instructions].filter(Boolean);

  return {
    resourceType: "MedicationRequest",
    id: treatment.id || `medication-request-${index + 1}`,
    status: "active",
    intent: "order",
    authoredOn: treatment.datetime || undefined,
    medicationCodeableConcept: {
      text: treatment.medicationName || "Unspecified medication",
    },
    dosageInstruction: [
      {
        text: dosageTextParts.join(" - ") || undefined,
        route: treatment.route ? { text: treatment.route } : undefined,
        patientInstruction: treatment.instructions || undefined,
      },
    ],
    dispenseRequest: treatment.duration
      ? {
          expectedSupplyDuration: buildDurationQuantity(treatment.duration),
        }
      : undefined,
  };
}

function buildAllergyResource(allergy, index) {
  if (allergy && allergy.fhirAllergyIntoleranceResource) {
    return cloneResource(allergy.fhirAllergyIntoleranceResource);
  }

  return {
    resourceType: "AllergyIntolerance",
    id: allergy.id || `allergy-${index + 1}`,
    criticality: allergy.criticality || undefined,
    code: {
      text: allergy.substance || "Unspecified substance",
    },
    recordedDate: allergy.recordedDate || undefined,
    reaction: allergy.reaction
      ? [
          {
            manifestation: [{ text: allergy.reaction }],
          },
        ]
      : [],
  };
}

function buildEncounterResource(encounter, index) {
  if (encounter && encounter.fhirEncounterResource) {
    return cloneResource(encounter.fhirEncounterResource);
  }

  return {
    resourceType: "Encounter",
    id: encounter.id || `encounter-${index + 1}`,
    status: encounter.status || "finished",
    period: {
      start: encounter.datetime || undefined,
      end: encounter.endDatetime || undefined,
    },
    type: encounter.encounterType ? [{ text: encounter.encounterType }] : [],
    reasonCode: encounter.reason ? [{ text: encounter.reason }] : [],
  };
}

function getCompositionFromBundle(bundle) {
  const entry = asArray(bundle && bundle.entry);
  const compositionEntry = entry.find((item) => item?.resource?.resourceType === "Composition");
  return compositionEntry ? compositionEntry.resource : null;
}

function isFinalTriageReport(report) {
  if (!report || !report.bundle) return false;
  const composition = getCompositionFromBundle(report.bundle);
  return report.status === "final" || composition?.status === "final";
}

function getFinalTriageReports(record) {
  const reports = [
    ...asArray(record.aiTriageReports),
    record.aiTriageReport,
  ].filter(isFinalTriageReport);

  const seen = new Set();
  return reports.filter((report) => {
    const key = report.id || report.updatedAt || report.sharedAt || report.createdAt || JSON.stringify(report.bundle);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTriageResource(resource, report, index, resourceIndex, patientReference) {
  const normalized = cloneResource(resource);
  const prefix = String(normalized.resourceType || "resource").toLowerCase();
  normalized.id = normalizeResourceId(prefix, normalized.id || report.id, `triage-${index + 1}-${resourceIndex + 1}`);

  if (normalized.resourceType === "Composition") {
    normalized.status = "final";
    normalized.title = normalized.title || report.title || "AI Triage Report";
    normalized.date = normalized.date || report.updatedAt || report.createdAt;
    normalized.subject = normalized.subject || { reference: patientReference };
  }

  if (["Condition", "Observation", "MedicationRequest"].includes(normalized.resourceType)) {
    normalized.subject = normalized.subject || { reference: patientReference };
  }

  return normalized;
}

async function normalizeTriageConditionResource(resource, version) {
  const condition = cloneResource(resource);
  if (condition.resourceType !== "Condition") return condition;

  const diagnosedText = condition.code?.text || firstCodingValue(condition.code);
  if (!asArray(condition.code?.coding).length && diagnosedText) {
    condition.code = await normalizeConditionCode(condition.code, diagnosedText);
  }

  return formatCondition(condition, version);
}

async function buildFinalTriageEntries(record, patientResource, version) {
  const patientReference = `Patient/${patientResource.id}`;
  const reports = getFinalTriageReports(record);
  const entries = [];

  for (const [index, report] of reports.entries()) {
    const resources = asArray(report.bundle.entry)
      .map((entry) => entry && entry.resource)
      .filter(Boolean);

    for (const [resourceIndex, resource] of resources.entries()) {
      const normalized = normalizeTriageResource(resource, report, index, resourceIndex, patientReference);
      const mapped = await normalizeTriageConditionResource(normalized, version);
      entries.push({ resource: mapped });
    }
  }

  return entries;
}

async function generateFHIRBundle(record, version = "R4") {
  if (!record || typeof record !== "object") {
    throw new Error("A decrypted patient record object is required for FHIR export.");
  }

  const normalizedVersion = version === "STU3" ? "STU3" : "R4";
  const patientResource = buildPatientResource(record);
  const conditionEntries = await Promise.all(
    asArray(record.diagnosis).map(async (diagnosis, index) => ({
      resource: await buildConditionResource(diagnosis, index, normalizedVersion),
    }))
  );
  const triageEntries = await buildFinalTriageEntries(record, patientResource, normalizedVersion);

  const entries = [
    { resource: patientResource },
    ...conditionEntries,
    ...asArray(record.treatmentPlan).map((treatment, index) => ({
      resource: buildMedicationRequestResource(treatment, index),
    })),
    ...asArray(record.allergies).map((allergy, index) => ({
      resource: buildAllergyResource(allergy, index),
    })),
    ...asArray(record.encounters).map((encounter, index) => ({
      resource: buildEncounterResource(encounter, index),
    })),
    ...triageEntries,
  ];

  return {
    resourceType: "Bundle",
    type: "collection",
    entry: entries.filter((entry) => entry && entry.resource),
  };
}

module.exports = {
  generateFHIRBundle,
  formatConditionByVersion: formatCondition,
};

"use strict";
const { mapToSNOMED } = require("./semanticMappingService");
const { formatCondition } = require("../utils/fhirFormatter");

function cloneResource(resource) {
  return resource ? JSON.parse(JSON.stringify(resource)) : resource; // deep copies objects because JavaScript objects are passed by reference so the original object can be modifieed by mistake if we don't clone it first
}

function asArray(value) {
  return Array.isArray(value) ? value : [];// ensures value is always array 
}

function firstCodingValue(concept) {
  const coding = asArray(concept && concept.coding);
  return coding[0] && (coding[0].code || coding[0].display) ? (coding[0].code || coding[0].display) : ""; // gets the first coding's code or display value, or returns an empty string if not available
}

function cloneIfPresent(value) {
  return value == null ? value : cloneResource(value); // clones the value if it's not null or undefined, otherwise returns it as is
}

function sanitizeIdSegment(value) {
  return String(value || "") // converts the value to a string, or uses an empty string if it's null or undefined
    .trim()
    .toLowerCase()
    .replace(/(^|-)stu3(?=-|$)/g, "$1")
    .replace(/(^|-)r4(?=-|$)/g, "$1")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .replace(/[^a-z0-9]+/g, "-");
}

function normalizeResourceId(prefix, value, fallback) {
  const normalized = sanitizeIdSegment(value); // normalizes the value to create a valid ID segment
  if (!normalized) return `${prefix}-${fallback}`;
  if (normalized.startsWith(`${prefix}-`)) return normalized; // if the normalized value already starts with the prefix, return it as is to avoid duplication
  return `${prefix}-${normalized}`;
}

async function normalizeConditionCode(resourceCode, diagnosedText) { // maps the diagnosed text to SNOMED codes if no coding is present, otherwise returns the existing code with text
  const mappedCoding = await mapToSNOMED(diagnosedText);

  if (mappedCoding.length > 0) {
    return {
      text: diagnosedText,
      coding: mappedCoding,
    };
  }

  if (resourceCode && typeof resourceCode === "object") { // if there's an existing code object, clone it and ensure it has text (using diagnosedText as fallback if text is missing)
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

// builds a Condition resource from the diagnosis object, using the fhirConditionResource as source if available, and normalizing the code and text based on the diagnosed text and existing code information. It also handles clinicalStatus and severity by checking both the diagnosis object and the source resource, and defaults to "unknown" if not specified.
async function buildCanonicalCondition(diagnosis, index) { 
  const source = diagnosis && diagnosis.fhirConditionResource ? diagnosis.fhirConditionResource : {};
  const diagnosedText =
    diagnosis?.diagnosed ||
    source.code?.text ||
    firstCodingValue(source.code) || // tries to get the diagnosed text from the diagnosis object, then from the source code's text, then from the first coding's code or display, and defaults to 
    "Unspecified condition";

  const bodySite = diagnosis?.affectedArea // if the diagnosis has an affectedArea property, use it as the bodySite text, otherwise use the bodySite from the source resource if available
    ? [{ text: diagnosis.affectedArea }]
    : asArray(source.bodySite);
  const note = diagnosis?.details
    ? [{ text: diagnosis.details }]
    : asArray(source.note);

  return { // builds the Condition resource, prioritizing values from the diagnosis object and falling back to the source resource, while ensuring required fields are populated and properly formatted
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


// normalizes personal information for the patient resource by checking both the record's personalInfo object and the top-level fields, and ensuring that we have values for firstName, last name
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

// builds a Quantity object for the expectedSupplyDuration based on the duration text, which can be in the format of "7 days", "2 weeks", etc. If the format is not recognized, it defaults to a value of 1 and uses the entire duration text as the unit.
function buildDurationQuantity(durationText) {
  if (!durationText) return undefined;
  const match = String(durationText).trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/); // tries to match a number followed by optional whitespace and then the unit, capturing both parts in groups
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

// builds a Patient resource from the record object, using the fhirPatientResource as source if available, and normalizing the personal information based on the record's personalInfo and top-level fields. It also ensures that the patient resource has a valid ID and properly formatted
function buildPatientResource(record) {
  const personalInfo = normalizePersonalInfo(record); // normalizes the personal information by checking both the personalInfo object and the top-level fields, and ensuring we have values for firstName
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

  // normalizes the patient resource ID by using the record's ID if available, or falling back to a default value based on the record's index in the export process. It ensures that the ID is properly formatted and does not contain invalid characters.
  patientResource.id = normalizeResourceId("patient", record.id || patientResource.id, "record");

  return patientResource;
}

// builds a Condition resource from the diagnosis object, using the fhirConditionResource as source if available, and normalizing the code and text based on the diagnosed text and existing code information. It also handles clinicalStatus and severity by checking both the diagnosis object and the source resource, and defaults to "unknown" if not specified. The resulting Condition resource is then formatted according to the specified FHIR version using the formatCondition function.
async function buildConditionResource(diagnosis, index, version) {
  return formatCondition(await buildCanonicalCondition(diagnosis, index), version);
}

// builds a MedicationRequest resource from the treatment object, using the fhirMedicationRequest as source if available, and normalizing the relevant fields such as medication name, dosage instructions, route, and duration. It also ensures that the resource has a valid ID and properly formatted fields based on the treatment information.
function buildMedicationRequestResource(treatment, index) {
  if (treatment && treatment.fhirMedicationRequest) {
    return cloneResource(treatment.fhirMedicationRequest);
  }

  // constructs the dosage instruction text by combining dose, frequency, and instructions, filtering out any empty values to avoid unnecessary separators
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

// builds an AllergyIntolerance resource from the allergy object, using the fhirAllergyIntoleranceResource as source if available, and normalizing the relevant fields such as substance, criticality, recorded date, and reaction. It also ensures that the resource has a valid ID and properly formatted fields based on the allergy information.
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

// builds an Encounter resource from the encounter object, using the fhirEncounterResource as source if available, and normalizing the relevant fields such as status, period, type, and reason. It also ensures that the resource has a valid ID and properly formatted fields based on the encounter information.
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

// extracts the Composition resource from a FHIR bundle, if present, by looking for an entry with a resource of type "Composition". It returns the Composition resource if found, or null if not present in the bundle.
function getCompositionFromBundle(bundle) {
  const entry = asArray(bundle && bundle.entry);
  const compositionEntry = entry.find((item) => item?.resource?.resourceType === "Composition");
  return compositionEntry ? compositionEntry.resource : null;
}

// checks if a given report is a final triage report by verifying that it has a bundle and that either the report's status or the Composition resource's status (if present) is "final". This helps ensure that only completed triage reports are included in the FHIR export.
function isFinalTriageReport(report) {
  if (!report || !report.bundle) return false;
  const composition = getCompositionFromBundle(report.bundle);
  return report.status === "final" || composition?.status === "final";
}

// extracts all final triage reports from the record by checking both the aiTriageReport and aiTriageReports fields, filtering out any reports that do not meet the criteria for being a final triage report, and ensuring that there are no duplicate reports based on their ID or timestamps. This allows us to include only relevant and unique triage information in the FHIR export.
function getFinalTriageReports(record) {
  const reports = [
    ...asArray(record.aiTriageReports),
    record.aiTriageReport,
  ].filter(isFinalTriageReport);

  // removes duplicate reports by using a Set to track seen report identifiers, which can be based on the report's ID or timestamps. This ensures that we only include unique triage reports in the final FHIR bundle.  
  const seen = new Set();
  return reports.filter((report) => {
    const key = report.id || report.updatedAt || report.sharedAt || report.createdAt || JSON.stringify(report.bundle);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// // builds a Condition resource from the diagnosis object, using the fhirConditionResource as source if available, and normalizing the code and text based on the diagnosed text and existing code information. It also handles clinicalStatus and severity by checking both the diagnosis object and the source resource, and defaults to "unknown" if not specified.
function normalizeTriageResource(resource, report, index, resourceIndex, patientReference) {
  const normalized = cloneResource(resource);
  const prefix = String(normalized.resourceType || "resource").toLowerCase();
  normalized.id = normalizeResourceId(prefix, normalized.id || report.id, `triage-${index + 1}-${resourceIndex + 1}`);

  // for Composition resources, we ensure that the status is set to "final" and that the title, date, and subject are populated based on the report information and patient reference. This helps maintain consistency and completeness of the Composition resource in the context of a triage report.
  if (normalized.resourceType === "Composition") {
    normalized.status = "final";
    normalized.title = normalized.title || report.title || "AI Triage Report";
    normalized.date = normalized.date || report.updatedAt || report.createdAt;
    normalized.subject = normalized.subject || { reference: patientReference };
  }

  // for Condition, Observation, and MedicationRequest resources, we ensure that the subject reference is set to the patient reference if not already specified. This helps maintain the link between these resources and the patient in the FHIR export.
  if (["Condition", "Observation", "MedicationRequest"].includes(normalized.resourceType)) {
    normalized.subject = normalized.subject || { reference: patientReference };
  }

  return normalized;
}

// normalizes a Condition resource from a triage report by first cloning the resource to avoid mutating the original, then checking if it's a Condition resource and if so, ensuring that it has a properly formatted code and text based on the diagnosed text and existing code information. It uses the normalizeConditionCode function to handle the mapping of diagnosed text to SNOMED codes if no coding is present, and then formats the resulting Condition resource according to the specified FHIR version using the formatCondition function.
async function normalizeTriageConditionResource(resource, version) {
  const condition = cloneResource(resource);
  if (condition.resourceType !== "Condition") return condition;
// for Condition resources, we ensure that the code is properly normalized by checking if there's any coding present, and if not, we use the diagnosed text (or existing code text) to attempt to map it to SNOMED codes. This helps improve the quality and interoperability of the Condition resource in the FHIR export.
  const diagnosedText = condition.code?.text || firstCodingValue(condition.code);
  if (!asArray(condition.code?.coding).length && diagnosedText) {
    condition.code = await normalizeConditionCode(condition.code, diagnosedText);
  }

  return formatCondition(condition, version);
}

// builds the final triage entries for the FHIR bundle by extracting all final triage reports from the record, then iterating through each report and its resources to normalize them based on their type and the report information. It ensures that each resource has a valid ID, is properly linked to the patient, and that Condition resources have their codes normalized. The resulting entries are then returned as an array of objects with a resource property, ready to be included in the final FHIR bundle.
async function buildFinalTriageEntries(record, patientResource, version) {
  const patientReference = `Patient/${patientResource.id}`;
  const reports = getFinalTriageReports(record);
  const entries = [];
// iterates through each final triage report and its resources, normalizing them based on their type and the report information. It ensures that each resource has a valid ID, is properly linked to the patient, and that Condition resources have their codes normalized. The resulting entries are then collected into an array to be included in the final FHIR bundle.
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

// generates a FHIR Bundle resource from the given patient record, including the patient information, conditions, treatments, allergies, encounters, and any relevant triage reports. It normalizes and formats each resource according to the specified FHIR version (R4 or STU3) and ensures that all resources have valid IDs and properly linked references. The resulting Bundle resource is structured as a collection of entries, ready for export or integration with other FHIR-compliant systems.
async function generateFHIRBundle(record, version = "R4") {
  if (!record || typeof record !== "object") {
    throw new Error("A decrypted patient record object is required for FHIR export.");
  }
//  normalizes the FHIR version by accepting either "R4" or "STU3" as input, and defaulting to "R4" if an unrecognized version is provided. This allows for flexibility in handling different FHIR versions while ensuring that the formatting functions can adapt accordingly.
  const normalizedVersion = version === "STU3" ? "STU3" : "R4";
  const patientResource = buildPatientResource(record);
  const conditionEntries = await Promise.all(
    asArray(record.diagnosis).map(async (diagnosis, index) => ({
      resource: await buildConditionResource(diagnosis, index, normalizedVersion),
    }))
  );
  // builds the final triage entries by extracting all final triage reports from the record, normalizing their resources based on their type and the report information, and ensuring that they are properly linked to the patient. The resulting entries are then included in the final FHIR bundle alongside the patient information, conditions, treatments, allergies, and encounters.
  const triageEntries = await buildFinalTriageEntries(record, patientResource, normalizedVersion);

  // constructs the final array of entries for the FHIR bundle by combining the patient resource, condition entries, treatment entries, allergy entries, encounter entries, and triage entries. It ensures that only valid entries with a resource property are included in the final bundle.
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
// exports the generateFHIRBundle function as the main entry point for generating a FHIR Bundle from a patient record, and also exports the formatCondition function for external use if needed. This allows other parts of the application to utilize these functions for FHIR export and condition formatting as needed.
module.exports = {
  generateFHIRBundle,
  formatConditionByVersion: formatCondition,
};

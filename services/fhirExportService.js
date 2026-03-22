"use strict";

function cloneResource(resource) {
  return resource ? JSON.parse(JSON.stringify(resource)) : resource;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
  if (record.fhirPatientResource) {
    return cloneResource(record.fhirPatientResource);
  }

  const personalInfo = normalizePersonalInfo(record);
  return {
    resourceType: "Patient",
    id: record.id || undefined,
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
}

function buildConditionResource(diagnosis, index) {
  if (diagnosis && diagnosis.fhirConditionResource) {
    return cloneResource(diagnosis.fhirConditionResource);
  }

  const note = diagnosis && diagnosis.details ? [{ text: diagnosis.details }] : [];
  const bodySite = diagnosis && diagnosis.affectedArea ? [{ text: diagnosis.affectedArea }] : [];

  return {
    resourceType: "Condition",
    id: diagnosis.id || `condition-${index + 1}`,
    clinicalStatus: diagnosis.clinicalStatus
      ? { coding: [{ code: diagnosis.clinicalStatus, display: diagnosis.clinicalStatus }] }
      : undefined,
    severity: diagnosis.severity
      ? { coding: [{ code: diagnosis.severity, display: diagnosis.severity }] }
      : undefined,
    code: {
      text: diagnosis.diagnosed || "Unspecified condition",
    },
    bodySite,
    recordedDate: diagnosis.datetime || undefined,
    note,
  };
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

function generateFHIRBundle(record) {
  if (!record || typeof record !== "object") {
    throw new Error("A decrypted patient record object is required for FHIR export.");
  }

  const entries = [
    { resource: buildPatientResource(record) },
    ...asArray(record.diagnosis).map((diagnosis, index) => ({
      resource: buildConditionResource(diagnosis, index),
    })),
    ...asArray(record.treatmentPlan).map((treatment, index) => ({
      resource: buildMedicationRequestResource(treatment, index),
    })),
    ...asArray(record.allergies).map((allergy, index) => ({
      resource: buildAllergyResource(allergy, index),
    })),
    ...asArray(record.encounters).map((encounter, index) => ({
      resource: buildEncounterResource(encounter, index),
    })),
  ];

  return {
    resourceType: "Bundle",
    type: "collection",
    entry: entries.filter((entry) => entry && entry.resource),
  };
}

module.exports = {
  generateFHIRBundle,
};

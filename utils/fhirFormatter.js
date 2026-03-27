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

function formatCondition(condition, version) {
  if (version === "STU3") {
    return {
      resourceType: "Condition",
      id: condition.id,
      clinicalStatus: firstCodingCode(condition.clinicalStatus) || condition.clinicalStatus || "unknown",
      verificationStatus: "confirmed",
      severity: firstCodingCode(condition.severity) || condition.severity || "unknown",
      code: cloneResource(condition.code),
      bodySite: cloneResource(condition.bodySite),
      note: cloneResource(condition.note),
      onsetDateTime: condition.recordedDate,
    };
  }

  return {
    resourceType: "Condition",
    id: condition.id,
    clinicalStatus: cloneResource(condition.clinicalStatus),
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
          code: "confirmed",
        },
      ],
    },
    severity: cloneResource(condition.severity),
    code: cloneResource(condition.code),
    bodySite: cloneResource(condition.bodySite),
    recordedDate: condition.recordedDate,
    note: cloneResource(condition.note),
  };
}

module.exports = {
  formatCondition,
};

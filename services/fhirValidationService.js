"use strict";

const Ajv = require("ajv");

const ajv = new Ajv({ allErrors: true });

// VERY BASIC FHIR Bundle schema (you can extend later)
const bundleSchema = {
  type: "object",
  properties: {
    resourceType: { const: "Bundle" },
    entry: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          resource: {
            type: "object",
            properties: {
              resourceType: { type: "string" }
            },
            required: ["resourceType"],
            additionalProperties: true 
          }
        },
        required: ["resource"],
        additionalProperties: true
      }
    }
  },
  required: ["resourceType", "entry"],
  additionalProperties: true 
};
const validate = ajv.compile(bundleSchema);

function validateFHIRBundle(bundle) {
  const valid = validate(bundle);

  if (valid) {
    return { valid: true, issues: [] };
  }

  const issues = (validate.errors || []).map(err => {
    return `${err.instancePath || "bundle"} ${err.message}`;
  });

  return {
    valid: false,
    issues
  };
}

module.exports = {
  validateFHIRBundle
};
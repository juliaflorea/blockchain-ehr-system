"use strict";

const Ajv = require("ajv");

const ajv = new Ajv({ allErrors: true });  // create AJV validator instance


const bundleSchema = { // defines structure for validating a FHIR bundle
  type: "object",
  properties: {
    resourceType: { const: "Bundle" }, // it must be a bundle resource
    entry: {
      type: "array",
      minItems: 1, // bundle cannot be empty
      items: {
        type: "object",
        properties: {
          resource: {
            type: "object",
            properties: {
              resourceType: { type: "string" }
            },
            required: ["resourceType"],
            additionalProperties: true  // extra fields are allowed in the resource, we just need to ensure it has a resourceType
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
const validate = ajv.compile(bundleSchema); // compile the schema into a validation function

function validateFHIRBundle(bundle) {
  const valid = validate(bundle); // check if bundle follows schema

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
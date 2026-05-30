"use strict";

// this service layer abstracts terminology normalization logic from the rest of the application
const { mapToSNOMED } = require("../utils/medicalMapping"); // import the mapping function from the medicalMapping utility module

module.exports = {
  mapToSNOMED,
};


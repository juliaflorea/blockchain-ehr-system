"use strict";

// VERY SIMPLE demo mapping (you can extend)
const SNOMED_MAP = {
  "high blood sugar": {
    system: "http://snomed.info/sct",
    code: "44054006",
    display: "Diabetes mellitus type 2"
  },
  "headache": {
    system: "http://snomed.info/sct",
    code: "25064002",
    display: "Headache"
  }
};

function mapToSNOMED(text) {
  if (!text) return null;

  const key = text.toLowerCase();

  return SNOMED_MAP[key] || null;
}

module.exports = {
  mapToSNOMED
};
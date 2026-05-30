"use strict";

// import axios HTTP client for making requests to SNOMED FHIR API
const axios = require("axios");

const SNOMED_SYSTEM = "http://snomed.info/sct"; // SNOMED CT code system URI
// SNOMED URL 
const SNOMED_FHIR_BASE_URL = process.env.SNOMED_FHIR_BASE_URL || "https://snowstorm-training.snomedtools.org/fhir";
// max request wait time
const SNOMED_LOOKUP_TIMEOUT_MS = Number(process.env.SNOMED_LOOKUP_TIMEOUT_MS || 5000);
// restricts search to clinical findings hierarchy in SNOMED CT (ECL expression for all descendants of "Clinical finding" concept)
const CLINICAL_FINDING_VALUESET = "http://snomed.info/sct?fhir_vs=ecl/<<404684003";
const lookupCache = new Map();

// Fallback mapping for common medical terms to SNOMED codes when API lookup fails or returns no results
const SNOMED_FALLBACK_MAP = {
  enterocolitis: {
    system: SNOMED_SYSTEM,
    code: "111854005",
    display: "Enterocolitis",
  },
  "streptococcal pharyngitis": {
    system: SNOMED_SYSTEM,
    code: "195662009",
    display: "Acute streptococcal pharyngitis",
  },
  hypertension: {
    system: SNOMED_SYSTEM,
    code: "38341003",
    display: "Hypertensive disorder",
  },
  "high blood sugar": {
    system: SNOMED_SYSTEM,
    code: "44054006",
    display: "Diabetes mellitus type 2",
  },
  headache: {
    system: SNOMED_SYSTEM,
    code: "25064002",
    display: "Headache",
  },
};

// cleans search input
function normalizeSearchText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

// uses predefined mappings
function mapToSNOMEDFallback(text) {
  if (!text) return [];

  const normalized = normalizeSearchText(text).toLowerCase();
  const mapped = SNOMED_FALLBACK_MAP[normalized];

  return mapped ? [mapped] : [];
}

// function to query the SNOMED server
async function searchSNOMEDConcepts(text, options = {}) {
  // normalize input
  const term = normalizeSearchText(text);
  if (!term) return [];

  // limit results to 3
  const limit = Number(options.limit || 3);
  const cacheKey = `${term.toLowerCase()}|${limit}`;
  // check if search is already cached
  if (lookupCache.has(cacheKey)) {
    return lookupCache.get(cacheKey);
  }
// create request URL for SNOMED FHIR API $expand operation on the clinical findings ValueSet, with search term as filter and specified result limit
  const url = `${SNOMED_FHIR_BASE_URL.replace(/\/$/, "")}/ValueSet/$expand`;
  // query server
  const response = await axios.get(url, {
    params: {
      url: CLINICAL_FINDING_VALUESET,
      filter: term, // search term entered by user
      count: limit,
      _format: "json",
    },
    timeout: SNOMED_LOOKUP_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
    },
  });

// extracts the response which should contain an expansion object with a contains array of matching concepts
  const items = Array.isArray(response.data?.expansion?.contains)
    ? response.data.expansion.contains
    : [];
    // maps concepts to FHIR coding format
  const codings = items
    .map((item) => ({
      system: item.system || SNOMED_SYSTEM,
      code: item.code,
      display: item.display || item.code,
    }))
    .filter((coding) => coding.code);
  lookupCache.set(cacheKey, codings); // cache results
  return codings;
}

// function to map free text to SNOMED codes, first trying the API and falling back to the predefined list
async function mapToSNOMED(text, options = {}) {
  if (!text) return [];

  try {
    // first attempt to find matches via SNOMED FHIR API
    const codings = await searchSNOMEDConcepts(text, options);
    if (codings.length > 0) return codings;
  } catch (error) {
    console.warn(`SNOMED lookup failed for "${text}":`, error.message);
  }
// if API fails, use fallback maping
  return mapToSNOMEDFallback(text);
}

module.exports = {
  mapToSNOMED,
  mapToSNOMEDFallback,
  SNOMED_FALLBACK_MAP,
  SNOMED_SYSTEM,
};

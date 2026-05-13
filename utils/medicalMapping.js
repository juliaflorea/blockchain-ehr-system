"use strict";

const axios = require("axios");

const SNOMED_SYSTEM = "http://snomed.info/sct";
const SNOMED_FHIR_BASE_URL = process.env.SNOMED_FHIR_BASE_URL || "https://snowstorm-training.snomedtools.org/fhir";
const SNOMED_LOOKUP_TIMEOUT_MS = Number(process.env.SNOMED_LOOKUP_TIMEOUT_MS || 5000);
const CLINICAL_FINDING_VALUESET = "http://snomed.info/sct?fhir_vs=ecl/<<404684003";
const lookupCache = new Map();

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

function normalizeSearchText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function mapToSNOMEDFallback(text) {
  if (!text) return [];

  const normalized = normalizeSearchText(text).toLowerCase();
  const mapped = SNOMED_FALLBACK_MAP[normalized];

  return mapped ? [mapped] : [];
}

async function searchSNOMEDConcepts(text, options = {}) {
  const term = normalizeSearchText(text);
  if (!term) return [];

  const limit = Number(options.limit || 3);
  const cacheKey = `${term.toLowerCase()}|${limit}`;
  if (lookupCache.has(cacheKey)) {
    return lookupCache.get(cacheKey);
  }

  const url = `${SNOMED_FHIR_BASE_URL.replace(/\/$/, "")}/ValueSet/$expand`;
  const response = await axios.get(url, {
    params: {
      url: CLINICAL_FINDING_VALUESET,
      filter: term,
      count: limit,
      _format: "json",
    },
    timeout: SNOMED_LOOKUP_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
    },
  });

  const items = Array.isArray(response.data?.expansion?.contains)
    ? response.data.expansion.contains
    : [];
  const codings = items
    .map((item) => ({
      system: item.system || SNOMED_SYSTEM,
      code: item.code,
      display: item.display || item.code,
    }))
    .filter((coding) => coding.code);
  lookupCache.set(cacheKey, codings);
  return codings;
}

async function mapToSNOMED(text, options = {}) {
  if (!text) return [];

  try {
    const codings = await searchSNOMEDConcepts(text, options);
    if (codings.length > 0) return codings;
  } catch (error) {
    console.warn(`SNOMED lookup failed for "${text}":`, error.message);
  }

  return mapToSNOMEDFallback(text);
}

module.exports = {
  mapToSNOMED,
  mapToSNOMEDFallback,
  SNOMED_FALLBACK_MAP,
  SNOMED_SYSTEM,
};

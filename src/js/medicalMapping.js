(function attachMedicalMapping(globalScope) {
  const SNOMED_FALLBACK_MAP = {
    enterocolitis: {
      system: "http://snomed.info/sct",
      code: "111854005",
      display: "Enterocolitis",
    },
    "streptococcal pharyngitis": {
      system: "http://snomed.info/sct",
      code: "195662009",
      display: "Acute streptococcal pharyngitis",
    },
    hypertension: {
      system: "http://snomed.info/sct",
      code: "38341003",
      display: "Hypertensive disorder",
    },
    "high blood sugar": {
      system: "http://snomed.info/sct",
      code: "44054006",
      display: "Diabetes mellitus type 2",
    },
    headache: {
      system: "http://snomed.info/sct",
      code: "25064002",
      display: "Headache",
    },
  };

  function getApiBaseUrl() {
    return "http://localhost:3000";
  }

  function mapToSNOMEDFallback(text) {
    if (!text) return [];

    const normalized = String(text).trim().toLowerCase();
    const mapped = SNOMED_FALLBACK_MAP[normalized];

    return mapped ? [mapped] : [];
  }

  async function mapToSNOMED(text, options = {}) {
    if (!text) return [];

    try {
      const params = new URLSearchParams({
        term: String(text).trim(),
        limit: String(options.limit || 3),
      });
      const response = await fetch(`${getApiBaseUrl()}/api/snomed/search?${params.toString()}`);
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.coding) && payload.coding.length > 0) {
          return payload.coding;
        }
      }
    } catch (err) {
      console.warn("SNOMED lookup unavailable, using local fallback:", err.message);
    }

    return mapToSNOMEDFallback(text);
  }

  globalScope.mapToSNOMED = mapToSNOMED;
  globalScope.mapToSNOMEDFallback = mapToSNOMEDFallback;
})(window);

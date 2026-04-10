(function attachMedicalMapping(globalScope) {
  const SNOMED_MAP = {
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

  function mapToSNOMED(text) {
    if (!text) return [];

    const normalized = String(text).trim().toLowerCase();
    const mapped = SNOMED_MAP[normalized];

    return mapped ? [mapped] : [];
  }

  globalScope.mapToSNOMED = mapToSNOMED;
})(window);

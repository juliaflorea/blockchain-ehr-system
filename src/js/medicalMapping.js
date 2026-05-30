// Browser wrapper for the backend SNOMED mapping endpoint.
// sends a medical term to the backend, which performs the SNOMED lookup and returns results.
(function attachMedicalMapping(globalScope) {
  async function mapToSNOMED(text, options = {}) {
    // convert input into text
    const term = String(text || "").trim();
    if (!term) return [];

    try {
      // Call the backend API to perform SNOMED lookup
      const params = new URLSearchParams({
        term,
        limit: String(options.limit || 3), // controls number of SNOMED matches returned
      });
      // send request to backend API endpoint with the search term and limit as query parameters
      const response = await fetch(`/api/snomed/search?${params.toString()}`);
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.coding) && payload.coding.length > 0) {
          return payload.coding; // return coding
        }
      }
    } catch (err) {
      console.warn("SNOMED lookup unavailable:", err.message);
    }

    return [];
  }

  globalScope.mapToSNOMED = mapToSNOMED;
})(window);

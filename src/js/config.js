// config.js
(async function() {
  try {
    // Load UserRegistry contract
    const userRegistryResponse = await fetch("../../build/contracts/UserRegistry.json");
    const userRegistryData = await userRegistryResponse.json();

    // Load AccessControl contract
    const accessControlResponse = await fetch("../../build/contracts/AccessControl.json");
    const accessControlData = await accessControlResponse.json();

    // Store contracts globally
    window.contracts = {
      UserRegistry: {
        abi: userRegistryData.abi,
        networks: userRegistryData.networks
      },
      AccessControl: {
        abi: accessControlData.abi,
        networks: accessControlData.networks
      }
    };

    console.log("Contracts loaded:", Object.keys(window.contracts));
  } catch (err) {
    console.error("Error loading contract JSONs:", err);
  }
})();

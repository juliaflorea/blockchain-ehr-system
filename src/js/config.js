// config.js
window.loadContracts = (async function () {
  try {
    const responses = await Promise.all([
      fetch("../../build/contracts/UserRegistry.json"),
      fetch("../../build/contracts/AccessControl.json"),
      fetch("../../build/contracts/MedicalDataRegistry.json"),
      fetch("../../build/contracts/AppointmentManager.json"),
      fetch("../../build/contracts/DiagnosisAndTreatment.json")
    ]);

    const data = await Promise.all(responses.map(r => r.json()));

    window.contracts = {
      UserRegistry: { abi: data[0].abi, networks: data[0].networks },
      AccessControl: { abi: data[1].abi, networks: data[1].networks },
      MedicalDataRegistry: { abi: data[2].abi, networks: data[2].networks },
      AppointmentManager: { abi: data[3].abi, networks: data[3].networks },
      DiagnosisAndTreatment: { abi: data[4].abi, networks: data[4].networks }
    };

    console.log("Contracts loaded:", Object.keys(window.contracts));
  } catch (err) {
    console.error("Error loading contract JSONs:", err);
  }
})();

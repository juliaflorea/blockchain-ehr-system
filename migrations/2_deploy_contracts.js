const MedicalRecords = artifacts.require("MedicalRecords");
const UserRegistry = artifacts.require("UserRegistry");
const AccessControl = artifacts.require("AccessControl");
const MedicalDataRegistry = artifacts.require("MedicalDataRegistry");
const AppointmentManager = artifacts.require("AppointmentManager");
const DiagnosisAndTreatment = artifacts.require("DiagnosisAndTreatment"); 


module.exports = function (deployer) {
  deployer.deploy(MedicalRecords);
  deployer.deploy(UserRegistry);
  deployer.deploy(AccessControl);
  deployer.deploy(MedicalDataRegistry);
  deployer.deploy(AppointmentManager);
  deployer.deploy(
    DiagnosisAndTreatment,
    AppointmentManager.address,
    MedicalDataRegistry.address
  );
  
};

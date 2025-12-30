const UserRegistry = artifacts.require("UserRegistry");
const MedicalDataRegistry = artifacts.require("MedicalDataRegistry");
const AccessControl = artifacts.require("AccessControl");
const AppointmentManager = artifacts.require("AppointmentManager");
const DiagnosisAndTreatment = artifacts.require("DiagnosisAndTreatment");

module.exports = async function (deployer) {
  // 1. Deploy UserRegistry FIRST (no args)
  await deployer.deploy(UserRegistry);
  const userRegistry = await UserRegistry.deployed();

  // 2. Deploy MedicalDataRegistry with UserRegistry address
  await deployer.deploy(MedicalDataRegistry, userRegistry.address);
  const medicalDataRegistry = await MedicalDataRegistry.deployed();

  // 3. Link them
  await userRegistry.setMedicalDataRegistry(medicalDataRegistry.address);

  // 4. Deploy AccessControl and store in variable
  await deployer.deploy(AccessControl, userRegistry.address);
  const accessControl = await AccessControl.deployed();

  // 5. Deploy AppointmentManager and store in variable
  await deployer.deploy(AppointmentManager, userRegistry.address);
  const appointmentManager = await AppointmentManager.deployed();

  // 6. Deploy DiagnosisAndTreatment with all 3 addresses
  await deployer.deploy(
    DiagnosisAndTreatment,
    appointmentManager.address,
    medicalDataRegistry.address,
    accessControl.address
  );
};

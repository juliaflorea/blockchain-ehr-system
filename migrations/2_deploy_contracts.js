const MedicalRecords = artifacts.require("MedicalRecords");
const UserRegistry = artifacts.require("UserRegistry");
const AccessControl = artifacts.require("AccessControl");
const MedicalDataRegistry = artifacts.require("MedicalDataRegistry")

module.exports = function (deployer) {
  deployer.deploy(MedicalRecords);
  deployer.deploy(UserRegistry);
  deployer.deploy(AccessControl);
  deployer.deploy(MedicalDataRegistry);
};

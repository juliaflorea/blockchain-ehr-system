const MedicalRecords = artifacts.require("MedicalRecords");
const UserRegistry = artifacts.require("UserRegistry");
const AccessControl = artifacts.require("AccessControl");

module.exports = function (deployer) {
  deployer.deploy(MedicalRecords);
  deployer.deploy(UserRegistry);
  deployer.deploy(AccessControl);
};

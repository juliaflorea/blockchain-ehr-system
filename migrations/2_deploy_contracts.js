const MedicalRecords = artifacts.require("MedicalRecords");
const UserRegistry = artifacts.require("UserRegistry");

module.exports = function (deployer) {
  deployer.deploy(MedicalRecords);
  deployer.deploy(UserRegistry);
};

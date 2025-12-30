// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./UserRegistry.sol";

contract MedicalDataRegistry {

    UserRegistry userRegistry;

    // ===== Events =====
    event RecordUpdated(address indexed user, string ipfsHash, uint256 timestamp);

    constructor(address _userRegistry) public {
        userRegistry = UserRegistry(_userRegistry);
    }

    mapping(address => string) private medicalRecords;
    mapping(address => bool) public trustedWriters;



    // ===== Functions =====

    // Sets or updates the IPFS hash for a user's medical record
   
   function setHash(address userAddr, string memory ipfsHash) public {
    require(
    msg.sender == userAddr ||
    msg.sender == address(userRegistry) ||
    trustedWriters[msg.sender] ||
    isAuthorizedDoctorForPatient(userAddr, msg.sender) ||
    isAuthorizedProxyForPatient(userAddr, msg.sender),
    "Not authorized to update record"
);


    require(userRegistry.userExists(userAddr), "User not found");

    medicalRecords[userAddr] = ipfsHash;

    // 🔁 sync BACK to UserRegistry
    userRegistry.updateLocalRecord(userAddr, ipfsHash);

    emit RecordUpdated(userAddr, ipfsHash, block.timestamp);
}

    // Gets the IPFS hash of a user's medical record
    function getHash(address userAddr) public view returns (string memory) {
      require(
    msg.sender == userAddr ||
    isAuthorizedDoctorForPatient(userAddr, msg.sender) ||
    isAuthorizedProxyForPatient(userAddr, msg.sender),
    "Not authorized to read record"
);
       return medicalRecords[userAddr];
    }

    // ===== Internal helper functions =====

    function isAuthorizedDoctorForPatient(address patientAddr, address doctorAddr) internal view returns (bool) {
        address[] memory doctors = userRegistry.getDoctorAccessList(patientAddr);
        for (uint i = 0; i < doctors.length; i++) {
            if (doctors[i] == doctorAddr) {
                return true;
            }
        }
        return false;
    }

    function isAuthorizedProxyForPatient(address patientAddr, address proxyAddr) internal view returns (bool) {
        UserRegistry.Patient memory p = userRegistry.getPatient(patientAddr);

        if (!p.hasDesignatedProxy) {
            return false;
        }

        if (p.proxyAddress != proxyAddr) {
            return false;
        }

        UserRegistry.Proxy memory prx = userRegistry.getProxy(proxyAddr);
        return prx.isAuthorized;
        }

    function setTrustedWriter(address writer, bool allowed) external {
    trustedWriters[writer] = allowed;
}

}

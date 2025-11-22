// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./AccessControl.sol";

contract MedicalDataRegistry is AccessControl {

    // ===== Events =====
    event RecordUpdated(address indexed user, string ipfsHash, uint256 timestamp);

    // ===== Functions =====

    // Sets or updates the IPFS hash for a user's medical record
    function setHash(address userAddr, string memory ipfsHash) public {
        // Only the user itself or an authorized proxy or doctor can update
        require(
            msg.sender == userAddr || 
            isAuthorizedDoctorForPatient(userAddr, msg.sender) || 
            isAuthorizedProxyForPatient(userAddr, msg.sender),
            "Caller not authorized to update this record"
        );

        // Update the record hash in the corresponding struct
        if (bytes(patientInfo[userAddr].firstName).length != 0) {
            patientInfo[userAddr].record = ipfsHash;
        } else if (bytes(doctorInfo[userAddr].firstName).length != 0) {
            doctorInfo[userAddr].record = ipfsHash;
        } else if (bytes(proxies[userAddr].firstName).length != 0) {
            proxies[userAddr].record = ipfsHash;
        } else {
            revert("User not found");
        }

        emit RecordUpdated(userAddr, ipfsHash, now);
    }

    // Gets the IPFS hash of a user's medical record
    function getHash(address userAddr) public view returns (string memory) {
        if (bytes(patientInfo[userAddr].firstName).length != 0) {
            return patientInfo[userAddr].record;
        } else if (bytes(doctorInfo[userAddr].firstName).length != 0) {
            return doctorInfo[userAddr].record;
        } else if (bytes(proxies[userAddr].firstName).length != 0) {
            return proxies[userAddr].record;
        } else {
            revert("User not found");
        }
    }

    // ===== Internal helper functions =====

    function isAuthorizedDoctorForPatient(address patientAddr, address doctorAddr) internal view returns (bool) {
        address[] memory doctors = getAccessedDoctorListForPatient(patientAddr);
        for (uint i = 0; i < doctors.length; i++) {
            if (doctors[i] == doctorAddr) {
                return true;
            }
        }
        return false;
    }

    function isAuthorizedProxyForPatient(address patientAddr, address proxyAddr) internal view returns (bool) {
        address[] memory proxiesList = getAccessedProxyListForPatient(patientAddr);
        for (uint i = 0; i < proxiesList.length; i++) {
            if (proxiesList[i] == proxyAddr) {
                return true;
            }
        }
        return false;
    }
}

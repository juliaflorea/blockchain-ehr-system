// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./UserRegistry.sol";

contract MedicalDataRegistry {

    UserRegistry userRegistry;

    address public owner;
    

    // ===== Events =====
    event RecordUpdated(address indexed user, string ipfsHash, uint256 timestamp);
    event EncryptedAESKeySet(address indexed patient, address indexed accessor);

    constructor(address _userRegistry) public {
        userRegistry = UserRegistry(_userRegistry);
        owner = msg.sender;
    }

    mapping(address => string) private medicalRecords;
    mapping(address => bool) public trustedWriters;

    // wrapped Record Master Key (AES-GCM, password-derived key)
    mapping(address => mapping(address => string)) private encryptedAESKeys;

     

    // ===== Functions =====

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

        // Sync back to UserRegistry
        userRegistry.updateLocalRecord(userAddr, ipfsHash);

        emit RecordUpdated(userAddr, ipfsHash, block.timestamp);
    }

    function getHash(address userAddr) public view returns (string memory) {
        require(
            msg.sender == userAddr ||
            isAuthorizedDoctorForPatient(userAddr, msg.sender) ||
            isAuthorizedProxyForPatient(userAddr, msg.sender),
            "Not authorized to read record"
        );
        return medicalRecords[userAddr];
    }

    function setTrustedWriter(address writer, bool allowed) external {
    require(msg.sender == owner, "Only owner");
    trustedWriters[writer] = allowed;
}
    // ===== AES Key functions =====
    function setEncryptedAESKey(
    address patientAddr,
    address accessorAddr,
    string calldata encryptedKey
) external {

    require(
        msg.sender == patientAddr ||
        isAuthorizedProxyForPatient(patientAddr, msg.sender),
        "Not authorized to set encrypted key"
    );

    require(
        userRegistry.userExists(accessorAddr),
        "Accessor not registered"
    );

    encryptedAESKeys[patientAddr][accessorAddr] = encryptedKey;

    emit EncryptedAESKeySet(patientAddr, accessorAddr);
}


    function getEncryptedAESKey(address patientAddr) external view returns (string memory) {
        string memory key = encryptedAESKeys[patientAddr][msg.sender];
        require(bytes(key).length != 0, "No encrypted key for caller");
        return key;
    }

    // ===== Internal helpers =====
    function isAuthorizedDoctorForPatient(address patientAddr, address doctorAddr) internal view returns (bool) {
        address[] memory doctors = userRegistry.getDoctorAccessList(patientAddr);
        for (uint i = 0; i < doctors.length; i++) {
            if (doctors[i] == doctorAddr) return true;
        }
        return false;
    }

    function isAuthorizedProxyForPatient(address patientAddr, address proxyAddr) internal view returns (bool) {
        UserRegistry.Patient memory p = userRegistry.getPatient(patientAddr);
        if (!p.hasDesignatedProxy) return false;
        if (p.proxyAddress != proxyAddr) return false;
        UserRegistry.Proxy memory prx = userRegistry.getProxy(proxyAddr);
        return prx.isAuthorized;
    }

    function isPendingTokenProxy(address patientAddr, address proxyAddr)
    internal
    view
    returns (bool)
{
    address expectedProxy = userRegistry.getPatient(patientAddr).proxyAddress;

    if (expectedProxy != proxyAddr) return false;

    UserRegistry.Proxy memory prx =
        userRegistry.getProxy(proxyAddr);

    return prx.accessGrantedViaToken;
}


}

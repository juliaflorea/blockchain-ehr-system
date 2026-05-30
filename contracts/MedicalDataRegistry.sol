// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./UserRegistry.sol";

contract MedicalDataRegistry {

    UserRegistry userRegistry;

    address public owner; // contract administrator address
    

    // ===== Events =====
    event RecordUpdated(address indexed user, string ipfsHash, uint256 timestamp);
    event EncryptedAESKeySet(address indexed patient, address indexed accessor);

    constructor(address _userRegistry) public {
        userRegistry = UserRegistry(_userRegistry);
        owner = msg.sender; // person deploying contract becomes owner
    }

    mapping(address => string) private medicalRecords; // maps a patient address to the IPFS hash
    mapping(address => bool) public trustedWriters;  // stores special authorized system components because contracts might need to update records automatically

    // wrapped Record Master Key (AES-GCM, password-derived key)
    mapping(address => mapping(address => string)) private encryptedAESKeys; // maps a patient to an authorized accessor and an encrypted AES key
    // Recovery wrapped RMK (patient only)
    mapping(address => string) private recoveryEncryptedAESKeys;  


     

    // ===== Functions =====

// function to update medical record reference
    function setHash(address userAddr, string memory ipfsHash) public {
        require(
            msg.sender == userAddr ||
            msg.sender == address(userRegistry) || // either patient or user registry contract can update
            trustedWriters[msg.sender] || // or trusted system components
            isAuthorizedDoctorForPatient(userAddr, msg.sender) || // or authorized doctors or proxies
            isAuthorizedProxyForPatient(userAddr, msg.sender),
            "Not authorized to update record"
        );

        require(userRegistry.userExists(userAddr), "User not found");

        medicalRecords[userAddr] = ipfsHash;  // store new IPFS hash

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
    require(msg.sender == owner, "Only owner");  // only contract owner can approve trusted writers
    trustedWriters[writer] = allowed;
}
    // ===== AES Key functions =====
    // function to store encrypteed AES key for accessor
    function setEncryptedAESKey(
    address patientAddr,
    address accessorAddr,
    string calldata encryptedKey // more gas efficient than memory for external inputs 
) external {

    require(
        msg.sender == patientAddr ||
        isAuthorizedProxyForPatient(patientAddr, msg.sender), // patient or proxy can set keys
        "Not authorized to set encrypted key"
    );

    require(
    accessorAddr == patientAddr ||
    userRegistry.userExists(accessorAddr),
    "Accessor not registered"
);


    encryptedAESKeys[patientAddr][accessorAddr] = encryptedKey;  // store accessor specific encrypted key; each accessor receives different encrypted AES key wrapper

    emit EncryptedAESKeySet(patientAddr, accessorAddr);
}


    function getEncryptedAESKey(address patientAddr) external view returns (string memory) {
        string memory key = encryptedAESKeys[patientAddr][msg.sender]; // accessor retreives their key
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
    address expectedProxy = userRegistry.getPatient(patientAddr).proxyAddress; // get proxy

    if (expectedProxy != proxyAddr) return false;

    UserRegistry.Proxy memory prx =
        userRegistry.getProxy(proxyAddr);

    return prx.accessGrantedViaToken;
}

function setRecoveryEncryptedAESKey(
    address patientAddr,
    string calldata encryptedKey
) external {

    require(
        msg.sender == patientAddr,
        "Only patient can set recovery key"
    );

    require(
        userRegistry.userExists(patientAddr),
        "Patient not registered"
    );

    recoveryEncryptedAESKeys[patientAddr] = encryptedKey;
}

function getRecoveryEncryptedAESKey(address patientAddr)
    external
    view
    returns (string memory)
{
    require(
        msg.sender == patientAddr,
        "Only patient can access recovery key"
    );

    string memory key = recoveryEncryptedAESKeys[patientAddr];

    require(bytes(key).length != 0, "No recovery key set");

    return key;
}



}

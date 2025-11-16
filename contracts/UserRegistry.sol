// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

contract UserRegistry {
    // ===== Structs =====
    struct Patient {
        string firstName;
        string lastName;
        uint age;
        address[] doctorAccessList;
        address[] proxyAccessList;
        uint[] diagnosis;
        string record;
        address proxyAddress;
        bool hasDesignatedProxy;
    }

    struct Doctor {
        string firstName;
        string lastName;
        uint age;
        address[] patientAccessList;
        string record;
        string licenseNumber;
    }

    struct Proxy {
        string firstName;
        string lastName;
        uint age;
        address patientAddress;
        address[] patientAccessList;
        string record;
        string token;
        bool accessGrantedViaToken;
        bool isAuthorized;
        bool poa;
    }

    // ===== Storage =====
    address[] public patientList;
    address[] public doctorList;
    address[] public proxyList;

    mapping(address => Patient) public patientInfo;
    mapping(address => Doctor) public doctorInfo;
    mapping(address => Proxy) public proxies;

    mapping(string => bool) private registeredLicenses;
    mapping(string => address) private tokenToPatient;
    mapping(address => string) private patientToToken;
    mapping(address => bytes32) private proxyDetailsHash;

    // ===== Events =====
    event PatientRegistered(address patient);
    event DoctorRegistered(address doctor);
    event ProxyRegistered(address proxy, address patient);

    // ===== Functions =====

    function addPatient(
    string memory firstName,
    string memory lastName,
    uint age,
    string memory recordHash
) public {
    require(bytes(patientInfo[msg.sender].firstName).length == 0, "Patient already registered");

    address[] memory emptyAddressArray;
    uint[] memory emptyUintArray;

    Patient memory p = Patient({
        firstName: firstName,
        lastName: lastName,
        age: age,
        doctorAccessList: emptyAddressArray,
        proxyAccessList: emptyAddressArray,
        diagnosis: emptyUintArray,
        record: recordHash,
        proxyAddress: address(0),
        hasDesignatedProxy: false
    });

    patientInfo[msg.sender] = p;
    patientList.push(msg.sender);
    emit PatientRegistered(msg.sender);
}

function addDoctor(
    string memory firstName,
    string memory lastName,
    uint age,
    string memory recordHash,
    string memory licenseNumber
) public {
    require(!registeredLicenses[licenseNumber], "License already registered");
    require(bytes(doctorInfo[msg.sender].firstName).length == 0, "Doctor already registered");

    address[] memory emptyAddressArray;

    Doctor memory d = Doctor({
        firstName: firstName,
        lastName: lastName,
        age: age,
        patientAccessList: emptyAddressArray,
        record: recordHash,
        licenseNumber: licenseNumber
    });

    doctorInfo[msg.sender] = d;
    doctorList.push(msg.sender);
    registeredLicenses[licenseNumber] = true;
    emit DoctorRegistered(msg.sender);
}

function addProxy(
    string memory firstName,
    string memory lastName,
    uint age,
    string memory recordHash,
    bool isToken,
    string memory tokenOrPOAHash,
    address patientEthereumAddress
) public {
    address patientAddr;
    if (isToken) {
        patientAddr = tokenToPatient[tokenOrPOAHash];
        require(patientAddr != address(0), "Invalid token");
    } else {
        patientAddr = patientEthereumAddress;
        require(patientAddr != address(0), "Invalid patient address");
    }

    require(bytes(patientInfo[patientAddr].firstName).length != 0, "Patient not found");

    // Link proxy to patient
    patientInfo[patientAddr].proxyAddress = msg.sender;
    patientInfo[patientAddr].hasDesignatedProxy = true;

    address[] memory emptyAddressArray;

    Proxy memory prx = Proxy({
        firstName: firstName,
        lastName: lastName,
        age: age,
        patientAddress: patientAddr,
        patientAccessList: emptyAddressArray,
        record: recordHash,
        token: isToken ? tokenOrPOAHash : "",
        accessGrantedViaToken: isToken,
        isAuthorized: true,
        poa: !isToken
    });

    proxies[msg.sender] = prx;
    proxyList.push(msg.sender);
    emit ProxyRegistered(msg.sender, patientAddr);
}

    // ===== Getters =====
    function getPatient(address addr) public view returns (Patient memory) {
        return patientInfo[addr];
    }

    function getDoctor(address addr) public view returns (Doctor memory) {
        return doctorInfo[addr];
    }

    function getProxy(address addr) public view returns (Proxy memory) {
        return proxies[addr];
    }

    function isLicenseRegistered(string memory licenseNumber) public view returns (bool) {
        return registeredLicenses[licenseNumber];
    }

    function getTokenToPatient(string memory token) public view returns (address) {
        return tokenToPatient[token];
    }

    function getProxyDetailsHash(address patientAddress) public view returns (bytes32) {
        return proxyDetailsHash[patientAddress];
    }

    // ===== Additional utility functions =====
    function getPatientList() public view returns (address[] memory) {
        return patientList;
    }

    function getDoctorList() public view returns (address[] memory) {
        return doctorList;
    }

    function getProxyList() public view returns (address[] memory) {
        return proxyList;
    }

   
}

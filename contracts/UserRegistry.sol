// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./MedicalDataRegistry.sol";

contract UserRegistry {

     MedicalDataRegistry public medicalDataRegistry;

 address public owner;

constructor() public {
    owner = msg.sender;
}

modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
}

function setMedicalDataRegistry(address _medicalDataRegistry) external onlyOwner {
    require(address(medicalDataRegistry) == address(0), "Already set");
    medicalDataRegistry = MedicalDataRegistry(_medicalDataRegistry);
}


    // ===== Structs =====
    struct Patient {
        string firstName;
        string lastName;
        uint age;
        address[] doctorAccessList;
        address[] proxyAccessList;
        uint[] diagnosis;
        // Cached IPFS hash (authoritative value in MedicalDataRegistry)
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
    event ProxyDesignated(address indexed patient, string token);

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
    medicalDataRegistry.setHash(msg.sender, recordHash);
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
    medicalDataRegistry.setHash(msg.sender, recordHash);
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
    medicalDataRegistry.setHash(msg.sender, recordHash);
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

    function addPatientToDoctor(address doctorAddr, address patientAddr) external {
    doctorInfo[doctorAddr].patientAccessList.push(patientAddr);
}

    function addDoctorToPatient(address patientAddr, address doctorAddr) external {
    patientInfo[patientAddr].doctorAccessList.push(doctorAddr);
}

    function removePatientFromDoctor(address doctorAddr, address patientAddr) external {
    address[] storage list = doctorInfo[doctorAddr].patientAccessList;
    for (uint i = 0; i < list.length; i++) {
        if (list[i] == patientAddr) {
            list[i] = list[list.length - 1];
            list.pop();
            return;
        }
    }
}

    function removeDoctorFromPatient(address patientAddr, address doctorAddr) external {
    address[] storage list = patientInfo[patientAddr].doctorAccessList;
    for (uint i = 0; i < list.length; i++) {
        if (list[i] == doctorAddr) {
            list[i] = list[list.length - 1];
            list.pop();
            return;
        }
    }
}

    function revokeProxyAccess(address proxyAddr, address patientAddr) external {
    proxies[proxyAddr].isAuthorized = false;
    patientInfo[patientAddr].hasDesignatedProxy = false;
    patientInfo[patientAddr].proxyAddress = address(0);

    // Optionally clear proxy's patientAccessList if needed
    delete proxies[proxyAddr].patientAccessList;
}
 
    function regrantProxy(address proxyAddr, address patientAddr) external {
    proxies[proxyAddr].isAuthorized = true;
    patientInfo[patientAddr].proxyAddress = proxyAddr;
    patientInfo[patientAddr].hasDesignatedProxy = true;
}

    function getDoctorAccessList(address patientAddr) public view returns (address[] memory) {
    return patientInfo[patientAddr].doctorAccessList;
}

    function getPatientAccessList(address doctorAddr) public view returns (address[] memory) {
    return doctorInfo[doctorAddr].patientAccessList;
}

    function getProxyPatient(address proxyAddr) public view returns (address) {
    return proxies[proxyAddr].patientAddress;
}

    function userExists(address userAddr) public view returns (bool) {
        if (bytes(patientInfo[userAddr].firstName).length != 0) {
            return true;
        }
        if (bytes(doctorInfo[userAddr].firstName).length != 0) {
            return true;
        }
        if (bytes(proxies[userAddr].firstName).length != 0) {
            return true;
        }
        return false;
}


    function designateProxy(string memory token, bytes32 detailsHash) public {
        
        require(bytes(patientInfo[msg.sender].firstName).length != 0, "Only patients can designate proxy");

        Patient storage p = patientInfo[msg.sender];

    // patient can only have one proxy
        require(!p.hasDesignatedProxy, "Proxy already designated");

    // token must be unused
        require(tokenToPatient[token] == address(0), "Token already used");

    // store proxy invitation metadata
        proxyDetailsHash[msg.sender] = detailsHash;

    // link token ↔ patient
        patientToToken[msg.sender] = token;
        tokenToPatient[token] = msg.sender;

    // mark patient as having designated a proxy
        p.hasDesignatedProxy = true;

        emit ProxyDesignated(msg.sender, token);
}

    function updateLocalRecord(address userAddr, string calldata newHash) external {
        require(
        msg.sender == address(medicalDataRegistry),
        "Only MedicalDataRegistry can sync records"
    );

        if (bytes(patientInfo[userAddr].firstName).length != 0) {
            patientInfo[userAddr].record = newHash;
        } 
        else if (bytes(doctorInfo[userAddr].firstName).length != 0) {
         doctorInfo[userAddr].record = newHash;
        } 
        else if (bytes(proxies[userAddr].firstName).length != 0) {
            proxies[userAddr].record = newHash;
        }
    }


}

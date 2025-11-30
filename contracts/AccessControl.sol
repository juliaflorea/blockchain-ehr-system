// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./UserRegistry.sol";

contract AccessControl is UserRegistry {

    uint public creditPool;

    // ===== Events =====
    event DoctorAccessGranted(address indexed patient, address indexed doctor);
    event DoctorAccessGrantedByProxy(address indexed proxy, address indexed patient, address indexed doctor);
    event DoctorAccessRevoked(address indexed patient, address indexed doctor);
    event DoctorAccessRevokedByProxy(address indexed proxy, address indexed patient, address indexed doctor);
    event ProxyAccessRevoked(address indexed patient, address indexed proxy);
    event ProxyAccessRegranted(address indexed patient, address indexed proxy);

    // ---------------------------
    // Access granting
    // ---------------------------

    function grantDoctorAccess(address doctorAddr) public payable {
        require(msg.value == 2 ether, "Payment must be 2 ether");
        creditPool += 2;

        doctorInfo[doctorAddr].patientAccessList.push(msg.sender);
        patientInfo[msg.sender].doctorAccessList.push(doctorAddr);

        emit DoctorAccessGranted(msg.sender, doctorAddr);
    }

    function grantDoctorAccessByProxy(address doctorAddr, address patientAddr) public payable {
        require(msg.value == 2 ether, "Payment must be 2 ether");
        require(proxies[msg.sender].isAuthorized, "Proxy not authorized");
        require(patientInfo[patientAddr].proxyAddress == msg.sender, "Caller is not the proxy");

        // Prevent double granting
        for (uint i = 0; i < patientInfo[patientAddr].doctorAccessList.length; i++) {
            require(patientInfo[patientAddr].doctorAccessList[i] != doctorAddr, "Access already granted");
        }

        creditPool += 2;
        patientInfo[patientAddr].doctorAccessList.push(doctorAddr);
        doctorInfo[doctorAddr].patientAccessList.push(patientAddr);

        emit DoctorAccessGrantedByProxy(msg.sender, patientAddr, doctorAddr);
    }

    // ---------------------------
    // Access revocation helpers
    // ---------------------------

    function removeElement(address[] storage array, address addr) internal {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == addr) {
                array[i] = array[array.length - 1];
                array.pop();
                return;
            }
        }
        revert("Address not found in array");
    }

    function removePatient(address patientAddr, address doctorAddr) public {
        removeElement(doctorInfo[doctorAddr].patientAccessList, patientAddr);
        removeElement(patientInfo[patientAddr].doctorAccessList, doctorAddr);
    }

    function removeProxy(address patientAddr) internal {
        require(patientInfo[patientAddr].hasDesignatedProxy, "No designated proxy");

        address proxyAddr = patientInfo[patientAddr].proxyAddress;
        require(proxyAddr != address(0), "Invalid proxy address");

        proxies[proxyAddr].isAuthorized = false;

        // Remove patient from proxy's list
        address[] storage accessList = proxies[proxyAddr].patientAccessList;
        for (uint i = 0; i < accessList.length; i++) {
            if (accessList[i] == patientAddr) {
                accessList[i] = accessList[accessList.length - 1];
                accessList.pop();
                break;
            }
        }

        patientInfo[patientAddr].hasDesignatedProxy = false;
        patientInfo[patientAddr].proxyAddress = address(0);

        emit ProxyAccessRevoked(patientAddr, proxyAddr);
    }

    // ---------------------------
    // Getters
    // ---------------------------

    function getAccessedDoctorListForPatient(address addr) public view returns (address[] memory) {
        return patientInfo[addr].doctorAccessList;
    }

    function getAccessedPatientListForDoctor(address addr) public view returns (address[] memory) {
        return doctorInfo[addr].patientAccessList;
    }

    function getAccessedPatientListForProxy(
        address proxyAddress
    ) public view returns (address[] memory) {
        Proxy memory proxy = proxies[proxyAddress];
        address[] memory accessedPatients = new address[](1);
        accessedPatients[0] = proxy.patientAddress;
        return accessedPatients;
    }

    function getAccessedProxyListForPatient(
        address patientAddress
    ) public view returns (address[] memory) {
        address[] memory accessedProxies = new address[](1);
        accessedProxies[0] = patientInfo[patientAddress].proxyAddress;
        return accessedProxies;
    }

    function getContractBalance() public view returns (uint) {
        return address(this).balance;
    }

    // ---------------------------
    // Revoke access functions
    // ---------------------------

    function revokeDoctorAccess(address doctorAddr) public payable {
        require(address(this).balance >= 2 ether, "Insufficient contract balance for refund");

        removePatient(msg.sender, doctorAddr);
        creditPool -= 2;
        address(uint160(msg.sender)).transfer(2 ether);

        emit DoctorAccessRevoked(msg.sender, doctorAddr);
    }

    function revokeDoctorAccessByProxy(address doctorAddr, address patientAddr) public payable {
        require(proxies[msg.sender].isAuthorized, "Proxy not authorized");
        require(patientInfo[patientAddr].proxyAddress == msg.sender, "Caller is not the proxy");
        require(address(this).balance >= 2 ether, "Insufficient contract balance for refund");

        removePatient(patientAddr, doctorAddr);
        creditPool -= 2;
        address(uint160(msg.sender)).transfer(2 ether);

        emit DoctorAccessRevokedByProxy(msg.sender, patientAddr, doctorAddr);
    }

    function revokeProxyAccess() public {
        address patientAddr = msg.sender;
        require(patientInfo[patientAddr].hasDesignatedProxy, "No proxy to revoke");
        require(patientInfo[patientAddr].age >= 16, "Patient under 16 cannot revoke proxy");

        removeProxy(patientAddr);
    }

    function regrantProxyAccess(address proxyAddr) public payable {
        require(!proxies[proxyAddr].isAuthorized, "Proxy already authorized");
        require(proxies[proxyAddr].patientAddress == msg.sender, "Proxy not designated for patient");
        require(msg.value == 2 ether, "Payment must be 2 ether");

        creditPool += 2;
        proxies[proxyAddr].isAuthorized = true;
        patientInfo[msg.sender].proxyAddress = proxyAddr;
        patientInfo[msg.sender].hasDesignatedProxy = true;

        emit ProxyAccessRegranted(msg.sender, proxyAddr);
    }
}

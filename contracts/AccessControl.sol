// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./UserRegistry.sol";

contract AccessControl {

    UserRegistry userRegistry;
    uint public creditPool;

    // ===== Events =====
    event DoctorAccessGranted(address indexed patient, address indexed doctor);
    event DoctorAccessGrantedByProxy(address indexed proxy, address indexed patient, address indexed doctor);
    event DoctorAccessRevoked(address indexed patient, address indexed doctor);
    event DoctorAccessRevokedByProxy(address indexed proxy, address indexed patient, address indexed doctor);
    event ProxyAccessRevoked(address indexed patient, address indexed proxy);
    event ProxyAccessRegranted(address indexed patient, address indexed proxy);

    constructor(address _userRegistry) public {
        userRegistry = UserRegistry(_userRegistry);
    }

    // ---------------------------
    // Access granting
    // ---------------------------

    function grantDoctorAccess(address doctorAddr) public payable {
        require(msg.value == 2 ether, "Payment must be 2 ether");
        creditPool += 2;

       userRegistry.addPatientToDoctor(doctorAddr, msg.sender);
       userRegistry.addDoctorToPatient(msg.sender, doctorAddr);


        emit DoctorAccessGranted(msg.sender, doctorAddr);
    }

    function grantDoctorAccessByProxy(address doctorAddr, address patientAddr) public payable {
        require(msg.value == 2 ether, "Payment must be 2 ether");
        require(userRegistry.getProxy(msg.sender).isAuthorized, "Proxy not authorized");
        require(
    userRegistry.getProxy(msg.sender).patientAddress == patientAddr,
    "Caller is not the proxy"
);

        // Prevent double granting
        address[] memory existing = getAccessedDoctorListForPatient(patientAddr);
        for (uint i = 0; i < existing.length; i++) {
            require(existing[i] != doctorAddr, "Access already granted");
        }

        creditPool += 2;
        
        userRegistry.addDoctorToPatient(patientAddr, doctorAddr);
        userRegistry.addPatientToDoctor(doctorAddr, patientAddr);


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
        userRegistry.removePatientFromDoctor(doctorAddr, patientAddr);
        userRegistry.removeDoctorFromPatient(patientAddr, doctorAddr);

    }

    // ---------------------------
    // Getters
    // ---------------------------

    function getAccessedDoctorListForPatient(address addr) public view returns (address[] memory) {
        return userRegistry.getDoctorAccessList(addr);
    }

    function getAccessedPatientListForDoctor(address addr) public view returns (address[] memory) {
         return userRegistry.getPatientAccessList(addr);
    }

    function getAccessedPatientListForProxy(
        address proxyAddress
    ) public view returns (address[] memory) {
        UserRegistry.Proxy memory proxy = userRegistry.getProxy(proxyAddress);
        address[] memory accessedPatients = new address[](1);
        accessedPatients[0] = proxy.patientAddress;
        return accessedPatients;
    }

    function getAccessedProxyListForPatient(
        address patientAddress
    ) public view returns (address[] memory) {
        address[] memory accessedProxies = new address[](1);
        accessedProxies[0] = userRegistry.getPatient(patientAddress).proxyAddress;
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
        require(userRegistry.getProxy(msg.sender).isAuthorized, "Proxy not authorized");
        require(userRegistry.getPatient(patientAddr).proxyAddress == msg.sender, "Caller is not the proxy");
        require(address(this).balance >= 2 ether, "Insufficient contract balance for refund");

        removePatient(patientAddr, doctorAddr);
        creditPool -= 2;
        address(uint160(msg.sender)).transfer(2 ether);

        emit DoctorAccessRevokedByProxy(msg.sender, patientAddr, doctorAddr);
    }

    function revokeProxyAccess() public {
        address patientAddr = msg.sender;
        require(userRegistry.getPatient(patientAddr).hasDesignatedProxy, "No proxy to revoke");
        require(userRegistry.getPatient(patientAddr).age >= 16, "Patient under 16 cannot revoke proxy");
        address proxyAddr = userRegistry.getPatient(patientAddr).proxyAddress;

        userRegistry.revokeProxyAccess(proxyAddr, patientAddr);

        emit ProxyAccessRevoked(patientAddr, proxyAddr);

    }

    function regrantProxyAccess(address proxyAddr) public payable {
        require(!userRegistry.getProxy(proxyAddr).isAuthorized, "Proxy already authorized");
        require(userRegistry.getProxy(proxyAddr).patientAddress == msg.sender, "Proxy not designated for patient");
        require(msg.value == 2 ether, "Payment must be 2 ether");

        creditPool += 2;
        userRegistry.regrantProxy(proxyAddr, msg.sender);

        emit ProxyAccessRegranted(msg.sender, proxyAddr);
    }
}

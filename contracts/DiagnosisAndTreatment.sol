// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./AppointmentManager.sol";
import "./MedicalDataRegistry.sol";
import  "./AccessControl.sol";

contract DiagnosisAndTreatment {

    event DiagnosisSubmitted(address indexed doctor, address indexed patient, uint indexed appointmentId);
    event TreatmentPlanSubmitted(address indexed doctor, address indexed patient, uint indexed appointmentId);

    AppointmentManager appointmentManager;
    MedicalDataRegistry medicalDataRegistry;
    AccessControl accessControl;

    constructor(address _appointmentManager, address _medicalDataRegistry, address _accessControl ) public {
        appointmentManager = AppointmentManager(_appointmentManager);
        medicalDataRegistry = MedicalDataRegistry(_medicalDataRegistry);
        accessControl = AccessControl(_accessControl);
    }

   function submitDiagnosis(
    uint appointmentId,
    string memory _hash
) public {

    string memory ipfsHash;
    bool isAccepted;
    address patientAddr;
    address doctorAddr;
    uint256 date;
    uint8 hour;
    bool diagnosisSubmitted;
    bool treatmentPlanSubmitted;

    (
        ipfsHash,
        isAccepted,
        patientAddr,
        doctorAddr,
        date,
        hour,
        diagnosisSubmitted,
        treatmentPlanSubmitted
    ) = appointmentManager.getAppointment(appointmentId);

    require(isAccepted, "Appointment not accepted");
    require(!diagnosisSubmitted, "Diagnosis already submitted");
    require(doctorAddr == msg.sender, "Only assigned doctor can submit diagnosis");

    // Mark diagnosis as submitted
    appointmentManager.setDiagnosisSubmitted(appointmentId);

    // Store updated medical record hash
    medicalDataRegistry.setHash(patientAddr, _hash);

    emit DiagnosisSubmitted(msg.sender, patientAddr, appointmentId);
}


 function submitTreatmentPlan(
    uint appointmentId,
    string memory treatmentPlanIPFSHash
) public {

    // Use getAppointment for consistency
    (
        string memory ipfsHash,
        bool isAccepted,
        address patientAddr,
        address doctorAddr,
        uint256 date,
        uint8 hour,
        bool diagnosisSubmitted,
        bool treatmentPlanSubmitted
    ) = appointmentManager.getAppointment(appointmentId);

    require(isAccepted, "Appointment not accepted");
    require(diagnosisSubmitted, "Diagnosis not submitted yet");
    require(!treatmentPlanSubmitted, "Treatment plan already submitted");
    require(doctorAddr == msg.sender, "Only assigned doctor can submit treatment");

    // Mark treatment plan as submitted
    appointmentManager.setTreatmentPlanSubmitted(appointmentId);

    // Store treatment plan hash
    medicalDataRegistry.setHash(patientAddr, treatmentPlanIPFSHash);

    // Revoke doctor access automatically
    accessControl.removePatient(patientAddr, doctorAddr);

    emit TreatmentPlanSubmitted(msg.sender, patientAddr, appointmentId);
}

}

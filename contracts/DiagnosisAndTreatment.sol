// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./AppointmentManager.sol";
import "./MedicalDataRegistry.sol";

contract DiagnosisAndTreatment {

    event DiagnosisSubmitted(address indexed doctor, address indexed patient, uint indexed appointmentId);
    event TreatmentPlanSubmitted(address indexed doctor, address indexed patient, uint indexed appointmentId);

    AppointmentManager appointmentManager;
    MedicalDataRegistry medicalDataRegistry;

    constructor(address _appointmentManager, address _medicalDataRegistry) public {
        appointmentManager = AppointmentManager(_appointmentManager);
        medicalDataRegistry = MedicalDataRegistry(_medicalDataRegistry);
    }

    function submitDiagnosis(address paddr, uint _diagnosis, string memory _hash) public {

        uint[] memory doctorAppointments = appointmentManager.getDoctorAppointments(msg.sender);
        uint acceptedAppointmentId = uint(-1);

        for (uint i = 0; i < doctorAppointments.length; i++) {
            uint appointmentId = doctorAppointments[i];

            (
                string memory ipfsHash,
                bool isAccepted,
                address patientAddr,
                address doctorAddr,
                uint256 date,
                uint8 hour,
                bool diagnosisSubmitted,
                bool treatmentPlanSubmitted
            ) = appointmentManager.appointments(appointmentId);

            if (
                patientAddr == paddr &&
                doctorAddr == msg.sender &&
                isAccepted &&
                !diagnosisSubmitted
            ) {
                acceptedAppointmentId = appointmentId;
                break;
            }
        }

        require(acceptedAppointmentId != uint(-1), "No accepted appointment found.");

        // ✅ Mark in AppointmentManager
        appointmentManager.setDiagnosisSubmitted(acceptedAppointmentId);

        // ✅ Store hash
        medicalDataRegistry.setHash(paddr, _hash);

        emit DiagnosisSubmitted(msg.sender, paddr, acceptedAppointmentId);
    }

    function submitTreatmentPlan(uint appointmentId, string memory treatmentPlanIPFSHash) public {

        // ✅ Mark inside AppointmentManager
        appointmentManager.setTreatmentPlanSubmitted(appointmentId);

        // ✅ Store treatment plan hash
        (, , address patientAddress, , , , , ) = appointmentManager.appointments(appointmentId);
        medicalDataRegistry.setHash(patientAddress, treatmentPlanIPFSHash);

        emit TreatmentPlanSubmitted(msg.sender, patientAddress, appointmentId);
    }
}

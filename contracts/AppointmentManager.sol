// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./AccessControl.sol"; // inherits UserRegistry as well

contract AppointmentManager is AccessControl {

    struct Appointment {
        string ipfsHash;
        bool isAccepted;
        address patientAddress;
        address doctorAddress;
        uint256 date;
        uint8 hour;
        bool diagnosisSubmitted;
        bool treatmentPlanSubmitted;
    }

    struct TimeSlot {
        uint256 date;
        uint8 hour;
        bool isAvailable;
    }

    uint public nextAppointmentId = 0;

    mapping(uint => Appointment) public appointments;
    mapping(address => uint[]) private doctorAppointments;
    mapping(address => uint[]) private patientAppointments;

    mapping(address => mapping(uint256 => mapping(uint8 => bool))) private doctorAvailability;

    // ---------------------------------------------
    // Request appointment (patient directly)
    // ---------------------------------------------
    function requestAppointment(
        address _doctor,
        string memory _appointmentIPFSHash,
        uint256 _appointmentDate,
        uint8 _appointmentHour
    ) public {
        bool accessGiven = false;
        address[] memory doctors = getAccessedDoctorListForPatient(msg.sender);
        for (uint i = 0; i < doctors.length; i++) {
            if (doctors[i] == _doctor) {
                accessGiven = true;
                break;
            }
        }

        require(
            accessGiven,
            "Patient must give access to the doctor before requesting an appointment."
        );
        require(
            _appointmentHour >= 8 && _appointmentHour <= 19,
            "Appointment hour must be between 8 AM and 7 PM."
        );
        require(
            isTimeSlotAvailable(_doctor, _appointmentDate, _appointmentHour),
            "Time slot not available."
        );

        uint appointmentId = nextAppointmentId++;
        appointments[appointmentId] = Appointment({
            ipfsHash: _appointmentIPFSHash,
            isAccepted: false,
            patientAddress: msg.sender,
            doctorAddress: _doctor,
            date: _appointmentDate,
            hour: _appointmentHour,
            diagnosisSubmitted: false,
            treatmentPlanSubmitted: false
        });

        doctorAppointments[_doctor].push(appointmentId);
        patientAppointments[msg.sender].push(appointmentId);
    }

    // ---------------------------------------------
    // Request appointment by proxy
    // ---------------------------------------------
    function requestAppointmentByProxy(
        address _doctor,
        address _patient,
        string memory _appointmentIPFSHash,
        uint256 _appointmentDate,
        uint8 _appointmentHour
    ) public {
        require(
            patientInfo[_patient].proxyAddress == msg.sender,
            "Caller is not the proxy for this patient"
        );

        bool accessGranted = false;
        address[] memory doctors = getAccessedDoctorListForPatient(_patient);
        for (uint i = 0; i < doctors.length; i++) {
            if (doctors[i] == _doctor) {
                accessGranted = true;
                break;
            }
        }

        require(
            accessGranted,
            "Doctor does not have access to the patient's records."
        );
        require(
            isTimeSlotAvailable(_doctor, _appointmentDate, _appointmentHour),
            "Requested time slot is not available."
        );

        uint appointmentId = nextAppointmentId++;
        appointments[appointmentId] = Appointment({
            ipfsHash: _appointmentIPFSHash,
            isAccepted: false,
            patientAddress: _patient,
            doctorAddress: _doctor,
            date: _appointmentDate,
            hour: _appointmentHour,
            diagnosisSubmitted: false,
            treatmentPlanSubmitted: false
        });

        patientAppointments[_patient].push(appointmentId);
        doctorAppointments[_doctor].push(appointmentId);
    }

    // ---------------------------------------------
    // Getters
    // ---------------------------------------------
    function getDoctorAppointments(address doctorAddress) public view returns (uint[] memory) {
        return doctorAppointments[doctorAddress];
    }

    function getPatientAppointments(address patientAddress) public view returns (uint[] memory) {
        return patientAppointments[patientAddress];
    }

    // ---------------------------------------------
    // Accept/Reject Appointments
    // ---------------------------------------------
    function acceptAppointment(uint _appointmentId) public {
        Appointment storage appointment = appointments[_appointmentId];

        require(!appointment.isAccepted, "Appointment is already processed");

        uint[] memory docAppointments = doctorAppointments[appointment.doctorAddress];
        for (uint i = 0; i < docAppointments.length; i++) {
            Appointment storage otherAppointment = appointments[docAppointments[i]];
            if (
                otherAppointment.date == appointment.date &&
                otherAppointment.hour == appointment.hour &&
                otherAppointment.isAccepted
            ) {
                revert("Another appointment is already booked for this time slot.");
            }
        }

        appointment.isAccepted = true;
        doctorAvailability[appointment.doctorAddress][appointment.date][appointment.hour] = true;
    }

    function rejectAppointment(uint _appointmentId) public {
        Appointment storage appointment = appointments[_appointmentId];
        require(!appointment.isAccepted, "Appointment is already processed");

        delete appointments[_appointmentId];
        doctorAvailability[appointment.doctorAddress][appointment.date][appointment.hour] = false;
    }

    // ---------------------------------------------
    // Availability management
    // ---------------------------------------------
    function updateAvailability(address _doctor, uint256 _date, uint8 _hour, bool _isAvailable) public {
        require(msg.sender == _doctor, "Unauthorized access");
        require(_hour >= 8 && _hour <= 19, "Invalid appointment hour.");

        doctorAvailability[_doctor][_date][_hour] = _isAvailable;
    }

    function isTimeSlotAvailable(address _doctor, uint256 _date, uint8 _hour) public view returns (bool) {
        return !doctorAvailability[_doctor][_date][_hour];
    }
}

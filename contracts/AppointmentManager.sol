// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "./UserRegistry.sol";

contract AppointmentManager {

    UserRegistry userRegistry;
    address public diagnosisContract;


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

    uint public nextAppointmentId = 0; // every new appointment gets a new id

    mapping(uint => Appointment) public appointments; // maps appointment id to appointment data
    mapping(address => uint[]) internal doctorAppointments; // maps a doctor address to a list of appointment ids
    mapping(address => uint[]) internal patientAppointments; // mas a patient address to a list of appointment ids
    mapping(address => mapping(uint256 => mapping(uint8 => bool))) private doctorAvailability; // maps a doctor address to a time slot (date and time) and a bool for checking if a slot is available or not

    // ===== Events =====
    event AppointmentRequested(uint indexed appointmentId, address indexed patient, address indexed doctor);
    event AppointmentAccepted(uint indexed appointmentId, address indexed doctor, address indexed patient);
    event AppointmentRejected(uint indexed appointmentId, address indexed doctor, address indexed patient);
    event AvailabilityUpdated(address indexed doctor, uint256 date, uint8 hour, bool isAvailable);

    constructor(address _userRegistry) public {
        userRegistry = UserRegistry(_userRegistry);
    }

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
        address[] memory doctors = userRegistry.getDoctorAccessList(msg.sender); // get the doctors that have acceess
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
        uint appointmentId = nextAppointmentId++; // creates new incremented id for appointment
        appointments[appointmentId] = Appointment({. // creates struct for appointment and stores it on blockchain
            ipfsHash: _appointmentIPFSHash,
            isAccepted: false,
            patientAddress: msg.sender,
            doctorAddress: _doctor,
            date: _appointmentDate,
            hour: _appointmentHour,
            diagnosisSubmitted: false,
            treatmentPlanSubmitted: false
        });

        doctorAppointments[_doctor].push(appointmentId); // push appointment to doctor's and patient's history
        patientAppointments[msg.sender].push(appointmentId);

        // Also push for the proxy if exists
UserRegistry.Patient memory p = userRegistry.getPatient(msg.sender);
if (p.hasDesignatedProxy) {
    patientAppointments[p.proxyAddress].push(appointmentId);
}

        emit AppointmentRequested(appointmentId, msg.sender, _doctor);
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
       require(userRegistry.getPatient(_patient).proxyAddress == msg.sender, "Caller is not the proxy for this patient");


        bool accessGranted = false; // check if proxy has access
        address[] memory doctors = userRegistry.getDoctorAccessList(_patient);
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
        patientAppointments[msg.sender].push(appointmentId); // msg.sender is proxy


        emit AppointmentRequested(appointmentId, _patient, _doctor);
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
        Appointment storage appointment = appointments[_appointmentId]; // direct blockchain reference  

        require(!appointment.isAccepted, "Appointment is already processed"); // check if appt is already accepted

        uint[] memory docAppointments = doctorAppointments[appointment.doctorAddress];
        // iterate through doctor appts and check if the time slot is already booked
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

        appointment.isAccepted = true; // mark appt as accepted
        doctorAvailability[appointment.doctorAddress][appointment.date][appointment.hour] = true; // mark time slot as booked

        emit AppointmentAccepted(_appointmentId, appointment.doctorAddress, appointment.patientAddress);
    }

    function rejectAppointment(uint _appointmentId) public {
        Appointment storage appointment = appointments[_appointmentId];
        require(!appointment.isAccepted, "Appointment is already processed");

        delete appointments[_appointmentId]; // remove appt struct from blockchain storage
        doctorAvailability[appointment.doctorAddress][appointment.date][appointment.hour] = false; // mark the time slot as free

        emit AppointmentRejected(_appointmentId, appointment.doctorAddress, appointment.patientAddress);
    }

    // ---------------------------------------------
    // Availability management
    // ---------------------------------------------
    function updateAvailability(address _doctor, uint256 _date, uint8 _hour, bool _isAvailable) public {
        require(msg.sender == _doctor, "Unauthorized access"); // only doctor can update slots
        require(_hour >= 8 && _hour <= 19, "Invalid appointment hour."); 

        doctorAvailability[_doctor][_date][_hour] = _isAvailable; // stores slot state

        emit AvailabilityUpdated(_doctor, _date, _hour, _isAvailable);
    }

    function isTimeSlotAvailable(address _doctor, uint256 _date, uint8 _hour) public view returns (bool) {
        return !doctorAvailability[_doctor][_date][_hour];
    }

    function setDiagnosisSubmitted(uint _appointmentId) public {
    Appointment storage appointment = appointments[_appointmentId]; 

    require(appointment.isAccepted, "Appointment not accepted"); // an appointment has to be accepted to submit the diagnosis
    require(!appointment.diagnosisSubmitted, "Diagnosis already submitted"); // prevents resubmission for an appt

    // Only doctor or diagnosisContract can call
    require(
        msg.sender == appointment.doctorAddress || msg.sender == diagnosisContract,
        "Not authorized"
    );

    appointment.diagnosisSubmitted = true;
}

function setTreatmentPlanSubmitted(uint _appointmentId) public {
    Appointment storage appointment = appointments[_appointmentId];

    require(appointment.isAccepted, "Appointment not accepted");
    require(appointment.diagnosisSubmitted, "Diagnosis must be submitted first");
    require(!appointment.treatmentPlanSubmitted, "Treatment plan already submitted");

    // Only doctor or diagnosisContract can call
    require(
        msg.sender == appointment.doctorAddress || msg.sender == diagnosisContract,
        "Not authorized"
    );

    appointment.treatmentPlanSubmitted = true;
}


    function getAppointment(uint _appointmentId) 
    public view 
    returns (
        string memory ipfsHash,
        bool isAccepted,
        address patientAddr,
        address doctorAddr,
        uint256 date,
        uint8 hour,
        bool diagnosisSubmitted,
        bool treatmentPlanSubmitted
    ) 
{
    Appointment storage appointment = appointments[_appointmentId];
    return (
        appointment.ipfsHash,
        appointment.isAccepted,
        appointment.patientAddress,
        appointment.doctorAddress,
        appointment.date,
        appointment.hour,
        appointment.diagnosisSubmitted,
        appointment.treatmentPlanSubmitted
    );
}
    // set linked diagnosis contract
    function setDiagnosisContract(address _addr) external {
    require(diagnosisContract == address(0), "Already set");
    diagnosisContract = _addr; // can only be set once
}


}

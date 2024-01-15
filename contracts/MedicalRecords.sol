// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;

contract MedicalRecords {
    struct patient {
        string firstName;
        string lastName;
        uint age;
        address[] doctorAccessList;
        uint[] diagnosis;
        string record;
    }

    struct doctor {
        string firstName;
        string lastName;
        uint age;
        address[] patientAccessList;
    }

    struct Appointment {
        string ipfsHash;
        bool isAccepted;
    }

    struct Notification {
        string message;
        string notificationType;
        uint256 timestamp;
    }

    uint creditPool;

    address[] public patientList;
    address[] public doctorList;

    mapping(address => patient) patientInfo;
    mapping(address => doctor) doctorInfo;
    mapping(address => address) Empty;

    mapping(address => string) patientRecords;

    mapping(uint => Appointment) public appointments;
    mapping(address => uint[]) private doctorAppointments;
    mapping(address => uint[]) private patientAppointments;

    mapping(address => Notification[]) patientNotifications;

    uint public nextAppointmentId = 0;

    function add_agent(
        string memory first_name,
        string memory last_name,
        uint _age,
        uint _designation,
        string memory _hash
    ) public returns (string memory, string memory) {
        address addr = msg.sender;

        if (_designation == 0) {
            patient memory p;
            p.firstName = first_name;
            p.lastName = last_name;
            p.age = _age;
            p.record = _hash;
            patientInfo[msg.sender] = p;
            patientList.push(addr) - 1;
            return (first_name, last_name);
        } else if (_designation == 1) {
            doctorInfo[addr].firstName = first_name;
            doctorInfo[addr].lastName = last_name;
            doctorInfo[addr].age = _age;
            doctorList.push(addr) - 1;
            return (first_name, last_name);
        } else {
            revert();
        }
    }

    function get_patient(
        address addr
    )
        public
        view
        returns (
            string memory,
            string memory,
            uint,
            uint[] memory,
            address,
            string memory
        )
    {
        return (
            patientInfo[addr].firstName,
            patientInfo[addr].lastName,
            patientInfo[addr].age,
            patientInfo[addr].diagnosis,
            Empty[addr],
            patientInfo[addr].record
        );
    }

    function get_doctor(
        address addr
    ) public view returns (string memory, string memory, uint) {
        return (
            doctorInfo[addr].firstName,
            doctorInfo[addr].lastName,
            doctorInfo[addr].age
        );
    }

    function get_patient_doctor_name(
        address paddr,
        address daddr
    )
        public
        view
        returns (string memory, string memory, string memory, string memory)
    {
        return (
            patientInfo[paddr].firstName,
            patientInfo[paddr].lastName,
            doctorInfo[daddr].firstName,
            doctorInfo[daddr].lastName
        );
    }

    function permit_access(address addr) public payable {
        require(msg.value == 2 ether);

        creditPool += 2;

        doctorInfo[addr].patientAccessList.push(msg.sender) - 1;
        patientInfo[msg.sender].doctorAccessList.push(addr) - 1;
    }

    function insurance_claim(
        address paddr,
        uint _diagnosis,
        string memory _hash
    ) public {
        bool patientFound = false;
        for (
            uint i = 0;
            i < doctorInfo[msg.sender].patientAccessList.length;
            i++
        ) {
            if (doctorInfo[msg.sender].patientAccessList[i] == paddr) {
                msg.sender.transfer(2 ether);
                creditPool -= 2;
                patientFound = true;
            }
        }
        if (patientFound == true) {
            set_hash(paddr, _hash);
            remove_patient(paddr, msg.sender);
        } else {
            revert();
        }

        bool DiagnosisFound = false;
        for (uint j = 0; j < patientInfo[paddr].diagnosis.length; j++) {
            if (patientInfo[paddr].diagnosis[j] == _diagnosis)
                DiagnosisFound = true;
        }
    }

    function remove_element_in_array(
        address[] storage Array,
        address addr
    ) internal returns (uint) {
        bool check = false;
        uint del_index = 0;
        for (uint i = 0; i < Array.length; i++) {
            if (Array[i] == addr) {
                check = true;
                del_index = i;
            }
        }
        if (!check) revert();
        else {
            if (Array.length == 1) {
                delete Array[del_index];
            } else {
                Array[del_index] = Array[Array.length - 1];
                delete Array[Array.length - 1];
            }
            Array.length--;
        }
    }

    function remove_patient(address paddr, address daddr) public {
        remove_element_in_array(doctorInfo[daddr].patientAccessList, paddr);
        remove_element_in_array(patientInfo[paddr].doctorAccessList, daddr);
    }

    function get_accessed_doctorlist_for_patient(
        address addr
    ) public view returns (address[] memory) {
        address[] storage doctoraddr = patientInfo[addr].doctorAccessList;
        return doctoraddr;
    }

    function get_accessed_patientlist_for_doctor(
        address addr
    ) public view returns (address[] memory) {
        return doctorInfo[addr].patientAccessList;
    }

    function revoke_access(address daddr) public payable {
        remove_patient(msg.sender, daddr);
        msg.sender.transfer(2 ether);
        creditPool -= 2;
    }

    function get_patient_list() public view returns (address[] memory) {
        return patientList;
    }

    function get_doctor_list() public view returns (address[] memory) {
        return doctorList;
    }

    function get_hash(address paddr) public view returns (string memory) {
        return patientInfo[paddr].record;
    }

    function set_hash(address paddr, string memory _hash) internal {
        patientInfo[paddr].record = _hash;
    }

    function getDoctorAppointments(
        address doctorAddress
    ) public view returns (uint[] memory) {
        return doctorAppointments[doctorAddress];
    }

    function getPatientAppointments(
        address patientAddress
    ) public view returns (uint[] memory) {
        return patientAppointments[patientAddress];
    }

    function requestAppointment(
        address _doctor,
        string memory _appointmentIPFSHash
    ) public {
        uint appointmentId = nextAppointmentId++;
        appointments[appointmentId] = Appointment({
            ipfsHash: _appointmentIPFSHash,
            isAccepted: false
        });
        doctorAppointments[_doctor].push(appointmentId);
        patientAppointments[msg.sender].push(appointmentId);
    }

    function acceptAppointment(uint _appointmentId) public {
        require(
            appointments[_appointmentId].isAccepted == false,
            "Appointment is already processed"
        );
        appointments[_appointmentId].isAccepted = true;

        // Capture the patient's address
        address patientAddress = msg.sender;

        // Notify the patient of the accepted appointment
        addNotification(
            patientAddress,
            "Your appointment request has been accepted.",
            "AppointmentAccepted"
        );
    }

    function rejectAppointment(uint _appointmentId) public {
        require(
            appointments[_appointmentId].isAccepted == false,
            "Appointment is already processed"
        );
        delete appointments[_appointmentId]; // Optionally, remove the appointment

        // Capture the patient's address
        address patientAddress = msg.sender;

        // Notify the patient of the rejected appointment
        addNotification(
            patientAddress,
            "Your appointment request has been rejected.",
            "AppointmentRejected"
        );
    }

    function addNotification(
        address patientAddress,
        string memory message,
        string memory notificationType
    ) public {
        // Create a new notification
        Notification memory notification = Notification({
            message: message,
            notificationType: notificationType,
            timestamp: block.timestamp // Use the current block's timestamp
        });

        // Add the notification to the patient's list
        patientNotifications[patientAddress].push(notification);

        // Emit an event to signal the addition of a new notification
        emit NewNotification(patientAddress, message, notificationType);
    }

    event NewNotification(
        address indexed patientAddress,
        string message,
        string notificationType
    );
}

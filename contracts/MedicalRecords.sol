// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract MedicalRecords {
    struct patient {
        string firstName;
        string lastName;
        uint age;
        address[] doctorAccessList;
        uint[] diagnosis;
        string record;
        address proxyAddress;
    }

    struct doctor {
        string firstName;
        string lastName;
        uint age;
        address[] patientAccessList;
        string record;
    }

    struct Appointment {
        string ipfsHash;
        bool isAccepted;
        address patientAddress;
        address doctorAddress;
        uint256 date; // New field for appointment date
        uint8 hour; // New field for appointment hour
    }

    struct TimeSlot {
        uint256 date; // Represented as YYYYMMDD
        uint8 hour; // Hour of the day (9-19)
        bool isAvailable; // True if available, false if booked
    }

    struct Proxy {
        string firstName;
        string lastName;
        address patientAddress;
        string record;
        string token; // This can be a hash or unique identifier
        bool hasPOA; // Power of Attorney
        bool consentGiven; 
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
    mapping(address => mapping(uint256 => mapping(uint8 => bool)))
        private doctorAvailability;

    mapping(address => Proxy) public proxies;
    mapping(string => address) private tokenToPatient; // Maps token to patient for proxy validation

    

    uint public nextAppointmentId = 0;

    function add_agent(
        string memory first_name,
        string memory last_name,
        uint _age,
        uint _designation,
        string memory _hash,
        string memory _tokenOrPOAHash, 
        bool _isToken
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
            doctorInfo[addr].record = _hash;
            doctorList.push(addr) - 1;
            return (first_name, last_name);
        } else if (_designation == 2) { // Proxy registration
            require(_isToken || bytes(_tokenOrPOAHash).length > 0, "Token or POA document hash required");
            address patientAddr = tokenToPatient[_tokenOrPOAHash];
            require(patientAddr != address(0), "Invalid token or no corresponding patient found");

            Proxy memory newProxy = proxies[addr];
            require(bytes(newProxy.firstName).length > 0, "Proxy not designated");

            newProxy.record = _hash; // Update with IPFS hash of proxy's information or POA document
            if (!_isToken) {
                newProxy.hasPOA = true; // POA provided
            }

            proxies[addr] = newProxy;
            // Link proxy with patient's record immediately or based on further validation
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
    ) public view returns (string memory, string memory, uint, string memory) {
        return (
            doctorInfo[addr].firstName,
            doctorInfo[addr].lastName,
            doctorInfo[addr].age,
            doctorInfo[addr].record
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
            patientFound = true;
            break; // Stop the loop once the patient is found
        }
    }
    require(patientFound, "Doctor does not have access to this patient.");

    // New: Check for an accepted appointment
    bool appointmentAccepted = false;
    for (uint i = 0; i < doctorAppointments[msg.sender].length; i++) {
        uint appointmentId = doctorAppointments[msg.sender][i];
        Appointment storage appointment = appointments[appointmentId];
        if (appointment.patientAddress == paddr && appointment.isAccepted) {
            appointmentAccepted = true;
            break; // Stop the loop once an accepted appointment is found
        }
    }
    require(appointmentAccepted, "No accepted appointment found between doctor and patient.");

    // If both conditions are met, process the diagnosis
    msg.sender.transfer(2 ether);
    creditPool -= 2;
    set_hash(paddr, _hash);
    remove_patient(paddr, msg.sender); // You may want to review this action based on your app's logic

    // Check if the diagnosis is already recorded (though this part remains unchanged)
    bool DiagnosisFound = false;
    for (uint j = 0; j < patientInfo[paddr].diagnosis.length; j++) {
        if (patientInfo[paddr].diagnosis[j] == _diagnosis) {
            DiagnosisFound = true;
            break; // Diagnosis already exists
        }
    }
    // Optionally handle the case where DiagnosisFound is true, if necessary
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

    function requestAppointment(
        address _doctor,
        string memory _appointmentIPFSHash,
        uint256 _appointmentDate,
        uint8 _appointmentHour
    ) public {
        bool accessGiven = false;
        for (
            uint i = 0;
            i < patientInfo[msg.sender].doctorAccessList.length;
            i++
        ) {
            if (patientInfo[msg.sender].doctorAccessList[i] == _doctor) {
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
            hour: _appointmentHour
        });

        doctorAppointments[_doctor].push(appointmentId);
        patientAppointments[msg.sender].push(appointmentId);
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

    function acceptAppointment(uint _appointmentId) public {
        Appointment storage appointment = appointments[_appointmentId];

        require(
            appointments[_appointmentId].isAccepted == false,
            "Appointment is already processed"
        );
        appointments[_appointmentId].isAccepted = true;
        doctorAvailability[appointment.doctorAddress][appointment.date][
            appointment.hour
        ] = true;
    }

    function rejectAppointment(uint _appointmentId) public {
        Appointment storage appointment = appointments[_appointmentId];

        require(
            appointments[_appointmentId].isAccepted == false,
            "Appointment is already processed"
        );
        address patientAddress = appointments[_appointmentId].patientAddress;
        delete appointments[_appointmentId]; // Optionally, remove the appointment
        doctorAvailability[appointment.doctorAddress][appointment.date][
            appointment.hour
        ] = false;
    }

    function updateAvailability(
        address _doctor,
        uint256 _date,
        uint8 _hour,
        bool _isAvailable
    ) public {
        require(msg.sender == _doctor, "Unauthorized access");
        require(
            _hour >= 8 && _hour <= 19,
            "Invalid hour. Must be between 8 AM and 7 PM."
        );
        doctorAvailability[_doctor][_date][_hour] = _isAvailable;
    }

    function isTimeSlotAvailable(
        address _doctor,
        uint256 _date,
        uint8 _hour
    ) public view returns (bool) {
        return !doctorAvailability[_doctor][_date][_hour];
    }

    function _generateTokenForProxy(address patientAddress) internal returns (string memory) {
        // Generate a unique token based on patient's address and current timestamp
        // This is a simplified version. Consider a more secure token generation strategy.
        return keccak256(abi.encodePacked(patientAddress, now)).toString();
    }

    function designateProxy(address _proxyAddress, string memory _firstName, string memory _lastName,consentGiven ) public {
        require(patients[msg.sender].proxyAddress == address(0), "Proxy already designated");

        string memory token = _generateTokenForProxy(msg.sender);
        Proxy memory newProxy = Proxy({
            firstName: _firstName,
            lastName: _lastName,
            email: _email,
            patientAddress: msg.sender,
            token: token,
            consentGiven: false,
            hasPOA: false,
            record: "" // Initially, no IPFS hash until registration is completed
        });

        proxies[_proxyAddress] = newProxy;
        patients[msg.sender].proxyAddress = _proxyAddress;
        tokenToPatient[token] = msg.sender; // Map token to patient for verification during proxy registration

     
    }

    

    function revokeProxyAccess() public {
    address proxyAddress = patientInfo[msg.sender].proxyAddress;
    require(proxyAddress != address(0), "No proxy designated");

    delete proxies[proxyAddress];
    delete patientInfo[msg.sender].proxyAddress;
    delete tokenToPatient[proxies[proxyAddress].token];
}

}

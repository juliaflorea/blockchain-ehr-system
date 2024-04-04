// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

// import "@openzeppelin/contracts/utils/Strings.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";
// import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract MedicalRecords {
    struct patient {
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
        uint age;
        address patientAddress;
        address[] patientAccessList;
        string record;
        string token;
        bool accessGrantedViaToken;
        bool isAuthorized;
        bool poa;
    }

    uint creditPool;

    address[] public patientList;
    address[] public doctorList;
    address[] public proxyList;

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
    mapping(address => string) private patientToToken;

    uint public nextAppointmentId = 0;

    function add_agent(
        string memory first_name,
        string memory last_name,
        uint _age,
        uint _designation,
        string memory _hash,
        string memory _tokenOrPOAHash,
        bool _isToken,
        address _patientEthereumAddress
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
        } else if (_designation == 2) {
            address patientAddr = address(0);

            // For the token option, retrieve the patient address using the token-to-patient mapping
            if (_isToken) {
                patientAddr = tokenToPatient[_tokenOrPOAHash];
                require(patientAddr != address(0), "Invalid token.");
            }
            // For the POA option, use the provided Ethereum address directly
            else {
                patientAddr = _patientEthereumAddress;
                require(
                    patientAddr != address(0),
                    "Invalid patient Ethereum address."
                );
            }

            // Validate that the patient address is registered in the system
            require(
                bytes(patientInfo[patientAddr].firstName).length != 0,
                "Patient not found."
            );

            patientInfo[patientAddr].proxyAddress = msg.sender;
            patientInfo[patientAddr].hasDesignatedProxy = true;
            address[] memory emptyPatientAccessList = new address[](0);

            proxies[msg.sender] = Proxy({
                firstName: first_name,
                lastName: last_name,
                age: _age,
                patientAddress: patientAddr,
                patientAccessList: emptyPatientAccessList,
                record: _hash, // Assuming this is POA document hash if _isToken is false
                token: _isToken ? _tokenOrPOAHash : "",
                accessGrantedViaToken: _isToken,
                isAuthorized: true,
                poa: !_isToken
            });
            proxyList.push(msg.sender);

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
    ) public view returns (string memory, string memory, uint, string memory) {
        return (
            doctorInfo[addr].firstName,
            doctorInfo[addr].lastName,
            doctorInfo[addr].age,
            doctorInfo[addr].record
        );
    }

    function get_proxy(
        address proxyAddress
    ) public view returns (Proxy memory) {
        return proxies[proxyAddress];
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
        require(
            appointmentAccepted,
            "No accepted appointment found between doctor and patient."
        );

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

    function remove_proxy(address patientAddress) public {
        require(
            patientInfo[patientAddress].hasDesignatedProxy,
            "Patient does not have a designated proxy."
        );

        address proxyAddress = patientInfo[patientAddress].proxyAddress;

        // Ensure the proxy exists
        require(proxyAddress != address(0), "Proxy address is not valid.");
        proxies[proxyAddress].isAuthorized = false;
        // Remove the patient from the proxy's patientAccessList
        address[] storage accessList = proxies[proxyAddress].patientAccessList;
        for (uint i = 0; i < accessList.length; i++) {
            if (accessList[i] == patientAddress) {
                accessList[i] = accessList[accessList.length - 1];
                accessList.pop();
                break;
            }
        }

        // Reset the proxy information for the patient
        patientInfo[patientAddress].hasDesignatedProxy = false;
        patientInfo[patientAddress].proxyAddress = address(0);
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

    function get_accessed_patientlist_for_proxy(
        address proxyAddress
    ) public view returns (address[] memory) {
        Proxy memory proxy = proxies[proxyAddress];
        address[] memory accessedPatients = new address[](1);
        accessedPatients[0] = proxy.patientAddress;
        return accessedPatients;
    }

    function get_accessed_proxylist_for_patient(
        address patientAddress
    ) public view returns (address[] memory) {
        address[] memory accessedProxies = new address[](1);
        accessedProxies[0] = patientInfo[patientAddress].proxyAddress;
        return accessedProxies;
    }

    function revoke_access(address daddr) public payable {
        remove_patient(msg.sender, daddr);
        msg.sender.transfer(2 ether);
        creditPool -= 2;
    }

    function revokeProxyAccess() public {
        // Assuming this function is called by the patient to revoke their proxy's access
        address patientAddress = msg.sender;

        // Ensure the patient has a designated proxy before attempting to remove it
        require(
            patientInfo[patientAddress].hasDesignatedProxy,
            "No proxy to revoke."
        );

        // Call remove_proxy to revoke the proxy's access
        remove_proxy(patientAddress);

        // Handle any refunds, notifications, or additional state updates as needed
    }

    function regrantProxyAccess(address proxyAddress) public payable {
        // Ensure the proxy is in the list of proxies but not currently authorized
        require(
            !proxies[proxyAddress].isAuthorized,
            "Proxy is currently authorized."
        );

        // Ensure the caller had designated a proxy before and wants to regrant access to the same proxy
        require(
            proxies[proxyAddress].patientAddress == msg.sender,
            "This proxy was never designated for the patient."
        );

        // Require a payment of 2 ether, aligning with the permit_access function requirements
        require(msg.value == 2 ether, "Payment of 2 ether is required.");

        // Update the credit pool similar to permit_access function
        creditPool += 2;

        // Set the proxy's isAuthorized flag to true to regrant access
        proxies[proxyAddress].isAuthorized = true;

        // Update the patient's proxy information
        patientInfo[msg.sender].proxyAddress = proxyAddress;
        patientInfo[msg.sender].hasDesignatedProxy = true;

        // Since the proxy is being regranted access, you may also need to ensure
        // that the proxy's access list is updated if necessary. This part of logic
        // might need adjustments based on how you're handling the list of patients
        // a proxy can access.
    }

    function get_patient_list() public view returns (address[] memory) {
        return patientList;
    }

    function get_doctor_list() public view returns (address[] memory) {
        return doctorList;
    }

    function get_proxy_list() public view returns (address[] memory) {
        return proxyList;
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

    function designateProxy(string memory token) public {
        require(
            !patientInfo[msg.sender].hasDesignatedProxy,
            "Proxy already designated"
        );

        // Associate token with the sender's address
        patientToToken[msg.sender] = token;
        tokenToPatient[token] = msg.sender;

        // Update patient's hasDesignatedProxy status
        patientInfo[msg.sender].hasDesignatedProxy = true;
    }
}

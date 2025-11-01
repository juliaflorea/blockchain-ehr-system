// SPDX-License-Identifier: MIT
pragma solidity ^0.5.1;
pragma experimental ABIEncoderV2;

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
        string licenseNumber;
    }

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
    mapping(string => bool) private registeredLicenses;

    mapping(address => address) Empty;

    mapping(address => string) patientRecords;

    mapping(uint => Appointment) public appointments;
    mapping(address => uint[]) private doctorAppointments;
    mapping(address => uint[]) private patientAppointments;
    mapping(address => mapping(uint256 => mapping(uint8 => bool)))
        private doctorAvailability;

    mapping(address => Proxy) public proxies;
    mapping(string => address) private tokenToPatient;
    mapping(address => string) private patientToToken;
    mapping(address => bytes32) private proxyDetailsHash;

    uint public nextAppointmentId = 0;

    // function to register new agent based on designation variable
    function add_agent(
        string memory first_name,
        string memory last_name,
        uint _age,
        uint _designation,
        string memory _hash,
        string memory _tokenOrPOAHash,
        bool _isToken,
        address _patientEthereumAddress,
        string memory _licenseNumber
    ) public returns (string memory, string memory) {
        address addr = msg.sender;

        if (_designation == 0) {
            // if agent = patient
            patient memory p;
            p.firstName = first_name;
            p.lastName = last_name;
            p.age = _age;
            p.record = _hash;
            patientInfo[msg.sender] = p;
            patientList.push(addr) - 1;
            return (first_name, last_name);
        } else if (_designation == 1) {
            // if agent = doctor
            require(
                !registeredLicenses[_licenseNumber],
                "License number already registered."
            );
            doctorInfo[addr].firstName = first_name;
            doctorInfo[addr].lastName = last_name;
            doctorInfo[addr].age = _age;
            doctorInfo[addr].record = _hash;
            doctorList.push(addr) - 1;
            registeredLicenses[_licenseNumber] = true;
            return (first_name, last_name);
        } else if (_designation == 2) {
            // if agent = proxy
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

            // Check if  the patient address is registered in the system

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
                record: _hash,
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

    // function to retrieve patient data
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

    // function to retrieve doctor data
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

    // function to retrieve proxy data
    function get_proxy(
        address proxyAddress
    ) public view returns (Proxy memory) {
        return proxies[proxyAddress];
    }

    // function to retrieve patient and doctor names
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

    // function that allows patient do grant access to doctor
    function permit_access(address addr) public payable {
        require(msg.value == 2 ether);

        creditPool += 2;

        doctorInfo[addr].patientAccessList.push(msg.sender) - 1;
        patientInfo[msg.sender].doctorAccessList.push(addr) - 1;
    }

    // function that allows the proxy to grant access to a doctor on behalf of the patient
    function permit_access_by_proxy(
        address doctorAddress,
        address patientAddress
    ) public payable {
        require(msg.value == 2 ether);
        require(proxies[msg.sender].isAuthorized, "Proxy not authorized");
        require(
            patientInfo[patientAddress].proxyAddress == msg.sender,
            "Caller is not the proxy for this patient"
        );
        bool isAlreadyGranted = false;
        for (
            uint i = 0;
            i < patientInfo[patientAddress].doctorAccessList.length;
            i++
        ) {
            if (
                patientInfo[patientAddress].doctorAccessList[i] == doctorAddress
            ) {
                isAlreadyGranted = true;
                break;
            }
        }
        require(!isAlreadyGranted, "Access already granted to this doctor.");
        creditPool += 2;

        patientInfo[patientAddress].doctorAccessList.push(doctorAddress);
        doctorInfo[doctorAddress].patientAccessList.push(patientAddress);
    }

    // function that allows the doctor to send a diagnosis to the patient
    function insurance_claim(
        address paddr,
        uint _diagnosis,
        string memory _hash
    ) public {
        // First set flag as false, as patient is not found yet
        bool patientFound = false;

        // Iterate through doctor's access list, to look for the address of the patient

        for (
            uint i = 0;
            i < doctorInfo[msg.sender].patientAccessList.length;
            i++
        ) {
            if (doctorInfo[msg.sender].patientAccessList[i] == paddr) {
                patientFound = true;
                break;
            }
        }
        // If not found, it means the doctor does not have access to the patient

        require(patientFound, "Doctor does not have access to this patient.");

        bool appointmentAcceptedAndCurrent = false;
        uint acceptedAppointmentId = 0;

        // Iterate through doctor's appointments to find an accepted appointment for the current patient, which does not have a submitted diagnosis

        for (uint i = 0; i < doctorAppointments[msg.sender].length; i++) {
            uint appointmentId = doctorAppointments[msg.sender][i];
            Appointment storage appointment = appointments[appointmentId];
            if (
                appointment.patientAddress == paddr &&
                appointment.isAccepted &&
                !appointment.diagnosisSubmitted
            ) {
                appointmentAcceptedAndCurrent = true;
                acceptedAppointmentId = appointmentId;
                break;
            }
        }
        // If accepted appointment not found, or the diagnosis has already been submitted by theb doctor for this appointment, stop
        require(
            appointmentAcceptedAndCurrent,
            "No accepted appointment found between doctor and patient."
        );
        // If appointment found, mark flag as true

        appointments[acceptedAppointmentId].diagnosisSubmitted = true;

        // update hash of the medical record

        set_hash(paddr, _hash);

        // Check if the diagnosis is already recorded

        bool DiagnosisFound = false;
        for (uint j = 0; j < patientInfo[paddr].diagnosis.length; j++) {
            if (patientInfo[paddr].diagnosis[j] == _diagnosis) {
                DiagnosisFound = true;
                break;
            }
        }
    }

    // function that allows the doctor to send a treatment plan to the patient
    function submit_TreatmentPlan(
        uint appointmentId,
        string memory treatmentPlanIPFSHash
    ) public {
        // Ensure appointmentId is passed and used to access the correct Appointment struct

        Appointment storage appointment = appointments[appointmentId];

        // Ensure the caller is the doctor associated with this appointment

        require(
            appointment.doctorAddress == msg.sender,
            "Caller is not the doctor for this appointment."
        );

        // Ensure that a diagnosis has been submitted for this appointment

        require(
            appointment.diagnosisSubmitted,
            "A diagnosis must be submitted before a treatment plan."
        );

        // Check that a treatment plan hasn't been submitted already

        require(
            !appointment.treatmentPlanSubmitted,
            "Treatment plan has already been submitted for this appointment."
        );

        // Update the appointment to indicate that a treatment plan has now been submitted

        appointment.treatmentPlanSubmitted = true;

        msg.sender.transfer(2 ether);
        creditPool -= 2;
        set_hash(appointment.patientAddress, treatmentPlanIPFSHash);

        // Remove the doctor's access to the patient

        remove_patient(appointment.patientAddress, msg.sender);
    }

    // Function to renove an element of a specified address in a list of addresses, used as internal function
    function remove_element_in_array(
        address[] storage Array,
        address addr
    ) internal returns (uint) {
        bool check = false;
        uint del_index = 0;
        // Itrate through the array to find address

        for (uint i = 0; i < Array.length; i++) {
            if (Array[i] == addr) {
                check = true; // address found
                del_index = i; // mark deletion index of the element
            }
        }
        // If address not found, throw an error

        if (!check) revert();
        else {
            // If arrayv has one element, delete it

            if (Array.length == 1) {
                delete Array[del_index];
            } else {
                // If it has more elements, replace the element at delition index to the last element and deletes last element

                Array[del_index] = Array[Array.length - 1];
                delete Array[Array.length - 1];
            }
            Array.length--;
        }
    }

    // Function to remove patient from doctor's access list and doctor from patint's access list, used in the revoke accss functions
    function remove_patient(address paddr, address daddr) public {
        remove_element_in_array(doctorInfo[daddr].patientAccessList, paddr);
        remove_element_in_array(patientInfo[paddr].doctorAccessList, daddr);
    }

    // Function to remove proxy from patient, used in the revoke accss functions
    function remove_proxy(address patientAddress) public {
        require(
            patientInfo[patientAddress].hasDesignatedProxy, // check if patient currently has a dsignated proxy
            "Patient does not have a designated proxy."
        );

        address proxyAddress = patientInfo[patientAddress].proxyAddress;

        // Ensure the proxy exists

        require(proxyAddress != address(0), "Proxy address is not valid.");
        proxies[proxyAddress].isAuthorized = false; // mark proxy as not authorisd
        // Remove the patient from the proxy's patientAccessList
        address[] storage accessList = proxies[proxyAddress].patientAccessList;

        // Iterate through the access list of the proxy, find the patient and remove it
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

    // Function to get the doctors that have access to the patient
    function get_accessed_doctorlist_for_patient(
        address addr
    ) public view returns (address[] memory) {
        address[] storage doctoraddr = patientInfo[addr].doctorAccessList;
        return doctoraddr;
    }

    // Function ti get th patient list that the doctor has access to
    function get_accessed_patientlist_for_doctor(
        address addr
    ) public view returns (address[] memory) {
        return doctorInfo[addr].patientAccessList;
    }

    // Function to get the patients that the proxy has access to
    function get_accessed_patientlist_for_proxy(
        address proxyAddress
    ) public view returns (address[] memory) {
        Proxy memory proxy = proxies[proxyAddress];
        address[] memory accessedPatients = new address[](1);
        accessedPatients[0] = proxy.patientAddress;
        return accessedPatients;
    }

    // Function to get proxies that have access to patient
    function get_accessed_proxylist_for_patient(
        address patientAddress
    ) public view returns (address[] memory) {
        address[] memory accessedProxies = new address[](1);
        accessedProxies[0] = patientInfo[patientAddress].proxyAddress;
        return accessedProxies;
    }

    // Function for patint to revoke access to doctor
    function revoke_access(address daddr) public payable {
        remove_patient(msg.sender, daddr);
        msg.sender.transfer(2 ether);
        creditPool -= 2;
    }

    // Function for proxy to revoke access to doctor on behalf of patient
    function revoke_access_by_proxy(
        address doctorAddress,
        address patientAddress
    ) public payable {
        require(proxies[msg.sender].isAuthorized, "Proxy not authorized");
        require(
            patientInfo[patientAddress].proxyAddress == msg.sender,
            "Caller is not the proxy for this patient"
        );

        remove_patient(patientAddress, doctorAddress);
        msg.sender.transfer(2 ether);
        creditPool -= 2;
    }

    // Function for patient to revoke access to proxy
    function revokeProxyAccess() public {
        address patientAddress = msg.sender;

        // Ensure the patient has a designated proxy before attempting to remove it
        require(
            patientInfo[patientAddress].hasDesignatedProxy,
            "No proxy to revoke."
        );
        require(
            patientInfo[msg.sender].age >= 16,
            "Patient under 16 cannot revoke access."
        );

        remove_proxy(patientAddress);
    }

    // Function for patient to grant proxy access after he has been revoked
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

        require(msg.value == 2 ether, "Payment of 2 ether is required.");

        creditPool += 2;

        // Set the proxy's isAuthorized flag to true

        proxies[proxyAddress].isAuthorized = true;

        // Update the patient's proxy information

        patientInfo[msg.sender].proxyAddress = proxyAddress;
        patientInfo[msg.sender].hasDesignatedProxy = true;
    }

    // Function to get the list of patients
    function get_patient_list() public view returns (address[] memory) {
        return patientList;
    }

    // Function to get the list of doctors
    function get_doctor_list() public view returns (address[] memory) {
        return doctorList;
    }

    // Function to get the list of proxies
    function get_proxy_list() public view returns (address[] memory) {
        return proxyList;
    }

    // Function  to get the hash of the medical rcord of the patient
    function get_hash(address paddr) public view returns (string memory) {
        return patientInfo[paddr].record;
    }

    // Function to update th hash of the medical record after it has been modified for the patient
    function set_hash(address paddr, string memory _hash) public {
        patientInfo[paddr].record = _hash;
    }

    // Function for patient to request an appointmnt with the doctor
    function requestAppointment(
        address _doctor,
        string memory _appointmentIPFSHash,
        uint256 _appointmentDate,
        uint8 _appointmentHour
    ) public {
        bool accessGiven = false;

        // Iterate through the access list of the doctors for the patient to check if doctor has access
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

        // Restrict appointments only for 8 AM - 7 PM interval
        require(
            _appointmentHour >= 8 && _appointmentHour <= 19,
            "Appointment hour must be between 8 AM and 7 PM."
        );

        // Check the doctor's availability
        require(
            isTimeSlotAvailable(_doctor, _appointmentDate, _appointmentHour),
            "Time slot not available."
        );
        // Set id for new appointment

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

        // Add the appointemnt to doctor's and patient's lists of appointments
        doctorAppointments[_doctor].push(appointmentId);
        patientAppointments[msg.sender].push(appointmentId);
    }

    // Function to rqust appointment with doctor by proxy, on behalf of the patient
    function requestAppointmentByProxy(
        address _doctor,
        address _patient,
        string memory _appointmentIPFSHash,
        uint256 _appointmentDate,
        uint8 _appointmentHour
    ) public {
        // Ensure the caller is the designated proxy for the patient
        require(
            patientInfo[_patient].proxyAddress == msg.sender,
            "Caller is not the proxy for this patient"
        );

        // Ensure the doctor has access to the patient's medical records
        bool accessGranted = false;
        for (
            uint i = 0;
            i < patientInfo[_patient].doctorAccessList.length;
            i++
        ) {
            if (patientInfo[_patient].doctorAccessList[i] == _doctor) {
                accessGranted = true;
                break;
            }
        }
        require(
            accessGranted,
            "Doctor does not have access to the patient's records."
        );

        // Check the doctor's availability
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

        // Add the appointment  to the patient's and doctor's lists
        patientAppointments[_patient].push(appointmentId);
        doctorAppointments[_doctor].push(appointmentId);
    }

    // Function to gt the list of appointments for the doctor
    function getDoctorAppointments(
        address doctorAddress
    ) public view returns (uint[] memory) {
        return doctorAppointments[doctorAddress];
    }

    // Function to gt the list of appointments for the patient
    function getPatientAppointments(
        address patientAddress
    ) public view returns (uint[] memory) {
        return patientAppointments[patientAddress];
    }

    // Function for the doctor to accept an appointment
    function acceptAppointment(uint _appointmentId) public {
        Appointment storage appointment = appointments[_appointmentId];

        require(
            appointment.isAccepted == false,
            "Appointment is already processed"
        );

        // Check if there is any accepted appointment at the same date and time

        uint[] memory docAppointments = doctorAppointments[
            appointment.doctorAddress
        ];

        // Iterathe through list of appointments

        for (uint i = 0; i < docAppointments.length; i++) {
            Appointment storage otherAppointment = appointments[
                docAppointments[i]
            ];
            // If another appointmnt for the same date and time as the current on is accepted, then the current one cannot be accepted
            if (
                otherAppointment.date == appointment.date &&
                otherAppointment.hour == appointment.hour &&
                otherAppointment.isAccepted
            ) {
                revert(
                    "Another appointment is already booked for this time slot."
                );
            }
        }

        // If no conflict, set the appointment as accepted

        appointment.isAccepted = true;

        // Mark the time slot as unavailable for the doctor, so that it is not shown when patient request appointment

        doctorAvailability[appointment.doctorAddress][appointment.date][
            appointment.hour
        ] = true;
    }

    // Function for the doctor to reject  an appointment
    function rejectAppointment(uint _appointmentId) public {
        Appointment storage appointment = appointments[_appointmentId];

        require(
            appointments[_appointmentId].isAccepted == false,
            "Appointment is already processed"
        );
        address patientAddress = appointments[_appointmentId].patientAddress;
        delete appointments[_appointmentId];

        // Mark the time slot as available, after appointment request is deleted

        doctorAvailability[appointment.doctorAddress][appointment.date][
            appointment.hour
        ] = false;
    }

    // Function to update doctor's availability based on appointments
    function updateAvailability(
        address _doctor,
        uint256 _date,
        uint8 _hour,
        bool _isAvailable
    ) public {
        require(msg.sender == _doctor, "Unauthorized access");

        // Restrict appointments requests to be made only for given interval by the patients

        require(
            _hour >= 8 && _hour <= 19,
            "Invalid hour. Must be between 8 AM and 7 PM."
        );
        // Mark doctor as available

        doctorAvailability[_doctor][_date][_hour] = _isAvailable;
    }

    // Function to check if a specific time slot is available for the doctor
    function isTimeSlotAvailable(
        address _doctor,
        uint256 _date,
        uint8 _hour
    ) public view returns (bool) {
        // Returns true if the time slot is booked and false if it is available
        return !doctorAvailability[_doctor][_date][_hour];
    }

    // Function for patient to designate a proxy
    function designateProxy(string memory token, bytes32 detailsHash) public {
        // check if a proxy is already deisgnated
        require(
            !patientInfo[msg.sender].hasDesignatedProxy,
            "Proxy already designated"
        );

        // Stores the dtails of the proxy in a hash

        proxyDetailsHash[msg.sender] = detailsHash;

        // Associate token with the sender's address

        patientToToken[msg.sender] = token;
        tokenToPatient[token] = msg.sender;

        // Update patient's hasDesignatedProxy status

        patientInfo[msg.sender].hasDesignatedProxy = true;
    }

    // Function to check if a license number for a doctor has valready been registered by another user
    function isLicenseRegistered(
        string memory licenseNumber
    ) public view returns (bool) {
        return registeredLicenses[licenseNumber];
    }

    // Function that returns the mapping for the token associated to a patient, so that the proxy is designated to right pateint based on the user
    // who sent the token
    function getTokenToPatient(
        string memory token
    ) public view returns (address) {
        return tokenToPatient[token];
    }

    // Function to gt the hash of the proxy details
    function getProxyDetailsHash(
        address patientAddress
    ) public view returns (bytes32) {
        return proxyDetailsHash[patientAddress];
    }

    // Test function to update a patieent's age
    function setTestAge(uint _age, address _patientAddress) public {
        patientInfo[_patientAddress].age = _age;
    }
}

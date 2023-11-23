pragma solidity ^0.8.23;

contract MedicalRecords {
    struct Patient {
        string name;
        uint age;
        string recordHash;
    }

    struct Practitioner {
        string name;
        uint age;
        string practitionerDataHash;
    }

    struct HealthcareProvider {
        string name;
        uint age;
        string providerDataHash;
    }

    address[] public patientList;
    address[] public practitionerList;
    address[] public providerList;

    mapping(address => Patient) public patients;
    mapping(address => Practitioner) public practitioners;
    mapping(address => HealthcareProvider) public healthcareProviders;

    function addPatient(
        string memory _name,
        uint _age,
        string memory _recordHash
    ) public {
        address patientAddr = msg.sender;
        Patient memory newPatient = Patient(_name, _age, _recordHash);
        patients[patientAddr] = newPatient;
        patientList.push(patientAddr);
    }

    function addPractitioner(
        string memory _name,
        uint _age,
        string memory _practitionerDataHash
    ) public {
        address practitionerAddr = msg.sender;
        Practitioner memory newPractitioner = Practitioner(
            _name,
            _age,
            _practitionerDataHash
        );
        practitioners[practitionerAddr] = newPractitioner;
        practitionerList.push(practitionerAddr);
    }

    function addHealthcareProvider(
        string memory _name,
        uint _age,
        string memory _providerDataHash
    ) public {
        address providerAddr = msg.sender;
        HealthcareProvider memory newProvider = HealthcareProvider(
            _name,
            _age,
            _providerDataHash
        );
        healthcareProviders[providerAddr] = newProvider;
        providerList.push(providerAddr);
    }
}

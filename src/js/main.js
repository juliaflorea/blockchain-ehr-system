let web3;
let contractInstance;

function connect() {
  if (window.ethereum) {
    // Initialize Web3
    web3 = new Web3(window.ethereum);

    // Request user account access
    window.ethereum
      .request({ method: "eth_requestAccounts" })
      .then((accounts) => {
        // User has allowed account access
        console.log("Connected to Web3");

        // Set default account
        web3.eth.getAccounts().then((accounts) => {
          web3.eth.defaultAccount = accounts[0];
          console.log("Web3 Connected:", web3.eth.defaultAccount);
        });

        const ContractAddress = "0xd011b83b183aD4e82c0F5C62200f8118881a1302";
        const abi = JSON.parse(
          '[{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"doctorList","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"appointments","outputs":[{"name":"ipfsHash","type":"string"},{"name":"isAccepted","type":"bool"},{"name":"patientAddress","type":"address"},{"name":"doctorAddress","type":"address"},{"name":"date","type":"uint256"},{"name":"hour","type":"uint8"},{"name":"diagnosisSubmitted","type":"bool"},{"name":"treatmentPlanSubmitted","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"proxyList","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"nextAppointmentId","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"patientList","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"proxies","outputs":[{"name":"firstName","type":"string"},{"name":"lastName","type":"string"},{"name":"age","type":"uint256"},{"name":"patientAddress","type":"address"},{"name":"record","type":"string"},{"name":"token","type":"string"},{"name":"accessGrantedViaToken","type":"bool"},{"name":"isAuthorized","type":"bool"},{"name":"poa","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"first_name","type":"string"},{"name":"last_name","type":"string"},{"name":"_age","type":"uint256"},{"name":"_designation","type":"uint256"},{"name":"_hash","type":"string"},{"name":"_tokenOrPOAHash","type":"string"},{"name":"_isToken","type":"bool"},{"name":"_patientEthereumAddress","type":"address"},{"name":"_licenseNumber","type":"string"}],"name":"add_agent","outputs":[{"name":"","type":"string"},{"name":"","type":"string"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_patient","outputs":[{"name":"","type":"string"},{"name":"","type":"string"},{"name":"","type":"uint256"},{"name":"","type":"uint256[]"},{"name":"","type":"address"},{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_doctor","outputs":[{"name":"","type":"string"},{"name":"","type":"string"},{"name":"","type":"uint256"},{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"proxyAddress","type":"address"}],"name":"get_proxy","outputs":[{"components":[{"name":"firstName","type":"string"},{"name":"lastName","type":"string"},{"name":"age","type":"uint256"},{"name":"patientAddress","type":"address"},{"name":"patientAccessList","type":"address[]"},{"name":"record","type":"string"},{"name":"token","type":"string"},{"name":"accessGrantedViaToken","type":"bool"},{"name":"isAuthorized","type":"bool"},{"name":"poa","type":"bool"}],"name":"","type":"tuple"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"paddr","type":"address"},{"name":"daddr","type":"address"}],"name":"get_patient_doctor_name","outputs":[{"name":"","type":"string"},{"name":"","type":"string"},{"name":"","type":"string"},{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"addr","type":"address"}],"name":"permit_access","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":false,"inputs":[{"name":"paddr","type":"address"},{"name":"_diagnosis","type":"uint256"},{"name":"_hash","type":"string"}],"name":"insurance_claim","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"appointmentId","type":"uint256"},{"name":"treatmentPlanIPFSHash","type":"string"}],"name":"submit_TreatmentPlan","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"paddr","type":"address"},{"name":"daddr","type":"address"}],"name":"remove_patient","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"patientAddress","type":"address"}],"name":"remove_proxy","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_accessed_doctorlist_for_patient","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"get_accessed_patientlist_for_doctor","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"proxyAddress","type":"address"}],"name":"get_accessed_patientlist_for_proxy","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"patientAddress","type":"address"}],"name":"get_accessed_proxylist_for_patient","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"daddr","type":"address"}],"name":"revoke_access","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":false,"inputs":[],"name":"revokeProxyAccess","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"proxyAddress","type":"address"}],"name":"regrantProxyAccess","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[],"name":"get_patient_list","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"get_doctor_list","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"get_proxy_list","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"paddr","type":"address"}],"name":"get_hash","outputs":[{"name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"paddr","type":"address"},{"name":"_hash","type":"string"}],"name":"set_hash","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_doctor","type":"address"},{"name":"_appointmentIPFSHash","type":"string"},{"name":"_appointmentDate","type":"uint256"},{"name":"_appointmentHour","type":"uint8"}],"name":"requestAppointment","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"doctorAddress","type":"address"}],"name":"getDoctorAppointments","outputs":[{"name":"","type":"uint256[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"patientAddress","type":"address"}],"name":"getPatientAppointments","outputs":[{"name":"","type":"uint256[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"_appointmentId","type":"uint256"}],"name":"acceptAppointment","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_appointmentId","type":"uint256"}],"name":"rejectAppointment","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_doctor","type":"address"},{"name":"_date","type":"uint256"},{"name":"_hour","type":"uint8"},{"name":"_isAvailable","type":"bool"}],"name":"updateAvailability","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"_doctor","type":"address"},{"name":"_date","type":"uint256"},{"name":"_hour","type":"uint8"}],"name":"isTimeSlotAvailable","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"string"},{"name":"detailsHash","type":"bytes32"}],"name":"designateProxy","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"licenseNumber","type":"string"}],"name":"isLicenseRegistered","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"string"}],"name":"getTokenToPatient","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"patientAddress","type":"address"}],"name":"getProxyDetailsHash","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"}]'
        );
        contractInstance = new web3.eth.Contract(abi, ContractAddress);
        console.log("Contract instance created:", contractInstance);
      })

      .catch((error) => {
        // User denied account access
        console.error("Error enabling account:", error);
      });
  } else {
    console.error("Web3 provider not found");
  }
}

window.addEventListener("load", async () => {
  connect();
  console.log("Externally Loaded!");
  emailjs.init("BVHC0t44IJq1EPSI2");
});

$("#main-content").kendoCardDeck({
  dataSource: [
      { title: "Welcome", text: "Manage your medical records in a secure and easy way" }
      // Add more objects for other sections
  ],
  cardTemplate: `<div class="k-card mx-auto" style="width: 18rem;">
      <div class="k-card-body">
          <h5 class="k-card-title">#= title #</h5>
          <p class="k-card-text">#= text #</p>
          <a href="#" class="btn btn-primary">Learn More</a>
      </div>
  </div>`
});

function downloadMedicalRecord(data) {
  // Extract first name and last name from the medical record
  var firstNamePattern = /First Name: (.+)/;
  var lastNamePattern = /Last Name: (.+)/;

  var firstNameMatch = data.match(firstNamePattern);
  var lastNameMatch = data.match(lastNamePattern);

  var firstName = firstNameMatch ? firstNameMatch[1].trim() : "Unknown";
  var lastName = lastNameMatch ? lastNameMatch[1].trim() : "Unknown";

  var filename = `MedicalRecord_${firstName}_${lastName}.pdf`;

  // Create a PDF document
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  //doc.text(data, 10, 10); // Adjust text positioning and formatting as needed
  var textOptions = {
    maxWidth: 180, // Maximum width for text lines
    align: "left", // Align text to the left
  };

  // Add the text to the PDF, using textOptions for formatting
  doc.text(data, 10, 10, textOptions);

  // Save the PDF
  doc.save(filename);
  var downloadButton = $("<button/>", {
    text: "Download Medical Record",
    class: "btn btn-primary",
    click: function () {
      doc.save(filename);
    },
  });

  // Append the button to the container
  $("#downloadLinkContainer").html(downloadButton);
}

function calculateAge(dob) {
  var diff_ms = Date.now() - dob.getTime();
  var age_dt = new Date(diff_ms);
  return Math.abs(age_dt.getUTCFullYear() - 1970);
}

// main.js - Adjusted for event delegation
document.addEventListener("DOMContentLoaded", function () {
  document.body.addEventListener("change", function (event) {
    if (event.target.id === "dob") {
      var dob = event.target.value;
      var age = calculateAge(new Date(dob));
      var ageInput = document.getElementById("age");
      if (ageInput) ageInput.value = age;
    }
    // For proxyDOB in patient.js
    if (event.target.id === "proxyDOB") {
      var dob = event.target.value;
      var age = calculateAge(new Date(dob));
      document.getElementById("proxyAge").value = age;
    }
  });
});

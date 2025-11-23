

let web3;
let userRegistry;
let accessControl;

// Function to initialise the environment
async function connect() {
  if (!window.ethereum) {
    console.error("Web3 provider not found");
    return;
  }

  try {
    web3 = new Web3(window.ethereum);
    await window.ethereum.request({ method: "eth_requestAccounts" });

    const accounts = await web3.eth.getAccounts();
    web3.eth.defaultAccount = accounts[0];
    console.log("Connected account:", web3.eth.defaultAccount);

    // Get the deployed contract info from Truffle
    const networkId = await web3.eth.net.getId();

   // UserRegistry
   const deployedUserRegistry = contracts.UserRegistry.networks[networkId];
   if (!deployedUserRegistry) throw new Error("UserRegistry not deployed on this network.");
   userRegistry = new web3.eth.Contract(contracts.UserRegistry.abi, deployedUserRegistry.address);
   console.log("UserRegistry connected:", deployedUserRegistry.address);

   // AccessControl 
   const deployedAccessControl = contracts.AccessControl.networks[networkId];
   if (!deployedAccessControl) throw new Error("AccessControl not deployed on this network.");
   accessControl = new web3.eth.Contract(contracts.AccessControl.abi, deployedAccessControl.address);
   console.log("AccessControl connected:", deployedAccessControl.address);

    // MedicalDataRegistry
    const deployedMedicalDataRegistry = contracts.MedicalDataRegistry.networks[networkId];
    if (!deployedMedicalDataRegistry) throw new Error("MedicalDataRegistry not deployed on this network.");
    medicalDataRegistry = new web3.eth.Contract(
      contracts.MedicalDataRegistry.abi,
      deployedMedicalDataRegistry.address
    );
    console.log("MedicalDataRegistry connected:", deployedMedicalDataRegistry.address);

    // AppointmentManager
    const deployedAppointmentManager = contracts.AppointmentManager.networks[networkId];
    if (!deployedAppointmentManager) throw new Error("AppointmentManager not deployed on this network.");
    appointmentManager = new web3.eth.Contract(
      contracts.AppointmentManager.abi,
      deployedAppointmentManager.address
    );
    console.log("AppointmentManager connected:", deployedAppointmentManager.address);


   return true; // Successful connection
 } catch (err) {
   console.error("Error connecting to Web3 or contracts:", err);
   return false;
 }
}

window.addEventListener("load", async () => {
  const connected = await connect();
  console.log("Externally Loaded!");
  emailjs.init({ publicKey: "BVHC0t44IJq1EPSI2" });

  
});


// Function to allow patients, doctors, proxis to download the medical record of the patient
function downloadMedicalRecord(data) {
  // Remove HTML tags and unwanted titles for cleaner text in PDF
  function cleanData(data) {
    // Remove HTML tags
    var div = document.createElement("div");
    div.innerHTML = data;
    var text = div.textContent || div.innerText || "";

    return text.replace(/Medical Record/g, "").trim();
  }

  // Extract first name and last name from the medical record for filename
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

  // Prepare the data by cleaning and formatting
  var cleanedData = cleanData(data);

  // Add formatted title and the rest of the text to the PDF
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Medical Record", 105, 20, { align: "center" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(cleanedData, 10, 30, { maxWidth: 180 });
  // Save the PDF
  doc.save(filename);
}

// Function to calculate age of user based on user date of birth

function calculateAge(dob) {
  var diff_ms = Date.now() - dob.getTime();
  var age_dt = new Date(diff_ms);
  return Math.abs(age_dt.getUTCFullYear() - 1970);
}

document.addEventListener("DOMContentLoaded", function () {
  $(".list-group-item").click(function (e) {
    e.preventDefault(); // Prevent the default anchor behavior

    $(".list-group-item").removeClass("active");

    // Add active class to the clicked sidebar item
    $(this).addClass("active");
    var targets = $(this).attr("data-target").split(" "); // Split the targets by space
    $(".panel").hide(); // Hide all panels initially

    targets.forEach(function (target) {
      $("#" + target).show(); // Show each targeted panel
    });
  });

  $("#logout").click(function () {
    // Implement your logout logic here
    console.log("Logout button clicked");
    // Redirect to login page or logout user
    window.location.href = "/index.html";
  });
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

// Function to fetch data from IPFS
function fetchFromIPFS(ipfsHash, callback) {
  $.get("http://localhost:8080/ipfs/" + ipfsHash)
    .done(function (data) {
      console.log("Data from IPFS:", data);

      callback(data);
    })
    .fail(function () {
      console.error("Failed to fetch data from IPFS.");
    });
}

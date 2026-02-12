
let web3;
let userRegistry;
let accessControl;
let medicalDataRegistry;
let appointmentManager;
let diagnosisAndTreatment;

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

    // DiagnosisAndTreatment
    const deployedDiagnosisAndTreatment = contracts.DiagnosisAndTreatment.networks[networkId];
    if (!deployedDiagnosisAndTreatment) throw new Error("DiagnosisAndTreatment not deployed on this network.");
    diagnosisAndTreatment = new web3.eth.Contract(
      contracts.DiagnosisAndTreatment.abi,
      deployedDiagnosisAndTreatment.address
    );
    console.log("DiagnosisAndTreatment connected:", deployedDiagnosisAndTreatment.address);

    window.userRegistry = userRegistry;
    window.accessControl = accessControl;
    window.medicalDataRegistry = medicalDataRegistry;
    window.appointmentManager = appointmentManager;
    window.diagnosisAndTreatment = diagnosisAndTreatment;

    window.dispatchEvent(new Event("contractsReady"));  

   return true; // Successful connection
 } catch (err) {
   console.error("Error connecting to Web3 or contracts:", err);
   return false;
 }
 
}

window.addEventListener("load", async () => {
  const connected = await connect();
  console.log("connect() finished");
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

    $(".panel").removeClass("active");

    const targets = $(this).attr("data-target");
if (targets) {
  targets.split(/\s+/).forEach(id => {
    if (id.trim()) $("#" + id.trim()).addClass("active");
  });
}

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



// Renders a patient resource as formatted HTML for doctor page
function renderResource(resource) {
  if (!resource) return "";

  let html = "";

  if (resource.resourceType === "Patient") {
    const name = resource.name.map(n => n.given.join(" ") + " " + n.family).join(", ");
    const gender = resource.gender;
    const birthDate = resource.birthDate;
    const phone = resource.telecom?.find(t => t.system === "phone")?.value || "";
    const email = resource.telecom?.find(t => t.system === "email")?.value || "";
    const address = resource.address?.map(a => a.line.join(", ")).join("; ") || "";
    const allergies = resource.allergies?.map(a => 
      `${a.substance} (${a.reaction}, ${a.criticality})`).join(", ") || "None";

    html += `
      <div style="border:1px solid #ccc; padding:10px; margin:5px;">
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Gender:</strong> ${gender}</p>
        <p><strong>Birth Date:</strong> ${birthDate}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Address:</strong> ${address}</p>
        <p><strong>Allergies:</strong> ${allergies}</p>
      </div>
    `;
  }

  // ✅ Diagnosis section
  if (resource.diagnosis && resource.diagnosis.length > 0) {
    html += `<div style="border:1px solid #007bff; padding:10px; margin:5px;">
      <h5>Diagnosis History</h5>`;
    resource.diagnosis.forEach(d => {
      html += `
        <p><strong>Date:</strong> ${d.datetime}</p>
        <p><strong>Doctor:</strong> ${d.doctor}</p>
        <p><strong>Condition:</strong> ${d.diagnosed}</p>
        <p><strong>Clinical Status:</strong> ${d.clinicalStatus}</p>
        <p><strong>Severity:</strong> ${d.severity}</p>
        <p><strong>Affected Area:</strong> ${d.affectedArea}</p>
        <p><strong>Details:</strong> ${d.details}</p>
        <hr>
      `;
    });
    html += `</div>`;
  }

  // ✅ Treatment Plan section
  if (resource.treatmentPlan && resource.treatmentPlan.length > 0) {
    html += `<div style="border:1px solid #28a745; padding:10px; margin:5px;">
      <h5>Treatment History</h5>`;
    resource.treatmentPlan.forEach(t => {
      html += `
        <p><strong>Date:</strong> ${t.datetime}</p>
        <p><strong>Doctor:</strong> ${t.doctor}</p>
        <p><strong>Medication:</strong> ${t.medicationName}</p>
        <p><strong>Dose:</strong> ${t.dose}</p>
        <p><strong>Route:</strong> ${t.route}</p>
        <p><strong>Frequency:</strong> ${t.frequency}</p>
        <p><strong>Instructions:</strong> ${t.instructions}</p>
        <hr>
      `;
    });
    html += `</div>`;
  }

  return html;
}

// Convert record to plain text for download
function recordToPlainText(record) {
  let text = "Medical Record\n\n";

  const resources = record.resourceType === "Bundle" && Array.isArray(record.entry)
    ? record.entry.map(e => e.resource)
    : [record];

  resources.forEach(r => {
    if (r.name && r.name.length > 0) {
      const n = r.name[0];
      text += `Patient Name: ${n.given.join(" ")} ${n.family}\n`;
    }
    if (r.gender) text += `Gender: ${r.gender}\n`;
    if (r.birthDate) text += `Birth Date: ${r.birthDate}\n`;

    if (r.telecom && r.telecom.length > 0) {
      text += "Contacts:\n";
      r.telecom.forEach(t => text += `  ${t.system}: ${t.value}\n`);
    }

    if (r.address && r.address.length > 0) {
      text += "Addresses:\n";
      r.address.forEach(a => text += `  ${a.line ? a.line.join(", ") : ""}\n`);
    }

    if (r.allergies && r.allergies.length > 0) {
      text += "Allergies:\n";
      r.allergies.forEach(a => {
        text += `  ${a.substance}: ${a.reaction} (Criticality: ${a.criticality}, Recorded: ${a.recordedDate})\n`;
      });
    }

    if (r.diagnosis && r.diagnosis.length > 0) {
      text += "Diagnosis Submission:\n";
      r.diagnosis.forEach(d => text += `  ${d}\n`);
    }

    if (r.treatmentPlan && r.treatmentPlan.length > 0) {
      text += "Treatment Plan:\n";
      r.treatmentPlan.forEach(t => text += `  ${t}\n`);
    }

    text += "\n---------------------\n\n";
  });

  return text;
}
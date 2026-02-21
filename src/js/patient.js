var url_string = window.location.href;
var url = new URL(url_string);
var key;
var ipfs = null;
var Buffer = null;
let sessionAESKey = null; // <-- cache AES key for session

if (window.IpfsApi) {
  ipfs = window.IpfsApi("localhost", "5001");
  Buffer = window.IpfsApi.Buffer;
} else {
  console.warn("IpfsApi not loaded yet");
}


toggleRecordsButton = 0;
let decryptedRecordCache = null;
var recordHash = "";


async function getSessionAESKey() {
  if (sessionAESKey) return sessionAESKey;

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const patientAddress = accounts[0].toLowerCase(); // ✅ lowercase

  const password = await requestPassword();
  if (!password) throw new Error("Password required");

  // Only 1 param: patientAddress
  const wrappedRMK = await medicalDataRegistry.methods
    .getEncryptedAESKey(patientAddress)
    .call({ from: patientAddress });

  if (!wrappedRMK || wrappedRMK === "0x") {
    throw new Error("No encryption key found for patient");
  }

  // Derive UAK with lowercase address
  const uak = await window.deriveUAK(password, patientAddress);

  sessionAESKey = await window.unwrapRMK(wrappedRMK, uak);

  // Cache for session
  window.sessionAESKey = sessionAESKey;

  return sessionAESKey;
}





async function loadPatientData() {
  // Ensure contracts are ready
  if (!userRegistry || !accessControl) {
    console.error("Contracts not initialized yet!");
    return;
  }

  $("#records").hide();
  $(".alert-info").hide();
  $(".alert-danger").hide();

  try {
    const accounts = await web3.eth.getAccounts();
    key = accounts[0].toLowerCase();

    /* =======================
       Fetch patient info
    ======================== */
    const patient = await userRegistry.methods
      .getPatient(key)
      .call({ gas: 1000000 });

    console.log("Patient struct returned:", patient);

    $("#name").html(patient.firstName + " " + patient.lastName);
    $("#age").html(patient.age);

    $("#recordsHash").html(
      `<a href="http://localhost:8080/ipfs/${patient.record}" target="_blank">${patient.record}</a>`
    );

    recordHash = patient.record;

    /* =======================
       Handle proxy info
    ======================== */
    await checkAndHandleProxy(key);

     // Print out the available  doctors to share emr
     console.log("Getting Doctor List");
     userRegistry.methods
       .getDoctorList()
       .call({ gas: 1000000 }, function (error, result) {
         if (!error) {
           var DoctorList = result;
           var list = document.getElementById("permitDoctorList");
           list.innerHTML = ""; // Clear existing options
 
           DoctorList.forEach(function (doctorAddress) {
             userRegistry.methods
               .getDoctor(doctorAddress)
               .call({ gas: 1000000 }, function (error, result) {
                 if (!error) {
                   var fullName = result[0] + " " + result[1];
                   var option = document.createElement("option");
                   option.text = fullName;
                   option.value = doctorAddress;
                   list.add(option);
                 } else {
                   console.error(error);
                 }
               });
           });
         } else {
           console.error(error);
         }
       });
 
       populateDoctorDropdown("doctorSelect");
       populateDoctorDropdown("doctorInfoSelect");

       
 
     // Fetch and display doctors who have access
     console.log("Getting Accessed Doctor List");
     accessControl.methods
       .getAccessedDoctorListForPatient(key)
       .call({ gas: 1000000 }, function (error, result) {
         if (!error) {
           var doctorAddressList = result;
           var table = document.getElementById("accessDoc");
 
           // Clear existing rows except for the header before adding new ones
           while (table.rows.length > 1) {
             table.deleteRow(1);
           }
 
           // Add each doctor to the table
           doctorAddressList.forEach(function (doctorAddress) {
             userRegistry.methods
               .getDoctor(doctorAddress)
               .call({ gas: 1000000 }, function (error, result) {
                 if (!error) {
                   var fullName = result[0] + " " + result[1];
                   var publicKey = doctorAddress;
 
                   var row = table.insertRow(-1);
                   var cell1 = row.insertCell(0);
                   var cell2 = row.insertCell(1);
                   var cell3 = row.insertCell(2);
                   cell1.innerHTML = fullName;
                   cell2.innerHTML = publicKey;
                   cell3.innerHTML =
                     '<button onclick="revokeAccess(this)" class="btn btn-danger">Revoke access</button>';
                 } else {
                   console.error(error);
                 }
               });
           });
         } else {
           console.error(error);
         }
       });
   
 
   
  } catch (err) {
    console.error("Error loading patient data:", err);
  }
}


// Listen for contractsReady before loading patient data
window.addEventListener("contractsReady", async () => {
  try {
    // Prompt for password once and cache AES key
    await getSessionAESKey();

    // Load patient info
    await loadPatientData();

    // Load sent appointment requests (uses cached AES key, no prompt)
    await loadSentAppointmentRequests();

    // Other automatic data loads
    displayProxiesWithAccess();
    displayFormerProxies();
    fetchSymptoms();
  } catch (err) {
    console.warn("Unable to auto-load data:", err.message);
  }
});

document.getElementById("viewRecordsButton")?.addEventListener("click", async function() {
  
  await showRecords(this);   // 'this' is the button
});

// ==================== Load Sent Appointments Button ====================
document.getElementById("loadAppointmentsButton")?.addEventListener("click", async function() {
  await loadSentAppointmentRequests();
});

// Function to display medical records
async function showRecords(element) {
  console.log("=== showRecords called ===");

  if (toggleRecordsButton % 2 !== 0) {
    $("#records").hide();
    $("#downloadLinkContainer").empty();
    toggleRecordsButton -= 1;
    element.innerHTML = "View Medical Records";
    element.className = "btn btn-info btn-lg";
    return;
  }

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0].toLowerCase();
    console.log("Patient address:", patientAddress);

    const patientAESKey = await getSessionAESKey();
    console.log("Patient AES key:", patientAESKey);

    const recordHash = await medicalDataRegistry.methods
      .getHash(patientAddress)
      .call({ from: patientAddress });
    console.log("Record hash:", recordHash);

    if (!recordHash) throw new Error("No medical record uploaded");

    // Fetch encrypted JSON from IPFS via HTTP gateway
    const resp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
    const encryptedJson = await resp.text();
    const encryptedPayload = JSON.parse(encryptedJson);

    // Decrypt
    const decryptedString = await window.decryptAES(encryptedPayload, patientAESKey);
    const record = JSON.parse(decryptedString);
    console.log("Decrypted record:", record);

    // Render HTML
    let html = '<h5 style="text-align:center;font-weight:bold;">Medical Record</h5><br/>';
    if (record.resourceType === "Bundle" && Array.isArray(record.entry)) {
      record.entry.forEach((e) => {
        if (e.resource) html += renderResource(e.resource);
      });
    } else {
      html += renderResource(record);
    }

    const plainText = recordToPlainText(record);
    const fileName = getPatientName(record);

    $("#records").html(html).show();
    decryptedRecordCache = { html, plainText, fileName };

    $("#downloadLinkContainer").html(
      $("<button/>", {
        text: "Download Medical Record",
        class: "btn btn-primary",
        click: () => downloadMedicalRecord(plainText, fileName),
      })
    );

    toggleRecordsButton += 1;
    element.innerHTML = "Hide Medical Records";
    element.className = "btn btn-info btn-lg";

    console.log("Records displayed successfully!");
  } catch (err) {
    console.error("Error in showRecords:", err);
    alert(err.message);
  }
}





// Get the patient name for the filename
// Recursively find the first name in the record or its nested resources
function getPatientName(record) {
  // Case 1: Direct Patient resource
  if (record?.resourceType === "Patient" && record.name?.length) {
    const n = record.name[0];
    return `${n.given.join("_")}_${n.family}`;
  }

  // Case 2: FHIR Bundle (CORRECT STRUCTURE)
  if (record?.resourceType === "Bundle" && Array.isArray(record.entry)) {
    for (const e of record.entry) {
      const res = e.resource;
      if (res?.resourceType === "Patient" && res.name?.length) {
        const n = res.name[0];
        return `${n.given.join("_")}_${n.family}`;
      }
    }
  }

  return "Unknown_Unknown";
}

// Convert a record to plain text for PDF download
// Convert a record to plain text for download
function recordToPlainText(record) {
  let text = "Medical Record\n\n";

  const resources = record.resourceType === "Bundle" && Array.isArray(record.entry)
    ? record.entry.map(e => e.resource)
    : [record];

  resources.forEach(r => {
    // Patient Info
    if (r.name && r.name.length > 0) {
      const n = r.name[0];
      text += `Patient Name: ${n.given.join(" ")} ${n.family}\n`;
    }
    if (r.gender) text += `Gender: ${r.gender}\n`;
    if (r.birthDate) text += `Birth Date: ${r.birthDate}\n`;

    // Contacts
    if (r.telecom && r.telecom.length > 0) {
      text += "Contacts:\n";
      r.telecom.forEach(t => text += `  ${t.system}: ${t.value}\n`);
    }

    // Addresses
    if (r.address && r.address.length > 0) {
      text += "Addresses:\n";
      r.address.forEach(a => text += `  ${a.line ? a.line.join(", ") : ""}\n`);
    }

    // Allergies
    if (r.allergies && r.allergies.length > 0) {
      text += "Allergies:\n";
      r.allergies.forEach(a => {
        text += `  ${a.substance}: ${a.reaction} (Criticality: ${a.criticality}, Recorded: ${a.recordedDate})\n`;
      });
    }

    // Diagnosis History
    if (r.diagnosis && r.diagnosis.length > 0) {
      text += "Diagnosis History:\n";
      r.diagnosis.forEach(d => {
        text += `  Date: ${d.datetime}\n`;
        text += `  Doctor: ${d.doctor}\n`;
        text += `  Condition: ${d.diagnosed}\n`;
        text += `  Clinical Status: ${d.clinicalStatus}\n`;
        text += `  Severity: ${d.severity}\n`;
        text += `  Affected Area: ${d.affectedArea}\n`;
        text += `  Details: ${d.details}\n`;
        text += "  ------------------\n";
      });
    }

    // Treatment Plan History
    if (r.treatmentPlan && r.treatmentPlan.length > 0) {
      text += "Treatment History:\n";
      r.treatmentPlan.forEach(t => {
        text += `  Date: ${t.datetime}\n`;
        text += `  Doctor: ${t.doctor}\n`;
        text += `  Medication: ${t.medicationName}\n`;
        text += `  Dose: ${t.dose}\n`;
        text += `  Route: ${t.route}\n`;
        text += `  Frequency: ${t.frequency}\n`;
        text += `  Instructions: ${t.instructions}\n`;
        text += "  ------------------\n";
      });
    }

    text += "\n====================\n\n";
  });

  return text;
}


// Render a resource to HTML for browser display
// Render a resource to HTML for browser display (patient page)
function renderResource(r) {
  if (!r) return "";

  let html = '<div class="medical-record" style="border:1px solid #ccc;padding:10px;margin-bottom:10px;">';

  // Basic Patient Info
  if (r.name && r.name.length > 0) {
    const name = r.name[0];
    html += `<strong>Name:</strong> ${name.given.join(" ")} ${name.family}<br/>`;
  }
  if (r.gender) html += `<strong>Gender:</strong> ${r.gender}<br/>`;
  if (r.birthDate) html += `<strong>Birth Date:</strong> ${r.birthDate}<br/>`;

  // Contacts
  if (r.telecom && r.telecom.length > 0) {
    html += "<strong>Contacts:</strong><ul>";
    r.telecom.forEach(t => { html += `<li>${t.system}: ${t.value}</li>`; });
    html += "</ul>";
  }

  // Addresses
  if (r.address && r.address.length > 0) {
    html += "<strong>Addresses:</strong><ul>";
    r.address.forEach(a => { html += `<li>${a.line ? a.line.join(", ") : ""}</li>`; });
    html += "</ul>";
  }

  // Allergies
  if (r.allergies && r.allergies.length > 0) {
    html += "<strong>Allergies:</strong><ul>";
    r.allergies.forEach(a => {
      html += `<li>${a.substance}: ${a.reaction} (Criticality: ${a.criticality}, Recorded: ${a.recordedDate})</li>`;
    });
    html += "</ul>";
  }

  // Diagnosis History
  if (r.diagnosis && r.diagnosis.length > 0) {
    html += `<div style="border:1px solid #007bff; padding:10px; margin:5px;">
               <h5>Diagnosis History</h5>`;
    r.diagnosis.forEach(d => {
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

  // Treatment Plan History
  if (r.treatmentPlan && r.treatmentPlan.length > 0) {
    html += `<div style="border:1px solid #28a745; padding:10px; margin:5px;">
               <h5>Treatment History</h5>`;
    r.treatmentPlan.forEach(t => {
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

  html += "</div>";
  return html;
}


// Function to grant access to doctor
async function giveAccess() {
  const list = document.getElementById("permitDoctorList");
  const index = list.selectedIndex;

  if (index === -1) {
    alert("Please select a doctor.");
    return;
  }

  const doctorAddress = list.options[index].value;

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0];

    // 1️⃣ Grant logical access
    await accessControl.methods
      .grantDoctorAccess(doctorAddress)
      .send({
        from: patientAddress,
        gas: 1000000,
        value: web3.utils.toWei("2", "ether"),
      });

    // 2️⃣ Get Record Master Key
    const rmk = await getSessionAESKey();
    if (!rmk) throw new Error("Session AES key missing");

    // 3️⃣ Derive doctor-specific key
    const doctorUAK = await window.deriveUAKForDoctor(doctorAddress);

    // 4️⃣ Wrap RMK for doctor
    const wrappedRMK = await window.wrapRMK(rmk, doctorUAK);

    // 5️⃣ Store encrypted key on-chain
    await medicalDataRegistry.methods
      .setEncryptedAESKey(
        patientAddress,
        doctorAddress,
        wrappedRMK
      )
      .send({
        from: patientAddress,
        gas: 1000000,
      });

    alert("Access granted successfully.");
    location.reload();

  } catch (err) {
    console.error("Grant access failed:", err);
    alert(err.message || "Failed to grant access.");
  }
}

// Function to revoke access to doctor

function revokeAccess(element) {
  rowNo = element.parentNode.parentNode.rowIndex;
  Row = element.parentNode.parentNode;
  var Cells = Row.getElementsByTagName("td");
  var docKey = Row.cells[1].firstChild.nodeValue;

  // Get the current user's account address
  web3.eth.getAccounts().then((accounts) => {
    const fromAddress = accounts[0];

    // Call the contract's revoke_access method
    accessControl.methods
      .revokeDoctorAccess(docKey)
      .send({
        from: fromAddress,
        gas: 1000000,
      })
      .on("transactionHash", function (hash) {
        console.log("Transaction Hash:", hash);
      })
      .on("confirmation", function (confirmationNumber, receipt) {
        console.log("Confirmation:", confirmationNumber, receipt);
        document.getElementById("accessDoc").deleteRow(rowNo);
      })
      .on("error", function (error) {
        $(".alert-danger").show();
        console.error("Error:", error);
      });
  });
}

// Function to populate  dropdown for selecting doctors
function populateDoctorDropdown(dropdownId) {
  console.log("populateDoctorDropdown called for:", dropdownId);

  // Ensure contractInstance is defined
  if (!userRegistry) {
    console.error("contractInstance is not defined.");
    return;
  }

  userRegistry.methods
    .getDoctorList()
    .call({ gas: 1000000 }, function (error, DoctorList) {
      if (error) {
        console.error("Error fetching doctor list:", error);
        return;
      }

      var list = document.getElementById(dropdownId);
      if (!list) {
        console.error("Dropdown element not found: " + dropdownId);
        return;
      }

      list.innerHTML = ""; // Clear existing options
      console.log("Doctor list received:", DoctorList);

      DoctorList.forEach(function (doctorAddress, index) {
        console.log("Fetching details for doctor at index:", index);
        userRegistry.methods
          .getDoctor(doctorAddress)
          .call({ gas: 1000000 }, function (error, doctorDetails) {
            if (error) {
              console.error("Error fetching doctor details:", error);
              return;
            }

            var fullName = doctorDetails[0] + " " + doctorDetails[1];
            var option = document.createElement("option");
            option.text = fullName;
            option.value = doctorAddress;
            list.appendChild(option);
          });
      });
    });
}

// Function to display doctor's information
function viewDoctorInfo() {
  var doctorSelect = document.getElementById("doctorInfoSelect");
  var selectedDoctorAddress = doctorSelect.value;

  if (
    !selectedDoctorAddress ||
    selectedDoctorAddress === "-- Please Select --"
  ) {
    alert("Please select a doctor to view their information.");
    return;
  }
  document.getElementById("doctorInfoDisplay").style.display = "none";
  // Fetch doctor's info from the smart contract
  userRegistry.methods
    .getDoctor(selectedDoctorAddress)
    .call({ from: key })
    .then(function (doctorDetails) {
      var ipfsHash = doctorDetails[4];

      if (!ipfsHash || ipfsHash === "0x" || ipfsHash === "0x0") {

        document.getElementById("doctorInfoDisplay").innerHTML =
          "Doctor information not available.";
        return;
      }

      // Fetch doctor's information from IPFS
      $.get("http://localhost:8080/ipfs/" + ipfsHash, function (data) {
        // Extracting relevant information from the raw data
        var lines = data.split(/\r?\n/).map(l => l.trim());

        var gender = lines.find(l => l.toLowerCase().startsWith("gender:"));
        var contact = lines.find(l => l.toLowerCase().startsWith("contact:"));
        var specialty = lines.find(
        l => l.toLowerCase().startsWith("specialty:")
     || l.toLowerCase().startsWith("speciality:")
);
        var yearsOfExperienceLine = lines.find((line) =>
          line.startsWith("Years of Experience:")
        );
        var yearsOfExperience = yearsOfExperienceLine.split(":")[1].trim();

        console.log("IPFS lines:", lines);
        console.log("Found specialty line:", specialty);


        var content = `
        <div class="doctor-info">
          <p>First Name: ${doctorDetails[0]}</p>
          <p>Last Name: ${doctorDetails[1]}</p>
          <p>Years of Experience: ${yearsOfExperience}</p>
          <p>${gender}</p>
          <p>${contact}</p>
          <p>${specialty}</p>
        </div>
      `;
      

        document.getElementById("doctorInfoDisplay").innerHTML = content;
        document.getElementById("doctorInfoDisplay").style.display = "block";
        
      }).fail(function () {
        console.error("Failed to fetch data from IPFS.");
        document.getElementById("doctorInfoDisplay").innerHTML =
          "Error loading doctor information.";
      });
    })
    .catch(function (error) {
      console.error("Error fetching doctor details:", error);
      document.getElementById("doctorInfoDisplay").innerHTML =
        "Error loading doctor information.";
    });
}


// Function to request appointment with doctor
async function scheduleAppointment() {
  const doctorId = $("#doctorSelect").val();
  const appointmentDate = $("#appointmentDate").val().replace(/-/g, "");
  const [hour, minute] = $("#appointmentHour").val().split(":").map(Number);

  if (!doctorId || !appointmentDate || isNaN(hour)) {
    alert("Please fill in all the fields.");
    return;
  }

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0].toLowerCase();

    // Ensure doctor has access
    const patientList = await accessControl.methods
      .getAccessedPatientListForDoctor(doctorId)
      .call();

    if (!patientList.map(a => a.toLowerCase()).includes(patientAddress)) {
      alert("Doctor does not have access. Grant access first.");
      return;
    }

    const patientResult = await userRegistry.methods.getPatient(patientAddress).call();
    const doctorResult = await userRegistry.methods.getDoctor(doctorId).call();

    const appointment = {
      resourceType: "Appointment",
      status: "Pending",
      start: `${appointmentDate}T${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}:00Z`,
      participant: [
        {
          actor: {
            reference: `Patient/${patientAddress}`,
            display: `${patientResult[0]} ${patientResult[1]}`
          },
          status: "needs-action"
        },
        {
          actor: {
            reference: `Practitioner/${doctorId}`,
            display: `${doctorResult[0]} ${doctorResult[1]}`
          },
          status: "needs-action"
        }
      ]
    };

    /* ============================
       🔐 CORRECT ENCRYPTION FLOW
    ============================ */

    // 1️⃣ Generate per-appointment AES key
    const appointmentAESKey = await window.generateAESKey();

    // 2️⃣ Encrypt appointment
    const encrypted = await window.encryptAES(
      JSON.stringify(appointment),
      appointmentAESKey
    );

    // 3️⃣ Wrap AES key for doctor
    const doctorUAK = await window.deriveUAKForDoctor(doctorId);
    const wrappedKeyForDoctor = await window.wrapRMK(
      appointmentAESKey,
      doctorUAK
    );

    // 4️⃣ Wrap AES key for patient
    const patientSessionKey = await getSessionAESKey();
    const wrappedKeyForPatient = await window.wrapRMK(
      appointmentAESKey,
      patientSessionKey
    );

    // 4.1️⃣ Wrap AES key for proxy (if patient has a proxy)
    let wrappedKeyForProxy = null;
    try {
      const proxyDetails = await userRegistry.methods.getProxyByPatient(patientAddress).call();
      const proxyAddress = proxyDetails[0]; // adjust based on your contract return
      if (proxyAddress && proxyAddress !== "0x0000000000000000000000000000000000000000") {
        const proxyUAK = await window.deriveUAKForDoctor(proxyAddress);
        wrappedKeyForProxy = await window.wrapRMK(appointmentAESKey, proxyUAK);
        console.log("Wrapped AES key for proxy:", proxyAddress);
      }
    } catch (e) {
      console.warn("No proxy detected for patient, skipping proxy wrap.", e);
    }

    // 5️⃣ Store payload in IPFS
    const ipfsPayload = {
      iv: encrypted.iv,
      data: encrypted.data,
      aesKeyWrappedForDoctor: wrappedKeyForDoctor,
      aesKeyWrappedForPatient: wrappedKeyForPatient,
      aesKeyWrappedForProxy: wrappedKeyForProxy // ✅ new field
    };

    const buffer = ipfs.Buffer.from(JSON.stringify(ipfsPayload), "utf8");
    const result = await ipfs.files.add(buffer);
    const ipfsHash = result[0].hash;

    // 6️⃣ Store appointment reference on-chain
    await appointmentManager.methods
      .requestAppointment(
        doctorId,
        ipfsHash,
        parseInt(appointmentDate, 10),
        hour
      )
      .send({ from: patientAddress, gas: 1000000 });

    alert("Appointment request sent successfully!");
    console.log("✅ Appointment encrypted, uploaded, and scheduled:", ipfsHash);

  } catch (err) {
    console.error("scheduleAppointment failed:", err);
    alert(err.message || "Failed to schedule appointment.");
  }
}



// Function to load  appointment requests sent to doctors
async function loadSentAppointmentRequests() {
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0].toLowerCase();
    const patientSessionKey = await getSessionAESKey();

    $("#sentAppointmentRequests tbody").empty();

    const appointmentIds = await appointmentManager.methods.getPatientAppointments(patientAddress).call();

    for (const id of appointmentIds) {
      const appointmentOnChain = await appointmentManager.methods.appointments(id).call();
      if (!appointmentOnChain.ipfsHash || appointmentOnChain.ipfsHash === "0x") continue;

      // Fetch encrypted payload
      let encryptedPayload;
      try {
        const files = await ipfs.files.get(appointmentOnChain.ipfsHash);
        const file = files.find(f => f.content);
        if (!file) continue;
        encryptedPayload = JSON.parse(new TextDecoder().decode(file.content));
      } catch {
        console.warn("⚠️ Failed to fetch IPFS data for appointment", id);
        continue;
      }

      // Decrypt using patient key
      if (!encryptedPayload.aesKeyWrappedForPatient) continue;
      let appointmentData;
      try {
        const appointmentAESKey = await window.unwrapRMK(encryptedPayload.aesKeyWrappedForPatient, patientSessionKey);
        const decrypted = await window.decryptAES({ iv: encryptedPayload.iv, data: encryptedPayload.data }, appointmentAESKey);
        appointmentData = JSON.parse(decrypted);
      } catch {
        console.warn("⚠️ Failed to decrypt appointment", id);
        continue;
      }

      // Resolve doctor name and status
      let doctorName = "Unknown Doctor";
      try {
        const doctor = await userRegistry.methods.getDoctor(appointmentOnChain.doctorAddress).call();
        doctorName = `${doctor[0]} ${doctor[1]}`;
      } catch {}

      const status = appointmentOnChain.isAccepted ? "Accepted" : appointmentOnChain.isRejected ? "Rejected" : "Pending";

      displaySentAppointmentRequest(id, appointmentData, status, doctorName);
    }

  } catch (err) {
    console.error("loadSentAppointmentRequests failed:", err);
  }
}




// Function to display the requests
function displaySentAppointmentRequest(id, appointment, status, doctorName) {
  console.log(`Full Appointment ${id} Data:`, appointment);

  var match = appointment.start.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
  );
  var appointmentDate = "Invalid Date";
  var appointmentTime = "Invalid Time";
  if (match) {
    var date = new Date(
      Date.UTC(
        parseInt(match[1], 10),
        parseInt(match[2], 10) - 1,
        parseInt(match[3], 10),
        parseInt(match[4], 10),
        parseInt(match[5], 10),
        parseInt(match[6], 10)
      )
    );
    appointmentDate = date.toISOString().substring(0, 10);
    appointmentTime = date.toISOString().substring(11, 16);
  }

  var row = $("<tr>");
  $("<td>", { class: "doctorName" }).text(doctorName).appendTo(row);
  $("<td>", { class: "appointmentDate" }).text(appointmentDate).appendTo(row);
  $("<td>", { class: "appointmentTime" }).text(appointmentTime).appendTo(row);
  var statusCell = $("<td>").text(status).appendTo(row);
  if (status === "Accepted") {
    statusCell.addClass("accepted-status");
  } else if (status === "Rejected") {
    statusCell.addClass("rejected-status");
  } else if (status === "Pending") {
    statusCell.addClass("pending-status");
  } else {
    statusCell.addClass("unknown-status");
  }
  $("#sentAppointmentRequests tbody").append(row);
}

document.addEventListener("DOMContentLoaded", function () {
  var today = new Date().toISOString().split("T")[0]; // Format today's date as YYYY-MM-DD
  $("#appointmentDate").attr("min", today);
  $("#appointmentDate").change(function () {
    var selectedDate = new Date(this.value);
    var dayOfWeek = selectedDate.getDay();

    // Check if the selected day is Saturday (6) or Sunday (0)
    // TRestrict patient to schedule appointment only on weekdays
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      alert(
        "Appointments cannot be scheduled on weekends. Please select a weekday."
      );
      this.value = ""; // Reset the date input
      $("#availableHoursContainer").hide();
      return; // Exit the function if a weekend is selected
    }
    $("#appointmentHour").attr("min", "08:00");
    $("#appointmentHour").attr("max", "19:00");

    // Proceed to populate hours dropdown
    populateHoursDropdown();
  });

  // Event delegation for revoke access buttons within the accessProxy table
  $("#accessProxy").on("click", ".revoke-proxy-access", function () {
    var proxyAddress = $(this).data("proxy-address");
    if (!proxyAddress) {
      console.error("Proxy address is undefined.");
      return;
    }
    // Pass the button itself and the proxy address
    revokeProxyAccess(proxyAddress);
  });

  // Fetch symptoms when the document is ready
  fetchSymptoms();

  // initialize views
  var panels = document.querySelectorAll(".panel");
  // Initially hide all panels except the personalInfoPanel
  panels.forEach(function (panel) {
    if (panel.id !== "personalInfoPanel") {
      panel.style.display = "none";
    } else {
      panel.style.display = "block"; // Ensure personalInfoPanel is visible
    }
  });

  // Setup event listeners for sidebar links
  var sidebarLinks = document.querySelectorAll(".list-group-item");
  sidebarLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      var targetPanelId = this.getAttribute("data-target");
      panels.forEach(function (panel) {
        if (panel.id === targetPanelId) {
          panel.style.display = "block"; // Show the clicked panel
        } else {
          panel.style.display = "none"; // Hide others
        }
      });
    });
  });

  // reset symptoms
  const resetButton = document.getElementById("resetButton");
  if (resetButton) {
    resetButton.addEventListener("click", function () {
      // Reset all checkboxes
      const checkboxes = document.querySelectorAll(
        '#symptomsContainer input[type="checkbox"]'
      );
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
      });

      // Clear diagnosis display and reset any styles
      const diagnosisResult = document.getElementById("predictionResult");
      if (diagnosisResult) {
        diagnosisResult.innerHTML = ""; // Clears the content
        diagnosisResult.style.display = "none";
        diagnosisResult.style.color = "black";
      }
    });
  }

  //calendar initialization

  var calendarEl = document.getElementById("calendar");
  var calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    events: [],
    eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: true },
    eventContent: function (arg) {
      return {
        html: `<div class="event-time">${
          arg.event.title.split(" ")[0]
        }</div><div class="event-title">${
          arg.event.extendedProps.description
        }</div>`,
      };
    },
  });

  calendar.render();
  function updateCalendarVisibility() {
    if ($("#calendar").is(":visible")) {
      calendar.updateSize();
    }
  }

  // MutationObserver Configuration
  const config = { attributes: true, childList: true, subtree: true };
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
      ) {
        updateCalendarVisibility();
      }
    });
  });

  // Start observing the target node for configured mutations
  observer.observe(document.body, config);

  // Clean up observer on page unload
  $(window).on("unload", function () {
    observer.disconnect();
  });

  setTimeout(function () {
    loadAcceptedAppointments(calendar);
  }, 1000);
});

// Function to load accepted appointments (patient view)
async function loadAcceptedAppointments(calendar) {
  try {
    const accounts = await ethereum.request({ method: "eth_accounts" });
    const patientAddress = accounts[0].toLowerCase();
    const patientSessionKey = await getSessionAESKey();

    const appointmentIds = await appointmentManager.methods
      .getPatientAppointments(patientAddress)
      .call();

    for (const appointmentId of appointmentIds) {
      const appointmentOnChain = await appointmentManager.methods
        .appointments(appointmentId)
        .call();

      if (!appointmentOnChain.ipfsHash || appointmentOnChain.ipfsHash === "0x") continue;

      let encryptedPayload;
      try {
        const files = await ipfs.files.get(appointmentOnChain.ipfsHash);
        const file = files.find(f => f.content);
        if (!file) continue;

        encryptedPayload = JSON.parse(new TextDecoder().decode(file.content));
      } catch (e) {
        console.warn(`⚠️ Failed to fetch IPFS data for appointment ${appointmentId}, skipping`, e);
        continue;
      }

      let appointmentAESKey = null;
      try {
        // Try patient key first
        if (encryptedPayload.aesKeyWrappedForPatient) {
          appointmentAESKey = await window.unwrapRMK(
            encryptedPayload.aesKeyWrappedForPatient,
            patientSessionKey
          );
        }
        // If patient key unavailable, try proxy key
        else if (encryptedPayload.aesKeyWrappedForProxy) {
          appointmentAESKey = await window.unwrapRMK(
            encryptedPayload.aesKeyWrappedForProxy,
            patientSessionKey // still use patient session key to unwrap proxy-created appointments
          );
        }
      } catch (e) {
        console.warn(`⚠️ Failed to unwrap AES key for appointment ${appointmentId}, skipping`, e);
        continue;
      }

      if (!appointmentAESKey) continue;

      let appointmentData = null;
      try {
        const decrypted = await window.decryptAES(
          { iv: encryptedPayload.iv, data: encryptedPayload.data },
          appointmentAESKey
        );
        appointmentData = JSON.parse(decrypted);
      } catch (e) {
        console.warn(`⚠️ Failed to decrypt appointment ${appointmentId}, skipping`, e);
        continue;
      }

      // Determine status
      let status = "Pending";
      if (appointmentOnChain.isAccepted) status = "Accepted";
      else if (appointmentOnChain.isRejected) status = "Rejected";

      // Format date & time
      let appointmentDate = "Unknown Date";
      let appointmentTime = "Unknown Time";
      if (appointmentData?.start) {
        const match = appointmentData.start.match(
          /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
        );
        if (match) {
          const date = new Date(
            Date.UTC(
              parseInt(match[1], 10),
              parseInt(match[2], 10) - 1,
              parseInt(match[3], 10),
              parseInt(match[4], 10),
              parseInt(match[5], 10),
              parseInt(match[6], 10)
            )
          );
          appointmentDate = date.toISOString().substring(0, 10);
          appointmentTime = date.toISOString().substring(11, 16);
        }
      }

      // Fetch doctor name
      let doctorName = "Unknown Doctor";
      try {
        const doctor = await userRegistry.methods
          .getDoctor(appointmentOnChain.doctorAddress)
          .call();
        doctorName = `${doctor[0]} ${doctor[1]}`;
      } catch {}

      // Display in table
      const row = $("<tr>");
      $("<td>", { class: "doctorName" }).text(doctorName).appendTo(row);
      $("<td>", { class: "appointmentDate" }).text(appointmentDate).appendTo(row);
      $("<td>", { class: "appointmentTime" }).text(appointmentTime).appendTo(row);
      const statusCell = $("<td>").text(status).appendTo(row);
      if (status === "Accepted") statusCell.addClass("accepted-status");
      else if (status === "Rejected") statusCell.addClass("rejected-status");
      else if (status === "Pending") statusCell.addClass("pending-status");
      else statusCell.addClass("unknown-status");

      $("#acceptedAppointments tbody").append(row);

      // Add to calendar only if accepted
      if (appointmentData && status === "Accepted") {
        addEventToCalendar(appointmentData, calendar);
      }
    }
  } catch (err) {
    console.error("loadAcceptedAppointments failed:", err);
  }
}

// function to add details of appointment to calendar
function addEventToCalendar(appointmentData, calendar) {
  if (!calendar) {
    console.error("Calendar not defined");
    return;
  }

  try {
    // Ensure the date is parsed correctly
    const date = moment(appointmentData.start, "YYYYMMDDTHH:mm:ssZ").utc();
    const formattedDate = date.format("YYYY-MM-DD");
    const formattedTime = date.format("HH:mm");

    // Find the patient's name in the participant array
    const doctorInfo = appointmentData.participant.find((p) =>
      p.actor.reference.startsWith("Practitioner")
    );
    const doctorName = doctorInfo ? doctorInfo.actor.display : "Unknown Doctor";

    // Check if patient's name was found
    if (doctorName === "Unknown Doctor") {
      console.error("Doctor name is missing in appointment data");
    }

    calendar.addEvent({
      title: `${formattedTime} ${doctorName}`,
      start: formattedDate + "T" + formattedTime,
      allDay: false,
      color: "rgba(255, 179, 128, 0.5)", // Peach background with transparency
      textColor: "#f26d21", // Orange text
      extendedProps: {
        description: doctorName, // Added to use in custom rendering
      },
    });
  } catch (e) {
    console.error("Error in adding event to calendar:", e);
  }
}
// Function to populate dropdown for displaying only the available times for appointments based on the date selected
function populateHoursDropdown() {
  const selectedDate = $("#appointmentDate").val(); //  "YYYY-MM-DD" format
  const formattedDate = selectedDate.replace(/-/g, ""); // Convert date to "YYYYMMDD" format
  const doctorId = $("#doctorSelect").val(); // Get selected doctor's Ethereum address

  // Clear existing options in the dropdown
  const hoursDropdown = $("#appointmentHour");
  hoursDropdown.empty();

  // Define  hours (8 AM to 7 PM)
  const startHour = 8;
  const endHour = 19;

  // Store all promises for the availability checks
  let availabilityPromises = [];

  for (let hour = startHour; hour <= endHour; hour++) {
    // Push each availability check promise to the array
    let promise = appointmentManager.methods
      .isTimeSlotAvailable(doctorId, formattedDate, hour)
      .call()
      .then((isAvailable) => ({ hour, isAvailable }));

    availabilityPromises.push(promise);
  }

  // Wait for all availability checks to complete
  Promise.all(availabilityPromises)
    .then((results) => {
      let optionsAdded = 0;
      results.forEach(({ hour, isAvailable }) => {
        if (isAvailable) {
          // For each available hour, add options for every minute
          for (let minute = 0; minute < 60; minute++) {
            let displayTime = `${hour < 10 ? `0${hour}` : hour}:${
              minute < 10 ? `0${minute}` : minute
            }`;
            hoursDropdown.append(new Option(displayTime, `${hour}:${minute}`));
            optionsAdded++;
          }
        }
      });

      // After all checks, determine if "No available hours" should be displayed
      if (optionsAdded === 0) {
        hoursDropdown.append(new Option("No available hours", ""));
        $("#submitAppointmentButton").prop("disabled", true); // Disable the submit button if no hours are available
      } else {
        $("#submitAppointmentButton").prop("disabled", false); // Enable the submit button if there are available hours
      }

      $("#availableHoursContainer").show(); // Show the dropdown after populating it
    })
    .catch((error) => {
      console.error("Error fetching availability:", error);
    });
}

// Function to designate proxy
async function designateProxy() {
  try {
    // ---------- Get patient address FIRST ----------
    const accounts = await web3.eth.getAccounts();
    const patientAddress = accounts[0];

    // ---------- Form values ----------
    const proxyFirstName = $("#proxyFirstName").val();
    const proxyLastName = $("#proxyLastName").val();
    const proxyDOB = $("#proxyDOB").val();
    const proxyAge = $("#proxyAge").val();
    const proxyAddress = $("#proxyAddress").val();
    const proxyPhone = $("#proxyPhone").val();
    const proxyEmail = $("#proxyEmail").val();
    const consentGiven = $("#consentDropdown").val() === "yes";

    if (!consentGiven) {
      alert("Consent not given. Proxy cannot be designated.");
      return;
    }

    // ---------- Hash proxy details ----------
    const detailsConcat =
      `${proxyFirstName}${proxyLastName}${proxyDOB}${proxyAddress}${proxyPhone}${proxyEmail}`;
    const detailsHash = web3.utils.sha3(detailsConcat);

    // ---------- Generate token ----------
    const token = generateTokenForProxy(proxyEmail);

    // ---------- Get wrapped RMK from session ----------
    const rmk = await getSessionAESKey();

    // ---------- Derive temporary key from token ----------
    const tempKey = await window.deriveTempKeyFromToken(token);

    // ---------- Wrap RMK with temp key ----------
    const tempWrappedRMK = await window.wrapRMK(rmk, tempKey);

    // ---------- Store temp wrapped RMK on IPFS ----------
    const ipfs = window.IpfsApi("localhost", "5001");
    const Buffer = window.IpfsApi().Buffer;

    // Convert to JSON string BEFORE storing
    const buffer = Buffer.from(JSON.stringify(tempWrappedRMK));
    const result = await ipfs.files.add(buffer);
    const tempWrappedRMKHash = result[0].hash;

    // ---------- Store designation on-chain ----------
    await userRegistry.methods
      .designateProxy(token, detailsHash, tempWrappedRMKHash)
      .send({ from: patientAddress });

    // ---------- Send token email ----------
    sendTokenToProxyEmail(proxyEmail, token, proxyFirstName, proxyLastName);

    alert("Proxy designated successfully. Token sent to email.");
  } catch (error) {
    console.error("Failed to designate proxy:", error);
    alert("Failed to designate proxy. Please try again.");
  }
}


// Function to generate token to send to proxy's email
function generateTokenForProxy() {
  // Create a random string of 16 characters (letters and numbers)
  let token = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < 16; i++) {
    token += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  // Append a timestamp for added uniqueness
  token += "-" + new Date().getTime().toString(36);

  return token;
}

// Function to send tpken to proxy's email
// ✅ FIXED: Send token to proxy's email (handles encrypted FHIR record)
async function sendTokenToProxyEmail(proxyEmail, token, proxyFirstName, proxyLastName) {
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0].toLowerCase();

    // 1️⃣ Get patient's AES key (already cached after login)
    const patientAESKey = await getSessionAESKey();
    if (!patientAESKey) throw new Error("Patient AES key not available");

    // 2️⃣ Get patient record hash
    const recordHash = await medicalDataRegistry.methods
      .getHash(patientAddress)
      .call();

    if (!recordHash) throw new Error("Patient record hash not found");

    // 3️⃣ Fetch encrypted record from IPFS
    const resp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
    const encryptedPayload = await resp.json(); // { iv, data }

    // 4️⃣ Decrypt record
    const decryptedStr = await window.decryptAES(encryptedPayload, patientAESKey);
    const record = JSON.parse(decryptedStr);

    // 5️⃣ Extract patient name from FHIR record
    let patientName = "Patient";

    if (record.resourceType === "Bundle" && Array.isArray(record.entry)) {
      const patientEntry = record.entry.find(
        e => e.resource?.resourceType === "Patient"
      );

      if (patientEntry?.resource?.name?.length) {
        const n = patientEntry.resource.name[0];
        patientName = `${n.given.join(" ")} ${n.family}`;
      }
    } else if (record.resourceType === "Patient" && record.name?.length) {
      const n = record.name[0];
      patientName = `${n.given.join(" ")} ${n.family}`;
    }

    // 6️⃣ Prepare EmailJS template params
    const templateParams = {
      proxy_email: proxyEmail,
      proxy_name: `${proxyFirstName} ${proxyLastName}`,
      patient_name: patientName,
      token: token,
      from_name: "Electronic Medical Records Service",
    };

    console.log("📤 Sending proxy token email:", templateParams);

    // 7️⃣ Send email
    await emailjs.send(
      "service_f9n994l",
      "template_bwpjgsk",
      templateParams
    );

    console.log("✅ Proxy token email sent successfully");

  } catch (err) {
    console.error("❌ sendTokenToProxyEmail failed:", err);
    alert("Failed to send token email to proxy.");
  }
}


// Function to display the proxies that have access
function displayProxiesWithAccess() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0];

    userRegistry.methods
      .getPatient(patientAddress)
      .call()
      .then((patientInfo) => {
        const age = parseInt(patientInfo[2], 10);

        accessControl.methods
          .getAccessedProxyListForPatient(patientAddress)
          .call()
          .then((proxyAddressList) => {
            var table = document.getElementById("accessProxy");
            var rowCount = table.rows.length;
            for (var i = rowCount - 1; i > 0; i--) {
              table.deleteRow(i);
            }
            // Check if the proxy address is null, if it is null it means the proxy does not exist
            proxyAddressList.forEach((proxyAddress, index) => {
              if (
                proxyAddress !== "0x0000000000000000000000000000000000000000"
              ) {
                userRegistry.methods
                  .getProxy(proxyAddress)
                  .call()
                  .then((proxyDetails) => {
                    var row = table.insertRow(-1);
                    var cell1 = row.insertCell(0);
                    var cell2 = row.insertCell(1);
                    var cell3 = row.insertCell(2);
                    cell1.innerHTML =
                      proxyDetails.firstName + " " + proxyDetails.lastName;
                    cell2.innerHTML = proxyAddress;
                    var btn = document.createElement("button");
                    btn.className = "btn btn-danger revoke-proxy-access";
                    btn.innerHTML = "Revoke access";
                    btn.onclick = function () {
                      revokeProxyAccess(proxyAddress);
                    };
                    if (age < 16) {
                      // Disable the button if the patient is under 16
                      btn.disabled = true;
                      btn.title = "You cannot revoke access until you are 16.";
                    }
                    cell3.appendChild(btn);
                  })
                  .catch((error) => {
                    console.error("Error fetching proxy details:", error);
                  });
              }
            });
          })
          .catch((error) => {
            console.error("Error fetching proxy list:", error);
          });
      })
      .catch((error) => {
        console.error("Error retrieving patient info:", error);
      });
  });
}

// Function to revoke access to proxy
function revokeProxyAccess() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // The account invoking the transaction

    console.log("Patient Address:", patientAddress);

    // Check if the patient has a designated proxy before attempting to revoke
    accessControl.methods
      .getAccessedProxyListForPatient(patientAddress)
      .call()
      .then((proxyList) => {
        if (
          proxyList.length === 0 ||
          proxyList[0] === "0x0000000000000000000000000000000000000000"
        ) {
          console.error("The patient does not have a designated proxy.");
          return;
        }

        console.log("Revoking access for proxy of patient:", patientAddress);

        // Calling the revokeProxyAccess function without the need for a proxyAddress
        accessControl.methods
          .revokeProxyAccess()
          .send({ from: patientAddress, gas: 1000000 })
          .then((receipt) => {
            console.log("Proxy access revoked successfully:", receipt);
          })
          .catch((error) => {
            console.error("Error revoking proxy access:", error);
          });
      })
      .catch((error) => {
        console.error("Error fetching proxy details:", error);
      });
  });
}

// Function to display former proxies
function displayFormerProxies() {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0]; // Assuming the patient is logged in

    userRegistry.methods
      .getProxyList()
      .call({ from: patientAddress })
      .then((proxyAddresses) => {
        proxyAddresses.forEach((proxyAddress) => {
          userRegistry.methods
            .getProxy(proxyAddress)
            .call()
            .then((proxy) => {
              if (
                !proxy.isAuthorized &&
                proxy.patientAddress.toLowerCase() ===
                  patientAddress.toLowerCase()
              ) {
                const table = document.getElementById("formerProxyTable");
                const row = table.insertRow(-1);
                const nameCell = row.insertCell(0);
                const publicKeyCell = row.insertCell(1);
                const actionCell = row.insertCell(2);

                nameCell.innerHTML = `${proxy.firstName} ${proxy.lastName}`;
                publicKeyCell.innerHTML = proxyAddress;
                actionCell.innerHTML = `<button onclick="regrantProxyAccess('${proxyAddress}')" class="btn btn-primary">Regrant Access</button>`;
              }
            });
        });
      });
  });
}

// Function to grant again access to a proxy that has been revoked access
function regrantProxyAccess(proxyAddress) {
  web3.eth.getAccounts().then((accounts) => {
    const patientAddress = accounts[0];
    console.log(
      `Attempting to regrant access for proxy: ${proxyAddress} by patient: ${patientAddress}`
    );

    accessControl.methods
      .regrantProxyAccess(proxyAddress)
      .send({
        from: patientAddress,
        gas: 1000000,
        value: web3.utils.toWei("2", "ether"),
      })
      .then((receipt) => {
        console.log("Transaction receipt:", receipt);
        alert("Access has been successfully regranted to the proxy.");
        // Optionally, refresh the list of current and former proxies
        displayProxiesWithAccess();
        displayFormerProxies();
      })
      .catch((error) => {
        console.error("Failed to regrant access to proxy:", error);
        alert("Failed to regrant access. Please try again.");
      });
  });
}

// Function to add allergy data to existing record
async function addPatientAllergy() {
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0].toLowerCase();

    const substance = $("#allergySubstance").val();
    const reaction = $("#reaction").val();
    const criticality = $("#criticality").val();

    if (!substance || !reaction || !criticality) {
      alert("Please fill in all fields.");
      return;
    }

    const patientAESKey = await getSessionAESKey(); // Use cached session AES key

    // Fetch current IPFS record
    const ipfsHash = await medicalDataRegistry.methods.getHash(patientAddress).call();
    if (!ipfsHash) {
      alert("No medical record found.");
      return;
    }

    const files = await ipfs.files.get(ipfsHash);
    const file = files.find((f) => f.content);
    if (!file) {
      alert("Invalid IPFS data.");
      return;
    }

    const encryptedJson = new TextDecoder().decode(file.content);
    const encryptedPayload = JSON.parse(encryptedJson);
    const decrypted = await window.decryptAES(encryptedPayload, patientAESKey);
    let record = JSON.parse(decrypted);

    // Add allergy
    if (!record.allergies) record.allergies = [];
    record.allergies.push({
      substance,
      reaction,
      criticality,
      recordedDate: new Date().toISOString(),
    });

    // Re-encrypt and upload
    const updatedEncrypted = await window.encryptAES(JSON.stringify(record), patientAESKey);
    const buffer = ipfs.Buffer.from(JSON.stringify(updatedEncrypted));
    const result = await ipfs.files.add(buffer);
    const newHash = result[0].hash;

    // Update blockchain pointer
    await medicalDataRegistry.methods.setHash(patientAddress, newHash).send({ from: patientAddress });

    // Clear cache so records are refreshed
    decryptedRecordCache = null;

    alert("Allergy added successfully.");
    $("#allergySubstance").val("");
    $("#reaction").val("");
    $("#criticality").val("low");

  } catch (err) {
    console.error("Add allergy failed:", err);
    alert(err.message || "Failed to add allergy.");
  }
}

// Function to fetch symptoms from the Flask API
function fetchSymptoms() {
  // Send a GET request to the Replit URL with th symptoms endpoint, to retrive the symptoms so that they can be displayed to the user
  fetch(
    "https://0bd9bf90-247c-40e9-adff-c9f302d7a747-00-3g8iecfpf4ugs.picard.replit.dev/symptoms"
  )
    // Check if the response is ok
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      // If ok, return the response as JSON
      return response.json();
    })
    .then((data) => {
      console.log(data);
      displaySymptoms(data.symptoms);
    })
    .catch((error) => {
      console.error("Error fetching symptoms:", error);
    });
}

// Function to display the symptoms
function displaySymptoms(symptoms) {
  const container = document.getElementById("symptomsContainer");
  container.innerHTML = ""; // Clear previous contents

  if (!document.querySelector(".symptoms-header")) {
    var header = document.createElement("h6");
    header.className = "symptoms-header";
    header.textContent = "Select Your Symptoms:";
    container.insertBefore(header, container.firstChild);
  }

  symptoms.forEach((symptom) => {
    const cleanName = cleanSymptomName(symptom);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "symptoms[]";
    checkbox.value = symptom;
    checkbox.id = symptom;

    const label = document.createElement("label");
    label.htmlFor = symptom;
    label.textContent = cleanName;

    const div = document.createElement("div");
    div.appendChild(checkbox);
    div.appendChild(label);

    container.appendChild(div);
  });
}

// Function to display prediction
function displayPredictionResult(result) {
  const resultContainer = document.getElementById("predictionResult");
  resultContainer.innerHTML = result;
  resultContainer.style.display = "block";
  resultContainer.style.fontWeight = "bold";
  resultContainer.style.fontSize = "2em";
  resultContainer.style.marginTop = "30px";
  resultContainer.style.backgroundColor = "transparent";
  resultContainer.style.color = result.includes("Error") ? "#d9534f" : "#000";
}

// Function to send selected symptoms to the Flask API for diagnosis prediction
document
  .getElementById("diagnosisForm")
  .addEventListener("submit", function (event) {
    event.preventDefault(); // Prevent the form from submitting

    // Collect checked symptoms
    const symptomsData = {};
    document
      .querySelectorAll('[name="symptoms[]"]:checked')
      .forEach((checkbox) => {
        symptomsData[checkbox.value] = 1; // Th model expects value 1 for the existent symptoms
      });

    // Send the symptoms data to the predict endpoint
    predictDiagnosis(symptomsData);
  });

// Function to predict diagnosis
function predictDiagnosis(symptoms) {
  // Send  POST requst to predict endpoint
  fetch(
    "https://0bd9bf90-247c-40e9-adff-c9f302d7a747-00-3g8iecfpf4ugs.picard.replit.dev/predict",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(symptoms),
    }
  )
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Prediction:", data);
      displayPredictionResult(data.prediction);

      storePredictionInIPFS(data.prediction);
    })
    .catch((error) => {
      console.error("Error predicting the diagnosis:", error);
      displayPredictionResult(`Error: ${error.message}`); // Display error in prediction result section
    });
}

// Function to display  the symptoms names in a clean way
function cleanSymptomName(symptom) {
  return symptom
    .replace(/(\.\d+)?$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Function to store predictions to IPFS
function storePredictionInIPFS(prediction) {
  const ipfs = window.IpfsApi("localhost", "5001");
  const timestamp = new Date().toLocaleString();

  // Get the current patient address reliably
  web3.eth
    .getAccounts()
    .then((accounts) => {
      if (accounts.length === 0) {
        console.error("No Ethereum accounts available.");
        return;
      }
      const patientAddress = accounts[0];

      const predictionData = { prediction, timestamp, patientAddress };

      const buffer = ipfs.Buffer.from(JSON.stringify(predictionData));
      ipfs.files.add(buffer, (error, result) => {
        if (error) {
          console.error("Error uploading to IPFS:", error);
          return;
        }
        const ipfsHash = result[0].hash;
        console.log("IPFS hash:", ipfsHash);

        // Store prediction data in local storage with patient ID
        let predictions = JSON.parse(
          localStorage.getItem("patientPredictions") || "{}"
        );
        console.log("Current predictions in localStorage:", predictions);

        if (!predictions[patientAddress]) {
          predictions[patientAddress] = [];
        }
        predictions[patientAddress].push(predictionData); // Store the actual prediction data
        localStorage.setItem("patientPredictions", JSON.stringify(predictions));

        console.log("Updated predictions in localStorage:", predictions); // Debug log

        appendPredictionToHistory(predictionData);
      });
    })
    .catch((error) => {
      console.error("Error retrieving Ethereum accounts:", error);
    });
}

// Function to append prediction data to history
function appendPredictionToHistory(predictionData) {
  const historyContainer = document.getElementById("predictionHistory");
  const entry = document.createElement("div");
  entry.className = "prediction-entry";
  entry.innerHTML = `<p>Prediction: ${predictionData.prediction}</p><p>Time: ${predictionData.timestamp}</p>`;
  historyContainer.appendChild(entry);
}
// Function to display all diagnosis predicted

function displayAllDiagnoses() {
  // Ensure Web3 is loaded and accounts are accessible
  web3.eth
    .getAccounts()
    .then((accounts) => {
      if (accounts.length === 0) {
        console.error("No Ethereum accounts available.");
        return;
      }
      const patientAddress = accounts[0];

      // Retrieve predictions from localStorage
      const allPredictions = JSON.parse(
        localStorage.getItem("patientPredictions") || "{}"
      );
      const patientHashes = allPredictions[patientAddress] || [];

      if (patientHashes.length === 0) {
        console.log("No diagnosis predictions to display for this patient.");
        return;
      }

      // Retrieve each prediction from IPFS
      patientHashes.forEach((hash) => {
        ipfs.files.cat(hash, (error, file) => {
          if (error) {
            console.error("Error retrieving from IPFS:", error);
            return;
          }
          const predictionData = JSON.parse(file.toString());
          appendPredictionToHistory(predictionData);
        });
      });
    })
    .catch((error) => {
      console.error("Error retrieving Ethereum accounts:", error);
    });
}

// Function to check the age of patient and handle the display of data and proxy designation
function checkAndHandleProxy(key) {
  userRegistry.methods
    .getPatient(key)
    .call()
    .then((patientInfo) => {
      const age = parseInt(patientInfo[2], 10);
      console.log(`Patient Age: ${age}, Checking proxy list...`);

      accessControl.methods
        .getAccessedProxyListForPatient(key)
        .call()
        .then((proxyAddressList) => {
          let hasActiveProxy = proxyAddressList.some(
            (addr) => addr !== "0x0000000000000000000000000000000000000000"
          );

          if (hasActiveProxy) {
            console.log("Active proxy found.");
            displayRegularPatientDashboard(); // Show full dashboard for adults or those 16 and older
          } else {
            console.log("No active proxy, showing full access.");
            if (age < 16) {
              showProxyRegistration(); // Show registration for proxy if under 16 and no proxy
            } else {
              displayRegularPatientDashboard(); // Show full dashboard if over 16 and no proxy
            }
          }
        })
        .catch((error) => {
          console.error("Error fetching proxy list:", error);
        });
    })
    .catch((error) => {
      console.error("Error fetching patient information:", error);
    });
}

// Function to display all panels to patient
function displayRegularPatientDashboard() {
  // Hide all panels initially
  var panels = document.querySelectorAll(".panel");
  panels.forEach(function (panel) {
    panel.style.display = "none"; // Hide all panels
  });

  // Show only the personalInfoPanel
  document.getElementById("personalInfoPanel").style.display = "block";

  // Show all sidebar items
  $(".list-group-item").show();

  // Hide the alert box if any
  $("#alertBox").hide();
}

// function to show only designation panel
function showProxyRegistration() {
  $("#designateProxyPanel").show();
  $('.list-group-item[data-target="designateProxyPanel"]').show();
  $("#alertBox")
    .html("You must designate a proxy to manage your medical decisions.")
    .show();
  $(".panel").not("#designateProxyPanel").hide(); // Hide other content panels
  $(".list-group-item")
    .not('.list-group-item[data-target="designateProxyPanel"]')
    .hide(); // Hide other sidebar items
}

// Test function for changing age
function changeAge() {
  web3.eth
    .getAccounts()
    .then(function (accounts) {
      if (accounts.length === 0) {
        throw new Error("No accounts available.");
      }

      const patientAddress = accounts[0]; // Get the first account
      const newAge = parseInt(document.getElementById("ageInput").value);

      contractInstance.methods
        .setTestAge(newAge, patientAddress)
        .send({ from: patientAddress })
        .then(function (result) {
          alert("Age updated successfully!");
          displayPatientAge(); // Refresh the UI to show the updated age
        })
        .catch(function (error) {
          console.error("Error updating age:", error);
          alert(`Failed to update age: ${error.message}`);
        });
    })
    .catch(function (error) {
      console.error("Error retrieving accounts:", error);
      alert(`Failed to retrieve accounts: ${error.message}`);
    });
}

// Test function to display age
function displayPatientAge() {
  const patientAddress = web3.eth.accounts[0];
  userRegistry.methods
    .getPatient(patientAddress)
    .call()
    .then(function (patientInfo) {
      document.getElementById("ageDisplay").innerText =
        "Patient Age: " + patientInfo.age;
    })
    .catch(function (error) {
      console.error("Error fetching patient age:", error);
    });
}

// Test function to update UI
function updateUIBasedOnAge(age) {
  const revokeButton = document.getElementById("revokeButton");
  if (age >= 16) {
    revokeButton.disabled = false;
  } else {
    revokeButton.disabled = true;
  }
}

function textToHtml(text) {
  return (
    '<h5 style="text-align:center; font-weight:bold;">Medical Record</h5>' +
    '<pre style="white-space:pre-wrap; font-family:inherit;">' +
    text +
    '</pre>'
  );
}


// Toggle the eye icon for password visibility
function toggleModalPasswordVisibility() {
  const input = document.getElementById("modalPassword");
  const icon = input.nextElementSibling.querySelector("i");
  if (input.type === "password") {
    input.type = "text";
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

// Show modal and wait for password input
function requestPassword() {
  return new Promise((resolve, reject) => {
    $("#modalPassword").val(""); // clear previous input
    $("#modalPasswordError").hide();
    const modalEl = document.getElementById("passwordModal");
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    modal.show();

    const submitBtn = document.getElementById("submitPasswordButton");

    function handleSubmit() {
      const pw = document.getElementById("modalPassword").value;
      if (!pw) return; // ignore empty
      modal.hide();
      submitBtn.removeEventListener("click", handleSubmit);
      resolve(pw);
    }

    submitBtn.addEventListener("click", handleSubmit);
  });
}

function getPasswordConstraintsMsg() {
  return `
    Password must meet the following criteria:<br>
    - Minimum 8 characters<br>
    - At least 1 uppercase letter<br>
    - At least 1 lowercase letter<br>
    - At least 1 number<br>
    - At least 1 special character (e.g., !@#$%^&*)<br>
  `;
}

function requestNewPassword() {
  return new Promise((resolve) => {
    $("#newPasswordInput").val("");
    $("#confirmPasswordInput").val("");
    $("#newPasswordError").hide();

    const modalEl = document.getElementById("newPasswordModal");
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    modal.show();

    const btn = document.getElementById("submitNewPasswordButton");

    function handle() {
      const pw = $("#newPasswordInput").val();
      const confirm = $("#confirmPasswordInput").val();

      if (!pw || !confirm) return;

      if (!isStrongPassword(pw)) {
        $("#newPasswordError")
          .html(getPasswordConstraintsMsg())
          .show();
        return;
      }

      if (pw !== confirm) {
        $("#newPasswordError")
          .text("Passwords do not match.")
          .show();
        return;
      }

      modal.hide();
      btn.removeEventListener("click", handle);
      resolve(pw);
    }

    btn.addEventListener("click", handle);
  });
}



async function openRecoveryFlow() {
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0].toLowerCase();

    const wrappedRecoveryRMK =
      await medicalDataRegistry.methods.getRecoveryEncryptedAESKey(patientAddress).call({ from: patientAddress });

    if (!wrappedRecoveryRMK) {
      alert("No recovery key found on chain.");
      return;
    }

    // This now resolves only when the recovery key is correct
    const recoveredRMK = await requestRecoveryKey(patientAddress, wrappedRecoveryRMK);

    // Ask for new password
    const newPassword = await requestNewPassword();
    if (!newPassword) return;

    const newUAK = await window.deriveUAK(newPassword, patientAddress);
    const newWrappedRMK = await window.wrapRMK(recoveredRMK, newUAK);

    await medicalDataRegistry.methods
      .setEncryptedAESKey(patientAddress, patientAddress, newWrappedRMK)
      .send({ from: patientAddress });

    sessionAESKey = recoveredRMK;
    alert("Password successfully reset!");

  } catch (err) {
    console.error(err);
    alert("Recovery failed.");
  }
}



function toggleRecoveryVisibility() {
  const input = document.getElementById("recoveryKeyInput");
  const icon = input.nextElementSibling.querySelector("i");

  if (input.type === "password") {
    input.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
}

function toggleNewPasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const icon = input.nextElementSibling.querySelector("i");

  if (input.type === "password") {
    input.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
}


function requestRecoveryKey(patientAddress, wrappedRecoveryRMK) {
  return new Promise((resolve) => {
    $("#recoveryKeyInput").val("");
    $("#recoveryError").hide();

    const modalEl = document.getElementById("recoveryModal");
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    modal.show();

    const btn = document.getElementById("submitRecoveryButton");

    async function handle() {
      const recoveryKey = $("#recoveryKeyInput").val();
      if (!recoveryKey) return;

      try {
        const recoveryUAK = await window.deriveRecoveryUAK(recoveryKey, patientAddress);
        const recoveredRMK = await window.unwrapRMK(wrappedRecoveryRMK, recoveryUAK);

        modal.hide(); // hide only on success
        btn.removeEventListener("click", handle);
        resolve(recoveredRMK); // return the recovered RMK

      } catch (err) {
        $("#recoveryError").text("Invalid recovery key. Please try again.").show();
        // keep modal open
      }
    }

    btn.addEventListener("click", handle);
  });
}


function showRecoveryError(msg) {
  $("#recoveryError").text(msg).show();
}





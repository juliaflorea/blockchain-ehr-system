var ipfs = window.IpfsApi("localhost", "5001");

const Buffer = window.IpfsApi().Buffer;

var ailmentsDict = {};
ailmentsDict[0] = "Common Flu";
ailmentsDict[1] = "Viral Infection";
ailmentsDict[2] = "Cancer";
ailmentsDict[3] = "Tumor";
ailmentsDict[4] = "Covid-19";
ailmentsDict[5] = "Heart-Disorder";
ailmentsDict[6] = "Other";
var url_string = window.location.href;
var url = new URL(url_string);
var key;
var docName = "";
let doctorSessionKeys = {}; 
toggleRecordsButton = 0;
let decryptedRecordCache = null;
let recordsToggled = {};


console.log("doctor.js loaded");

async function getDoctorAESKeyForPatient(patientAddress) {
  if (doctorSessionKeys[patientAddress]) return doctorSessionKeys[patientAddress];

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const doctorAddress = accounts[0].toLowerCase();

  const wrappedKey = await medicalDataRegistry.methods
    .getEncryptedAESKey(patientAddress)
    .call({ from: doctorAddress });

  if (!wrappedKey) throw new Error("No access key for this patient");

  const uak = await window.deriveUAKForDoctor(doctorAddress);
  const aesKey = await window.unwrapRMK(wrappedKey, uak);

  doctorSessionKeys[patientAddress] = aesKey;
  return aesKey;
}



async function loadDoctorData() {
  if (!userRegistry || !accessControl) {
    console.error("Contracts not initialized yet!");
    return;
  }

  $(".alert-danger").hide();

  try {
    const accounts = await ethereum.request({ method: "eth_accounts" });
    key = accounts[0].toLowerCase();

    // Display the info of the current doctor
    const doctor = await userRegistry.methods.getDoctor(key).call({ gas: 1000000 });
    const firstName = doctor[0];
    const lastName = doctor[1];
    const age = doctor[2];
    docName = firstName + " " + lastName;
    $("#name").html(docName);
    $("#age").html(age);

    // Get the patient access list for the doctor
    const patientAddressList = await accessControl.methods
      .getAccessedPatientListForDoctor(key)
      .call({ gas: 1000000 });
    console.log("Patient list:", patientAddressList);

    const table = document.getElementById("viewPatient");
    while (table.rows.length > 1) table.deleteRow(1); // Clear previous entries

    for (const patientAddress of patientAddressList) {
      const patient = await userRegistry.methods.getPatient(patientAddress).call({ gas: 1000000 });
      const patientFirstName = patient[0];
      const patientLastName = patient[1];
      const publicKey = patientAddress;

      const row = table.insertRow(-1);
      const cell1 = row.insertCell(0);
      const cell2 = row.insertCell(1);
      const cell3 = row.insertCell(2);

      cell1.className = "patientName";
      cell2.className = "publicKeyPatient";
      cell1.innerHTML = patientFirstName + " " + patientLastName;
      cell2.innerHTML = publicKey;
      cell3.innerHTML =
        '<input class="btn btn-success" onclick="showRecords(this)" id="viewRecordsButton" type="button" value="View records"></input>';
    }
  } catch (err) {
    console.error("Error loading doctor data:", err);
  }
}

// Listen for contractsReady event
window.addEventListener("contractsReady", async () => {
  console.log("contractsReady event received in doctor.js");
  console.log("userRegistry:", window.userRegistry);

  await loadDoctorData();
  loadAppointmentRequests();
  loadAppointmentHistory();
});
// Function to display the patients' medical records
// Keep a cache of decrypted records per patient
async function showRecords(element) {
  var table = document.getElementById("viewPatient");
  var index = element.parentNode.parentNode.rowIndex;
  var patientAddr = table.rows[index].cells[1].innerHTML;

  if (toggleRecordsButton % 2 == 0) {
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const doctorAddr = accounts[0];

      // Get encrypted AES key for doctor
      const wrappedRMKStr = await medicalDataRegistry.methods
        .getEncryptedAESKey(patientAddr)
        .call({ from: doctorAddr });

      if (!wrappedRMKStr) {
        alert("No access granted or RMK not found.");
        return;
      }

      const uak = await window.deriveUAKForDoctor(doctorAddr);
      const rmk = await window.unwrapRMK(wrappedRMKStr, uak);

      // Get record hash from blockchain
      const recordHash = await medicalDataRegistry.methods
        .getHash(patientAddr)
        .call({ from: doctorAddr });

      // Fetch encrypted record from IPFS
      let payloadStr;
      try {
        const ipfsResp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
        payloadStr = await ipfsResp.text();
      } catch (err) {
        console.error("IPFS fetch failed:", err);
        alert("Failed to fetch record from IPFS. Try again later.");
        return;
      }

      let encryptedPayload;
      try {
        encryptedPayload = JSON.parse(payloadStr);
      } catch (e) {
        throw new Error("Invalid encrypted payload format (not JSON)");
      }

      // Decrypt record
      const decryptedRecordStr = await window.decryptAES(encryptedPayload, rmk);

      let decryptedRecord;
      try {
        decryptedRecord = JSON.parse(decryptedRecordStr);
      } catch (e) {
        throw new Error("Decrypted record is not valid JSON");
      }

      // Convert record to formatted HTML
      const formattedHtml = renderResource(decryptedRecord);

      // Create download button
      const downloadButton = $("<button/>", {
        text: "Download Medical Record",
        class: "btn btn-primary",
        click: function () {
          const textRecord = recordToPlainText(decryptedRecord);
          downloadMedicalRecord(textRecord);
        },
      });

      const downloadButtonContainer = $("<div/>", {
        id: "downloadButtonContainer",
        class: "download-button-container",
      }).append(downloadButton);

      // Create content including diagnosis & treatment forms
      const content = `
        <div class="tab-content">
          <div id="view${patientAddr}">
            <div class="row">
              <div class="col-sm-12">
                <div style="margin: 20px 0;" id="records${patientAddr}">
                  ${formattedHtml}
                </div>
              </div>
            </div>
            <hr>
            <div class="section diagnosis-section">
              <h5 class="diagnosis-title">Diagnosis Submission</h5>
              <div class="form-group">
                <label for="ailmentsList${patientAddr}" class="form-label">Diagnosis:</label>
                <select class="form-control" id="ailmentsList${patientAddr}" required>
                  <option selected disabled>-- Please Select --</option>
                  <option value="0">Common Flu</option>
                  <option value="1">Viral Infection</option>
                  <option value="2">Cancer</option>
                  <option value="3">Tumor</option>
                  <option value="4">Covid-19</option>
                  <option value="5">Heart Disorder</option>
                  <option value="6">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label for="clinicalStatus${patientAddr}" class="form-label">Clinical Status:</label>
                <select class="form-control" id="clinicalStatus${patientAddr}" required>
                  <option selected disabled>-- Please Select --</option>
                  <option value="active">Active</option>
                  <option value="remission">Remission</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div class="form-group">
                <label for="severity${patientAddr}" class="form-label">Severity:</label>
                <select class="form-control" id="severity${patientAddr}" required>
                  <option selected disabled>-- Please Select --</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div class="form-group">
                <label for="affectedArea${patientAddr}" class="form-label">Affected Area:</label>
                <input type="text" class="form-control" id="affectedArea${patientAddr}" placeholder="Enter affected body area" required>
              </div>
              <div class="form-group">
                <label for="details${patientAddr}" class="form-label">Details:</label>
                <textarea class="form-control" rows="5" id="details${patientAddr}" placeholder="Enter details to be added" name="Details" required autofocus></textarea>
              </div>
              <div class="form-group">
                <button class="btn btn-primary" onclick="submitDiagnosis(this, ${index})">Submit</button>
              </div>
            </div>
            <hr>
            <div class="section treatment-plan-section">
              <h5>Treatment Plan</h5>
              <div class="form-group">
                <label>Medication Name:</label>
                <input type="text" class="form-control" id="medicationName${patientAddr}">
              </div>
              <div class="form-group">
                <label>Dose:</label>
                <input type="text" class="form-control" id="dose${patientAddr}">
              </div>
              <div class="form-group">
                <label>Route of Administration:</label>
                <select id="route${patientAddr}" class="form-control">
                  <option value="">Select</option>
                  <option value="oral">Oral</option>
                  <option value="intravenous">Intravenous</option>
                  <option value="inhalation">Inhalation</option>
                  <option value="subcutaneous">Subcutaneous</option>
                  <option value="intramuscular">Intramuscular</option>
                  <option value="topical">Topical</option>
                  <option value="rectal">Rectal</option>
                  <option value="sublingual">Sublingual</option>
                  <option value="nasal">Nasal</option>
                  <option value="ophthalmic">Ophthalmic</option>
                  <option value="otic">Otic</option>
                </select>
              </div>
              <div class="form-group">
                <label>Frequency:</label>
                <input type="text" class="form-control" id="frequency${patientAddr}">
              </div>
              <div class="form-group">
                <label>Additional Instructions:</label>
                <textarea class="form-control" id="instructions${patientAddr}"></textarea>
              </div>
              <button class="btn btn-primary" onclick="submitTreatmentPlan(this, ${index})">Submit</button>
            </div>
          </div>
        </div>
      `;

      const newRow = table.insertRow(index + 1);
      newRow.classList.add("recordRow");
      const newCell = newRow.insertCell(0);
      newCell.colSpan = 3;
      newCell.append(downloadButtonContainer[0]);

      const contentWrapper = document.createElement("div");
      contentWrapper.innerHTML = content;
      newCell.append(contentWrapper);

      toggleRecordsButton += 1;
      element.value = "Hide Records";
      element.className = "btn btn-danger";

    } catch (err) {
      console.error("Error showing patient records:", err);
      alert(err.message || "Failed to show records.");
    }
  } else {
    var row = table.rows[index + 1];
    $(row).remove();
    $("#downloadLinkContainer").empty();
    toggleRecordsButton -= 1;
    element.value = "View Records";
    element.className = "btn btn-success";
  }
}


// Function to get the current date and time
function getDateTime() {
  function AddZero(num) {
    return num >= 0 && num < 10 ? "0" + num : num + "";
  }
  var now = new Date();
  var strDateTime = [
    [
      AddZero(now.getDate()),
      AddZero(now.getMonth() + 1),
      now.getFullYear(),
    ].join("/"),
    [AddZero(now.getHours()), AddZero(now.getMinutes())].join(":"),
    now.getHours() >= 12 ? "PM" : "AM",
  ].join(" ");
  return strDateTime;
}

// ----- Submit Diagnosis -----
// ----- Submit Diagnosis -----
async function submitDiagnosis(element, index) {
  try {
    const table = document.getElementById("viewPatient");
    const patientAddress = table.rows[index].cells[1].innerHTML;

    // Get form details
    const diagnosisIndex = document.getElementById(`ailmentsList${patientAddress}`).value;
    const clinicalStatus = document.getElementById(`clinicalStatus${patientAddress}`).value;
    const severity = document.getElementById(`severity${patientAddress}`).value;
    const affectedArea = document.getElementById(`affectedArea${patientAddress}`).value;
    const otherDetails = document.getElementById(`details${patientAddress}`).value;

    if (!diagnosisIndex || !clinicalStatus || !severity || !affectedArea) {
      alert("Please fill in all fields.");
      return;
    }

    const accounts = await web3.eth.getAccounts();
    const doctorAddress = accounts[0];

    // Get doctor's appointments
    const appointmentIds = await appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress });

    let foundAppointment = null;

    for (let id of appointmentIds) {
      const appointment = await appointmentManager.methods.appointments(id).call();
      if (
        appointment.patientAddress.toLowerCase() === patientAddress.toLowerCase() &&
        appointment.isAccepted &&
        !appointment.diagnosisSubmitted
      ) {
        foundAppointment = { ...appointment, id };
        break;
      }
    }

    if (!foundAppointment) {
      alert("No accepted appointment found for this patient.");
      return;
    }

    const datetime = new Date().toISOString();
    const docNameStored = docName || "Unknown Doctor";
    const diagnosis = parseInt(diagnosisIndex);
    const diagnosed = ailmentsDict[diagnosis];

    const fhirConditionResource = {
      resourceType: "Condition",
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: clinicalStatus,
          },
        ],
      },
      severity: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-severity",
            code: severity,
          },
        ],
      },
      code: { text: diagnosed },
      bodySite: [{ text: affectedArea }],
      onsetDateTime: datetime,
      note: [{ text: otherDetails }],
    };

    // 1️⃣ Fetch existing record from IPFS
    let existingRecord = {};
    try {
      const recordHash = await medicalDataRegistry.methods.getHash(patientAddress).call({ from: doctorAddress });
      if (recordHash) {
        const resp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
        const encryptedPayload = await resp.json();
        const aesKey = await getDoctorAESKeyForPatient(patientAddress);
        const decryptedRecordStr = await window.decryptAES(encryptedPayload, aesKey);
        existingRecord = JSON.parse(decryptedRecordStr);
      }
    } catch (err) {
      console.warn("No previous records found or failed to decrypt, starting fresh.");
      existingRecord = {};
    }

    if (!existingRecord.diagnosis) existingRecord.diagnosis = [];

    // 2️⃣ Append new diagnosis entry
    existingRecord.diagnosis.push({
      doctor: docNameStored,
      datetime,
      diagnosed,
      clinicalStatus,
      severity,
      affectedArea,
      details: otherDetails,
      fhirConditionResource
    });

    // 3️⃣ Encrypt updated record
    const aesKey = await getDoctorAESKeyForPatient(patientAddress);
    const updatedRecordStr = JSON.stringify(existingRecord);
    const encryptedPayload = await window.encryptAES(updatedRecordStr, aesKey);

    // 4️⃣ Upload to IPFS
    const buffer = Buffer.from(JSON.stringify(encryptedPayload), "utf-8");
    const ipfsResult = await ipfs.add(buffer);
    const ipfsHash = ipfsResult[0]?.hash || ipfsResult.path;

    // 5️⃣ Submit diagnosis on-chain
    await diagnosisAndTreatment.methods
      .submitDiagnosis(foundAppointment.id, ipfsHash)
      .send({ from: doctorAddress, gas: 1000000 });

    alert("Diagnosis successfully submitted.");

    // Reload data
    loadDoctorData();
    $("#appointmentRequests tr:gt(0)").remove();
    $("#appointmentHistory tr:gt(0)").remove();
    loadAppointmentRequests();
    loadAppointmentHistory();

  } catch (err) {
    console.error("Error submitting diagnosis:", err);
    alert("Failed to submit diagnosis: " + (err.message || err));
  }
}


// ----- Submit Treatment Plan -----
async function submitTreatmentPlan(element, index) {
  try {
    const table = document.getElementById("viewPatient");
    const patientAddress = table.rows[index].cells[1].innerHTML;
    const medicationName = document.getElementById(`medicationName${patientAddress}`).value;
    const dose = document.getElementById(`dose${patientAddress}`).value;
    const route = document.getElementById(`route${patientAddress}`).value;
    const frequency = document.getElementById(`frequency${patientAddress}`).value;
    const instructions = document.getElementById(`instructions${patientAddress}`).value;

    if (!medicationName || !dose || !route || !frequency || !instructions) {
      alert("Please fill in all fields.");
      return;
    }

    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const doctorAddr = accounts[0];
    const datetime = new Date().toISOString();
    const docNameStored = docName || "Unknown Doctor";

    // Fetch existing record
    let existingRecord = {};
    try {
      const recordHash = await medicalDataRegistry.methods.getHash(patientAddress).call({ from: doctorAddr });
      if (recordHash) {
        const resp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
        const encryptedPayload = await resp.json();
        const aesKey = await getDoctorAESKeyForPatient(patientAddress);
        const decryptedRecordStr = await window.decryptAES(encryptedPayload, aesKey);
        existingRecord = JSON.parse(decryptedRecordStr);
      }
    } catch (err) {
      console.warn("No previous record found, creating new.");
      existingRecord = { resourceType: "Patient", diagnosis: [], treatmentPlan: [] };
    }

    if (!existingRecord.treatmentPlan) existingRecord.treatmentPlan = [];

    // Append new treatment
    existingRecord.treatmentPlan.push({
      datetime,
      doctor: docNameStored,
      medicationName,
      dose,
      route,
      frequency,
      instructions,
      fhirMedicationRequest: {
        resourceType: "MedicationRequest",
        status: "active",
        intent: "order",
        medicationCodeableConcept: { text: medicationName },
        authoredOn: datetime,
        dosageInstruction: [
          {
            text: instructions,
            timing: { repeat: { frequency: parseInt(frequency) } },
            doseAndRate: [{ doseQuantity: { value: dose } }],
            route: { text: route },
          },
        ],
      },
    });

    // Encrypt updated record
    const aesKey = await getDoctorAESKeyForPatient(patientAddress);
    const encryptedPayload = await window.encryptAES(JSON.stringify(existingRecord), aesKey);

    // Upload to IPFS
    const buffer = Buffer.from(JSON.stringify(encryptedPayload), "utf-8");
    const ipfsResult = await ipfs.add(buffer);
    const ipfsHash = ipfsResult[0]?.hash || ipfsResult.path;

    // Submit on-chain
    const appointmentIds = await appointmentManager.methods.getDoctorAppointments(doctorAddr).call({ from: doctorAddr });
    let foundAppointmentId = null;

    for (let id of appointmentIds) {
      const appointment = await appointmentManager.methods.appointments(id).call();
      if (
        appointment.patientAddress.toLowerCase() === patientAddress.toLowerCase() &&
        appointment.isAccepted &&
        appointment.diagnosisSubmitted &&
        !appointment.treatmentPlanSubmitted
      ) {
        foundAppointmentId = id;
        break;
      }
    }

    if (!foundAppointmentId) {
      alert("No suitable appointment found or diagnosis not yet submitted.");
      return;
    }

    await diagnosisAndTreatment.methods
      .submitTreatmentPlan(foundAppointmentId, ipfsHash)
      .send({ from: doctorAddr, gas: 1000000 });

    alert("Treatment plan successfully submitted.");

    // Refresh UI
    loadDoctorData();
    loadAppointmentRequests();
    loadAppointmentHistory();

  } catch (err) {
    console.error("Error submitting treatment plan:", err);
    alert("Failed to submit treatment plan: " + (err.message || err));
  }
}




async function decryptEntries(entries, aesKey) {
  const results = [];

  for (const entry of entries || []) {
    if (entry.encrypted && entry.payload) {
      const decrypted = await window.decryptAES(entry.payload, aesKey);
      results.push(JSON.parse(decrypted));
    } else {
      results.push(entry); // backward compatibility
    }
  }

  return results;
}


// Function to load appointment requsts rceived from patients
function loadAppointmentRequests() {
  web3.eth.getAccounts().then(async function (accounts) {
    const doctorAddress = accounts[0].toLowerCase();

    try {
      const appointmentIds = await appointmentManager.methods.getDoctorAppointments(doctorAddress).call({ from: doctorAddress });

      for (const id of appointmentIds) {
        const appointment = await appointmentManager.methods.appointments(id).call();

        // Only show pending appointments
        if (!appointment.isAccepted && !appointment.isRejected) {
          try {
            const appointmentData = await fetchAndDecryptAppointment(appointment.ipfsHash);
            displayAppointmentRequest(id, appointmentData);
          } catch (e) {
            console.error("Failed to load appointment request:", e);
          }
        }
      }
    } catch (error) {
      console.error("Error loading appointment requests:", error);
    }
  });
}



// Function to display the requests
function displayAppointmentRequest(id, appointment) {
  if (!appointment || !Array.isArray(appointment.participant)) {
    console.error("Invalid appointment object:", appointment);
    return;
  }

  var row = $("<tr>");

  const patientInfo = appointment.participant.find(p =>
    p.actor?.reference?.startsWith("Patient")
  );

  const patientName = patientInfo?.actor?.display || "Unknown";

  let appointmentDate = "Invalid Date";
  let appointmentTime = "Invalid Time";

  const match = appointment.start?.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
  );

  if (match) {
    const date = new Date(Date.UTC(
      match[1], match[2] - 1, match[3],
      match[4], match[5], match[6]
    ));
    appointmentDate = date.toISOString().substring(0, 10);
    appointmentTime = date.toISOString().substring(11, 16);
  }

  $("<td>").text(patientName).appendTo(row);
  $("<td>").text(appointmentDate).appendTo(row);
  $("<td>").text(appointmentTime).appendTo(row);
  $("<td>").text(appointment.status || "unknown").appendTo(row);

  const actionsCell = $("<td>").appendTo(row);

  $("<button>")
    .text("Accept")
    .addClass("btn btn-success")
    .click(() => acceptAppointment(id))
    .appendTo(actionsCell);

  $("<button>")
    .text("Reject")
    .addClass("btn btn-danger")
    .click(() => rejectAppointment(id))
    .appendTo(actionsCell);

  $("#appointmentRequests").append(row);
}


// Function to load the history of appointments accepted so far
function loadAppointmentHistory() {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];

    appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress })
      .then(function (appointmentIds) {
        appointmentIds.forEach(function (id) {
          appointmentManager.methods
            .appointments(id)
            .call()
            .then(async function (appointment) {
              try {
                const appointmentData =
                  await fetchAndDecryptAppointment(appointment.ipfsHash);

                const status = appointment.isAccepted
                  ? "Accepted"
                  : appointment.isRejected
                  ? "Rejected"
                  : "Pending";

                displayAppointmentHistory(id, appointmentData, status);
              } catch (e) {
                console.error("Failed to load appointment history:", e);
              }
            });
        });
      });
  });
}


// Function to display the history of appointments
function displayAppointmentHistory(id, appointment, status) {
  if (!appointment || !Array.isArray(appointment.participant)) return;

  const row = $("<tr>");

  const patientInfo = appointment.participant.find(p =>
    p.actor?.reference?.startsWith("Patient")
  );

  const patientName = patientInfo?.actor?.display || "Unknown";

  let appointmentDate = "Invalid Date";
  let appointmentTime = "Invalid Time";

  const match = appointment.start?.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{1,2}):(\d{2}):(\d{2})Z$/
  );

  if (match) {
    const date = new Date(Date.UTC(
      match[1], match[2] - 1, match[3],
      match[4], match[5], match[6]
    ));
    appointmentDate = date.toISOString().substring(0, 10);
    appointmentTime = date.toISOString().substring(11, 16);
  }

  $("<td>").text(patientName).appendTo(row);
  $("<td>").text(appointmentDate).appendTo(row);
  $("<td>").text(appointmentTime).appendTo(row);

  const statusCell = $("<td>").text(status).appendTo(row);
  statusCell.addClass(status.toLowerCase() + "-status");

  $("#appointmentHistory tbody").append(row);
}


// Function to accept an appointment
function acceptAppointment(appointmentId) {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];
    // Get the appointment's id
    appointmentManager.methods
      .appointments(appointmentId)
      .call()
      .then(function (appointmentToAccept) {
        // Fetch all appointments for the doctor and check for conflicts

        appointmentManager.methods
          .getDoctorAppointments(doctorAddress)
          .call()
          .then(function (appointmentIds) {
            let conflict = false;
            let promises = appointmentIds.map((id) => {
              return appointmentManager.methods
                .appointments(id)
                .call()
                .then((otherAppointment) => {
                  // Check if any appointment is at the same time and is already accepted
                  if (
                    otherAppointment.date === appointmentToAccept.date &&
                    otherAppointment.hour === appointmentToAccept.hour &&
                    otherAppointment.isAccepted &&
                    otherAppointment.doctorAddress === doctorAddress &&
                    id !== appointmentId
                  ) {
                    conflict = true;
                  }
                });
            });

            Promise.all(promises).then(() => {
              if (conflict) {
                alert("An appointment is already booked for this time slot.");
              } else {
                // If no conflict, proceed to accept the appointment

                appointmentManager.methods
                  .acceptAppointment(appointmentId)
                  .send({ from: doctorAddress })
                  .then(function (result) {
                    console.log("Appointment accepted. Transaction:", result);
                    notifyPatient(appointmentId, "Accepted");
                    alert("Appointment Accepted");
                  })
                  .catch(function (error) {
                    console.error("Error accepting appointment:", error);
                    alert("Failed to accept appointment: " + error.message);
                  });
              }
            });
          });
      })
      .catch(function (error) {
        console.error("Error fetching appointment details:", error);
        alert("Failed to fetch appointment details.");
      });
  });
}

// Function to reject an appointment
function rejectAppointment(appointmentId) {
  web3.eth.getAccounts().then(function (accounts) {
    const doctorAddress = accounts[0];
    appointmentManager.methods
      .appointments(appointmentId)
      .call()
      .then(function (appointment) {
        // Notify the patient before the appointment is deleted

        notifyPatient(appointmentId, "Rejected", appointment.patientAddress);
        return appointmentManager.methods
          .rejectAppointment(appointmentId)
          .send({ from: doctorAddress });
      })
      .then(function (result) {
        console.log("Appointment rejected. Transaction:", result);

        alert("Appointment Rejected");
      })
      .catch(function (error) {
        console.error("Error rejecting appointment:", error);
        alert("Failed to reject appointment.");
      });
  });
}

// Function to send a notification email to patient when an appointment has been accepted or rejected
// Function to send a notification email to patient when an appointment has been accepted or rejected
async function notifyPatient(appointmentId, status) {
  try {
    console.log(`📧 Notify patient | Appointment ${appointmentId} | ${status}`);

    // 1️⃣ Get appointment info from blockchain
    const appointment = await appointmentManager.methods
      .appointments(appointmentId)
      .call();

    const patientAddress = appointment.patientAddress;
    if (!patientAddress) throw new Error("Patient address missing");

    // 2️⃣ Fetch & decrypt appointment data from IPFS
    const appointmentData = await fetchAndDecryptAppointment(appointment.ipfsHash);
    console.log("Raw appointment start:", appointmentData.start);

    // 2a️⃣ Parse appointment start date
    let dateObj;
    const startRaw = appointmentData.start;
    if (/^\d{8}T\d{2}:\d{2}:\d{2}Z$/.test(startRaw)) {
      // Already ISO-ish (e.g., "2026-03-03T08:00:00Z")
      dateObj = new Date(startRaw);
    } else if (/^\d{8}T\d{6}Z$/.test(startRaw)) {
      // Custom format: "YYYYMMDDTHHMMSSZ"
      const match = startRaw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
      dateObj = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
    } else {
      console.warn("⚠️ Unknown date format, using fallback");
      dateObj = new Date();
    }

    const appointmentDate = dateObj.toLocaleDateString("en-US", { timeZone: "UTC" });
    const appointmentTime = dateObj.toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" });

    // 3️⃣ Get patient record hash
    const recordHash = await medicalDataRegistry.methods.getHash(patientAddress).call();
    if (!recordHash) throw new Error("Patient record hash not found");

    // 4️⃣ Fetch patient record from IPFS
    const recordResp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
    let payload = await recordResp.json(); // Can be encrypted or plaintext

    let patientRecord, patientEmail, patientName;

    // 5️⃣ Try AES decryption if needed
    try {
      if (payload.iv && payload.data) {
        const aesKey = await getDoctorAESKeyForPatient(patientAddress);
        const decryptedStr = await window.decryptAES(payload, aesKey);
        patientRecord = JSON.parse(decryptedStr);

        patientEmail = patientRecord.telecom?.find(t => t.system === "email")?.value;
        const nameObj = patientRecord.name?.[0];
        patientName = nameObj ? `${nameObj.given.join(" ")} ${nameObj.family}` : "Patient";
      }
    } catch (err) {
      console.warn("⚠️ AES decryption failed or missing structure:", err);
    }

    // 6️⃣ Fallback: parse raw IPFS text if email not found
    if (!patientEmail) {
      console.log("⚠️ Falling back to raw IPFS text parsing");
      const lines = typeof payload === "string" ? payload.split("\n") : JSON.stringify(payload).split("\n");

      const contactLine = lines.find(line => line.startsWith("Contact:"));
      if (!contactLine) throw new Error("Contact line not found in patient data");

      const emailPart = contactLine.split(",").find(part => part.trim().startsWith("email:"));
      if (!emailPart) throw new Error("Email not found in patient data");

      patientEmail = emailPart.split("email:")[1].trim();

      const firstNameLine = lines.find(line => line.startsWith("First Name:"));
      const lastNameLine = lines.find(line => line.startsWith("Last Name:"));
      const firstName = firstNameLine ? firstNameLine.split(":")[1].trim() : "";
      const lastName = lastNameLine ? lastNameLine.split(":")[1].trim() : "";
      patientName = `${firstName} ${lastName}`.trim() || "Patient";
    }

    // 7️⃣ Prepare email template
    const templateParams = {
      doctor_name: docName,
      patient_name: patientName,
      patient_email: patientEmail,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      status: status,
    };

    console.log("📤 Sending email:", templateParams);

    // 8️⃣ Send email via emailjs
    await emailjs.send("service_f9n994l", "template_wxamyw8", templateParams);

    console.log("✅ Notification sent");

  } catch (err) {
    console.error("❌ notifyPatient failed:", err);
  }
}

// Clendar initialisation
$(document).ready(function () {
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

  observer.observe(document.body, config);

  $(window).on("unload", function () {
    observer.disconnect();
  });

  setTimeout(function () {
    loadAcceptedAppointments(calendar);
  }, 1000);
});

// Function to load acceptd appointmnets for calndar
// Load accepted appointments and display them in calendar
async function loadAcceptedAppointments(calendar) {
  try {
    const accounts = await ethereum.request({ method: "eth_accounts" });
    const doctorAddress = accounts[0].toLowerCase();

    const appointmentIds = await appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call();

    for (const id of appointmentIds) {
      const appointment = await appointmentManager.methods
        .appointments(id)
        .call();

      if (!appointment.isAccepted) continue; // Only accepted

      console.log("Accepted appointment:", appointment);

      let appointmentData;
      try {
        appointmentData = await fetchAndDecryptAppointment(appointment.ipfsHash);
      } catch (e) {
        console.warn(`Failed to fetch/decrypt appointment ${id}, skipping:`, e);
        continue;
      }

      addEventToCalendar(appointmentData, calendar);
    }
  } catch (err) {
    console.error("Error loading accepted appointments:", err);
  }
}


// Function to display the time of the appointment and name of patient in the calendar
function addEventToCalendar(appointmentData, calendar) {
  if (!calendar) {
    console.error("Calendar not defined");
    return;
  }

  try {
    const date = moment(appointmentData.start, "YYYYMMDDTHH:mm:ssZ").utc();
    const formattedDate = date.format("YYYY-MM-DD");
    const formattedTime = date.format("HH:mm");

    const patientInfo = appointmentData.participant.find((p) =>
      p.actor.reference.startsWith("Patient")
    );
    const patientName = patientInfo
      ? patientInfo.actor.display
      : "Unknown Patient";

    if (patientName === "Unknown Patient") {
      console.error("Patient name is missing in appointment data");
    }

    calendar.addEvent({
      title: `${formattedTime} ${patientName}`,
      start: formattedDate + "T" + formattedTime,
      allDay: false,
      color: "rgba(255, 179, 128, 0.5)",
      textColor: "#f26d21",
      extendedProps: {
        description: patientName,
      },
    });
  } catch (e) {
    console.error("Error in adding event to calendar:", e);
  }
  
}

$(window).on("load", function () {
  // Hide all panels
  $(".panel").hide();

  // Show Personal Info panel by default
  $("#personalInfoPanel").show();

  // Load default panel data
  loadDoctorData();
});
$(".list-group-item").on("click", function (e) {
  e.preventDefault();

  const targets = $(this).data("target").split(" ");

  // Hide all panels
  $(".panel").hide();

  // Show target panels
  targets.forEach(id => {
    $("#" + id).show();
  });

  // Load data depending on panel
  if (targets.includes("personalInfoPanel")) {
    loadDoctorData();
  }

  if (targets.includes("appointmentRequestsPanel")) {
    $("#appointmentRequests tr:gt(0)").remove();
    loadAppointmentRequests();
  }

  if (targets.includes("appointmentHistoryPanel")) {
    $("#appointmentHistory tr:gt(0)").remove();
    loadAppointmentHistory();
  }

  if (targets.includes("accessibleEMRPanel")) {
    loadAccessiblePatients(); // whatever your function is called
  }
});


async function fetchAndDecryptAppointment(ipfsHash) {
  try {
    const accounts = await ethereum.request({ method: "eth_accounts" });
    const doctorAddress = accounts[0].toLowerCase();

    const resp = await fetch(`http://localhost:8080/ipfs/${ipfsHash}`);
    if (!resp.ok) {
      throw new Error("Failed to fetch appointment from IPFS");
    }

    const payload = await resp.json();

    console.log("📦 Appointment IPFS payload:", payload);

    // ✅ NEW VALIDATION (matches patient.js)
    if (!payload.iv || !payload.data || !payload.aesKeyWrappedForDoctor) {
      throw new Error("Invalid encrypted appointment payload format");
    }

    // 1️⃣ Doctor derives UAK
    const uak = await window.deriveUAKForDoctor(doctorAddress);

    // 2️⃣ Doctor unwraps appointment AES key
    const aesKey = await window.unwrapRMK(
      payload.aesKeyWrappedForDoctor,
      uak
    );

    // 3️⃣ Decrypt appointment
    const decrypted = await window.decryptAES(
      {
        iv: payload.iv,
        data: payload.data
      },
      aesKey
    );

    const appointment = JSON.parse(decrypted);
    console.log("✅ Decrypted appointment:", appointment);

    return appointment;

  } catch (err) {
    console.error("❌ fetchAndDecryptAppointment failed:", err);
    throw err;
  }
}







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

function escapeConversationHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSharedConversations(record) {
  const shared = Array.isArray(record?.sharedConversations)
    ? record.sharedConversations
    : [];

  if (!shared.length) {
    return `
      <div class="ai-shared-empty">
        No conversations shared yet.
      </div>
    `;
  }

  const sorted = [...shared].sort((a, b) => {
    const aTime = a?.sharedAt ? Date.parse(a.sharedAt) : 0;
    const bTime = b?.sharedAt ? Date.parse(b.sharedAt) : 0;
    return bTime - aTime;
  });

  return sorted.map((conversation) => {
    const title = escapeConversationHtml(conversation.title || "Conversation");
    const sharedAt = conversation.sharedAt
      ? new Date(conversation.sharedAt).toLocaleString()
      : "Unknown time";
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];

    const messageHtml = messages.map((msg) => {
      const roleLabel = msg.role === "assistant" ? "Assistant" : "Patient";
      const timestamp = msg.ts ? new Date(msg.ts).toLocaleString() : "";
      const header = timestamp ? `${roleLabel} (${timestamp})` : roleLabel;
      return `
        <div class="ai-shared-message">
          <div class="ai-shared-message-header">${escapeConversationHtml(header)}</div>
          <div class="ai-shared-message-body">${escapeConversationHtml(msg.text || "")}</div>
        </div>
      `;
    }).join("");

    return `
      <div class="ai-shared-card">
        <div class="ai-shared-title">${title}</div>
        <div class="ai-shared-meta">Shared: ${escapeConversationHtml(sharedAt)}</div>
        <div class="ai-shared-thread">
          ${messageHtml}
        </div>
      </div>
    `;
  }).join("");
}

const TRIAGE_SECTION_TITLES = [
  "Chief Complaint",
  "Symptoms",
  "AI Differential Diagnosis",
  "Suggested Treatments",
  "Recommended Follow-up",
  "Doctor Notes"
];

function getTriageReportFromRecord(record) {
  if (record && record.aiTriageReport) return record.aiTriageReport;
  if (Array.isArray(record?.aiTriageReports) && record.aiTriageReports.length) {
    return [...record.aiTriageReports].sort((a, b) => {
      const aTime = Date.parse(a.updatedAt || a.sharedAt || a.createdAt || 0);
      const bTime = Date.parse(b.updatedAt || b.sharedAt || b.createdAt || 0);
      return bTime - aTime;
    })[0];
  }
  return null;
}

function getCompositionFromBundle(bundle) {
  if (!bundle || bundle.resourceType !== "Bundle") return null;
  const entry = Array.isArray(bundle.entry) ? bundle.entry : [];
  const compEntry = entry.find((e) => e && e.resource && e.resource.resourceType === "Composition");
  return compEntry ? compEntry.resource : null;
}

function ensureComposition(bundle) {
  if (!bundle || bundle.resourceType !== "Bundle") return null;
  if (!Array.isArray(bundle.entry)) bundle.entry = [];
  let composition = getCompositionFromBundle(bundle);
  if (!composition) {
    composition = {
      resourceType: "Composition",
      status: "preliminary",
      type: {
        coding: [
          {
            system: "http://loinc.org",
            code: "11488-4",
            display: "Consult note"
          }
        ]
      },
      title: "AI Triage Report",
      date: new Date().toISOString(),
      author: [{ reference: "Device/AI-Triage-System" }],
      section: TRIAGE_SECTION_TITLES.map((title) => ({
        title,
        text: "Not provided"
      }))
    };
    bundle.entry.unshift({ resource: composition });
  }
  if (!Array.isArray(composition.section)) {
    composition.section = TRIAGE_SECTION_TITLES.map((title) => ({
      title,
      text: "Not provided"
    }));
  }
  TRIAGE_SECTION_TITLES.forEach((title) => {
    if (!composition.section.find((s) => (s.title || "").toLowerCase() === title.toLowerCase())) {
      composition.section.push({ title, text: "Not provided" });
    }
  });
  return composition;
}

function getSectionText(bundle, title) {
  const composition = getCompositionFromBundle(bundle);
  if (!composition || !Array.isArray(composition.section)) return "";
  const section = composition.section.find((s) => (s.title || "").toLowerCase() === title.toLowerCase());
  const value = section && section.text;
  return typeof value === "string" ? value : "";
}

function setSectionText(bundle, title, text) {
  const composition = ensureComposition(bundle);
  if (!composition) return;
  const section = composition.section.find((s) => (s.title || "").toLowerCase() === title.toLowerCase());
  if (section) section.text = text || "Not provided";
}

function renderTriageReport(record, patientAddr, canEdit) {
  const report = getTriageReportFromRecord(record);
  if (!report || !report.bundle) {
    return `
      <div class="ai-shared-empty">
        No AI triage report shared yet.
      </div>
    `;
  }

  const bundle = report.bundle;
  const status = report.status || getCompositionFromBundle(bundle)?.status || "preliminary";
  const updatedAt = report.updatedAt || report.sharedAt || report.createdAt;
  const readonlyAttr = canEdit ? "" : "readonly";

  const sectionHtml = TRIAGE_SECTION_TITLES.map((title) => {
    const idSuffix = `${title.replace(/[^a-z0-9]+/gi, "")}${patientAddr}`;
    const value = escapeConversationHtml(getSectionText(bundle, title));
    return `
      <label for="aiTriage${idSuffix}">${escapeConversationHtml(title)}</label>
      <textarea id="aiTriage${idSuffix}" class="form-control ai-triage-textarea" rows="3" ${readonlyAttr}>${value}</textarea>
    `;
  }).join("");

  const actionHtml = canEdit
    ? `<div class="ai-triage-actions"><button class="btn btn-primary" onclick="saveTriageReport('${patientAddr}', '${report.id || ""}')">Save Report</button></div>`
    : "";

  const updatedLabel = updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : "Not updated";

  return `
    <div class="ai-triage-meta">
      Status: <span id="aiTriageStatus${patientAddr}">${escapeConversationHtml(status)}</span>
      <span id="aiTriageUpdated${patientAddr}">${escapeConversationHtml(updatedLabel)}</span>
    </div>
    <div class="ai-triage-fields">
      ${sectionHtml}
    </div>
    ${actionHtml}
  `;
}

async function canEditTriageReport(patientAddress) {
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const doctorAddress = accounts[0];
    const appointmentIds = await appointmentManager.methods
      .getDoctorAppointments(doctorAddress)
      .call({ from: doctorAddress });

    for (let id of appointmentIds) {
      const appointment = await appointmentManager.methods.appointments(id).call();
      if (
        appointment.patientAddress.toLowerCase() === patientAddress.toLowerCase() &&
        appointment.isAccepted
      ) {
        return true;
      }
    }
  } catch (err) {
    console.warn("Failed to check triage report edit eligibility:", err);
  }
  return false;
}

async function saveTriageReport(patientAddr, reportId) {
  try {
    const canEdit = await canEditTriageReport(patientAddr);
    if (!canEdit) {
      alert("You need an accepted appointment to edit this report.");
      return;
    }

    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const doctorAddr = accounts[0];

    const recordHash = await medicalDataRegistry.methods
      .getHash(patientAddr)
      .call({ from: doctorAddr });
    if (!recordHash) {
      alert("No medical record found for this patient.");
      return;
    }

    const resp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
    const encryptedPayload = await resp.json();
    const aesKey = await getDoctorAESKeyForPatient(patientAddr);
    const decryptedRecordStr = await window.decryptAES(encryptedPayload, aesKey);
    const record = JSON.parse(decryptedRecordStr);

    let reports = [];
    if (Array.isArray(record?.aiTriageReports)) {
      reports = record.aiTriageReports;
    } else if (record?.aiTriageReport) {
      reports = [record.aiTriageReport];
    }

    let report = null;
    if (reportId) {
      report = reports.find((r) => r && r.id === reportId) || null;
    }
    if (!report) {
      report = getTriageReportFromRecord(record);
    }

    if (!report || !report.bundle) {
      alert("No AI triage report found.");
      return;
    }

    const bundle = report.bundle;
    TRIAGE_SECTION_TITLES.forEach((title) => {
      const idSuffix = `${title.replace(/[^a-z0-9]+/gi, "")}${patientAddr}`;
      const field = document.getElementById(`aiTriage${idSuffix}`);
      if (field) setSectionText(bundle, title, field.value || "Not provided");
    });

    const composition = ensureComposition(bundle);
    const now = new Date().toISOString();
    if (composition) {
      composition.status = "final";
      composition.date = now;
      composition.attester = [
        {
          mode: "legal",
          time: now,
          party: {
            display: docName || "Unknown Doctor",
            reference: `Practitioner/${doctorAddr}`
          }
        }
      ];
    }

    report.status = "final";
    report.updatedAt = now;
    report.attestedBy = {
      name: docName || "Unknown Doctor",
      address: doctorAddr,
      time: now
    };
    report.bundle = bundle;
    if (!Array.isArray(record.aiTriageReports)) record.aiTriageReports = [];
    record.aiTriageReports = record.aiTriageReports.filter((r) => r && r.id !== report.id);
    record.aiTriageReports.unshift(report);
    record.aiTriageReport = report;

    const encryptedUpdated = await window.encryptAES(JSON.stringify(record), aesKey);
    const buffer = Buffer.from(JSON.stringify(encryptedUpdated), "utf-8");
    const ipfsResult = await ipfs.add(buffer);
    const ipfsHash = ipfsResult[0]?.hash || ipfsResult.path;

    await medicalDataRegistry.methods.setHash(patientAddr, ipfsHash).send({ from: doctorAddr });

    const statusEl = document.getElementById(`aiTriageStatus${patientAddr}`);
    const updatedEl = document.getElementById(`aiTriageUpdated${patientAddr}`);
    if (statusEl) statusEl.textContent = "final";
    if (updatedEl) updatedEl.textContent = `Updated ${new Date(now).toLocaleString()}`;

    alert("AI triage report saved.");
  } catch (err) {
    console.error("Error saving triage report:", err);
    alert("Failed to save triage report: " + (err.message || err));
  }
}
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
      const formattedHtml = `
        <div class="medical-record-title">Medical Record</div>
        ${renderMedicalRecord(decryptedRecord, {
          includeDiagnosis: false,
          includeTreatment: false,
          includeTriage: false,
        })}
      `;
      const sharedConversationsHtml = renderSharedConversations(decryptedRecord);
      const canEditTriage = await canEditTriageReport(patientAddr);
      const triageReportHtml = renderTriageReport(decryptedRecord, patientAddr, canEditTriage);

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
                <div class="medical-record-surface" id="records${patientAddr}">
                  ${formattedHtml}
                </div>
              </div>
            </div>
            <hr>
            <div class="section ai-triage-report-section">
              <h5 class="ai-triage-title">AI Triage Report</h5>
              <div class="ai-triage-content">
                ${triageReportHtml}
              </div>
            </div>
            <hr>
            <div class="section shared-conversations-section">
              <h5 class="shared-conversations-title">Shared Conversations</h5>
              <div class="shared-conversations-content">
                ${sharedConversationsHtml}
              </div>
            </div>
            <hr>
            <div class="form-container clinical-form-container">
              <div class="section diagnosis-section clinical-form-card">
                <div class="clinical-card-header">
                  <h5 class="clinical-card-title">Diagnosis</h5>
                  <p class="clinical-card-subtitle">Enter diagnosis details for this patient.</p>
                </div>
                <div class="form-row clinical-form-row">
                  <div class="form-field">
                    <label for="ailmentsList${patientAddr}" class="form-label">Diagnosis Name</label>
                    <select class="form-control clinical-input" id="ailmentsList${patientAddr}" required>
                      <option selected disabled>Choose diagnosis...</option>
                      <option value="0">Common Flu</option>
                      <option value="1">Viral Infection</option>
                      <option value="2">Cancer</option>
                      <option value="3">Tumor</option>
                      <option value="4">Covid-19</option>
                      <option value="5">Heart Disorder</option>
                      <option value="6">Other</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label for="severity${patientAddr}" class="form-label">Severity</label>
                    <select class="form-control clinical-input" id="severity${patientAddr}" required>
                      <option selected disabled>Select severity...</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div class="form-row clinical-form-row">
                  <div class="form-field">
                    <label for="clinicalStatus${patientAddr}" class="form-label">Clinical Status</label>
                    <select class="form-control clinical-input" id="clinicalStatus${patientAddr}" required>
                      <option selected disabled>Select status...</option>
                      <option value="active">Active</option>
                      <option value="remission">Remission</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                  <div class="form-field">
                    <label for="affectedArea${patientAddr}" class="form-label">Affected Area</label>
                    <input type="text" class="form-control clinical-input" id="affectedArea${patientAddr}" placeholder="e.g. upper respiratory tract" required>
                  </div>
                </div>
                <div class="form-field form-field-full">
                  <label for="details${patientAddr}" class="form-label">Details</label>
                  <textarea class="form-control clinical-input clinical-textarea" rows="5" id="details${patientAddr}" placeholder="Enter diagnosis details, symptoms, and relevant findings..." name="Details" required autofocus></textarea>
                </div>
                <div class="clinical-form-actions">
                  <button class="btn btn-primary clinical-submit-btn" onclick="submitDiagnosis(this, ${index})">Save Diagnosis</button>
                </div>
              </div>
              <div class="section treatment-plan-section clinical-form-card">
                <div class="clinical-card-header">
                  <h5 class="clinical-card-title">Treatment</h5>
                  <p class="clinical-card-subtitle">Document the prescribed treatment plan and administration guidance.</p>
                </div>
                <div class="form-row clinical-form-row">
                  <div class="form-field">
                    <label for="medicationName${patientAddr}" class="form-label">Medication Name</label>
                    <input type="text" class="form-control clinical-input" id="medicationName${patientAddr}" placeholder="Enter medication name">
                  </div>
                  <div class="form-field">
                    <label for="dose${patientAddr}" class="form-label">Dosage</label>
                    <input type="text" class="form-control clinical-input" id="dose${patientAddr}" placeholder="e.g. 500mg twice daily">
                  </div>
                </div>
                <div class="form-row clinical-form-row">
                  <div class="form-field">
                    <label for="frequency${patientAddr}" class="form-label">Frequency</label>
                    <input type="text" class="form-control clinical-input" id="frequency${patientAddr}" placeholder="e.g. Twice daily for 7 days">
                  </div>
                  <div class="form-field">
                    <label for="route${patientAddr}" class="form-label">Route of Administration</label>
                    <select id="route${patientAddr}" class="form-control clinical-input">
                      <option value="">Select route...</option>
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
                </div>
                <div class="form-field form-field-full">
                  <label for="instructions${patientAddr}" class="form-label">Notes</label>
                  <textarea class="form-control clinical-input clinical-textarea" id="instructions${patientAddr}" rows="4" placeholder="Add monitoring instructions, precautions, or follow-up notes..."></textarea>
                </div>
                <div class="clinical-form-actions">
                  <button class="btn btn-primary clinical-submit-btn" onclick="submitTreatmentPlan(this, ${index})">Save Treatment</button>
                </div>
              </div>
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

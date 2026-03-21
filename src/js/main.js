
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



function safeText(value, fallback = "Not provided") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function formatDate(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value, "Not provided");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return safeText(value, "Not provided");
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${datePart} \u2013 ${timePart}`;
}

function formatName(nameArray) {
  if (!Array.isArray(nameArray) || nameArray.length === 0) return "Unknown Patient";
  return nameArray
    .map((n) => `${(n.given || []).join(" ")} ${n.family || ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

function formatGender(gender) {
  if (!gender) return "Unknown";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

function getSectionText(bundle, title) {
  if (!bundle || bundle.resourceType !== "Bundle") return "";
  const entry = Array.isArray(bundle.entry) ? bundle.entry : [];
  const compEntry = entry.find((e) => e && e.resource && e.resource.resourceType === "Composition");
  const composition = compEntry ? compEntry.resource : null;
  if (!composition || !Array.isArray(composition.section)) return "";
  const section = composition.section.find((s) => (s.title || "").toLowerCase() === title.toLowerCase());
  const value = section && section.text;
  return typeof value === "string" ? value : "";
}

function SectionBlock(title, bodyHtml) {
  return `
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0 w-full">
      <div class="text-[11px] uppercase tracking-widest text-slate-500">${safeText(title, "")}</div>
      <div class="mt-1 text-sm text-slate-700 leading-relaxed break-words whitespace-normal max-w-full">${safeText(bodyHtml, "Not provided")}</div>
    </div>
  `;
}

function splitListItems(text) {
  if (!text) return [];
  return String(text)
    .split(/\n|,|;|•/g)
    .map((item) => item.trim())
    .map((item) => item.replace(/^\d+[\).\s]+/, "").trim())
    .filter(Boolean);
}

function renderTagList(text) {
  const items = splitListItems(text);
  if (!items.length) return "Not provided";
  return `
    <div class="flex flex-wrap gap-2 max-w-full">
      ${items.map((item) => `<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 break-words max-w-full">${item}</span>`).join("")}
    </div>
  `;
}

function renderNumberedList(text) {
  const items = splitListItems(text);
  if (!items.length) return "Not provided";
  return `
    <ol class="list-decimal pl-4 text-sm text-slate-700 max-w-full">
      ${items.map((item) => `<li class="mb-1 break-words">${item}</li>`).join("")}
    </ol>
  `;
}

function PatientCard(patient) {
  if (!patient) return "";
  const name = formatName(patient.name);
  const genderDob = `${formatGender(patient.gender)} \u2022 ${formatDate(patient.birthDate)}`;
  const phone = patient.telecom?.find((t) => t.system === "phone")?.value || "";
  const email = patient.telecom?.find((t) => t.system === "email")?.value || "";
  const address = patient.address?.map((a) => (a.line ? a.line.join(", ") : "")).filter(Boolean).join("; ") || "Not provided";
  const allergies = Array.isArray(patient.allergies)
    ? patient.allergies.map((a) => `${a.substance} (${a.reaction}, ${a.criticality})`).join(", ")
    : "None";

  return `
    <section class="w-full rounded-2xl border border-slate-200 bg-[#f9fafb] p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xl font-semibold text-slate-900">${safeText(name, "Unknown Patient")}</div>
          <div class="mt-1 text-sm text-slate-500">${safeText(genderDob, "Not provided")}</div>
        </div>
        <div class="text-[11px] uppercase tracking-[0.3em] text-slate-400">Patient Summary</div>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div class="mt-1 text-slate-400"><i class="fa-solid fa-phone"></i></div>
          <div class="min-w-0">
            <div class="text-[11px] uppercase tracking-widest text-slate-400">Phone</div>
            <div class="text-sm text-slate-700 break-words">${safeText(phone, "Not provided")}</div>
          </div>
        </div>
        <div class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div class="mt-1 text-slate-400"><i class="fa-solid fa-envelope"></i></div>
          <div class="min-w-0">
            <div class="text-[11px] uppercase tracking-widest text-slate-400">Email</div>
            <div class="text-sm text-slate-700 break-words">${safeText(email, "Not provided")}</div>
          </div>
        </div>
        <div class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div class="mt-1 text-slate-400"><i class="fa-solid fa-location-dot"></i></div>
          <div class="min-w-0">
            <div class="text-[11px] uppercase tracking-widest text-slate-400">Address</div>
            <div class="text-sm text-slate-700 break-words leading-relaxed">${safeText(address, "Not provided")}</div>
          </div>
        </div>
        <div class="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div class="mt-1 text-slate-400"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="min-w-0">
            <div class="text-[11px] uppercase tracking-widest text-slate-400">Allergies</div>
            <div class="text-sm text-slate-700 break-words">${safeText(allergies, "None")}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function TreatmentCard(treatmentPlan) {
  if (!Array.isArray(treatmentPlan) || treatmentPlan.length === 0) return "";
  const items = treatmentPlan.map((t) => `
    <div class="min-w-0">
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-sm font-semibold text-slate-700 break-words">${safeText(formatDateTime(t.datetime), "Not provided")}</div>
          <div class="text-xs text-slate-500"><i class="fa-solid fa-user-doctor"></i> ${safeText(t.doctor, "Unknown Doctor")}</div>
        </div>
        <div class="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <span class="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
            <i class="fa-solid fa-pills mr-1"></i>${safeText(t.medicationName, "Medication")}
          </span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Dose: ${safeText(t.dose, "N/A")}</span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Route: ${safeText(t.route, "N/A")}</span>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Frequency: ${safeText(t.frequency, "N/A")}</span>
        </div>
        <div class="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 break-words w-full max-w-full">
          <div class="text-[11px] uppercase tracking-widest text-slate-500">Instructions</div>
          <div class="mt-1 text-slate-700 break-words whitespace-normal">${safeText(t.instructions, "Not provided")}</div>
        </div>
      </div>
    </div>
  `).join("");

  return `
    <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="flex min-h-[72px] items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <i class="fa-solid fa-clipboard-list"></i>
        </div>
        <div>
          <div class="text-sm font-semibold uppercase tracking-widest text-slate-500">Treatment History</div>
          <div class="text-xs text-slate-400">Timeline of prescribed care</div>
        </div>
      </div>
      <div class="space-y-4 p-5 pt-3">${items}</div>
    </section>
  `;
}

function DiagnosisCard(diagnosis) {
  if (!Array.isArray(diagnosis) || diagnosis.length === 0) return "";
  const items = diagnosis.map((d) => `
    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm font-semibold text-slate-700 break-words">${safeText(formatDateTime(d.datetime), "Not provided")}</div>
        <div class="text-xs text-slate-500"><i class="fa-solid fa-user-doctor"></i> ${safeText(d.doctor, "Unknown Doctor")}</div>
      </div>
      <div class="mt-2 text-sm text-slate-600 break-words">
        <span class="font-semibold text-slate-700">Condition:</span> ${safeText(d.diagnosed, "Not provided")}
      </div>
      <div class="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <span class="rounded-full bg-slate-100 px-2.5 py-1">Status: ${safeText(d.clinicalStatus, "N/A")}</span>
        <span class="rounded-full bg-slate-100 px-2.5 py-1">Severity: ${safeText(d.severity, "N/A")}</span>
        <span class="rounded-full bg-slate-100 px-2.5 py-1">Area: ${safeText(d.affectedArea, "N/A")}</span>
      </div>
      <div class="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 break-words w-full max-w-full">
        <div class="text-[11px] uppercase tracking-widest text-slate-500">Details</div>
        <div class="mt-1 text-slate-700 break-words whitespace-normal">${safeText(d.details, "Not provided")}</div>
      </div>
    </div>
  `).join("");

  return `
    <section class="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="flex min-h-[72px] items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <i class="fa-solid fa-notes-medical"></i>
        </div>
        <div>
          <div class="text-sm font-semibold uppercase tracking-widest text-slate-500">Diagnosis History</div>
          <div class="text-xs text-slate-400">Clinician assessments</div>
        </div>
      </div>
      <div class="space-y-4 p-5 pt-3">${items}</div>
    </section>
  `;
}

function ReportCard(triageReports) {
  if (!Array.isArray(triageReports) || triageReports.length === 0) return "";
  const reportHtml = triageReports.map((report, index) => {
    const title = report.title || "AI Triage Report";
    const status = report.status || "preliminary";
    const updated = report.updatedAt || report.sharedAt || report.createdAt;
    const statusClass = status.toLowerCase() === "final"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
    const sections = [
      ["Chief Complaint", safeText(getSectionText(report.bundle, "Chief Complaint"), "Not provided")],
      ["Symptoms", renderTagList(getSectionText(report.bundle, "Symptoms"))],
      ["AI Differential Diagnosis", renderNumberedList(getSectionText(report.bundle, "AI Differential Diagnosis"))],
      ["Suggested Treatments", safeText(getSectionText(report.bundle, "Suggested Treatments"), "Not provided")],
      ["Doctor Notes", safeText(getSectionText(report.bundle, "Doctor Notes"), "Not provided")],
    ].map(([label, value]) => SectionBlock(label, value)).join("");

    return `
      <details class="group rounded-xl border border-slate-200 bg-white shadow-sm min-w-0 w-full" ${index === 0 ? "open" : ""}>
        <summary class="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-slate-700 break-words">${safeText(title, "AI Triage Report")}</div>
            <div class="text-xs text-slate-500">${safeText(formatDateTime(updated), "Not provided")}</div>
          </div>
          <div class="flex items-center gap-3">
            <span class="rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}">${safeText(status, "preliminary")}</span>
            <i class="fa-solid fa-chevron-down text-slate-400 transition-transform group-open:rotate-180"></i>
          </div>
        </summary>
        <div class="border-t border-slate-200 p-5 space-y-3 min-w-0">
          ${sections}
        </div>
      </details>
    `;
  }).join("");

  return `
    <section class="rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
      <div class="flex min-h-[72px] flex-col items-center justify-center gap-2 border-b border-slate-200 px-5 py-4 text-center">
        <div class="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <i class="fa-solid fa-brain"></i>
        </div>
        <div>
          <div class="text-sm font-semibold uppercase tracking-widest text-slate-500">AI Triage Reports</div>
          <div class="text-xs text-slate-400">Clinical summaries generated by AI</div>
        </div>
      </div>
      <div class="space-y-3 p-5">${reportHtml}</div>
    </section>
  `;
}

// Renders a patient resource as formatted HTML for doctor/proxy pages
function renderResource(resource, options = {}) {
  if (!resource) return "";

  let record = resource;
  let patient = null;
  let diagnosis = [];
  let treatmentPlan = [];
  let triageReports = [];

  if (record.resourceType === "Bundle" && Array.isArray(record.entry)) {
    const entries = record.entry.map((e) => e.resource).filter(Boolean);
    patient = entries.find((r) => r.resourceType === "Patient") || null;
  } else if (record.resourceType === "Patient") {
    patient = record;
  }
  if (!patient && (record.gender || record.birthDate || record.telecom || record.address || record.allergies)) {
    patient = record;
  }

  if (record.diagnosis) diagnosis = record.diagnosis;
  if (record.treatmentPlan) treatmentPlan = record.treatmentPlan;

  if (record.aiTriageReports) triageReports = record.aiTriageReports;
  if (!triageReports.length && record.aiTriageReport) triageReports = [record.aiTriageReport];

  const includeTriage = options.includeTriage !== false;

  const patientCard = PatientCard(patient);
  const diagnosisCard = DiagnosisCard(diagnosis);
  const treatmentCard = TreatmentCard(treatmentPlan);
  const reportCard = includeTriage ? ReportCard(triageReports) : "";

  const mainCards = [treatmentCard, diagnosisCard, reportCard].filter(Boolean).join("");

  return `
    <div class="ehr-shell space-y-5 mx-auto w-full max-w-none px-0">
      ${patientCard}
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start">
        ${mainCards}
      </div>
    </div>
  `;
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

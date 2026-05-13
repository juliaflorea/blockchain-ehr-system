
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
let llmChatState = {
  awaitingFollowUpReply: false,
  lastDiagnoses: [],
  lastFollowUpQuestions: []
};
let cachedLLMContext = null;
let cachedLLMContextHash = null;
let chatStorageKey = "aiChatThreads:default";
let chatThreads = [];
let activeThreadId = null;
let lastGeneratedTriageReport = null;
let cachedTriageReports = null;
let cachedTriageReportsHash = null;
let draftTriageReports = {};
const DEFAULT_THREAD_TITLE = "New conversation";
const pendingThreadTitleIds = new Set();

async function initChatHistoryStorageKey() {
  try {
    let accounts = await ethereum.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) {
      accounts = await ethereum.request({ method: "eth_requestAccounts" });
    }
    if (accounts && accounts[0]) {
      chatStorageKey = `aiChatThreads:${accounts[0].toLowerCase()}`;
    }
  } catch (err) {
    console.warn("Chat history key fallback:", err.message);
  }
}

function loadChatThreadsFromStorage() {
  const raw = localStorage.getItem(chatStorageKey);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    chatThreads = Array.isArray(parsed.threads) ? parsed.threads : [];
    activeThreadId = parsed.activeThreadId || (chatThreads[0] && chatThreads[0].id) || null;
  } catch (err) {
    console.warn("Failed to parse chat threads:", err.message);
  }
}

function saveChatThreadsToStorage() {
  localStorage.setItem(
    chatStorageKey,
    JSON.stringify({ threads: chatThreads, activeThreadId })
  );
}

function createNewThread(title) {
  const id = `t_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const thread = {
    id,
    title: title || DEFAULT_THREAD_TITLE,
    updatedAt: Date.now(),
    messages: []
  };
  chatThreads.unshift(thread);
  activeThreadId = id;
  saveChatThreadsToStorage();
  renderChatThreadsList();
  renderActiveThread();
}

function setActiveThread(id) {
  activeThreadId = id;
  saveChatThreadsToStorage();
  renderChatThreadsList();
  renderActiveThread();
}

function deleteThreadById(id) {
  if (!id) return;
  const wasActive = id === activeThreadId;
  chatThreads = chatThreads.filter(t => t.id !== id);
  if (!chatThreads.length) {
    createNewThread("New conversation");
    return;
  }
  if (wasActive) {
    activeThreadId = chatThreads[0].id;
    renderActiveThread();
  }
  saveChatThreadsToStorage();
  renderChatThreadsList();
}

function renameThreadById(id) {
  const thread = chatThreads.find(t => t.id === id);
  if (!thread) return;
  const nextTitle = window.prompt("Rename conversation", thread.title || "Conversation");
  if (!nextTitle) return;
  thread.title = nextTitle.trim().slice(0, 60) || thread.title;
  thread.updatedAt = Date.now();
  saveChatThreadsToStorage();
  renderChatThreadsList();
}

function getActiveThread() {
  return chatThreads.find(t => t.id === activeThreadId) || null;
}

function renderChatThreadsList() {
  const list = document.getElementById("aiChatList");
  if (!list) return;
  list.innerHTML = "";

  const search = document.getElementById("aiChatSearch");
  const query = search ? search.value.trim().toLowerCase() : "";
  const sorted = [...chatThreads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  sorted.forEach(thread => {
    if (query && !(thread.title || "").toLowerCase().includes(query)) {
      return;
    }
    const item = document.createElement("div");
    item.className = "ai-chat-item" + (thread.id === activeThreadId ? " active" : "");
    item.dataset.threadId = thread.id;

    const label = document.createElement("div");
    label.className = "ai-chat-item-label";
    label.textContent = thread.title || "Conversation";
    label.addEventListener("click", () => setActiveThread(thread.id));

    const menu = document.createElement("div");
    menu.className = "ai-chat-item-menu";
    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.textContent = "⋯";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllChatMenus();
      toggleChatMenu(menu);
    });

    menu.appendChild(menuBtn);
    item.appendChild(label);
    item.appendChild(menu);
    list.appendChild(item);
  });
}

function toggleChatMenu(menuRoot) {
  const open = menuRoot.querySelector(".ai-chat-item-dropdown");
  if (open) {
    open.remove();
    return;
  }

  const threadId = getThreadIdFromListItem(menuRoot.parentElement);

  const dropdown = document.createElement("div");
  dropdown.className = "ai-chat-item-dropdown";

  const renameBtn = document.createElement("button");
  renameBtn.textContent = "Rename";
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.remove();
    if (threadId) renameThreadById(threadId);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.remove();
    if (threadId) deleteThreadById(threadId);
  });

  dropdown.appendChild(renameBtn);
  dropdown.appendChild(deleteBtn);
  menuRoot.appendChild(dropdown);
}

function closeAllChatMenus() {
  document.querySelectorAll(".ai-chat-item-dropdown").forEach(el => el.remove());
}

function getThreadIdFromListItem(listItem) {
  return listItem?.dataset?.threadId || null;
}

function renderActiveThread() {
  const chatWindow = document.getElementById("chatWindow");
  if (!chatWindow) return;
  chatWindow.innerHTML = "";

  const thread = getActiveThread();
  if (!thread) return;

  thread.messages.forEach(msg => {
    appendMessageToUI(msg.role, msg.text);
  });

  chatWindow.scrollTop = chatWindow.scrollHeight;
  refreshTriageReportForActiveThread();
}

function appendMessageToUI(role, text) {
  const chatWindow = document.getElementById("chatWindow");
  if (!chatWindow) return;
  const bubble = document.createElement("div");
  bubble.className = role === "assistant" ? "ai-bubble ai-assistant" : "ai-bubble ai-user";
  bubble.dataset.role = role;
  const span = document.createElement("div");
  span.className = "ai-message-content";
  if (role === "assistant") {
    span.innerHTML = renderAssistantMessage(text || "");
  } else {
    span.textContent = text || "";
  }
  bubble.appendChild(span);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "ai-copy-btn";
  copyBtn.textContent = "Copy";
  bubble.appendChild(copyBtn);

  chatWindow.appendChild(bubble);
  return span;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatRiskLevelMarkup(escapedText) {
  return escapedText
    .replace(/Risk level:\s*(LOW|MODERATE|HIGH)/gi, (_match, level) => {
      const normalizedLevel = String(level || "").toUpperCase();
      const className = normalizedLevel === "LOW"
        ? "risk-low"
        : normalizedLevel === "MODERATE"
          ? "risk-moderate"
          : "risk-high";
      return `Risk level: <span class="${className}">${normalizedLevel}</span>`;
    });
}

function dedupeConsecutiveSentences(text) {
  const blocks = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  const dedupedBlocks = blocks.map((block) => {
    const lines = block.split("\n");
    const out = [];
    let last = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const normalized = trimmed.toLowerCase();
      if (normalized === last) continue;
      out.push(trimmed);
      last = normalized;
    }

    return out.join("\n");
  }).filter(Boolean);

  return dedupedBlocks.join("\n\n");
}

function addSectionSpacing(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*(\*\*Possible causes:\*\*)/gi, "\n\n$1")
    .replace(/\s*(\*\*Safety Alert:\*\*)/gi, "\n\n$1")
    .replace(/\s*(\*\*Risk level:[^\n]*\*\*)/gi, "\n\n$1")
    .replace(/\s*(Possible causes:)/gi, "\n\n$1")
    .replace(/\s*(Safety Alert:)/gi, "\n\n$1")
    .replace(/\s*(Risk level:\s*(?:LOW|MODERATE|HIGH))/gi, "\n\n$1")
    .replace(/^\n+/, "");
}

function renderAssistantMessage(text) {
  const formattedText = addSectionSpacing(dedupeConsecutiveSentences(text || "")).trim();
  const escaped = escapeHtml(formattedText);
  const lines = escaped.split("\n");
  const htmlParts = [];
  let bulletItems = [];

  const flushBullets = () => {
    if (!bulletItems.length) return;
    htmlParts.push(`<ul>${bulletItems.join("")}</ul>`);
    bulletItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushBullets();
      if (htmlParts[htmlParts.length - 1] !== "<br><br>") {
        htmlParts.push("<br><br>");
      }
      continue;
    }

    if (line.startsWith("- ")) {
      bulletItems.push(`<li>${line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`);
      continue;
    }

    flushBullets();
    htmlParts.push(line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"));
  }

  flushBullets();

  let html = htmlParts.join("<br>");
  html = html.replace(/(<br>){3,}/g, "<br><br>");
  return formatRiskLevelMarkup(html);
}

function appendTypingIndicator() {
  const chatWindow = document.getElementById("chatWindow");
  if (!chatWindow) return null;
  const bubble = document.createElement("div");
  bubble.className = "ai-bubble ai-assistant ai-typing";
  bubble.dataset.role = "assistant";

  const dotWrap = document.createElement("div");
  dotWrap.className = "ai-typing-dots";
  dotWrap.setAttribute("aria-label", "Assistant is typing");
  dotWrap.innerHTML = "<span></span><span></span><span></span>";

  bubble.appendChild(dotWrap);
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

function removeTypingIndicator(bubble) {
  if (bubble && bubble.parentNode) {
    bubble.parentNode.removeChild(bubble);
  }
}

function addMessageToActiveThread(role, text) {
  const thread = getActiveThread();
  if (!thread) return;
  thread.messages.push({ role, text, ts: Date.now() });
  thread.updatedAt = Date.now();

  // Keep history bounded to last 200 messages per thread.
  if (thread.messages.length > 200) {
    thread.messages = thread.messages.slice(thread.messages.length - 200);
  }

  saveChatThreadsToStorage();
  renderChatThreadsList();
}

function isDefaultThreadTitle(title) {
  const normalized = String(title || "").trim().toLowerCase();
  return !normalized || normalized === DEFAULT_THREAD_TITLE.toLowerCase() || normalized === "conversation";
}

function toTitleCase(text) {
  return String(text || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildFallbackConversationTitle(messages) {
  const firstUserMessage = (messages || []).find((msg) => msg && msg.role === "user" && msg.text);
  const source = String(firstUserMessage?.text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!source) return "Conversation";

  let normalized = source
    .replace(/^(hi|hello|hey)\b[!,.\s]*/i, "")
    .replace(/^(can you|could you|would you|please|help me)\b[!,.\s]*/i, "")
    .replace(/^(i have|i'm having|i am having|i feel|i'm feeling|i am feeling|my)\b[!,.\s]*/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();

  if (!normalized) normalized = source.replace(/[?.!]+$/g, "").trim();

  const words = normalized.split(/\s+/).slice(0, 6);
  const compact = words.join(" ").replace(/\s+/g, " ").trim();
  return compact ? toTitleCase(compact) : "Conversation";
}

function sanitizeConversationTitle(title, messages) {
  const cleaned = String(title || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(title|conversation title)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim()
    .slice(0, 60);

  return cleaned || buildFallbackConversationTitle(messages);
}

async function maybeGenerateThreadTitle(threadId) {
  const thread = chatThreads.find((t) => t.id === threadId);
  if (!thread || !isDefaultThreadTitle(thread.title) || pendingThreadTitleIds.has(threadId)) {
    return;
  }

  const meaningfulMessages = (thread.messages || []).filter((msg) => String(msg.text || "").trim());
  const hasUser = meaningfulMessages.some((msg) => msg.role === "user");
  const hasAssistant = meaningfulMessages.some((msg) => msg.role === "assistant");
  if (!hasUser || !hasAssistant) return;

  pendingThreadTitleIds.add(threadId);

  try {
    const response = await fetch("http://localhost:3000/api/conversation-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: meaningfulMessages.slice(0, 6).map((msg) => ({
          role: msg.role,
          text: msg.text
        }))
      })
    });

    if (!response.ok) {
      throw new Error("Title generation failed");
    }

    const payload = await response.json();
    const latestThread = chatThreads.find((t) => t.id === threadId);
    if (!latestThread || !isDefaultThreadTitle(latestThread.title)) return;

    latestThread.title = sanitizeConversationTitle(payload?.title, latestThread.messages);
    latestThread.updatedAt = Date.now();
    saveChatThreadsToStorage();
    renderChatThreadsList();
  } catch (err) {
    const latestThread = chatThreads.find((t) => t.id === threadId);
    if (latestThread && isDefaultThreadTitle(latestThread.title)) {
      latestThread.title = buildFallbackConversationTitle(latestThread.messages);
      latestThread.updatedAt = Date.now();
      saveChatThreadsToStorage();
      renderChatThreadsList();
    }
    console.warn("Conversation title generation failed:", err.message);
  } finally {
    pendingThreadTitleIds.delete(threadId);
  }
}


async function getSessionAESKey() {
  if (sessionAESKey) return sessionAESKey;

  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const patientAddress = accounts[0].toLowerCase(); // ✅ lowercase

  // Only 1 param: patientAddress
  const wrappedRMK = await medicalDataRegistry.methods
    .getEncryptedAESKey(patientAddress)
    .call({ from: patientAddress });

  if (!wrappedRMK || wrappedRMK === "0x") {
    throw new Error("No encryption key found for patient");
  }

  let passwordError = "";

  while (!sessionAESKey) {
    const password = await requestPassword(passwordError);
    if (!password) {
      throw new Error("Password entry cancelled.");
    }

    try {
      // Derive UAK with lowercase address
      const uak = await window.deriveUAK(password, patientAddress);
      sessionAESKey = await window.unwrapRMK(wrappedRMK, uak);

      // Cache for session
      window.sessionAESKey = sessionAESKey;
      return sessionAESKey;
    } catch (err) {
      if (!isIncorrectPasswordError(err)) {
        throw err;
      }

      passwordError = "The password you entered is incorrect. Please try again or use your recovery key if you have forgotten it.";
      console.warn("Incorrect patient password entered.");
    }
  }

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
    await refreshShareAvailability();
    await loadStoredTriageReport();

    // Initialize chat history storage key and load past conversation
    await initChatHistoryStorageKey();
    loadChatThreadsFromStorage();
    if (!chatThreads.length) {
      createNewThread("New conversation");
    } else {
      renderChatThreadsList();
      renderActiveThread();
    }

    document.getElementById("aiNewChatBtn")?.addEventListener("click", () => {
      createNewThread("New conversation");
    });
    document.getElementById("aiChatSearch")?.addEventListener("input", () => {
      renderChatThreadsList();
    });
    document.addEventListener("click", () => closeAllChatMenus());

    // Load sent appointment requests (uses cached AES key, no prompt)
    await loadSentAppointmentRequests();

    // Other automatic data loads
    displayProxiesWithAccess();
    displayFormerProxies();
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
    let html = '<div class="medical-record-title">Medical Record</div>';
    html += renderResource(record);

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
    if (err?.message === "Password entry cancelled.") {
      return;
    }
    if (isIncorrectPasswordError(err)) {
      alert("Unable to unlock your medical records because the password entered is incorrect. Please try again.");
      return;
    }
    alert(err.message || "Unable to load your medical records right now. Please try again.");
  }
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/fhir+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getApiBaseUrl() {
  return window.__API_BASE_URL__ || "http://localhost:3000";
}

async function readApiJson(response, fallbackMessage) {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch (err) {
    const looksLikeHtml = rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html");
    if (looksLikeHtml) {
      throw new Error(`${fallbackMessage} The API returned an HTML page instead of JSON. Make sure the Node server is running on ${getApiBaseUrl()} and has been restarted after the FHIR endpoint changes.`);
    }
    throw new Error(`${fallbackMessage} The API returned an invalid JSON response.`);
  }
}

async function exportFHIRMedicalRecord() {
  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    const patientAddress = accounts[0].toLowerCase();
    const selectedVersion = document.getElementById("fhirExportVersion")?.value || "R4";

    // Ensure session key exists
    if (!sessionAESKey) {
      alert("Session expired. Please log in again.");
      return;
    }

    // Export raw AES key from session
    const rawKey = await window.crypto.subtle.exportKey("raw", sessionAESKey);

    // Convert to base64
    const rawKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(rawKey))
    );

    // Call backend with session key instead of password
    const response = await fetch(`${getApiBaseUrl()}/api/fhir/export/${patientAddress}?version=${encodeURIComponent(selectedVersion)}`, {
      method: "GET",
      headers: {
        "x-session-key": rawKeyBase64,
      },
    });

    const payload = await readApiJson(response, "FHIR export failed.");
    if (!response.ok) {
      throw new Error(payload.error || "FHIR export failed.");
    }

    const bundle = payload?.bundle || payload;

    const patientResource = bundle?.entry?.find(
      entry => entry?.resource?.resourceType === "Patient"
    )?.resource;

    const firstName = patientResource?.name?.[0]?.given?.[0];
    const lastName = patientResource?.name?.[0]?.family;

    let fileName;

    if (firstName && lastName) {
      fileName = `MedicalRecord_${firstName}_${lastName}.json`;
    } else {
      fileName = "MedicalRecord_Patient.json";
    }

    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json"
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

  } catch (err) {
    console.error("FHIR export failed:", err);
    alert(err.message || "FHIR export failed.");
  }
}


// Recursively find the first name in the record or its nested resources
function getPatientName(record) {
  // Case 0: FHIR payload wrapped under .bundle
  if (record?.bundle) {
    return getPatientName(record.bundle);
  }

  if (record?.personalInfo) {
    const firstName = record.personalInfo.firstName || "";
    const lastName = record.personalInfo.lastName || "";
    if (firstName && lastName) {
      return `${firstName}_${lastName}`;
    }
    if (firstName) {
      return firstName;
    }
    if (lastName) {
      return lastName;
    }
  }

  let patient;

  // Case 1: Direct Patient resource
  if (record?.resourceType === "Patient") {
    patient = record;
  }
  // Case 2: FHIR Bundle
  else if (record?.resourceType === "Bundle" && Array.isArray(record.entry)) {
    for (const e of record.entry) {
      const res = e.resource;
      if (res?.resourceType === "Patient") {
        patient = res;
        break;
      }
    }
  }

  if (!patient || !patient.name?.length) return "Unknown_Unknown";

  const n = patient.name[0];

  // Prefer 'given' + 'family' if available
  if (Array.isArray(n.given) && n.family) {
    return `${n.given.join("_")}_${n.family}`;
  }
  // Fallback to 'text' field
  if (n.text) {
    return n.text.replace(/\s+/g, "_");
  }

  return "Unknown_Unknown";
}

// Convert a record to plain text for PDF download
// Convert a record to plain text for download
function recordToPlainText(record) {
  if (typeof window.medicalRecordToPlainText === "function") {
    return window.medicalRecordToPlainText(record);
  }
  return "Medical Record\n\n";
}

// Render a resource to HTML for browser display
// Render a resource to HTML for browser display (patient page)
function renderResource(r) {
  if (typeof window.renderMedicalRecord === "function") {
    return window.renderMedicalRecord(r);
  }
  return "";
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
          '<div class="detail-empty">Doctor information not available.</div>';
        return;
      }

      // Fetch doctor's information from IPFS
      $.get("http://localhost:8080/ipfs/" + ipfsHash, function (data) {
        // Extracting relevant information from the raw data
        var lines = data.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        var gender = extractDoctorInfoValue(lines, ["gender"]);
        var contact = extractDoctorInfoValue(lines, ["contact"]);
        var specialty = extractDoctorInfoValue(lines, ["specialty", "speciality"]);
        var hospital = extractDoctorInfoValue(lines, ["hospital", "clinic", "organization"]);
        var yearsOfExperienceLine = lines.find((line) =>
          line.startsWith("Years of Experience:")
        );
        var yearsOfExperience = yearsOfExperienceLine
          ? yearsOfExperienceLine.split(":").slice(1).join(":").trim()
          : "Not provided";

        var content = buildDoctorInfoCard({
          name: `${doctorDetails[0]} ${doctorDetails[1]}`.trim(),
          specialty: specialty || "Not provided",
          contact: contact || "Not provided",
          hospital: hospital || "Not provided",
          yearsOfExperience: yearsOfExperience || "Not provided",
          gender: gender || "Not provided"
        });
      

        document.getElementById("doctorInfoDisplay").innerHTML = content;
        document.getElementById("doctorInfoDisplay").style.display = "block";
        
      }).fail(function () {
        console.error("Failed to fetch data from IPFS.");
        document.getElementById("doctorInfoDisplay").innerHTML =
          '<div class="detail-empty">Error loading doctor information.</div>';
      });
    })
    .catch(function (error) {
      console.error("Error fetching doctor details:", error);
      document.getElementById("doctorInfoDisplay").innerHTML =
        '<div class="detail-empty">Error loading doctor information.</div>';
    });
}

function extractDoctorInfoValue(lines, keys) {
  if (!Array.isArray(lines)) return "";
  const keyList = Array.isArray(keys) ? keys : [keys];
  const match = lines.find((line) =>
    keyList.some((key) => line.toLowerCase().startsWith(key.toLowerCase() + ":"))
  );
  if (!match) return "";
  return match.split(":").slice(1).join(":").trim();
}

function buildDoctorInfoCard(data) {
  const details = [
    { label: "Name", value: data.name },
    { label: "Specialty", value: data.specialty },
    { label: "Contact", value: data.contact },
    { label: "Hospital", value: data.hospital },
    { label: "Years of Experience", value: data.yearsOfExperience },
    { label: "Gender", value: data.gender }
  ];

  const items = details.map((item) => `
    <div class="detail-item">
      <span class="detail-label">${item.label}</span>
      <span class="detail-value">${item.value || "Not provided"}</span>
    </div>
  `).join("");

  return `
    <div class="detail-card">
      <div class="detail-card-header">
        <h4 class="detail-card-title">Doctor Information</h4>
        <p class="detail-card-subtitle">Professional details and contact information</p>
      </div>
      <div class="detail-grid">
        ${items}
      </div>
    </div>
  `;
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
  var statusCell = $("<td>").appendTo(row);
  if (status === "Accepted") {
    statusCell.html('<span class="status-badge accepted-status">Accepted</span>');
  } else if (status === "Rejected") {
    statusCell.html('<span class="status-badge rejected-status">Rejected</span>');
  } else if (status === "Pending") {
    statusCell.html('<span class="status-badge pending-status">Pending</span>');
  } else {
    statusCell.html('<span class="status-badge unknown-status">Unknown</span>');
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

 

  // initialize views
  var panels = document.querySelectorAll(".panel");
  // Remove active from all panels
panels.forEach(function (panel) {
  panel.classList.remove("active");
});

// Activate personalInfoPanel
document.getElementById("personalInfoPanel").classList.add("active");

 // Setup event listeners for sidebar links
var sidebarLinks = document.querySelectorAll(".list-group-item");

sidebarLinks.forEach(function (link) {
  link.addEventListener("click", function () {
    var targetPanelIds = this.getAttribute("data-target").split(" ");

    // Remove active from all panels
    panels.forEach(function (panel) {
      panel.classList.remove("active");
    });

    // Activate all target panels
    targetPanelIds.forEach(function (id) {
      var panel = document.getElementById(id);
      if (panel) {
        panel.classList.add("active");
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
  panel.classList.remove("active");
});
document.getElementById("personalInfoPanel").classList.add("active");

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

function isIncorrectPasswordError(err) {
  const name = String(err?.name || "");
  const message = String(err?.message || "");

  return (
    name === "OperationError" ||
    name === "InvalidAccessError" ||
    name === "DataError" ||
    /decrypt/i.test(message) ||
    /operation/i.test(message) ||
    /unsupported state/i.test(message) ||
    /provided data is too small/i.test(message)
  );
}

// Show modal and wait for password input
function requestPassword(errorMessage = "") {
  return new Promise((resolve) => {
    $("#modalPassword").val(""); // clear previous input
    if (errorMessage) {
      $("#modalPasswordError").text(errorMessage).show();
    } else {
      $("#modalPasswordError").hide();
    }

    const modalEl = document.getElementById("passwordModal");
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
    modal.show();

    const submitBtn = document.getElementById("submitPasswordButton");
    const cancelBtn = modalEl.querySelector('[data-dismiss="modal"]');
    const passwordInput = document.getElementById("modalPassword");
    let settled = false;

    function cleanup() {
      submitBtn.removeEventListener("click", handleSubmit);
      cancelBtn?.removeEventListener("click", handleCancel);
      passwordInput.removeEventListener("keydown", handleKeydown);
      modalEl.removeEventListener("hidden.bs.modal", handleDismiss);
    }

    function finish(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function handleSubmit() {
      const pw = document.getElementById("modalPassword").value;
      if (!pw) return; // ignore empty
      finish(pw);
      modal.hide();
    }

    function handleCancel() {
      finish(null);
    }

    function handleDismiss() {
      finish(null);
    }

    function handleKeydown(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    }

    submitBtn.addEventListener("click", handleSubmit);
    cancelBtn?.addEventListener("click", handleCancel);
    passwordInput.addEventListener("keydown", handleKeydown);
    modalEl.addEventListener("hidden.bs.modal", handleDismiss, { once: true });
    passwordInput.focus();
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

    // Stop the flow cleanly if the modal is dismissed.
    const recoveredRMK = await requestRecoveryKey(patientAddress, wrappedRecoveryRMK);
    if (!recoveredRMK) return;

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
    const modal = new bootstrap.Modal(modalEl, { backdrop: true, keyboard: true });
    modal.show();

    const btn = document.getElementById("submitRecoveryButton");
    let settled = false;

    function cleanup() {
      btn.removeEventListener("click", handle);
      modalEl.removeEventListener("hidden.bs.modal", handleDismiss);
    }

    function finish(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function handleDismiss() {
      finish(null);
    }

    async function handle() {
      const recoveryKey = $("#recoveryKeyInput").val();
      if (!recoveryKey) return;

      try {
        const recoveryUAK = await window.deriveRecoveryUAK(recoveryKey, patientAddress);
        const recoveredRMK = await window.unwrapRMK(wrappedRecoveryRMK, recoveryUAK);

        finish(recoveredRMK);
        modal.hide();

      } catch (err) {
        $("#recoveryError").text("Invalid recovery key. Please try again.").show();
      }
    }

    btn.addEventListener("click", handle);
    modalEl.addEventListener("hidden.bs.modal", handleDismiss, { once: true });
  });
}


function showRecoveryError(msg) {
  $("#recoveryError").text(msg).show();
}

async function buildPatientLLMContext() {
  // Use existing wallet session when available to avoid repeated prompts.
  let accounts = await ethereum.request({ method: "eth_accounts" });
  if (!accounts || accounts.length === 0) {
    accounts = await ethereum.request({ method: "eth_requestAccounts" });
  }
  const patientAddress = accounts[0].toLowerCase();

  const recordHash = await medicalDataRegistry.methods
    .getHash(patientAddress)
    .call();

  // Reuse decrypted patient context if the record hash hasn't changed.
  if (cachedLLMContext && cachedLLMContextHash === recordHash) {
    return cachedLLMContext;
  }

  const patientAESKey = await getSessionAESKey();

  const resp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
  const encryptedPayload = await resp.json();

  const decryptedString = await window.decryptAES(encryptedPayload, patientAESKey);
  const record = JSON.parse(decryptedString);

  let age = null;
  let gender = null;
  let allergies = [];
  let allergyDetails = [];
  let pastDiagnoses = [];
  let diagnosisDetails = [];
  let treatments = [];
  let treatmentDetails = [];

  const resources =
    record.resourceType === "Bundle"
      ? record.entry.map(e => e.resource)
      : [record];

  resources.forEach(r => {
    if (r.birthDate) {
      const birthYear = new Date(r.birthDate).getFullYear();
      age = new Date().getFullYear() - birthYear;
    }

    if (r.gender) gender = r.gender;

    if (r.allergies) {
      r.allergies.forEach(a => {
        allergies.push(a.substance);
        allergyDetails.push({
          substance: a.substance,
          reaction: a.reaction
        });
      });
    }

    if (r.diagnosis) {
      r.diagnosis.forEach(d => {
        pastDiagnoses.push(d.diagnosed);
        diagnosisDetails.push({
          diagnosed: d.diagnosed,
          details: d.details,
          datetime: d.datetime,
          severity: d.severity
        });
      });
    }

    if (r.treatmentPlan) {
      r.treatmentPlan.forEach(t => {
        treatments.push(t.medicationName);
        treatmentDetails.push({
          medicationName: t.medicationName,
          dose: t.dose,
          frequency: t.frequency
        });
      });
    }
  });

  cachedLLMContext = {
    age,
    gender,
    allergies,
    allergyDetails,
    pastDiagnoses,
    diagnosisDetails,
    treatments,
    treatmentDetails
  };
  cachedLLMContextHash = recordHash;
  return cachedLLMContext;
}

async function sendSymptomMessage() {
  const input = document.getElementById("symptomInput");
  const chatWindow = document.getElementById("chatWindow");

  const message = input.value.trim();
  if (!message) return;

  // Display user message
  appendMessageToUI("user", message);
  addMessageToActiveThread("user", message);

  input.value = "";
  chatWindow.scrollTop = chatWindow.scrollHeight;
  const typingBubble = appendTypingIndicator();

  try {
    // Get blockchain + decrypted patient context
    const patientContext = await buildPatientLLMContext();

    // Fetch streaming response from server
    const response = await fetch("http://localhost:3000/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: patientContext.age,
        gender: patientContext.gender,
        allergies: patientContext.allergies,
        allergyDetails: patientContext.allergyDetails,
        pastDiagnoses: patientContext.pastDiagnoses,
        diagnosisDetails: patientContext.diagnosisDetails,
        treatments: patientContext.treatments,
        treatmentDetails: patientContext.treatmentDetails,
        symptoms: message
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aiReply = "";
    let span = null;
    let typingRemoved = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Append chunk to AI reply progressively
      if (!typingRemoved) {
        removeTypingIndicator(typingBubble);
        typingRemoved = true;
        span = appendMessageToUI("assistant", "");
      }
      aiReply += chunk;
      if (span) span.innerHTML = renderAssistantMessage(aiReply);
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // Plain text responses don't include structured follow-ups.
    llmChatState.lastDiagnoses = [];
    llmChatState.lastFollowUpQuestions = [];
    llmChatState.awaitingFollowUpReply = false;

    if (!typingRemoved) {
      removeTypingIndicator(typingBubble);
      typingRemoved = true;
      span = appendMessageToUI("assistant", "");
      if (span) span.innerHTML = renderAssistantMessage(aiReply);
    }

    const finalReply = addSectionSpacing(dedupeConsecutiveSentences(aiReply)).trim();
    addMessageToActiveThread("assistant", finalReply);
    const thread = getActiveThread();
    if (thread) {
      maybeGenerateThreadTitle(thread.id);
    }

  } catch (err) {
    removeTypingIndicator(typingBubble);
    chatWindow.innerHTML += `
      <div style="color:red;">AI assistant failed to respond.</div>
    `;
    console.error(err);
  }
}

function getRecentChatMessages(limit = 12) {
  const thread = getActiveThread();
  if (!thread || !Array.isArray(thread.messages)) return [];
  return thread.messages.slice(-limit).map((msg) => ({
    role: msg.role,
    text: msg.text,
    ts: msg.ts
  }));
}

function getActiveConversationExport(thread) {
  if (!thread) return null;
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  const lines = [];
  const title = thread.title || "Conversation";
  lines.push(title);
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push("");

  messages.forEach((msg) => {
    const when = msg.ts ? new Date(msg.ts).toLocaleString() : "";
    const role = msg.role === "assistant" ? "Assistant" : "Patient";
    const header = when ? `${role} (${when}):` : `${role}:`;
    lines.push(header);
    lines.push(msg.text || "");
    lines.push("");
  });

  return {
    title,
    text: lines.join("\n").trim(),
    messages
  };
}

const TRIAGE_SECTION_TITLES = [
  "Chief Complaint",
  "Symptoms",
  "AI Differential Diagnosis",
  "Suggested Treatments",
  "Recommended Follow-up",
  "Doctor Notes"
];

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

function updateTriageReportUI(report) {
  const setValue = (id, value, placeholder) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value || placeholder || "";
  };

  const statusEl = document.getElementById("aiTriageStatus");
  const updatedEl = document.getElementById("aiTriageUpdated");

  if (!report || !report.bundle) {
    setValue("aiTriageChiefComplaint", "", "");
    setValue("aiTriageSymptoms", "", "");
    setValue("aiTriageDifferential", "", "");
    setValue("aiTriageTreatments", "", "");
    setValue("aiTriageFollowUp", "", "");
    setValue("aiTriageDoctorNotes", "", "");
    if (statusEl) statusEl.textContent = "Not generated";
    if (updatedEl) updatedEl.textContent = "";
    return;
  }

  setValue("aiTriageChiefComplaint", getSectionText(report.bundle, "Chief Complaint"), "");
  setValue("aiTriageSymptoms", getSectionText(report.bundle, "Symptoms"), "");
  setValue("aiTriageDifferential", getSectionText(report.bundle, "AI Differential Diagnosis"), "");
  setValue("aiTriageTreatments", getSectionText(report.bundle, "Suggested Treatments"), "");
  setValue("aiTriageFollowUp", getSectionText(report.bundle, "Recommended Follow-up"), "");
  setValue("aiTriageDoctorNotes", getSectionText(report.bundle, "Doctor Notes"), "");

  const status = report.status || getCompositionFromBundle(report.bundle)?.status || "preliminary";
  if (statusEl) statusEl.textContent = status;

  const updatedAt = report.updatedAt || report.sharedAt || report.createdAt;
  if (updatedEl) {
    updatedEl.textContent = updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : "";
  }
}

function getTriageReportFromCache(threadId) {
  if (!threadId || !Array.isArray(cachedTriageReports)) return null;
  return cachedTriageReports.find((r) => r && r.id === threadId) || null;
}

function setTriageReportInCache(report) {
  if (!report || !report.id) return;
  if (!Array.isArray(cachedTriageReports)) cachedTriageReports = [];
  cachedTriageReports = cachedTriageReports.filter((r) => r && r.id !== report.id);
  cachedTriageReports.unshift(report);
}

function refreshTriageReportForActiveThread() {
  const thread = getActiveThread();
  const threadId = thread ? thread.id : null;
  const draft = threadId ? draftTriageReports[threadId] : null;
  const saved = getTriageReportFromCache(threadId);
  const report = draft || saved || null;
  lastGeneratedTriageReport = report;
  updateTriageReportUI(report);
}

async function loadStoredTriageReport() {
  try {
    const accounts = await ethereum.request({ method: "eth_accounts" });
    const patientAddress = accounts && accounts[0] ? accounts[0].toLowerCase() : null;
    if (!patientAddress) return;

    const patientAESKey = await getSessionAESKey();
    const recordHash = await medicalDataRegistry.methods.getHash(patientAddress).call();
    if (!recordHash) return;
    if (cachedTriageReportsHash && cachedTriageReportsHash === recordHash) {
      refreshTriageReportForActiveThread();
      return;
    }

    const resp = await fetch(`http://localhost:8080/ipfs/${recordHash}`);
    const encryptedPayload = await resp.json();
    const decrypted = await window.decryptAES(encryptedPayload, patientAESKey);
    const record = JSON.parse(decrypted);

    let reports = [];
    if (Array.isArray(record?.aiTriageReports)) {
      reports = record.aiTriageReports;
    } else if (record?.aiTriageReport) {
      reports = [record.aiTriageReport];
    }

    cachedTriageReports = reports.filter((r) => r && r.bundle);
    cachedTriageReportsHash = recordHash;
    refreshTriageReportForActiveThread();
  } catch (err) {
    console.warn("Failed to load triage report:", err.message);
  }
}

async function exportActiveConversationToPDF() {
  const thread = getActiveThread();
  const exportData = getActiveConversationExport(thread);
  if (!exportData || !exportData.text) {
    alert("No conversation to export yet.");
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("PDF export is not available.");
    return;
  }

  const doc = new jsPDF();
  const margin = 12;
  const maxWidth = 180;
  const filenameSafe = (exportData.title || "conversation")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .slice(0, 40);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(exportData.title, margin, 16);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const bodyLines = doc.splitTextToSize(exportData.text, maxWidth);
  doc.text(bodyLines, margin, 26);

  doc.save(`Conversation_${filenameSafe}.pdf`);
}

async function generateTriageReport() {
  const generateBtn = document.getElementById("aiGenerateReportBtn");
  const shareBtn = document.getElementById("aiShareReportBtn");
  const statusEl = document.getElementById("aiTriageStatus");
  const updatedEl = document.getElementById("aiTriageUpdated");
  if (generateBtn) generateBtn.disabled = true;
  if (shareBtn) shareBtn.disabled = true;
  if (statusEl) statusEl.textContent = "Generating...";
  if (updatedEl) updatedEl.textContent = "";
  updateTriageReportUI({
    status: "Generating...",
    bundle: {
      resourceType: "Bundle",
      entry: [
        {
          resource: {
            resourceType: "Composition",
            status: "preliminary",
            section: [
              { title: "Chief Complaint", text: "Generating..." },
              { title: "Symptoms", text: "Generating..." },
              { title: "AI Differential Diagnosis", text: "Generating..." },
              { title: "Suggested Treatments", text: "Generating..." },
              { title: "Recommended Follow-up", text: "Generating..." },
              { title: "Doctor Notes", text: "Generating..." }
            ]
          }
        }
      ]
    }
  });

  try {
    const patientContext = await buildPatientLLMContext();
    const messages = getRecentChatMessages(8);
    const thread = getActiveThread();
    if (!thread || !messages.length) {
      alert("No conversation to summarize yet.");
      return;
    }

    const response = await fetch("http://localhost:3000/api/triage-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: patientContext.age,
        gender: patientContext.gender,
        allergies: patientContext.allergies,
        allergyDetails: patientContext.allergyDetails,
        pastDiagnoses: patientContext.pastDiagnoses,
        diagnosisDetails: patientContext.diagnosisDetails,
        treatments: patientContext.treatments,
        treatmentDetails: patientContext.treatmentDetails,
        messages
      })
    });

    if (!response.ok) {
      throw new Error("Report generation failed");
    }

    const bundle = await response.json();
    const composition = ensureComposition(bundle);
    if (composition) {
      composition.status = "preliminary";
    }

    lastGeneratedTriageReport = {
      id: thread.id,
      title: thread.title || "AI Triage Report",
      createdAt: new Date().toISOString(),
      status: composition?.status || "preliminary",
      bundle
    };

    draftTriageReports[thread.id] = lastGeneratedTriageReport;
    updateTriageReportUI(lastGeneratedTriageReport);
  } catch (err) {
    console.error("Failed to generate triage report:", err);
    alert("Failed to generate triage report. Please try again.");
    refreshTriageReportForActiveThread();
  } finally {
    if (generateBtn) generateBtn.disabled = false;
    if (shareBtn) shareBtn.disabled = false;
  }
}

async function shareTriageReport() {
  const warning = document.getElementById("aiShareWarning");
  if (warning) warning.style.display = "none";

  const thread = getActiveThread();
  if (!thread) {
    alert("No conversation selected.");
    return;
  }

  const reportToShare = draftTriageReports[thread.id]
    || getTriageReportFromCache(thread.id)
    || null;

  if (!reportToShare || !reportToShare.bundle) {
    alert("Generate the AI triage report first.");
    return;
  }

  let accounts;
  try {
    accounts = await ethereum.request({ method: "eth_requestAccounts" });
  } catch (err) {
    alert("Unable to access your wallet.");
    return;
  }

  const patientAddress = accounts[0]?.toLowerCase();
  if (!patientAddress) {
    alert("Unable to identify patient address.");
    return;
  }

  let doctorAccessList = [];
  try {
    doctorAccessList = await accessControl.methods
      .getAccessedDoctorListForPatient(patientAddress)
      .call({ gas: 1000000 });
  } catch (err) {
    console.error("Failed to load doctor access list:", err);
  }

  if (!doctorAccessList || doctorAccessList.length === 0) {
    if (warning) warning.style.display = "block";
    alert("No doctors currently have access to your records.");
    return;
  }

  try {
    const patientAESKey = await getSessionAESKey();
    const recordHash = await medicalDataRegistry.methods.getHash(patientAddress).call();
    if (!recordHash) {
      alert("No medical record found to attach this report.");
      return;
    }

    const files = await ipfs.files.get(recordHash);
    const file = files.find((f) => f.content);
    if (!file) {
      alert("Failed to load your medical record.");
      return;
    }

    const encryptedJson = new TextDecoder().decode(file.content);
    const encryptedPayload = JSON.parse(encryptedJson);
    const decrypted = await window.decryptAES(encryptedPayload, patientAESKey);
    const record = JSON.parse(decrypted);

    const reportToStore = {
      id: reportToShare.id,
      title: reportToShare.title,
      createdAt: reportToShare.createdAt,
      sharedAt: new Date().toISOString(),
      status: "preliminary",
      bundle: reportToShare.bundle
    };

    if (!Array.isArray(record.aiTriageReports)) record.aiTriageReports = [];
    record.aiTriageReports = record.aiTriageReports.filter((r) => r && r.id !== reportToStore.id);
    record.aiTriageReports.unshift(reportToStore);
    record.aiTriageReport = reportToStore;

    const updatedEncrypted = await window.encryptAES(JSON.stringify(record), patientAESKey);
    const buffer = ipfs.Buffer.from(JSON.stringify(updatedEncrypted));
    const result = await ipfs.files.add(buffer);
    const newHash = result[0].hash;

    await medicalDataRegistry.methods.setHash(patientAddress, newHash).send({ from: patientAddress });
    decryptedRecordCache = null;

    cachedTriageReportsHash = newHash;
    setTriageReportInCache(reportToStore);
    lastGeneratedTriageReport = reportToStore;
    delete draftTriageReports[thread.id];
    updateTriageReportUI(reportToStore);
    alert("AI triage report shared with your doctors.");
  } catch (err) {
    console.error("Share triage report failed:", err);
    alert("Failed to share report. Please try again.");
  }
}

function exportTriageReportToPDF() {
  const thread = getActiveThread();
  if (!thread) {
    alert("No conversation selected.");
    return;
  }

  const report = draftTriageReports[thread.id]
    || getTriageReportFromCache(thread.id)
    || null;

  if (!report || !report.bundle) {
    alert("No report available for this conversation.");
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("PDF export is not available.");
    return;
  }

  const doc = new jsPDF();
  const margin = 12;
  const maxWidth = 180;
  const title = report.title || "AI Triage Report";

  const lines = [
    title,
    `Status: ${report.status || "preliminary"}`,
    report.updatedAt ? `Updated: ${report.updatedAt}` : (report.sharedAt ? `Shared: ${report.sharedAt}` : ""),
    "",
    `Chief Complaint: ${getSectionText(report.bundle, "Chief Complaint") || "Not provided"}`,
    `Symptoms: ${getSectionText(report.bundle, "Symptoms") || "Not provided"}`,
    `AI Differential Diagnosis: ${getSectionText(report.bundle, "AI Differential Diagnosis") || "Not provided"}`,
    `Suggested Treatments: ${getSectionText(report.bundle, "Suggested Treatments") || "Not provided"}`,
    `Recommended Follow-up: ${getSectionText(report.bundle, "Recommended Follow-up") || "Not provided"}`,
    `Doctor Notes: ${getSectionText(report.bundle, "Doctor Notes") || "Not provided"}`
  ].filter(Boolean);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, 16);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const bodyLines = doc.splitTextToSize(lines.slice(1).join("\n"), maxWidth);
  doc.text(bodyLines, margin, 26);

  const filenameSafe = title.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40);
  doc.save(`AI_Triage_Report_${filenameSafe}.pdf`);
}

async function shareActiveConversation() {
  const warning = document.getElementById("aiShareWarning");
  if (warning) warning.style.display = "none";

  const thread = getActiveThread();
  const exportData = getActiveConversationExport(thread);
  if (!exportData || !exportData.messages.length) {
    alert("No conversation to share yet.");
    return;
  }

  let accounts;
  try {
    accounts = await ethereum.request({ method: "eth_requestAccounts" });
  } catch (err) {
    alert("Unable to access your wallet.");
    return;
  }

  const patientAddress = accounts[0]?.toLowerCase();
  if (!patientAddress) {
    alert("Unable to identify patient address.");
    return;
  }

  let doctorAccessList = [];
  try {
    doctorAccessList = await accessControl.methods
      .getAccessedDoctorListForPatient(patientAddress)
      .call({ gas: 1000000 });
  } catch (err) {
    console.error("Failed to load doctor access list:", err);
  }

  if (!doctorAccessList || doctorAccessList.length === 0) {
    if (warning) warning.style.display = "block";
    alert("No doctors currently have access to your records.");
    return;
  }

  try {
    const patientAESKey = await getSessionAESKey();
    const recordHash = await medicalDataRegistry.methods.getHash(patientAddress).call();
    if (!recordHash) {
      alert("No medical record found to attach this conversation.");
      return;
    }

    const files = await ipfs.files.get(recordHash);
    const file = files.find((f) => f.content);
    if (!file) {
      alert("Failed to load your medical record.");
      return;
    }

    const encryptedJson = new TextDecoder().decode(file.content);
    const encryptedPayload = JSON.parse(encryptedJson);
    const decrypted = await window.decryptAES(encryptedPayload, patientAESKey);
    const record = JSON.parse(decrypted);

    if (!Array.isArray(record.sharedConversations)) {
      record.sharedConversations = [];
    }

    const sharedEntry = {
      id: thread.id,
      title: exportData.title,
      sharedAt: new Date().toISOString(),
      messages: exportData.messages.map((m) => ({
        role: m.role,
        text: m.text,
        ts: m.ts
      }))
    };

    record.sharedConversations = record.sharedConversations.filter((c) => c.id !== thread.id);
    record.sharedConversations.unshift(sharedEntry);
    record.sharedConversations = record.sharedConversations.slice(0, 10);

    const updatedEncrypted = await window.encryptAES(JSON.stringify(record), patientAESKey);
    const buffer = ipfs.Buffer.from(JSON.stringify(updatedEncrypted));
    const result = await ipfs.files.add(buffer);
    const newHash = result[0].hash;

    await medicalDataRegistry.methods.setHash(patientAddress, newHash).send({ from: patientAddress });
    decryptedRecordCache = null;

    alert("Conversation shared with your doctors.");
  } catch (err) {
    console.error("Share conversation failed:", err);
    alert("Failed to share conversation. Please try again.");
  }
}

async function refreshShareAvailability() {
  const warning = document.getElementById("aiShareWarning");
  const shareBtn = document.getElementById("aiShareReportBtn");
  if (warning) warning.style.display = "none";
  if (shareBtn) shareBtn.disabled = false;

  let accounts;
  try {
    accounts = await ethereum.request({ method: "eth_requestAccounts" });
  } catch (err) {
    return;
  }

  const patientAddress = accounts[0]?.toLowerCase();
  if (!patientAddress) return;

  try {
    const doctorAccessList = await accessControl.methods
      .getAccessedDoctorListForPatient(patientAddress)
      .call({ gas: 1000000 });
    if (!doctorAccessList || doctorAccessList.length === 0) {
      if (warning) warning.style.display = "block";
      if (shareBtn) shareBtn.disabled = true;
    }
  } catch (err) {
    console.warn("Unable to refresh share availability:", err);
  }
}

async function generateVisitSummary() {
  const output = document.getElementById("aiVisitSummaryOutput");
  const generateBtn = document.getElementById("aiGenerateSummaryBtn");
  const copyBtn = document.getElementById("aiCopySummaryBtn");
  if (!output || !generateBtn) return;

  generateBtn.disabled = true;
  if (copyBtn) copyBtn.disabled = true;
  output.value = "Generating summary...";

  try {
    const patientContext = await buildPatientLLMContext();
    const messages = getRecentChatMessages(16);

    const response = await fetch("http://localhost:3000/api/visit-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: patientContext.age,
        gender: patientContext.gender,
        allergies: patientContext.allergies,
        allergyDetails: patientContext.allergyDetails,
        pastDiagnoses: patientContext.pastDiagnoses,
        diagnosisDetails: patientContext.diagnosisDetails,
        treatments: patientContext.treatments,
        treatmentDetails: patientContext.treatmentDetails,
        messages
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let summary = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      summary += decoder.decode(value, { stream: true });
      output.value = summary;
    }

    output.value = summary.trim();
    if (copyBtn) copyBtn.disabled = !output.value;
  } catch (err) {
    console.error(err);
    output.value = "Failed to generate summary. Please try again.";
  } finally {
    generateBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const chatWindow = document.getElementById("chatWindow");
  if (chatWindow) {
    chatWindow.addEventListener("click", async (e) => {
      const btn = e.target.closest(".ai-copy-btn");
      if (!btn) return;
      const bubble = btn.closest(".ai-bubble");
      const span = bubble ? bubble.querySelector(".ai-message-content") : null;
      const text = span ? span.textContent.trim() : "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        const original = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.textContent = original;
        }, 1200);
      } catch (err) {
        console.warn("Clipboard failed:", err.message);
      }
    });
  }

  const generateBtn = document.getElementById("aiGenerateReportBtn");
  if (generateBtn) generateBtn.addEventListener("click", generateTriageReport);

  const exportConversationBtn = document.getElementById("aiExportConversationBtn");
  if (exportConversationBtn) {
    exportConversationBtn.addEventListener("click", exportActiveConversationToPDF);
  }

  const exportReportBtn = document.getElementById("aiExportReportBtn");
  if (exportReportBtn) {
    exportReportBtn.addEventListener("click", exportTriageReportToPDF);
  }

  const shareBtn = document.getElementById("aiShareReportBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", shareTriageReport);
  }
});

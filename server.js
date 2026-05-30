const { validateFHIRBundle } = require("./services/fhirValidationService");

// import express for creating the server and API
const express = require("express");
// imports axios for making http requests
const axios = require("axios");
// imports cors for handling requests from other domains
const cors = require("cors");
// imports webcrypto for crypthographic functions
const { webcrypto } = require("crypto");
// imports Textencoder for converting text to bytes
const { TextEncoder, TextDecoder } = require("util");
// imports web3 for interacting with blockchain
const { Web3 } = require("web3");
// imports FormData for sending files
const FormData = require("form-data");

const medicalDataRegistryArtifact = require("./build/contracts/MedicalDataRegistry.json");
const { parseFHIRBundle } = require("./services/fhirImportService");
const { generateFHIRBundle } = require("./services/fhirExportService");
const { mapToSNOMED } = require("./services/semanticMappingService");

// creates express app
const app = express();

app.use(cors());
app.use(express.json());

// local AI model endpoint
const OLLAMA_URL = "http://localhost:11434/api/generate";
// max tokens that can be generated for each type of prompt
const NUM_PREDICT_DIAGNOSE = Number(process.env.OLLAMA_NUM_PREDICT_DIAGNOSE || 600);
const NUM_PREDICT_SUMMARY = Number(process.env.OLLAMA_NUM_PREDICT_SUMMARY || 300);
const NUM_PREDICT_TRIAGE = Number(process.env.OLLAMA_NUM_PREDICT_TRIAGE || 400);
const NUM_PREDICT_TITLE = Number(process.env.OLLAMA_NUM_PREDICT_TITLE || 24);
// IPFS configuration
const IPFS_HOST = process.env.IPFS_HOST || "127.0.0.1";
const IPFS_PORT = Number(process.env.IPFS_PORT || 5001);
const IPFS_PROTOCOL = process.env.IPFS_PROTOCOL || "http";
const IPFS_GATEWAY_URL = "http://127.0.0.1:8080/ipfs";
const WEB3_HTTP_URL = process.env.WEB3_HTTP_URL || "http://127.0.0.1:8546";

// crypto engine
const subtle = webcrypto.subtle;
// text -> bytes
const encoder = new TextEncoder();
// bytes -> text
const decoder = new TextDecoder();
// connects to ethereum blockchain
const web3 = new Web3(WEB3_HTTP_URL);

// converts binary to base64 string
function b64encode(buf) {
  return Buffer.from(new Uint8Array(buf)).toString("base64");
}

// converts base64 string to binary
function b64decode(str) {
  return Uint8Array.from(Buffer.from(str, "base64"));
}

// normalize eth address format
function ensureLowercaseAddress(address) {
  return String(address || "").trim().toLowerCase();
}

// check if string is a valid ISO
function isIsoDateString(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.trim());
}

// format date for humans
function formatReadableDateTime(value) {
  if (!isIsoDateString(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

// format prompt for humans
function humanizePromptData(value) {
  if (Array.isArray(value)) {
    return value.map((item) => humanizePromptData(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, humanizePromptData(entryValue)])
    );
  }

  if (isIsoDateString(value)) {
    return formatReadableDateTime(value);
  }

  return value;
}

// format conversation title
function sanitizeConversationTitle(rawTitle, fallback = "Conversation") {
  const cleaned = String(rawTitle || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(title|conversation title)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return cleaned || fallback;
}

// blockchain contract loader
async function getMedicalDataRegistryContract() {
  const networkId = String(await web3.eth.net.getId()); // get blockchain network id
  // find deployed contract address
  const deployedNetwork =
    medicalDataRegistryArtifact.networks[networkId] ||
    medicalDataRegistryArtifact.networks[Object.keys(medicalDataRegistryArtifact.networks)[0]];

  if (!deployedNetwork || !deployedNetwork.address) {
    throw new Error("MedicalDataRegistry contract is not deployed for the configured network.");
  }

  // return contract instance for interaction
  return new web3.eth.Contract(
    medicalDataRegistryArtifact.abi,
    deployedNetwork.address
  );
}

// create a random 256-bit encryption key
async function generateAESKey() {
  return subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// encrypts plaintext using AES-GCM with the provided key, returns base64-encoded ciphertext and IV
async function encryptAES(plaintext, aesKey) {
  // generate a random 96-bit IV for AES-GCM
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  // encode plaintext to bytes
  const encoded = encoder.encode(plaintext);

  // encrypt the plaintext using AES-GCM with the generated IV and provided key
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  // return the IV and ciphertext as base64 strings for storage/transmission
  return {
    iv: b64encode(iv),
    data: b64encode(ciphertext),
  };
}

// decrypts the base64-encoded ciphertext using AES-GCM with the provided key and IV, returns the plaintext string
async function decryptAES(payload, aesKey) {
  // decode the IV and ciphertext from base64
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(payload.iv) },
    aesKey,
    b64decode(payload.data)
  );

  // decode the decrypted bytes back to a string and return
  return decoder.decode(plaintext);
}

// derive a user authentication key (UAK) from the user's password and Ethereum address using PBKDF2 with 100,000 iterations and SHA-256 hash, returning a CryptoKey for AES-GCM encryption/decryption
async function deriveUAK(password, ethAddress) {
  // import the password as key material for PBKDF2
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
// derive a key using PBKDF2 with the Ethereum address as salt, 100,000 iterations, and SHA-256 hash, resulting in a CryptoKey suitable for AES-GCM encryption/decryption
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(ensureLowercaseAddress(ethAddress)),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// derive a recovery key authentication key (Recovery UAK) from the recovery key and Ethereum address using PBKDF2 with 100,000 iterations and SHA-256 hash, returning a CryptoKey for AES-GCM encryption/decryption
async function deriveRecoveryUAK(recoveryKey, ethAddress) {
  // import the recovery key as key material for PBKDF2
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(recoveryKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // derive a key using PBKDF2 with the Ethereum address as salt, 100,000 iterations, and SHA-256 hash, resulting in a CryptoKey suitable for AES-GCM encryption/decryption
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(`recovery-${ensureLowercaseAddress(ethAddress)}`),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// wraps the RMK by encrypting it with the UAK and returning a JSON string containing the base64-encoded IV and ciphertext
async function wrapRMK(rmk, uak) {
  // export the RMK as raw bytes
  const rawRMK = new Uint8Array(await subtle.exportKey("raw", rmk));
  // generate random IV 
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  // encrypt the raw RMK with the generated IV and UAK
  const wrapped = await subtle.encrypt(
    { name: "AES-GCM", iv },
    uak,
    rawRMK
  );

  // return the IV and wrapped RMK as a JSON string with base64-encoded values
  return JSON.stringify({
    iv: b64encode(iv),
    data: b64encode(wrapped),
  });
}

// unwrap the RMK 
async function unwrapRMK(payload, uak) {
  // parse the payload to extract the IV and wrapped RMK
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  // decrypt the wrapped RMK
  const rawRMK = await subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(parsed.iv) },
    uak,
    b64decode(parsed.data)
  );

  // return the decrypted RMK as a CryptoKey that can be used for AES-GCM encryption/decryption
  return subtle.importKey(
    "raw",
    rawRMK,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
}

// generate recovery key 
function generateRecoveryKey() {
  const bytes = webcrypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes);
}

// upload encrypted payload to IPFS
async function uploadEncryptedPayloadToIPFS(payload) {
  // convert the payload to JSON and create a FormData object to send it as a file
  const form = new FormData();
  form.append("file", Buffer.from(JSON.stringify(payload), "utf8"), {
    filename: "medical-record.json",
    contentType: "application/json",
  });

  // send to IPFS API 
  const response = await axios.post(
    `${IPFS_PROTOCOL}://${IPFS_HOST}:${IPFS_PORT}/api/v0/add?pin=true`,
    form,
    {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000,
    }
  );

  const data = response.data;
  if (typeof data === "string") {
    const lastLine = data.trim().split("\n").filter(Boolean).pop();
    const parsed = JSON.parse(lastLine);
    return parsed.Hash;
  }

  // return the hash to store it on blockchain
  return data.Hash || data.Cid?.["/"];
}

// downloads encrypted file from IPFS
async function readEncryptedPayloadFromIPFS(ipfsHash) {
  // construct the URL for the IPFS gateway
  const url = `${IPFS_GATEWAY_URL}/${ipfsHash}`;
  console.log("Fetching from IPFS:", url);

  // fetch the encrypted payload from IPFS with a timeout
  const response = await axios.get(url, { timeout: 30000 });

  // return the parsed JSON response which should contain the encrypted data
  return typeof response.data === "string"
    ? JSON.parse(response.data)
    : response.data;
}

// get the hash of the patient's record
async function getPatientRecordHash(patientAddress) {
  const contract = await getMedicalDataRegistryContract();
  return contract.methods.getHash(patientAddress).call({ from: patientAddress });
}

// gets the encrypted RMK for a patient
async function getWrappedRMKForPatient(patientAddress) {
  const contract = await getMedicalDataRegistryContract();
  return contract.methods.getEncryptedAESKey(patientAddress).call({ from: patientAddress });
}

// writes IPFS hash to blockchain
async function tryStoreHashOnChain(patientAddress, ipfsHash) {
  try {
    const contract = await getMedicalDataRegistryContract();
    await contract.methods.setHash(patientAddress, ipfsHash).send({
      from: patientAddress,
      gas: 500000,
    });
    return true;
  } catch (error) {
    console.warn("FHIR hash persistence skipped:", error.message);
    return false;
  }
}

// AI symptom checker endpoint
app.post("/api/diagnose", async (req, res) => {

  try {

    // gets patient data from request
    const {
      age,
      gender,
      allergies,
      allergyDetails,
      pastDiagnoses,
      diagnosisDetails,
      treatments,
      treatmentDetails,
      symptoms,
      prompt: clientPrompt
    } = req.body;

    // format symptoms
    const symptomText = Array.isArray(symptoms)
      ? symptoms.join(", ")
      : symptoms;

      // build AI prompt
    const promptDiagnosisDetails = humanizePromptData(diagnosisDetails);
    const promptTreatmentDetails = humanizePromptData(treatmentDetails);
    const prompt = clientPrompt || `
You are an AI medical triage assistant.

Speak directly to the user using "you".
Never say "the patient".
Do not invent or assume diagnoses, medications, or allergies not provided in the context.

Patient context:
Age: ${age || "unknown"}
Gender: ${gender || "unknown"}
Allergies: ${(allergies || []).join(", ") || "none"}
Past diagnoses: ${(pastDiagnoses || []).join(", ") || "none"}
Treatments: ${(treatments || []).join(", ") || "none"}
Allergy details (compact): ${allergyDetails && allergyDetails.length ? JSON.stringify(allergyDetails) : "none"}
Diagnosis details (compact; includes 'details' for Other): ${promptDiagnosisDetails && promptDiagnosisDetails.length ? JSON.stringify(promptDiagnosisDetails) : "none"}
Treatment details (compact): ${promptTreatmentDetails && promptTreatmentDetails.length ? JSON.stringify(promptTreatmentDetails) : "none"}

Current symptoms:
${symptomText}

Respond in natural, conversational plain text.
Include likely causes, follow-up questions, and safety advice, but do NOT use headings, bullet points, or numbered lists.
Provide fuller explanations for the likely causes, but keep each cause to 1–2 sentences max.
Include at most 3 likely causes.
Include follow-up questions and safety advice within the same 6–8 sentences total.
Keep the response between 6 and 8 sentences total.
Avoid repetition.
Do not restate the user's symptoms verbatim in the first sentence; start with a likely-cause oriented sentence.
Do not repeat the same point or sentence.
Ask exactly 2 follow-up questions.
Each question must be its own sentence and must end with a "?".
Do not preface the questions with any lead-in like "Here are questions" or similar.
Do not include a "Follow-up Questions" header or any header-like label.
Do not number, bullet, or label the questions in any way.
Place the two questions as the final two sentences of the response.

Personalized diagnosis requirement:
Consider the user's past diagnoses, treatments, and allergies when forming the differential.
If their history changes your reasoning, explicitly say so in the response (e.g., "Because you previously had asthma, respiratory causes should also be considered.").

Medication / allergy safety requirement:
If you suggest treatments or medications, check them against the user's allergies and current treatments.
If a conflict exists, include a clear warning sentence starting with "Safety Alert:" and state what to avoid.
If there is no conflict, do not add a safety alert.
Include at most one Safety Alert sentence and never repeat it.

Risk level requirement:
Classify the situation as LOW, MODERATE, or HIGH urgency and include one short explanation.
Include a sentence in this exact format: "Risk level: <LOW|MODERATE|HIGH> - <short explanation>."
`;

// send the prompt to the local Ollama model for processing
    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: "qwen2.5:1.5b-instruct",
        prompt: prompt,
        stream: true, // enable streaming for real-time response
        keep_alive: "10m", // keep the model session alive for 10 minutes to allow for follow-up prompts without reloading the model
        options: {
          temperature: 0.2, // low temperature for more focused and deterministic responses, which is important for medical advice
          num_predict: NUM_PREDICT_DIAGNOSE // limit the response length to control costs and ensure concise answers, adjust as needed based on typical response lengths observed
        }
      },
      { timeout: 180000, responseType: "stream" }
    );

    // set headers for streaming response
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let buffer = "";

    // receives model response piece by piece and sends it immediately to the UI
    ollamaResponse.data.on("data", chunk => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      // process each complete line of response as a JSON payload
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const payload = JSON.parse(trimmed);
          if (payload.response) {
            res.write(payload.response);
          }
          if (payload.done) {
            res.end();
          }
        } catch (err) {
          console.error("Stream JSON parse failed:", trimmed);
        }
      }
    });

    // handle end of stream, ensuring any remaining buffer is processed and response is properly ended
    ollamaResponse.data.on("end", () => {
      if (buffer.trim()) {
        try {
          const payload = JSON.parse(buffer.trim());
          if (payload.response) res.write(payload.response);
          if (payload.done && !res.writableEnded) res.end();
        } catch (err) {
          console.error("Final stream JSON parse failed:", buffer.trim());
        }
      }
      if (!res.writableEnded) res.end();
    });

    ollamaResponse.data.on("error", err => {
      console.error("Ollama stream error:", err.message);
      if (!res.writableEnded) res.end();
    });

  } catch (error) {

    const status = error.response && error.response.status;
    const data = error.response && error.response.data;
    console.error("Server error:", error.message, status || "", data || "");

    if (res.headersSent) {
      if (!res.writableEnded) res.end();
    } else {
      res.status(500).json({
        error: "AI assistant failed to respond."
      });
    }

  }

});

// Endpoint to generate a title for a medical conversation
app.post("/api/conversation-title", async (req, res) => {
  try {
    // takes chat messages from request body
    const { messages } = req.body || {};

    // formats the most recent messages into a single string to provide context
    const conversation = Array.isArray(messages)
      ? messages
          .slice(0, 6)
          .map((m) => `${m.role || "user"}: ${m.text || ""}`.trim())
          .filter(Boolean)
          .join("\n")
      : "";

    if (!conversation) {
      return res.json({ title: "Conversation" });
    }

    // prompt to genrate a concise title
    const prompt = `
Create a short title for this medical support conversation.
Requirements:
- 2 to 6 words
- sentence case
- no quotes
- no trailing punctuation
- summarize the main symptom or request
- sound natural, similar to a ChatGPT conversation title

Conversation:
${conversation}
`;

// send the prompt to model
    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: "qwen2.5:1.5b-instruct",
        prompt,
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.1,
          num_predict: NUM_PREDICT_TITLE
        }
      },
      { timeout: 60000 }
    );

    // extract response and sanitize to create a clean title
    const raw = (ollamaResponse.data && ollamaResponse.data.response)
      ? String(ollamaResponse.data.response).trim()
      : "";

    res.json({
      title: sanitizeConversationTitle(raw)
    });
  } catch (error) {
    const status = error.response && error.response.status;
    const data = error.response && error.response.data;
    console.error("Conversation title error:", error.message, status || "", data || "");
    res.status(500).json({
      error: "Conversation title generation failed."
    });
  }
});

// Endpoint to generate a concise visit summary based on patient data and conversation context
app.post("/api/visit-summary", async (req, res) => {
  try {
    // extracts patient data and conversation messages from request body
    const {
      age,
      gender,
      allergies,
      allergyDetails,
      pastDiagnoses,
      diagnosisDetails,
      treatments,
      treatmentDetails,
      messages
    } = req.body;

    const conversation = Array.isArray(messages)
      ? messages
          .map((m) => `${m.role || "user"}: ${m.text || ""}`)
          .join("\n")
      : "";

      // formats diagnosis and treatment details for inclusion in the prompt
    const promptDiagnosisDetails = humanizePromptData(diagnosisDetails);
    const promptTreatmentDetails = humanizePromptData(treatmentDetails);
    const prompt = `
You are a clinical assistant preparing a concise visit summary for a doctor.
Write 5–7 bullet points, each under 18 words.
Use only the information provided. If something is unknown, write "Not provided".
Keep it professional and concise.

Patient context:
Age: ${age || "unknown"}
Gender: ${gender || "unknown"}
Allergies: ${(allergies || []).join(", ") || "none"}
Past diagnoses: ${(pastDiagnoses || []).join(", ") || "none"}
Treatments: ${(treatments || []).join(", ") || "none"}
Allergy details (compact): ${allergyDetails && allergyDetails.length ? JSON.stringify(allergyDetails) : "none"}
Diagnosis details (compact): ${promptDiagnosisDetails && promptDiagnosisDetails.length ? JSON.stringify(promptDiagnosisDetails) : "none"}
Treatment details (compact): ${promptTreatmentDetails && promptTreatmentDetails.length ? JSON.stringify(promptTreatmentDetails) : "none"}

Conversation (most recent messages):
${conversation || "none"}
`;

// send prompt to model
    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: "qwen2.5:1.5b-instruct",
        prompt: prompt,
        stream: true,
        keep_alive: "10m",
        options: {
          temperature: 0.2,
          num_predict: NUM_PREDICT_SUMMARY
        }
      },
      { timeout: 180000, responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let buffer = "";

// receives model response piece by piece and sends it immediately to the UI
    ollamaResponse.data.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const payload = JSON.parse(trimmed);
          if (payload.response) {
            res.write(payload.response);
          }
          if (payload.done) {
            res.end();
          }
        } catch (err) {
          console.error("Stream JSON parse failed:", trimmed);
        }
      }
    });

    // handle end of stream, ensuring any remaining buffer is processed and response is properly ended
    ollamaResponse.data.on("end", () => {
      if (buffer.trim()) {
        try {
          const payload = JSON.parse(buffer.trim());
          if (payload.response) res.write(payload.response);
          if (payload.done && !res.writableEnded) res.end();
        } catch (err) {
          console.error("Final stream JSON parse failed:", buffer.trim());
        }
      }
      if (!res.writableEnded) res.end();
    });

    ollamaResponse.data.on("error", (err) => {
      console.error("Ollama stream error:", err.message);
      if (!res.writableEnded) res.end();
    });
  } catch (error) {
    const status = error.response && error.response.status;
    const data = error.response && error.response.data;
    console.error("Server error:", error.message, status || "", data || "");

    if (res.headersSent) {
      if (!res.writableEnded) res.end();
    } else {
      res.status(500).json({
        error: "Visit summary failed to generate."
      });
    }
  }
});

// Endpoint to generate a concise AI triage report based on patient data and conversation context
app.post("/api/triage-report", async (req, res) => {
  try {
    // extracts patient data and conversation messages from request body
    const {
      age,
      gender,
      allergies,
      allergyDetails,
      pastDiagnoses,
      diagnosisDetails,
      treatments,
      treatmentDetails,
      messages
    } = req.body;

    const conversation = Array.isArray(messages)
      ? messages
          .map((m) => `${m.role || "user"}: ${m.text || ""}`)
          .join("\n")
      : "";
    const conversationTrimmed = conversation.length > 2000
      ? conversation.slice(-2000)
      : conversation;

    const now = new Date().toISOString();

    const promptDiagnosisDetails = humanizePromptData(diagnosisDetails);
    const promptTreatmentDetails = humanizePromptData(treatmentDetails);

    // builds prompt for a structured report with specific sections and strict formatting rules to ensure the output can be easily parsed and integrated into clinical workflows 
    const prompt = `
You are a clinical assistant producing a concise AI triage report.
Return plain text ONLY, exactly six lines, no extra lines.
Each line must follow this format: "<Section Title>: <content>"
Use these section titles exactly and in this exact order:
Chief Complaint
Symptoms
AI Differential Diagnosis
Suggested Treatments
Recommended Follow-up
Doctor Notes

Rules:
- Keep each line under 30 words.
- Use semicolons to separate multiple items.
- Use "Not provided" if missing.
- Do not include JSON, bullets, numbering, or extra commentary.

Patient context:
Age: ${age || "unknown"}
Gender: ${gender || "unknown"}
Allergies: ${(allergies || []).join(", ") || "none"}
Past diagnoses: ${(pastDiagnoses || []).join(", ") || "none"}
Treatments: ${(treatments || []).join(", ") || "none"}
Allergy details (compact): ${allergyDetails && allergyDetails.length ? JSON.stringify(allergyDetails) : "none"}
Diagnosis details (compact): ${promptDiagnosisDetails && promptDiagnosisDetails.length ? JSON.stringify(promptDiagnosisDetails) : "none"}
Treatment details (compact): ${promptTreatmentDetails && promptTreatmentDetails.length ? JSON.stringify(promptTreatmentDetails) : "none"}

Conversation (most recent messages, may be truncated):
${conversationTrimmed || "none"}
`;

// send response to model
    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: "qwen2.5:1.5b-instruct",
        prompt,
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.1,
          num_predict: NUM_PREDICT_TRIAGE
        }
      },
      { timeout: 180000 }
    );

    // extract the raw response text to parse into structured data
    const raw = (ollamaResponse.data && ollamaResponse.data.response)
      ? String(ollamaResponse.data.response).trim()
      : "";

      // extract each section's content 
    const extractLineValue = (text, title) => {
      const re = new RegExp(`^${title}:\\s*(.*)$`, "mi");
      const match = text.match(re);
      return match && match[1] ? match[1].trim() : "Not provided";
    };

    const splitItems = (value) => {
      if (!value || value.toLowerCase() === "not provided") return [];
      return value
        .split(/;|•|\n/gi)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 2);
    };

    // parse the response into structured sections and create FHIR resources for symptoms, diagnosis and treatment to be included in the final FHIR bundle 
    const sectionValues = {
      chiefComplaint: extractLineValue(raw, "Chief Complaint"),
      symptoms: extractLineValue(raw, "Symptoms"),
      differential: extractLineValue(raw, "AI Differential Diagnosis"),
      treatments: extractLineValue(raw, "Suggested Treatments"),
      followUp: extractLineValue(raw, "Recommended Follow-up"),
      doctorNotes: extractLineValue(raw, "Doctor Notes")
    };

    const observations = splitItems(sectionValues.symptoms).map((item) => ({
      resourceType: "Observation",
      status: "preliminary",
      code: { text: item },
      valueString: item
    }));

    const conditions = splitItems(sectionValues.differential).map((item) => ({
      resourceType: "Condition",
      clinicalStatus: { coding: [{ code: "provisional" }] },
      verificationStatus: { coding: [{ code: "unconfirmed" }] },
      code: { text: item }
    }));

    const meds = splitItems(sectionValues.treatments).map((item) => ({
      resourceType: "MedicationRequest",
      status: "draft",
      intent: "proposal",
      medicationCodeableConcept: { text: item }
    }));

    const bundle = {
      resourceType: "Bundle",
      type: "document",
      entry: [
        {
          resource: {
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
            date: now,
            author: [{ reference: "Device/AI-Triage-System" }],
            section: [
              { title: "Chief Complaint", text: sectionValues.chiefComplaint || "Not provided" },
              { title: "Symptoms", text: sectionValues.symptoms || "Not provided" },
              { title: "AI Differential Diagnosis", text: sectionValues.differential || "Not provided" },
              { title: "Suggested Treatments", text: sectionValues.treatments || "Not provided" },
              { title: "Recommended Follow-up", text: sectionValues.followUp || "Not provided" },
              { title: "Doctor Notes", text: sectionValues.doctorNotes || "Not provided" }
            ]
          }
        },
        ...observations.map((resource) => ({ resource })),
        ...conditions.map((resource) => ({ resource })),
        ...meds.map((resource) => ({ resource }))
      ]
    };

    res.json(bundle);
  } catch (error) {
    const status = error.response && error.response.status;
    const data = error.response && error.response.data;
    console.error("Triage report error:", error.message, status || "", data || "");
    res.status(500).json({
      error: "AI triage report failed to generate."
    });
  }
});

// Endpoint to search for SNOMED CT codes based on a free-text term, returning a list of matching codes and descriptions to assist with clinical documentation and coding
app.get("/api/snomed/search", async (req, res) => {
  try {
    // extracts the search term and optional limit from query parameters
    const term = String(req.query.term || "").trim();
    const limit = Number(req.query.limit || 5);

    if (!term) {
      return res.status(400).json({ error: "Missing term query parameter." });
    }

    // calls the  API function to map the term to a SNOMED code
    const coding = await mapToSNOMED(term, { limit });
    return res.json({ term, coding });
  } catch (error) {
    console.error("SNOMED search failed:", error.message);
    return res.status(500).json({
      error: error.message || "SNOMED search failed.",
    });
  }
});

// Endpoint to import a FHIR bundle, encrypt it, store it on IPFS, and optionally persist the hash on the blockchain, returning the IPFS hash and wrapped keys for secure access
app.post("/api/fhir/import", async (req, res) => {
  try {
    // extract FHIR bundle from request body
    const {
      bundleJson,
      patientAddress,
      password,
      persistOnChain = false,
    } = req.body || {};

    if (!bundleJson) {
      return res.status(400).json({ error: "FHIR import requires a bundleJson payload." });
    }

    // parse the bundle JSON if it's a string 
    const bundleObjRaw = typeof bundleJson === "string" ? JSON.parse(bundleJson) : bundleJson;
    const bundleObj =
      bundleObjRaw.bundle ||
      bundleObjRaw.bundleJson ||
      bundleObjRaw;

//  validate FHIR bundle structure and content before proceeding
const validation = validateFHIRBundle(bundleObj);

if (!validation.valid) {
  return res.status(400).json({
    error: "Invalid FHIR Bundle",
    validation
  });
}

// remove any NaN values from the bundle and ensure the patient address is in lowercase for consistent key derivation, then proceed with encryption and storage
const normalizedRecord = removeNaN(parseFHIRBundle(bundleObj));
    const normalizedPatientAddress = ensureLowercaseAddress(patientAddress);
    // generate a random AES key (RMK) for encrypting the medical record, then encrypt the normalized FHIR bundle with this key
    const rmk = await generateAESKey();
    // upload the encrypted payload to IPFS and get the resulting hash
    const encryptedPayload = await encryptAES(JSON.stringify(normalizedRecord), rmk);
    const ipfsHash = await uploadEncryptedPayloadToIPFS(encryptedPayload);
    console.log("IPFS hash returned from upload:", ipfsHash);

    // derive a UAK from patient password and address
    const uak = await deriveUAK(password, normalizedPatientAddress);
    // wrap the RMK with the UAK for secure storage and access control
    const wrappedRMK = await wrapRMK(rmk, uak);
    // generate recovery key
    const recoveryKey = generateRecoveryKey();
    // derive recovery UAK from recovery key and patient address
    const recoveryUAK = await deriveRecoveryUAK(recoveryKey, normalizedPatientAddress);
    // wrap the RMK with the recovery key 
    const wrappedRMKRecovery = await wrapRMK(rmk, recoveryUAK);
    // store the IPFS hash on chain if requested
    const storedOnChain = persistOnChain
      ? await tryStoreHashOnChain(normalizedPatientAddress, ipfsHash)
      : false;

    return res.json({
      success: true,
      ipfsHash,
      storedOnChain,
      wrappedRMK,
      wrappedRMKRecovery,
      recoveryKey,
      normalizedRecord,
    });
  } catch (error) {
    console.error("FHIR import failed:", error.message);
    return res.status(500).json({
      error: error.message || "FHIR import failed.",
    });
  }
});

// Endpoint to export a patient's medical record as a FHIR bundle by retrieving the encrypted record from IPFS using the hash stored on the blockchain, decrypting it with the provided session key, and returning the FHIR bundle along with validation results and the version of FHIR used for export
app.get("/api/fhir/export/:patientAddress", async (req, res) => {
  try {
    // ensure patient address is in lowercase for consistent key derivation
    const patientAddress = ensureLowercaseAddress(req.params.patientAddress);
    // determine FHIR version requested for export
    const requestedVersion = String(req.query.version || "R4").toUpperCase();
    const exportVersion = requestedVersion === "STU3" ? "STU3" : "R4";
    
    // get the IPFS hash of the patient record from blockchain
    const recordHashRaw = await getPatientRecordHash(patientAddress);
console.log("RAW recordHash from blockchain:", recordHashRaw);

// normalize the hash
const recordHash = normalizeIPFSHash(recordHashRaw);
console.log("Normalized recordHash:", recordHash);
    if (!recordHash) {
      return res.status(404).json({ error: "No medical record found for this patient." });
    }

    // get the session key from request headers, which is required to decrypt the record
    const rawKeyBase64 = req.get("x-session-key");

if (!rawKeyBase64) {
  return res.status(400).json({ error: "Missing session key." });
}

// decode the base64-encoded session key and import it as a CryptoKey for AES-GCM decryption
const rawKey = b64decode(rawKeyBase64);

// import the raw session key as a CryptoKey that can be used for AES-GCM decryption of the medical record
const rmk = await subtle.importKey(
  "raw",
  rawKey,
  "AES-GCM",
  true,
  ["decrypt"]
);
// read the encrypted payload from IPFS using the hash 
    const encryptedPayload = await readEncryptedPayloadFromIPFS(recordHash);
    // decrypt it with the provided session key to obtain the original FHIR record, which is then parsed and converted into a FHIR bundle in the requested version format
    const decryptedRecord = JSON.parse(await decryptAES(encryptedPayload, rmk));
    const bundle = await generateFHIRBundle(decryptedRecord, exportVersion);

// validate bundle
const validation = validateFHIRBundle(bundle);

if (!validation.valid) {
  console.warn("FHIR Export validation issues:", validation.issues);
}


res.setHeader("Content-Type", "application/fhir+json; charset=utf-8");

return res.json({
  bundle,
  validation,
  version: exportVersion,
});
  } catch (error) {
    console.error("FHIR export failed:", error.message);
    return res.status(500).json({
      error: error.message || "FHIR export failed.",
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

// fix broken hash formats that may be stored on chain due to user error or different IPFS client versions, ensuring we can still retrieve the correct record from IPFS even if the hash is not in the expected format
function normalizeIPFSHash(hash) {
  if (!hash) return hash;

  // remove subdomain-style: bafy...ipfs.localhost
  if (hash.includes(".ipfs.")) {
    return hash.split(".ipfs.")[0];
  }

  // remove full URL if stored accidentally
  if (hash.includes("/ipfs/")) {
    return hash.split("/ipfs/")[1];
  }

  return hash;
}

// recursively remove any NaN values from the object, which can cause issues with JSON serialization and FHIR validation, and also ensure that numeric fields that are null or empty strings are set to a default value to maintain data integrity
function removeNaN(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeNaN);
  } else if (obj && typeof obj === "object") {
    const cleaned = {};
    for (const key in obj) {
      let value = obj[key];

      // ❌ Remove NaN
      if (typeof value === "number" && isNaN(value)) continue;

      // ❌ Remove undefined
      if (value === undefined) continue;

      // Fix null numeric fields
      if (key === "frequency" && (value === null || value === "")) {
        value = 1; // default safe value
      }

      cleaned[key] = removeNaN(value);
    }
    return cleaned;
  }
  return obj;
}
 
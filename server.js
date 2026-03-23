const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { webcrypto } = require("crypto");
const { TextEncoder, TextDecoder } = require("util");
const { Web3 } = require("web3");
const FormData = require("form-data");

const medicalDataRegistryArtifact = require("./build/contracts/MedicalDataRegistry.json");
const { parseFHIRBundle } = require("./services/fhirImportService");
const { generateFHIRBundle } = require("./services/fhirExportService");

const app = express();

app.use(cors());
app.use(express.json());

const OLLAMA_URL = "http://localhost:11434/api/generate";
const NUM_PREDICT_DIAGNOSE = Number(process.env.OLLAMA_NUM_PREDICT_DIAGNOSE || 600);
const NUM_PREDICT_SUMMARY = Number(process.env.OLLAMA_NUM_PREDICT_SUMMARY || 300);
const NUM_PREDICT_TRIAGE = Number(process.env.OLLAMA_NUM_PREDICT_TRIAGE || 400);
const IPFS_HOST = process.env.IPFS_HOST || "127.0.0.1";
const IPFS_PORT = Number(process.env.IPFS_PORT || 5001);
const IPFS_PROTOCOL = process.env.IPFS_PROTOCOL || "http";
const IPFS_GATEWAY_URL = "http://127.0.0.1:8080/ipfs";
const WEB3_HTTP_URL = process.env.WEB3_HTTP_URL || "http://127.0.0.1:8546";

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const web3 = new Web3(WEB3_HTTP_URL);

function b64encode(buf) {
  return Buffer.from(new Uint8Array(buf)).toString("base64");
}

function b64decode(str) {
  return Uint8Array.from(Buffer.from(str, "base64"));
}

function ensureLowercaseAddress(address) {
  return String(address || "").trim().toLowerCase();
}

async function getMedicalDataRegistryContract() {
  const networkId = String(await web3.eth.net.getId());
  const deployedNetwork =
    medicalDataRegistryArtifact.networks[networkId] ||
    medicalDataRegistryArtifact.networks[Object.keys(medicalDataRegistryArtifact.networks)[0]];

  if (!deployedNetwork || !deployedNetwork.address) {
    throw new Error("MedicalDataRegistry contract is not deployed for the configured network.");
  }

  return new web3.eth.Contract(
    medicalDataRegistryArtifact.abi,
    deployedNetwork.address
  );
}

async function generateAESKey() {
  return subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function encryptAES(plaintext, aesKey) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(plaintext);

  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  return {
    iv: b64encode(iv),
    data: b64encode(ciphertext),
  };
}

async function decryptAES(payload, aesKey) {
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(payload.iv) },
    aesKey,
    b64decode(payload.data)
  );

  return decoder.decode(plaintext);
}

async function deriveUAK(password, ethAddress) {
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

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

async function deriveRecoveryUAK(recoveryKey, ethAddress) {
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(recoveryKey),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

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

async function wrapRMK(rmk, uak) {
  const rawRMK = new Uint8Array(await subtle.exportKey("raw", rmk));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.encrypt(
    { name: "AES-GCM", iv },
    uak,
    rawRMK
  );

  return JSON.stringify({
    iv: b64encode(iv),
    data: b64encode(wrapped),
  });
}

async function unwrapRMK(payload, uak) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  const rawRMK = await subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(parsed.iv) },
    uak,
    b64decode(parsed.data)
  );

  return subtle.importKey(
    "raw",
    rawRMK,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
}

function generateRecoveryKey() {
  const bytes = webcrypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes);
}

async function uploadEncryptedPayloadToIPFS(payload) {
  const form = new FormData();
  form.append("file", Buffer.from(JSON.stringify(payload), "utf8"), {
    filename: "medical-record.json",
    contentType: "application/json",
  });

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

  return data.Hash || data.Cid?.["/"];
}

async function readEncryptedPayloadFromIPFS(ipfsHash) {
  const url = `${IPFS_GATEWAY_URL}/${ipfsHash}`;
  console.log("Fetching from IPFS:", url);

  const response = await axios.get(url, { timeout: 30000 });

  return typeof response.data === "string"
    ? JSON.parse(response.data)
    : response.data;
}

async function getPatientRecordHash(patientAddress) {
  const contract = await getMedicalDataRegistryContract();
  return contract.methods.getHash(patientAddress).call({ from: patientAddress });
}

async function getWrappedRMKForPatient(patientAddress) {
  const contract = await getMedicalDataRegistryContract();
  return contract.methods.getEncryptedAESKey(patientAddress).call({ from: patientAddress });
}

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

app.post("/api/diagnose", async (req, res) => {

  try {

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

    const symptomText = Array.isArray(symptoms)
      ? symptoms.join(", ")
      : symptoms;

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
Diagnosis details (compact; includes 'details' for Other): ${diagnosisDetails && diagnosisDetails.length ? JSON.stringify(diagnosisDetails) : "none"}
Treatment details (compact): ${treatmentDetails && treatmentDetails.length ? JSON.stringify(treatmentDetails) : "none"}

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

    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: "qwen2.5:1.5b-instruct",
        prompt: prompt,
        stream: true,
        keep_alive: "10m",
        options: {
          temperature: 0.2,
          num_predict: NUM_PREDICT_DIAGNOSE
        }
      },
      { timeout: 180000, responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let buffer = "";

    ollamaResponse.data.on("data", chunk => {
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

app.post("/api/visit-summary", async (req, res) => {
  try {
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
Diagnosis details (compact): ${diagnosisDetails && diagnosisDetails.length ? JSON.stringify(diagnosisDetails) : "none"}
Treatment details (compact): ${treatmentDetails && treatmentDetails.length ? JSON.stringify(treatmentDetails) : "none"}

Conversation (most recent messages):
${conversation || "none"}
`;

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

app.post("/api/triage-report", async (req, res) => {
  try {
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
Diagnosis details (compact): ${diagnosisDetails && diagnosisDetails.length ? JSON.stringify(diagnosisDetails) : "none"}
Treatment details (compact): ${treatmentDetails && treatmentDetails.length ? JSON.stringify(treatmentDetails) : "none"}

Conversation (most recent messages, may be truncated):
${conversationTrimmed || "none"}
`;

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

    const raw = (ollamaResponse.data && ollamaResponse.data.response)
      ? String(ollamaResponse.data.response).trim()
      : "";

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

app.post("/api/fhir/import", async (req, res) => {
  try {
    const {
      bundleJson,
      patientAddress,
      password,
      persistOnChain = false,
    } = req.body || {};

    if (!bundleJson) {
      return res.status(400).json({ error: "FHIR import requires a bundleJson payload." });
    }

    if (!patientAddress || !password) {
      return res.status(400).json({ error: "FHIR import requires patientAddress and password." });
    }

    const normalizedRecord = parseFHIRBundle(bundleJson);
    const normalizedPatientAddress = ensureLowercaseAddress(patientAddress);
    const rmk = await generateAESKey();
    const encryptedPayload = await encryptAES(JSON.stringify(normalizedRecord), rmk);
    const ipfsHash = await uploadEncryptedPayloadToIPFS(encryptedPayload);
    console.log("IPFS hash returned from upload:", ipfsHash);

    const uak = await deriveUAK(password, normalizedPatientAddress);
    const wrappedRMK = await wrapRMK(rmk, uak);
    const recoveryKey = generateRecoveryKey();
    const recoveryUAK = await deriveRecoveryUAK(recoveryKey, normalizedPatientAddress);
    const wrappedRMKRecovery = await wrapRMK(rmk, recoveryUAK);
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

app.get("/api/fhir/export/:patientAddress", async (req, res) => {
  try {
    const patientAddress = ensureLowercaseAddress(req.params.patientAddress);
    const password = req.get("x-record-password") || req.query.password;

    if (!patientAddress || !password) {
      return res.status(400).json({ error: "FHIR export requires patientAddress and password." });
    }

    const recordHashRaw = await getPatientRecordHash(patientAddress);
console.log("RAW recordHash from blockchain:", recordHashRaw);

const recordHash = normalizeIPFSHash(recordHashRaw);
console.log("Normalized recordHash:", recordHash);
    if (!recordHash) {
      return res.status(404).json({ error: "No medical record found for this patient." });
    }

    const wrappedRMK = await getWrappedRMKForPatient(patientAddress);
    const uak = await deriveUAK(password, patientAddress);
    const rmk = await unwrapRMK(wrappedRMK, uak);
    const encryptedPayload = await readEncryptedPayloadFromIPFS(recordHash);
    const decryptedRecord = JSON.parse(await decryptAES(encryptedPayload, rmk));
    const bundle = generateFHIRBundle(decryptedRecord);

    res.setHeader("Content-Type", "application/fhir+json; charset=utf-8");
    return res.json(bundle);
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
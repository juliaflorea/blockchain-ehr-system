const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const OLLAMA_URL = "http://localhost:11434/api/generate";
const NUM_PREDICT_DIAGNOSE = Number(process.env.OLLAMA_NUM_PREDICT_DIAGNOSE || 600);
const NUM_PREDICT_SUMMARY = Number(process.env.OLLAMA_NUM_PREDICT_SUMMARY || 300);
const NUM_PREDICT_TRIAGE = Number(process.env.OLLAMA_NUM_PREDICT_TRIAGE || 400);
const NUM_PREDICT_TITLE = Number(process.env.OLLAMA_NUM_PREDICT_TITLE || 30);

function sanitizeChatTitle(rawTitle) {
  const cleaned = String(rawTitle || "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/[•|:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "New conversation";

  const words = cleaned.split(" ").slice(0, 7);
  const normalized = words.join(" ").replace(/[.!?,;:]+$/g, "").trim();
  if (!normalized) return "New conversation";

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

app.post("/api/chat-title", async (req, res) => {
  try {
    const firstMessage = String(req.body?.message || "").trim();

    if (!firstMessage) {
      return res.status(400).json({ error: "Message is required." });
    }

    const prompt = `
You are generating a short title for a medical conversation.
Summarize the user's message into a natural, human-readable title.

Rules:
- Return ONLY the title.
- Maximum 6 words.
- Use natural language, not keyword lists.
- No bullets, dots, separators, quotes, or trailing punctuation.
- No ALL CAPS.
- Prefer concise medical-style phrasing when appropriate.
- Make it sound like a ChatGPT conversation title.

User message:
${firstMessage}
`;

    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: "qwen2.5:1.5b-instruct",
        prompt,
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.2,
          num_predict: NUM_PREDICT_TITLE
        }
      },
      { timeout: 60000 }
    );

    const rawTitle = (ollamaResponse.data && ollamaResponse.data.response)
      ? String(ollamaResponse.data.response).trim()
      : "";

    res.json({ title: sanitizeChatTitle(rawTitle) });
  } catch (error) {
    const status = error.response && error.response.status;
    const data = error.response && error.response.data;
    console.error("Chat title error:", error.message, status || "", data || "");
    res.status(500).json({
      error: "Chat title failed to generate."
    });
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

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

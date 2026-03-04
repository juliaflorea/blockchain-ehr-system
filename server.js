const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const MODEL_NAME = "mistral:7b-instruct-q4_K_M";

// 🧠 Robust Output parser
function parseLLMOutput(text) {
  const result = {
    differential_diagnoses: [],
    follow_up_questions: [],
    safety_advice: ""
  };

  try {
    // Normalize line endings
    const normalized = text.replace(/\r/g, "");

    // 1️⃣ DIAGNOSES
    const diagnosesSection = normalized.match(/DIAGNOSES:\s*([\s\S]*?)(FOLLOW_UP_QUESTIONS:|$)/i);
    if (diagnosesSection) {
      const lines = diagnosesSection[1]
        .split(/\n+/)
        .map(l => l.trim())
        .filter(Boolean);

      lines.forEach(line => {
        const cleanLine = line.replace(/^\d+\.\s*/, "");
        // Attempt split by dash, if missing, use first sentence
        let condition = cleanLine;
        let reasoning = "This condition is possible given the patient's symptoms.";
        const dashSplit = cleanLine.split(/\s*[-–—]\s*/);
        if (dashSplit.length > 1) {
          condition = dashSplit[0].trim();
          reasoning = dashSplit.slice(1).join(" - ").trim();
        } else {
          // fallback: first sentence as condition, rest as reasoning
          const sentenceSplit = cleanLine.split(/\. (.+)/);
          if (sentenceSplit.length > 1) {
            condition = sentenceSplit[0].trim();
            reasoning = sentenceSplit[1].trim();
          }
        }

        // Remove placeholder reasoning text so UI can omit it cleanly.
        if (/^reasoning not provided\.?$/i.test(reasoning)) {
          reasoning = "";
        }

        result.differential_diagnoses.push({
          condition,
          likelihood: "Possible",
          reasoning
        });
      });
    }

    // 2️⃣ FOLLOW_UP_QUESTIONS
    const questionsSection = normalized.match(/FOLLOW_UP_QUESTIONS:\s*([\s\S]*?)(SAFETY_ADVICE:|$)/i);
    if (questionsSection) {
      const lines = questionsSection[1]
        .split(/\n+/)
        .map(l => l.replace(/^[-•]\s*/, "").trim())
        .filter(Boolean);
      result.follow_up_questions = lines;
    }

    // 3️⃣ SAFETY_ADVICE
    const safetySection = normalized.match(/SAFETY_ADVICE:\s*([\s\S]*)/i);
    if (safetySection) {
      result.safety_advice = safetySection[1].trim();
    }

  } catch (err) {
    console.error("Parsing error:", err.message);
  }

  return result;
}

// 🚨 API route
app.post("/api/diagnose", async (req, res) => {
  try {
    const {
      age,
      gender,
      allergies = [],
      pastDiagnoses = [],
      treatments = [],
      symptoms
    } = req.body;

    if (!symptoms || !Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ error: "No symptoms provided" });
    }

    // Emergency keyword override
    const emergencyKeywords = [
      "chest pain",
      "loss of consciousness",
      "seizure",
      "shortness of breath",
      "uncontrolled bleeding"
    ];

    if (
      symptoms.some(s =>
        emergencyKeywords.some(k => s.toLowerCase().includes(k))
      )
    ) {
      return res.json({
        emergency: true,
        message: "Seek immediate emergency medical attention."
      });
    }

    // Prompt — now forces structured reasoning and complete output
    const prompt = `
You are a clinical AI medical triage assistant.

RESPOND IN THIS EXACT FORMAT — DO NOT DEVIATE:

DIAGNOSES:
1. Condition - provide a 1-sentence reasoning why this could be a possible diagnosis
2. Condition - provide a 1-sentence reasoning why this could be a possible diagnosis

FOLLOW_UP_QUESTIONS:
- Provide 2 full follow-up questions for the patient.

SAFETY_ADVICE:
Provide a short, complete paragraph of safety advice.

PATIENT:
Age: ${age || "Unknown"}
Gender: ${gender || "Unknown"}
Allergies: ${allergies.join(", ") || "None"}
Past Diagnoses: ${pastDiagnoses.slice(0, 2).join(", ") || "None"}
Current Medications: ${treatments.slice(0, 2).join(", ") || "None"}
Symptoms: ${symptoms.join(", ")}
`;

    const response = await axios.post(
      OLLAMA_URL,
      {
        model: MODEL_NAME,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_ctx: 512,
          num_predict: 1024, // increased to prevent truncation
          top_p: 0.8
        }
      },
      { timeout: 180000 }
    );

    const rawText = response.data.response;
    console.log("RAW OUTPUT:\n", rawText);

    const structured = parseLLMOutput(rawText);
    res.json(structured);

  } catch (error) {
    console.error("LLM ERROR:", error.message);
    res.status(500).json({ error: "LLM processing failed" });
  }
});

// Warm model on startup
async function warmModel() {
  try {
    await axios.post(OLLAMA_URL, {
      model: MODEL_NAME,
      prompt: "Hello",
      stream: false,
      options: { num_predict: 10 }
    });
    console.log("Mistral 7B ready.");
  } catch (e) {
    console.error("Warmup failed:", e.message);
  }
}

warmModel();

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const OLLAMA_URL = "http://localhost:11434/api/generate";

app.post("/api/diagnose", async (req, res) => {

  try {

    const {
      age,
      gender,
      allergies,
      pastDiagnoses,
      treatments,
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

Patient context:
Age: ${age || "unknown"}
Gender: ${gender || "unknown"}
Allergies: ${(allergies || []).join(", ") || "none"}
Past diagnoses: ${(pastDiagnoses || []).join(", ") || "none"}
Treatments: ${(treatments || []).join(", ") || "none"}

Current symptoms:
${symptomText}

Return plain text with these sections and nothing else:
Possible causes:
- ...
- ...
Follow-up questions:
- ...
- ...
Safety advice:
...

Rules:
- Plain text only (no JSON)
- No repetition
- Keep it concise
`;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: "qwen2.5:3b-instruct",
        prompt: prompt,
        stream: true,
        keep_alive: "10m",
        options: {
          temperature: 0.2,
          num_predict: 400    // allow full response without truncation
        }
      },
      { timeout: 60000, responseType: "stream" }
    );

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
      if (!res.writableEnded) res.end();
    });

    ollamaResponse.data.on("error", err => {
      console.error("Ollama stream error:", err.message);
      if (!res.writableEnded) res.end();
    });

  } catch (error) {

    console.error("Server error:", error.message);

    res.status(500).json({
      error: "AI assistant failed to respond."
    });

  }

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});

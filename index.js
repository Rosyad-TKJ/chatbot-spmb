require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const knowledgeBase = require("./knowledge");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

const chatHistory = {};
const processing = new Set(); // anti-spam

async function sendWhatsApp(target, message) {
  try {
    await axios.post(
      "https://api.fonnte.com/send",
      { target: target, message: message, countryCode: "62" },
      { headers: { Authorization: process.env.FONNTE_TOKEN } }
    );
  } catch (error) {
    console.error("Gagal kirim:", error.message);
  }
}

async function askGemini(userNumber, userMessage) {
  try {
    if (!chatHistory[userNumber]) {
      chatHistory[userNumber] = model.startChat({
        history: [
          { role: "user", parts: [{ text: knowledgeBase }] },
          { role: "model", parts: [{ text: "Siap membantu SPMB SMK Negeri 1 Kutasari!" }] }
        ]
      });
    }
    const result = await chatHistory[userNumber].sendMessage(userMessage);
    return result.response.text();
  } catch (error) {
    console.error("Error Gemini:", error.message);
    return null; // return null kalau error
  }
}

app.post("/webhook", async (req, res) => {
  // Langsung balas 200 ke Fonnte
  res.status(200).json({ status: "received" });

  const body = req.body;
  const sender = body.sender || body.from;
  const message = body.message || body.text || body.pesan;

  if (!sender || !message) return;
  if (body.isgroup === "true") return;
  if (body.type && body.type !== "text") return;

  const cleanSender = sender.replace(/[^0-9]/g, "");

  // Anti-spam: skip kalau nomor ini sedang diproses
  if (processing.has(cleanSender)) return;
  processing.add(cleanSender);

  try {
    if (message.toLowerCase().trim() === "reset") {
      delete chatHistory[cleanSender];
      await sendWhatsApp(cleanSender, "Sesi direset! Silakan tanya lagi seputar SPMB.");
      return;
    }

    const greetings = ["halo", "hi", "hello", "hai", "mulai", "start", "menu"];
    if (greetings.includes(message.toLowerCase().trim())) {
      const welcome = `Halo! 👋 Selamat datang di Chatbot SPMB SMK Negeri 1 Kutasari 2026/2027!\n\nSaya siap membantu info:\n✅ Jadwal pendaftaran\n✅ Program keahlian\n✅ Cara mendaftar\n\nSilakan ketik pertanyaanmu!\n_Ketik *reset* untuk mulai ulang._`;
      await sendWhatsApp(cleanSender, welcome);
      return;
    }

    const reply = await askGemini(cleanSender, message);
    if (reply) {
      await sendWhatsApp(cleanSender, reply);
    }
    // Kalau null (error Gemini), tidak kirim apa-apa

  } finally {
    // Hapus dari processing setelah selesai
    setTimeout(() => processing.delete(cleanSender), 3000);
  }
});

app.get("/", (req, res) => {
  res.send("Chatbot SPMB SMK Negeri 1 Kutasari aktif!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server berjalan di port " + PORT);
});

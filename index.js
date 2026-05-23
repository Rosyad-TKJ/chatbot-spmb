require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const knowledgeBase = require("./knowledge");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inisialisasi Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Simpan riwayat chat per nomor (sementara, di memori)
const chatHistory = {};

// =====================
// FUNGSI KIRIM PESAN VIA FONNTE
// =====================
async function sendWhatsApp(target, message) {
  try {
    await axios.post(
      "https://api.fonnte.com/send",
      {
        target: target,
        message: message,
        countryCode: "62",
      },
      {
        headers: {
          Authorization: process.env.FONNTE_TOKEN,
        },
      }
    );
    console.log(`✅ Pesan terkirim ke ${target}`);
  } catch (error) {
    console.error("❌ Gagal kirim pesan:", error.response?.data || error.message);
  }
}

// =====================
// FUNGSI TANYA KE GEMINI
// =====================
async function askGemini(userNumber, userMessage) {
  try {
    // Buat atau ambil sesi chat
    if (!chatHistory[userNumber]) {
      chatHistory[userNumber] = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: knowledgeBase }],
          },
          {
            role: "model",
            parts: [
              {
                text: "Baik! Saya siap membantu menjawab pertanyaan seputar SPMB SMK Negeri 1 Kutasari 2026/2027. Silakan tanyakan apa saja! 😊",
              },
            ],
          },
        ],
      });
    }

    const result = await chatHistory[userNumber].sendMessage(userMessage);
    return result.response.text();
  } catch (error) {
    console.error("❌ Error Gemini:", error.message);
    return "Maaf, sistem sedang mengalami gangguan. Silakan coba beberapa saat lagi. 🙏";
  }
}

// =====================
// WEBHOOK ENDPOINT (dipanggil Fonnte)
// =====================
app.post("/webhook", async (req, res) => {
  // Fonnte mengirim data lewat form atau JSON
  const body = req.body;

  const sender = body.sender || body.from;
  const message = body.message || body.text || body.pesan;

  console.log(`📩 Pesan masuk dari ${sender}: ${message}`);

  // Balas 200 dulu ke Fonnte agar tidak timeout
  res.status(200).json({ status: "received" });

  if (!sender || !message) return;

  // Filter pesan sistem / notifikasi
  if (body.isgroup === "true" || body.type !== "text") return;

  // Bersihkan nomor pengirim
  const cleanSender = sender.replace(/[^0-9]/g, "");

  // Hapus history jika user ketik "reset"
  if (message.toLowerCase().trim() === "reset") {
    delete chatHistory[cleanSender];
    await sendWhatsApp(
      cleanSender,
      "🔄 Sesi chat kamu telah direset. Silakan tanyakan kembali seputar SPMB SMK Negeri 1 Kutasari!"
    );
    return;
  }

  // Pesan sambutan jika "halo", "hi", "mulai", dll
  const greetings = ["halo", "hi", "hello", "hai", "mulai", "start", "menu"];
  if (greetings.includes(message.toLowerCase().trim())) {
    const welcome = `Halo! 👋 Selamat datang di Chatbot Resmi SPMB SMK Negeri 1 Kutasari 2026/2027! 🏫

Saya siap membantu kamu dengan informasi seputar:
✅ Jadwal pendaftaran
✅ Program keahlian yang tersedia
✅ Cara mendaftar
✅ Informasi umum SPMB

Silakan ketik pertanyaanmu! 😊
_Ketik *reset* untuk memulai percakapan baru._`;
    await sendWhatsApp(cleanSender, welcome);
    return;
  }

  // Tanya ke Gemini
  const reply = await askGemini(cleanSender, message);
  await sendWhatsApp(cleanSender, reply);
});

// Health check
app.get("/", (req, res) => {
  res.send("🤖 Chatbot SPMB SMK Negeri 1 Kutasari aktif!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
});
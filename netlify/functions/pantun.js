// Netlify Function. API key HANYA ada di sini, lewat Environment Variable.
const MODES = ["Nasional", "Maluku Utara", "Sumatera Utara", "Aceh"];
const STYLES = ["Formal", "Santai"];
const MAX_LEN = 120;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method tidak diizinkan" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "GEMINI_API_KEY belum diset di server" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return json(400, { error: "Format request tidak valid" });
  }
  const { mode, style, isi3, isi4 } = payload;

  if (!MODES.includes(mode) || !STYLES.includes(style)) {
    return json(400, { error: "Mode atau gaya bahasa tidak valid" });
  }
  if (typeof isi3 !== "string" || typeof isi4 !== "string" || !isi3.trim() || !isi4.trim()) {
    return json(400, { error: "Baris 3 dan 4 wajib diisi" });
  }
  if (isi3.length > MAX_LEN || isi4.length > MAX_LEN) {
    return json(400, { error: `Maksimal ${MAX_LEN} karakter per baris` });
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const url = "https://generativelanguage.googleapis.com/v1beta/interactions";

  const systemInstruction = `Kamu adalah ahli pembuat pantun. Pengguna akan memberikan baris 3 dan 4 (isi pantun).
Tugasmu adalah merangkai baris 1 dan 2 (sampiran) sehingga membentuk pantun bersajak a-b-a-b yang masuk akal.
Aturan rima (WAJIB):
- Suku kata terakhir dari baris 1 bunyinya HARUS SAMA dengan suku kata terakhir baris 3.
- Suku kata terakhir dari baris 2 bunyinya HARUS SAMA dengan suku kata terakhir baris 4.

Tema Sampiran: Harus mengambil elemen khas dari daerah "${mode}". (Jika Maluku Utara, sebut ciri khasnya seperti cengkeh, Gamalama, dll. Jika Sumut, sebut Danau Toba, ulos, dll. Jika Aceh, sebut Serambi Mekah, kopi Gayo, dll).
Gaya Bahasa: ${style}.

Hanya kembalikan teks berupa 4 baris pantun utuh tanpa penjelasan apapun.`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        system_instruction: systemInstruction,
        input: `Baris 3: ${isi3.trim()}\nBaris 4: ${isi4.trim()}`,
        store: false,
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return json(502, { error: data.error?.message || "Terjadi kesalahan pada API Gemini" });
    }

    // Skema baru: steps[].content[].text | skema lama: outputs[].text
    let pantun;
    const step = (data.steps || []).filter((x) => x.type === "model_output").pop();
    if (step) {
      pantun = (step.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    } else {
      pantun = (data.outputs || []).filter((o) => o.type === "text").map((o) => o.text).join("");
    }

    if (!pantun) {
      return json(502, { error: "Gemini tidak mengembalikan hasil" });
    }
    return json(200, { pantun: pantun.trim() });
  } catch (e) {
    return json(500, { error: "Gagal menghubungi Gemini" });
  }
};

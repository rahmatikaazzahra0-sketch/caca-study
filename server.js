import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.pptx');
    cb(ok ? null : new Error('Format file harus .pptx.'), ok);
  }
});
const summarizeLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Batas sementara tercapai. Coba lagi sekitar satu jam kemudian.' } });

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function extractPptx(buffer) {
  const zip = new AdmZip(buffer);
  const slides = zip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)).sort((a,b) => Number(a.entryName.match(/slide(\d+)/)[1]) - Number(b.entryName.match(/slide(\d+)/)[1]));
  if (!slides.length) throw new Error('Tidak menemukan slide pada file PPTX.');
  return slides.map((entry, i) => {
    const xml = entry.getData().toString('utf8');
    const chunks = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => decodeXml(m[1]));
    return `SLIDE ${i+1}\n${chunks.join(' ')}`;
  }).join('\n\n').slice(0, 90000);
}
function extractJson(text) {
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(clean);
}

app.post('/api/summarize', summarizeLimit, upload.single('ppt'), async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'API key Gemini belum dipasang di Render.' });
    if (!req.file) return res.status(400).json({ error: 'Pilih satu file PPTX terlebih dahulu.' });
    const subject = String(req.body.subject || 'Materi kuliah').slice(0, 160);
    const slideText = extractPptx(req.file.buffer);
    if (slideText.replace(/SLIDE \d+/g, '').trim().length < 80) return res.status(422).json({ error: 'Teks pada PPT terlalu sedikit. Pastikan file berisi teks yang dapat diseleksi, bukan hanya gambar.' });

    const prompt = `Kamu adalah asisten belajar kedokteran berbahasa Indonesia. Buat bahan belajar berdasarkan isi PPT berikut. Jangan mengarang detail yang tidak didukung PPT. Jika menambahkan penjelasan umum untuk memperjelas, tandai sebagai "penjelasan tambahan". Gunakan bahasa Indonesia yang mudah dipahami tetapi tetap tepat secara akademik.\n\nKeluaran WAJIB JSON valid tanpa markdown fence dengan skema:\n{"title":"...","overview":"...","sections":[{"heading":"...","content":"..."}],"comparisonTables":[{"title":"...","headers":["..."],"rows":[["...","..."]]}],"keyPoints":["..."],"questions":[{"question":"vignette klinis/HOTS...","options":{"A":"...","B":"...","C":"...","D":"...","E":"..."},"answer":"A","explanation":"...","optionReview":{"A":"...","B":"...","C":"...","D":"...","E":"..."}}]}\n\nBuat rangkuman lengkap dan terstruktur. Tabel perbandingan hanya bila ada konsep yang memang dapat dibandingkan. Buat tepat 15 soal vignette klinis HOTS, masing-masing opsi A-E, satu jawaban terbaik, pembahasan jawaban dan alasan tiap opsi. Jika materi PPT tidak cukup untuk 15 soal yang benar-benar relevan, tetap buat soal dari konsep yang tersedia tanpa menambahkan fakta spesifik yang tidak didukung.\n\nMata kuliah/blok: ${subject}\nMateri PPT:\n${slideText}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 12000 } })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Gemini API error (${response.status})`);
    const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (!raw) throw new Error('Gemini tidak mengembalikan rangkuman. Coba lagi dengan PPT yang lebih singkat.');
    const result = extractJson(raw);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Terjadi kesalahan saat memproses PPT.' });
  }
});

app.use((err, _req, res, _next) => res.status(400).json({ error: err.message || 'Permintaan tidak dapat diproses.' }));
app.listen(PORT, () => console.log(`CACA Study berjalan pada port ${PORT}`));

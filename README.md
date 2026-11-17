# CACA Study
Aplikasi web untuk merangkum teks dari slide PowerPoint (.pptx) menggunakan Gemini API.

## Deploy ke Render
1. Push seluruh isi folder ini ke repository GitHub.
2. Di Render pilih **New + → Web Service**, hubungkan repository `caca-study`.
3. Runtime: Node; Build Command: `npm install`; Start Command: `npm start`; Plan: Free.
4. Tambahkan Environment Variable `GEMINI_API_KEY` dengan API key dari Google AI Studio (jangan masukkan ke GitHub).
5. Deploy.

`GEMINI_MODEL` default `gemini-3.5-flash-lite` dan dapat diubah di Environment.

## Catatan
- Menerima satu file PPTX hingga 15 MB; hanya teks slide yang dapat diseleksi yang diekstrak.
- Maksimal 5 permintaan per jam per alamat IP (pembatas sederhana).
- Paket gratis dan kuota API dapat berubah. Jangan unggah materi rahasia, data pasien, atau informasi pribadi.
- Tombol Cetak / Simpan PDF memakai fitur cetak browser; pilih "Save as PDF".

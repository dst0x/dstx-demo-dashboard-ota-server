# UTIL Mertani — OTA Server

Server manajemen IoT untuk perangkat Mertani Datalogger. Menyediakan OTA firmware update, serial monitoring, Modbus terminal, dan asisten AI berbasis RAG.

---

## Daftar Isi

1. [Cara Kerja](#cara-kerja)
2. [Arsitektur & Struktur Direktori](#arsitektur--struktur-direktori)
3. [Alur Fitur Utama](#alur-fitur-utama)
4. [Struktur Database](#struktur-database)
5. [Keamanan](#keamanan)
6. [Konfigurasi (.env)](#konfigurasi-env)
7. [Menjalankan Server](#menjalankan-server)
8. [Dependensi](#dependensi)

---

## Cara Kerja

Server ini bertindak sebagai **pusat kontrol** untuk perangkat IoT Mertani. Ada dua jenis klien yang terhubung:

```
Perangkat IoT (ESP32/STM32)          Dashboard Admin (Browser)
        │                                       │
        │  GET /api/ota/check-update            │  HTTPS (cookie session)
        │  GET /api/ota/download/:id            │
        │  POST /api/ota/ack                    │
        │  POST /api/serial/logs                │  GET /api/admin/...
        │  GET /api/device/modbus/command       │  POST /api/admin/...
        └──────────────────────────────────────►│
                                        [Express Server]
                                                │
                                        [PostgreSQL DB]
```

- **Perangkat** mengakses endpoint `/api/ota/` dan `/api/serial/` tanpa autentikasi (authenticated lewat `devid`)
- **Admin** mengakses semua endpoint `/api/admin/` dengan cookie session yang diverifikasi HMAC-SHA256
- **Halaman HTML** dilindungi middleware `requireAuth`; redirect ke `/login` jika session tidak valid

---

## Arsitektur & Struktur Direktori

```
mertani_ota-server/
├── server.js                    # Entry point, registrasi route & middleware
├── .env                         # Konfigurasi rahasia (tidak di-commit)
│
├── public/                      # Static HTML (dilindungi requireAuth)
│   ├── login.html               # Halaman login
│   ├── index.html               # Dashboard OTA
│   ├── monitor.html             # Serial Monitor
│   ├── modbus.html              # Modbus Terminal
│   └── chat.html                # Asisten AI
│
├── src/
│   ├── controllers/             # Logika bisnis per fitur
│   │   ├── admin_controller.js       # CRUD firmware, daftar device
│   │   ├── ota_controller.js         # check-update, download, ack
│   │   ├── serial_controller.js      # Simpan & query log serial
│   │   ├── modbus_controller.js      # Antre & poll perintah Modbus
│   │   ├── serial_port_controller.js # Buka/tutup serial port lokal
│   │   ├── chat_controller.js        # Streaming AI + session chat
│   │   └── knowledge_file_controller.js  # Upload file KB + RAG search
│   │
│   ├── middlewares/
│   │   ├── auth.js              # Session cookie (HMAC-SHA256, HttpOnly)
│   │   ├── upload.js            # Multer untuk firmware .bin
│   │   └── serial_token.js      # Validasi token perangkat serial
│   │
│   ├── routes/                  # Definisi endpoint per modul
│   ├── services/                # Service serial port & monitor
│   ├── database/
│   │   ├── db.js                # Pool koneksi PostgreSQL
│   │   └── init.js              # Inisialisasi/migrasi tabel
│   └── utils/
│       └── hash_helper.js       # Hashing checksum firmware
│
├── storage/firmwares/           # File .bin firmware yang diupload
└── uploads/knowledge/           # File dokumen Knowledge Base
```

---

## Alur Fitur Utama

### 1. OTA Firmware Update

```
Device                          Server                        Admin
  │                                │                            │
  │── GET /check-update ──────────►│                            │
  │   (devid, hardware, version)   │◄── POST /upload firmware ──│
  │                                │    (.bin, versi, target)   │
  │◄── { update_available, url } ──│                            │
  │                                │                            │
  │── GET /download/:id ──────────►│                            │
  │◄── [binary stream .bin] ───────│                            │
  │                                │                            │
  │── POST /ack ───────────────────►│                           │
  │   (devid, firmware_id, status) │                            │
```

- Server menyimpan file `.bin` di `storage/firmwares/`
- Checksum SHA-256 dihitung saat upload dan disimpan di DB
- Device mengirim ACK setelah download berhasil/gagal

### 2. Asisten AI + RAG (Retrieval-Augmented Generation)

```
User mengetik pertanyaan
         │
         ▼
[Ekstrak keyword] ── filter stopword Indonesia/Inggris
         │
         ▼
[ILIKE search per keyword] ── OR query ke kolom extracted_text
         │
    Ada hasil?
    ┌─────┴─────┐
   YA          TIDAK
    │             │
    ▼             ▼
[Sliding window]   AI jawab dari
[skor per chunk]   pengetahuan umum
[skip 8% header]
    │
    ▼
[Inject ke system prompt]
    │
    ▼
[DeepSeek API — SSE streaming]
    │
    ▼
[Tampilkan ke user real-time]
```

**Sliding window excerpt:** teks dokumen dipotong per 600 karakter (stride 300), setiap chunk diberi skor berdasarkan jumlah keyword yang cocok. Chunk dengan skor tertinggi di luar 8% pertama dokumen (menghindari header) dipilih sebagai kutipan konteks.

### 3. Knowledge Base File Upload

```
Upload file (PDF/DOCX/XLSX/PPTX/TXT/CSV/MD)
         │
         ▼
[Cek duplikat] ── original_name sudah ada? ── SKIP (409)
         │
         ▼
[Ekstrak teks]
  pdf-parse / mammoth / xlsx / jszip / fs.readFile
         │
         ▼
[Simpan ke DB] ── extracted_text + tsvector (GIN index)
```

### 4. Session Chat

- Setiap kali halaman dimuat, **session key baru** dibuat (`sess_<timestamp><random>`)
- Chat lama tersimpan di DB dan tampil di sidebar "Riwayat Chat"
- Klik riwayat → load ulang pesan dari DB, session key diganti ke yang lama

---

## Struktur Database

### `firmwares`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | SERIAL PK | |
| `version` | VARCHAR(50) | Versi firmware, misal `1.2.3` |
| `hardware_target` | VARCHAR(100) | Target hardware, misal `MTI-THETA` |
| `file_path` | VARCHAR(255) | Path file `.bin` di server |
| `file_size` | INTEGER | Ukuran file dalam bytes |
| `checksum` | VARCHAR(255) | SHA-256 file |
| `release_notes` | TEXT | Catatan rilis |
| `upload_date` | TIMESTAMP | |

### `devices`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `mac_address` | VARCHAR(50) PK | |
| `current_version` | VARCHAR(50) | Versi firmware aktif |
| `last_seen` | TIMESTAMP | |

### `ota_devices`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `devid` | VARCHAR(20) PK | ID unik perangkat |
| `created_at` | TIMESTAMP | |
| `last_seen` | TIMESTAMP | Di-update setiap check-update |

### `firmware_targets`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `firmware_id` | INTEGER FK → firmwares | |
| `devid` | VARCHAR(20) | Perangkat yang ditarget |

Composite PK `(firmware_id, devid)`.

### `ota_download_acks`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `devid` | VARCHAR(20) | |
| `firmware_id` | INTEGER FK → firmwares | |
| `download_status` | BOOLEAN | `true` = sukses |
| `acknowledged_at` | TIMESTAMP | |

Unique index `(devid, firmware_id)` — satu ACK per pasangan.

### `modbus_commands`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `devid` | VARCHAR(20) | Target perangkat |
| `frame` | VARCHAR(200) | Frame hex Modbus RTU |
| `description` | VARCHAR(255) | Label perintah |
| `status` | VARCHAR(20) | `pending` / `sent` / `responded` |
| `created_at` | TIMESTAMP | |
| `sent_at` | TIMESTAMP | Waktu dikirim ke device |
| `response_frame` | VARCHAR(200) | Respons dari device |
| `response_status` | VARCHAR(20) | |
| `responded_at` | TIMESTAMP | |

### `chat_sessions`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `session_key` | VARCHAR(64) UNIQUE | Key random per sesi |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | Di-update tiap pesan baru |

### `chat_messages`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `session_id` | BIGINT FK → chat_sessions | CASCADE DELETE |
| `role` | VARCHAR(20) | `user` atau `assistant` |
| `content` | TEXT | Isi pesan |
| `created_at` | TIMESTAMP | |

Index: `(session_id, id)` untuk query history cepat.

### `knowledge_base`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | SERIAL PK | |
| `title` | VARCHAR(200) | |
| `category` | VARCHAR(100) | Default `'Umum'` |
| `content` | TEXT | Isi knowledge |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

### `knowledge_files`
| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | SERIAL PK | |
| `original_name` | VARCHAR(255) | Nama file asli (cek duplikat) |
| `file_type` | VARCHAR(20) | Ekstensi: `pdf`, `docx`, dll |
| `file_size` | INTEGER | Bytes |
| `file_path` | VARCHAR(500) | Path fisik di server |
| `extracted_text` | TEXT | Teks hasil ekstraksi |
| `text_search` | TSVECTOR | GIN index untuk FTS |
| `created_at` | TIMESTAMP | |

---

## Keamanan

### Autentikasi Admin

| Mekanisme | Detail |
|---|---|
| **Session cookie** | HMAC-SHA256 dengan `SESSION_SECRET` dari `.env` |
| **Cookie flags** | `HttpOnly`, `SameSite=Strict`, `Secure` (di production) |
| **TTL session** | 8 jam, kadaluarsa otomatis |
| **Timing-safe compare** | `crypto.timingSafeEqual` untuk username & password — mencegah timing attack |
| **Cache-Control** | `no-store` pada semua halaman HTML — cegah cache browser |

### Proteksi Endpoint

- Semua `/api/admin/*` dan halaman HTML dilindungi `requireAuth` middleware
- Endpoint perangkat (`/api/ota/*`, `/api/serial/*`) tidak butuh session admin — diakses device dengan `devid`
- `devid` divalidasi regex `^[A-Za-z0-9._:-]{1,20}$` sebelum masuk ke query

### Upload File

| Aspek | Implementasi |
|---|---|
| **Firmware** | Hanya `.bin`, disimpan dengan nama random (`stm32-<timestamp>.bin`) |
| **Knowledge file** | Whitelist ekstensi: `.pdf .docx .xlsx .xls .pptx .txt .md .csv` |
| **Batas ukuran** | 20 MB per file (multer `limits.fileSize`) |
| **Duplikat** | Cek `original_name` di DB sebelum proses — file duplikat langsung dihapus |
| **Path traversal** | `multer.diskStorage` mengontrol nama file; path tidak berasal dari input user |

### Database

- Semua query menggunakan **parameterized query** (`$1, $2, ...`) — tidak ada string interpolation SQL
- Koneksi pool via `pg` dengan kredensial dari `.env`

### Hal yang Perlu Diperhatikan

> ⚠️ **Single-user:** sistem ini dirancang untuk satu admin. Tidak ada manajemen multi-user atau role.
>
> ⚠️ **HTTPS:** pastikan server diakses via HTTPS (misal Cloudflare Tunnel) di production agar cookie `Secure` aktif dan token tidak dikirim plaintext.
>
> ⚠️ **Disk penuh:** sisa disk saat ini ~9 GB (90% terpakai). Monitor penggunaan disk secara berkala.

---

## Konfigurasi (.env)

```env
# Server
PORT=3100
NODE_ENV=production          # aktifkan Secure cookie

# Database PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=ota_admin
DB_PASSWORD=your_db_password
DB_NAME=ota_database

# Autentikasi Admin
ADMIN_USERNAME=admin_mertani
ADMIN_PASSWORD=your_admin_password
SESSION_SECRET=random_string_panjang_64_karakter

# DeepSeek AI
DEEPSEEK_API_KEY=your_deepseek_api_key
```

Generate `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Menjalankan Server

### Inisialisasi database (pertama kali)
```bash
node src/database/init.js
```

### Development
```bash
npm run dev        # nodemon, auto-restart saat ada perubahan
```

### Production
```bash
npm start          # node server.js
```

### Akses
Buka `http://localhost:3100` (atau port sesuai `.env`) → redirect ke halaman login.

---

## Dependensi

| Package | Versi | Fungsi |
|---|---|---|
| `express` | ^5.2 | HTTP framework |
| `pg` | ^8.23 | PostgreSQL client |
| `multer` | ^2.4 | Upload file multipart |
| `pdf-parse` | 1.1.1 | Ekstraksi teks PDF |
| `mammoth` | ^1.13 | Ekstraksi teks DOCX |
| `xlsx` | ^0.18 | Ekstraksi teks XLSX/XLS/CSV |
| `jszip` | ^3.10 | Ekstraksi teks PPTX (XML) |
| `serialport` | ^13.0 | Komunikasi serial port lokal |
| `dotenv` | ^18.0 | Load variabel dari `.env` |
| `nodemon` | ^3.1 | Dev: auto-restart (devDependency) |

> **Catatan `pdf-parse`:** gunakan versi `1.1.1` spesifik. Versi 2.x menggunakan API class-based yang tidak kompatibel.

# OTA (Over-The-Air) Server

Backend server berbasis Node.js (Express) dan PostgreSQL yang dirancang untuk mengelola pembaruan firmware mikrokontroler secara nirkabel (OTA). Server ini mendukung unggahan file biner (.bin), kalkulasi checksum otomatis berbasis SHA-256, pengecekan versi perangkat, hingga penyediaan jalur unduhan file yang aman.

---

## Tampilan Web

### Login Administrator

![Halaman login STM32 OTA Console](docs/images/login.png)

### Dashboard OTA Server

![Dashboard OTA Server Hub](docs/images/dashboard.png)

---

## Fitur Utama

- Upload Firmware (.bin): Dilengkapi validasi ekstensi file dan penyimpanan aman menggunakan multer.
- SHA-256 Checksum Generator: Otomatis menghasilkan kode hash kriptografi untuk validasi integritas firmware di mikrokontroler.
- Database PostgreSQL: Menyimpan metadata rilis firmware (version, hardware_target, checksum, file_size, release_notes) dan pelacakan perangkat.
- OTA Polling & Download Endpoint: Endpoint khusus bagi perangkat IoT untuk mengecek pembaruan dan mengunduh file biner.
- Cloudflare Tunnels Integration: Memungkinkan server lokal diakses secara aman dari internet publik tanpa memerlukan port forwarding router fisik.

---

## Prasyarat Sistem

Pastikan perangkat Anda telah terinstal perangkat lunak berikut:

1. Node.js
2. Docker & Docker Compose
3. Cloudflared CLI

---

## Struktur Proyek

```text
mertani_ota-server/
├── src/
│   ├── controllers/
│   │   ├── admin_controller.js
│   │   └── ota_controller.js
│   ├── database/
│   │   ├── db.js
│   │   └── init.js
│   ├── middlewares/
│   │   └── upload.js
│   ├── routes/
│   │   ├── admin_routes.js
│   │   └── ota_routes.js
│   └── utils/
│       └── hash_helper.js
├── storage/
│   └── firmwares/       # Tempat penyimpanan file .bin fisik
├── .env
├── .gitignore
├── docker-compose.yml
├── package.json
├── server.js
└── README.md
```

---

## Struktur Database

Database PostgreSQL pada proyek ini terdiri dari 2 tabel utama yang digunakan untuk menyimpan metadata firmware dan status perangkat:

### 1. Tabel `firmwares`

Tabel ini menyimpan data rilisan firmware yang tersedia untuk diunduh oleh perangkat IoT.

```sql
CREATE TABLE IF NOT EXISTS firmwares (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    hardware_target VARCHAR(100) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL,
    checksum VARCHAR(255) NOT NULL,
    release_notes TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Penjelasan kolom:

- `id`: ID unik firmware.
- `version`: Versi firmware, contoh `1.0.0`.
- `hardware_target`: Target perangkat, contoh `STM32G0B1`.
- `file_path`: Lokasi file `.bin` yang tersimpan di server.
- `file_size`: Ukuran file dalam byte.
- `checksum`: Nilai SHA-256 hasil hash file.
- `release_notes`: Catatan rilis atau perbaikan yang disertakan.
- `upload_date`: Waktu upload firmware.

### 2. Tabel `devices`

Tabel ini menyimpan daftar perangkat yang sudah terdaftar dan informasi versi terakhir yang terpasang.

```sql
CREATE TABLE IF NOT EXISTS devices (
    mac_address VARCHAR(50) PRIMARY KEY,
    current_version VARCHAR(50),
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Penjelasan kolom:

- `mac_address`: Identitas unik perangkat, biasanya alamat MAC.
- `current_version`: Versi firmware yang saat ini dipakai perangkat.
- `last_seen`: Waktu perangkat terakhir melakukan polling atau check-in.

### Diagram Relasi Sederhana

```text
+-------------------+       +-------------------+
| devices           |       | firmwares         |
|-------------------|       |-------------------|
| mac_address       |       | id                |
| current_version   |       | version           |
| last_seen         |       | hardware_target   |
+-------------------+       | file_path         |
                            | file_size         |
                            | checksum          |
                            | release_notes     |
                            | upload_date       |
                            +-------------------+
```

Relasi yang dipakai bersifat logis: satu perangkat bisa memeriksa firmware terbaru dari tabel `firmwares`, sedangkan `devices` hanya mencatat status perangkat saat ini.

---

## Langkah Instalasi & Pengaturan

### 1. Clone atau Buat Direktori Proyek

Masuk ke direktori proyek Anda, lalu instal dependensi Node.js yang diperlukan:

```bash
npm install express multer dotenv pg
npm install --save-dev nodemon
```

### 2. Konfigurasi Environment (.env)

Buat file `.env` di root folder proyek dan sesuaikan konfigurasi berikut:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5433
DB_USER=ota_admin
DB_PASSWORD=supersecret
DB_NAME=ota_database
```

### 3. Jalankan Database PostgreSQL via Docker

Gunakan Docker Compose untuk menghidupkan wadah database PostgreSQL:

```bash
docker compose up -d
```

### 4. Inisialisasi Tabel Database

Jalankan script migrasi untuk membuat tabel `firmwares` dan `devices` secara otomatis:

```bash
node src/database/init.js
```

### 5. Menjalankan Server (Development Mode)

Jalankan server menggunakan `nodemon` agar melakukan restart otomatis saat ada perubahan kode:

```bash
npx nodemon server.js
```

Server akan berjalan di `http://localhost:3000`.

---

## Dokumentasi API Endpoint

### A. Admin API (Manajemen Firmware)

#### Upload Firmware

- Method: `POST`
- URL: `/api/admin/upload`
- Body (form-data):
  - `firmware`: File `.bin` (Type: File)
  - `version`: `1.0.0` (Type: Text)
  - `hardware_target`: `STM32G0B1` (Type: Text)
  - `release_notes`: `Perbaikan bug sensor suhu` (Type: Text)

### B. OTA API (Untuk Perangkat IoT / STM32)

#### Cek Ketersediaan Update

- Method: `GET`
- URL: `/api/ota/check?hardware_target=STM32G0B1&current_version=0.9.0`
- Respons: Mengembalikan informasi versi terbaru, ukuran file, checksum SHA-256, dan tautan unduhan jika ditemukan versi yang lebih baru.

#### Unduh File Firmware (.bin)

- Method: `GET`
- URL: `/api/ota/download/:id`
- Deskripsi: Mengunduh file biner fisik secara langsung berdasarkan ID firmware di database.

---

## Publikasi ke Internet (Cloudflare Tunnel)

Agar server lokal dapat diakses oleh perangkat IoT di luar jaringan lokal:

1. Pastikan utilitas `cloudflared` sudah terinstal di sistem Anda.
2. Jalankan Quick Tunnel atau Named Tunnel yang mengarah ke port lokal `3000`:

```bash
cloudflared tunnel run --url http://localhost:3000 mertani-ota-server
```

3. Gunakan domain atau URL publik HTTPS yang dihasilkan di dalam kode mikrokontroler Anda.

---

## Git Best Practices (.gitignore)

Pastikan file sensitif dan direktori biner tidak ikut terunggah ke repository GitHub dengan membuat file `.gitignore` berisi:

```gitignore
node_modules/
.env
storage/firmwares/*
!storage/firmwares/.gitkeep
.DS_Store
```

---

## Ringkasan

Proyek ini cocok digunakan untuk deployment OTA firmware berbasis perangkat microcontroller seperti STM32, ESP32, atau board berbasis MCU lainnya. Dengan kombinasi PostgreSQL, Express, dan mekanisme checksum SHA-256, server ini memudahkan pengelolaan update firmware dalam skenario perangkat IoT yang terdistribusi.

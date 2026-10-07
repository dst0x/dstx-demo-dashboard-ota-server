const pool = require('./db');

const createTables = async () => {
    const query = `
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

        CREATE TABLE IF NOT EXISTS devices (
            mac_address VARCHAR(50) PRIMARY KEY,
            current_version VARCHAR(50),
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    try {
        await pool.query(query);
        console.log('Tabel berhasil dibuat atau sudah tersedia.');
    } catch (error) {
        console.error('Gagal membuat tabel:', error);
    } finally {
        pool.end(); // Tutup koneksi setelah selesai
    }
};

createTables();
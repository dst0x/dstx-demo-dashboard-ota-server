const pool = require('./db');

const createTables = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS firmwares (
            id              SERIAL PRIMARY KEY,
            version         VARCHAR(50)  NOT NULL,
            hardware_target VARCHAR(100) NOT NULL,
            file_path       VARCHAR(255) NOT NULL,
            file_size       INTEGER      NOT NULL,
            mti_file_path   VARCHAR(255),
            mti_file_size   INTEGER,
            checksum        VARCHAR(255) NOT NULL,
            payload_crc32   VARCHAR(10),
            release_notes   TEXT,
            upload_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE firmwares
            ADD COLUMN IF NOT EXISTS mti_file_path  VARCHAR(255),
            ADD COLUMN IF NOT EXISTS mti_file_size  INTEGER,
            ADD COLUMN IF NOT EXISTS payload_crc32  VARCHAR(10);

        CREATE TABLE IF NOT EXISTS devices (
            mac_address     VARCHAR(50) PRIMARY KEY,
            current_version VARCHAR(50),
            last_seen       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ota_devices (
            devid       VARCHAR(20) PRIMARY KEY,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS firmware_targets (
            firmware_id INTEGER NOT NULL REFERENCES firmwares(id) ON DELETE CASCADE,
            devid       VARCHAR(20) NOT NULL,
            PRIMARY KEY (firmware_id, devid)
        );

        CREATE TABLE IF NOT EXISTS ota_download_acks (
            id              BIGSERIAL PRIMARY KEY,
            devid           VARCHAR(20),
            firmware_id     INTEGER NOT NULL REFERENCES firmwares(id) ON DELETE CASCADE,
            download_status BOOLEAN NOT NULL,
            acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE ota_download_acks
            ADD COLUMN IF NOT EXISTS devid VARCHAR(20);

        CREATE INDEX IF NOT EXISTS idx_ota_download_acks_firmware_id
            ON ota_download_acks(firmware_id);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_download_acks_device_firmware
            ON ota_download_acks(devid, firmware_id);
    `;

    try {
        await pool.query(query);
        console.log('Tabel berhasil dibuat atau sudah tersedia.');
    } catch (error) {
        console.error('Gagal membuat tabel:', error);
    } finally {
        pool.end();
    }
};

createTables();

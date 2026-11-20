const pool = require('./db');

const createTables = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS firmwares (
            id              SERIAL PRIMARY KEY,
            version         VARCHAR(50)  NOT NULL,
            hardware_target VARCHAR(100) NOT NULL,
            file_path       VARCHAR(255) NOT NULL,
            file_size       INTEGER      NOT NULL,
            checksum        VARCHAR(255) NOT NULL,
            release_notes   TEXT,
            upload_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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

        ALTER TABLE firmwares
            DROP COLUMN IF EXISTS mti_file_path,
            DROP COLUMN IF EXISTS mti_file_size,
            DROP COLUMN IF EXISTS payload_crc32;

        CREATE INDEX IF NOT EXISTS idx_ota_download_acks_firmware_id
            ON ota_download_acks(firmware_id);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_download_acks_device_firmware
            ON ota_download_acks(devid, firmware_id);

        CREATE TABLE IF NOT EXISTS modbus_commands (
            id              BIGSERIAL PRIMARY KEY,
            devid           VARCHAR(20)  NOT NULL,
            frame           VARCHAR(200) NOT NULL,
            description     VARCHAR(255),
            status          VARCHAR(20)  DEFAULT 'pending',
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            sent_at         TIMESTAMP,
            response_frame  VARCHAR(200),
            response_status VARCHAR(20),
            responded_at    TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_modbus_commands_devid_status
            ON modbus_commands(devid, status);

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id          BIGSERIAL PRIMARY KEY,
            session_key VARCHAR(64) UNIQUE NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id         BIGSERIAL PRIMARY KEY,
            session_id BIGINT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            role       VARCHAR(20) NOT NULL,
            content    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_session
            ON chat_messages(session_id, id);

        CREATE TABLE IF NOT EXISTS knowledge_base (
            id         SERIAL PRIMARY KEY,
            title      VARCHAR(200) NOT NULL,
            category   VARCHAR(100) DEFAULT 'Umum',
            content    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
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

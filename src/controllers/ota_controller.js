const pool = require('../database/db');
const path = require('path');
const fs = require('fs');

let otaSchemaPromise;

function ensureOtaSchema() {
    if (!otaSchemaPromise) {
        otaSchemaPromise = pool.query(`
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
        `).catch(error => {
            otaSchemaPromise = null;
            throw error;
        });
    }
    return otaSchemaPromise;
}

function normalizeDevid(value) {
    const devid = String(value || '').trim();
    return /^[A-Za-z0-9._:-]{1,20}$/.test(devid) ? devid : null;
}

function getFirmwareBinPath(row) {
    const binPath = path.resolve(row.file_path);
    return fs.existsSync(binPath) ? binPath : null;
}

const checkUpdate = async (req, res) => {
    const { hardware_target, current_version } = req.query;
    const devid = normalizeDevid(req.query.devid);

    if (!devid) {
        return res.status(400).json({ error: 'Parameter devid wajib diisi dan hanya boleh berisi huruf, angka, titik, garis, titik dua, atau underscore (maks 20 karakter)' });
    }

    try {
        await ensureOtaSchema();
        await pool.query(
            `INSERT INTO ota_devices (devid, last_seen)
             VALUES ($1, CURRENT_TIMESTAMP)
             ON CONFLICT (devid) DO UPDATE SET last_seen = CURRENT_TIMESTAMP`,
            [devid]
        );

        const result = await pool.query(
            `SELECT f.id, f.version,
                    EXISTS (
                        SELECT 1
                        FROM ota_download_acks a
                        WHERE a.firmware_id = f.id
                          AND a.devid = $1::varchar
                          AND a.download_status = TRUE
                    ) AS download_acknowledged
             FROM firmwares f
             WHERE EXISTS (
                       SELECT 1 FROM firmware_targets t
                       WHERE t.firmware_id = f.id
                         AND (t.devid = $1::varchar OR t.devid = '*')
                   )
               AND ($2::varchar IS NULL OR f.hardware_target = $2)
             ORDER BY f.id DESC LIMIT 1`,
            [devid, hardware_target || null]
        );

        if (result.rows.length === 0) {
            return res.json({
                devid,
                update_id: null,
                update_available: false,
                version: null,
            });
        }

        const latest = result.rows[0];
        const versionIsNew = current_version ? latest.version !== current_version : true;
        return res.json({
            devid,
            update_id: String(latest.id),
            update_available: versionIsNew && !latest.download_acknowledged,
            version: latest.version,
        });
    } catch (error) {
        console.error('Error saat cek update:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

const acknowledgeDownload = async (req, res) => {
    const { update_id, download_status } = req.body;
    const devid = normalizeDevid(req.body.devid);
    const firmwareId = Number(update_id);

    if (!devid || !Number.isInteger(firmwareId) || firmwareId <= 0 || typeof download_status !== 'boolean') {
        return res.status(400).json({
            error: 'devid, update_id, dan download_status wajib diisi dengan format yang valid',
        });
    }

    try {
        await ensureOtaSchema();
        const result = await pool.query(
            `INSERT INTO ota_download_acks (devid, firmware_id, download_status, acknowledged_at)
             SELECT $1::varchar, f.id, $3, CURRENT_TIMESTAMP
             FROM firmwares f
             WHERE f.id = $2
               AND EXISTS (
                   SELECT 1 FROM firmware_targets t
                   WHERE t.firmware_id = f.id
                     AND (t.devid = $1::varchar OR t.devid = '*')
               )
             ON CONFLICT (devid, firmware_id)
             DO UPDATE SET download_status = EXCLUDED.download_status,
                           acknowledged_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [devid, firmwareId, download_status]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Firmware tidak ditemukan atau tidak ditargetkan ke devid ini' });
        }

        return res.status(201).json({
            devid,
            update_id: String(firmwareId),
            download_status,
            acknowledged: true,
        });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(404).json({ error: `Firmware update_id=${firmwareId} tidak ditemukan` });
        }
        console.error('Error saat menyimpan ACK OTA:', error);
        return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

const downloadFirmware = async (req, res) => {
    const firmwareId = req.params.id;

    try {
        const query = `
            SELECT id, file_path, version
            FROM firmwares WHERE id = $1
        `;
        const result = await pool.query(query, [firmwareId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: `Firmware id=${firmwareId} tidak ditemukan di database` });
        }

        const row = result.rows[0];
        const binPath = getFirmwareBinPath(row);

        if (!binPath) {
            return res.status(404).json({
                error: 'File firmware .bin tidak tersedia di penyimpanan server',
            });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.download(binPath, 'UPDATE.bin');
    } catch (error) {
        console.error('Error saat unduh firmware:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

const downloadLatest = async (req, res) => {
    const hardwareTarget = req.params.hardware_target || req.query.hardware_target;
    const devid = normalizeDevid(req.query.devid);

    if (!devid) {
        return res.status(400).json({ error: 'Parameter devid wajib diisi dan hanya boleh berisi huruf, angka, titik, garis, titik dua, atau underscore (maks 20 karakter)' });
    }

    try {
        await ensureOtaSchema();
        const result = await pool.query(
            `SELECT f.id, f.file_path, f.version
             FROM firmwares f
             WHERE EXISTS (
                       SELECT 1 FROM firmware_targets t
                       WHERE t.firmware_id = f.id
                         AND (t.devid = $1 OR t.devid = '*')
                   )
               AND ($2::varchar IS NULL OR f.hardware_target = $2)
             ORDER BY f.id DESC LIMIT 1`,
            [devid, hardwareTarget || null]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: hardwareTarget
                    ? `Tidak ada firmware untuk hardware_target=${hardwareTarget}`
                    : 'Belum ada firmware yang tersedia',
            });
        }

        const row = result.rows[0];
        const binPath = getFirmwareBinPath(row);

        if (!binPath) {
            return res.status(404).json({
                error: 'File firmware .bin tidak tersedia di penyimpanan server',
            });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.download(binPath, 'UPDATE.bin');
    } catch (error) {
        console.error('Error saat unduh firmware terbaru:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

module.exports = { acknowledgeDownload, checkUpdate, downloadFirmware, downloadLatest };

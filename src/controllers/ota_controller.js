const pool = require('../database/db');
const path = require('path');
const fs = require('fs');

const checkUpdate = async (req, res) => {
    const { hardware_target, current_version } = req.query;

    if (!hardware_target || !current_version) {
        return res.status(400).json({ error: 'Parameter hardware_target dan current_version wajib diisi' });
    }

    try {
        const query = `
            SELECT id, version, file_size, checksum, release_notes 
            FROM firmwares 
            WHERE hardware_target = $1 
            ORDER BY id DESC LIMIT 1;
        `;
        const result = await pool.query(query, [hardware_target]);

        if (result.rows.length === 0) {
            return res.json({ update_available: false, message: 'Belum ada rilis untuk perangkat ini' });
        }

        const latestFirmware = result.rows[0];

        if (latestFirmware.version !== current_version) {
            return res.json({
                update_available: true,
                version: latestFirmware.version,
                file_size: latestFirmware.file_size,
                checksum: latestFirmware.checksum,
                download_url: `/api/ota/download/${latestFirmware.id}`,
                release_notes: latestFirmware.release_notes
            });
        } else {
            return res.json({ update_available: false });
        }
    } catch (error) {
        console.error('Error saat cek update:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

const downloadFirmware = async (req, res) => {
    const firmwareId = req.params.id;

    try {
        const query = `SELECT file_path FROM firmwares WHERE id = $1`;
        const result = await pool.query(query, [firmwareId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Firmware tidak ditemukan di database' });
        }

        const filePath = result.rows[0].file_path;
        const absolutePath = path.resolve(filePath); // Ambil lokasi absolut file di laptop/server

        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: 'File biner fisik hilang dari server' });
        }

        res.download(absolutePath);
    } catch (error) {
        console.error('Error saat unduh firmware:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

module.exports = { checkUpdate, downloadFirmware };
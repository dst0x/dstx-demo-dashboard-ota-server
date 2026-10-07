const pool = require('../database/db');
const { generateChecksum } = require('../utils/hash_helper');

const uploadFirmware = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File biner tidak ditemukan' });
        }

        const { version, hardware_target, release_notes } = req.body;
        const filePath = req.file.path;
        const fileSize = req.file.size;

        if (!version || !hardware_target) {
            return res.status(400).json({ error: 'Version dan hardware_target wajib diisi' });
        }

        const checksum = await generateChecksum(filePath);

        const query = `
            INSERT INTO firmwares (version, hardware_target, file_path, file_size, checksum, release_notes)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        const values = [version, hardware_target, filePath, fileSize, checksum, release_notes];
        
        const result = await pool.query(query, values);

        res.status(201).json({
            message: 'Firmware berhasil diunggah',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error saat upload:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

module.exports = { uploadFirmware };
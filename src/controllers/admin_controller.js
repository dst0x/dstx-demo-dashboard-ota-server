const pool = require('../database/db');
const { generateChecksum } = require('../utils/hash_helper');
const { packageFirmware } = require('../utils/mti_packager');
const path = require('path');
const fs = require('fs');

const uploadFirmware = async (req, res) => {
    let binPath = null;
    let mtiPath = null;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File biner tidak ditemukan' });
        }

        const { version, hardware_target, release_notes } = req.body;
        binPath = req.file.path;

        if (!version || !hardware_target) {
            fs.unlinkSync(binPath);
            return res.status(400).json({ error: 'Version dan hardware_target wajib diisi' });
        }

        const binBuffer = fs.readFileSync(binPath);

        let pkgResult;
        try {
            pkgResult = packageFirmware(binBuffer);
        } catch (pkgErr) {
            fs.unlinkSync(binPath);
            return res.status(422).json({ error: `Validasi firmware gagal: ${pkgErr.message}` });
        }

        const baseName = path.basename(binPath, '.bin');
        mtiPath = path.join(path.dirname(binPath), baseName + '.mti');
        fs.writeFileSync(mtiPath, pkgResult.mtiBuffer);

        const checksum = await generateChecksum(mtiPath);

        const query = `
            INSERT INTO firmwares
                (version, hardware_target, file_path, file_size, mti_file_path, mti_file_size, checksum, payload_crc32, release_notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;
        const values = [
            version,
            hardware_target,
            binPath,
            req.file.size,
            mtiPath,
            pkgResult.totalSize,
            checksum,
            pkgResult.payloadCrc32.toString(16).toUpperCase().padStart(8, '0'),
            release_notes || null,
        ];

        const result = await pool.query(query, values);

        res.status(201).json({
            message: 'Firmware berhasil diunggah dan dipackage',
            data: result.rows[0],
        });
    } catch (error) {
        try { if (binPath && fs.existsSync(binPath)) fs.unlinkSync(binPath); } catch (_) {}
        try { if (mtiPath && fs.existsSync(mtiPath)) fs.unlinkSync(mtiPath); } catch (_) {}
        console.error('Error saat upload:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

const getAllFirmwares = async (req, res) => {
    try {
        const query = 'SELECT * FROM firmwares ORDER BY upload_date DESC;';
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error saat mengambil data firmware:', error);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan pada server' });
    }
};

const deleteFirmware = async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'SELECT file_path, mti_file_path FROM firmwares WHERE id = $1';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Firmware tidak ditemukan' });
        }

        const { file_path, mti_file_path } = result.rows[0];

        await pool.query('DELETE FROM firmwares WHERE id = $1', [id]);

        // Delete physical files
        for (const fp of [file_path, mti_file_path]) {
            if (fp) {
                try {
                    const abs = path.resolve(fp);
                    if (fs.existsSync(abs)) fs.unlinkSync(abs);
                } catch (_) {}
            }
        }

        res.json({ message: `Firmware #${id} berhasil dihapus` });
    } catch (error) {
        console.error('Error saat hapus firmware:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

module.exports = { uploadFirmware, getAllFirmwares, deleteFirmware };

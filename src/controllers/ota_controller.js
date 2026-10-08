const pool = require('../database/db');
const { packageFirmware } = require('../utils/mti_packager');
const path = require('path');
const fs = require('fs');

/**
 * Ensures a firmware record has a valid .mti package file.
 * For records uploaded before packaging was introduced, generates the package
 * on-the-fly from the stored .bin and persists the result to DB.
 * Returns the absolute path to the .mti file, or null on failure.
 */
async function ensureMtiPackage(row) {
    // Happy path: mti already exists
    if (row.mti_file_path) {
        const abs = path.resolve(row.mti_file_path);
        if (fs.existsSync(abs)) return abs;
    }

    // Retroactive packaging from .bin
    const binAbs = path.resolve(row.file_path);
    if (!fs.existsSync(binAbs)) return null;

    let pkgResult;
    try {
        pkgResult = packageFirmware(fs.readFileSync(binAbs));
    } catch (e) {
        console.error(`[OTA] retroactive packaging failed for id=${row.id}:`, e.message);
        return null;
    }

    const mtiPath = binAbs.replace(/\.bin$/, '.mti');
    fs.writeFileSync(mtiPath, pkgResult.mtiBuffer);

    // Persist to DB so the next request doesn't need to repackage
    try {
        await pool.query(
            `UPDATE firmwares
             SET mti_file_path = $1, mti_file_size = $2, payload_crc32 = $3
             WHERE id = $4`,
            [
                path.relative(process.cwd(), mtiPath),
                pkgResult.totalSize,
                pkgResult.payloadCrc32.toString(16).toUpperCase().padStart(8, '0'),
                row.id,
            ]
        );
        console.log(`[OTA] retroactive package saved for firmware id=${row.id}`);
    } catch (dbErr) {
        console.error(`[OTA] DB update failed for id=${row.id}:`, dbErr.message);
    }

    return mtiPath;
}

const checkUpdate = async (req, res) => {
    const { hardware_target, current_version } = req.query;

    if (!hardware_target || !current_version) {
        return res.status(400).json({ error: 'Parameter hardware_target dan current_version wajib diisi' });
    }

    try {
        const query = `
            SELECT id, version, mti_file_size, file_size, checksum, payload_crc32, release_notes
            FROM firmwares
            WHERE hardware_target = $1
            ORDER BY id DESC LIMIT 1;
        `;
        const result = await pool.query(query, [hardware_target]);

        if (result.rows.length === 0) {
            return res.json({ update_available: false, message: 'Belum ada rilis untuk perangkat ini' });
        }

        const latest = result.rows[0];

        if (latest.version !== current_version) {
            return res.json({
                update_available: true,
                version:          latest.version,
                file_size:        latest.mti_file_size || latest.file_size,
                checksum:         latest.checksum,
                payload_crc32:    latest.payload_crc32,
                download_url:     `/api/ota/download/${latest.id}`,
                download_url_stable: `/api/ota/download/latest/${hardware_target}`,
                release_notes:    latest.release_notes,
            });
        }

        return res.json({ update_available: false });
    } catch (error) {
        console.error('Error saat cek update:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

const downloadFirmware = async (req, res) => {
    const firmwareId = req.params.id;

    try {
        const query = `
            SELECT id, file_path, mti_file_path, version
            FROM firmwares WHERE id = $1
        `;
        const result = await pool.query(query, [firmwareId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: `Firmware id=${firmwareId} tidak ditemukan di database` });
        }

        const row = result.rows[0];
        const mtiAbs = await ensureMtiPackage(row);

        if (!mtiAbs) {
            return res.status(500).json({
                error: 'File UPDATE.MTI tidak tersedia dan tidak dapat dibuat ulang dari binary yang tersimpan',
            });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.download(mtiAbs, 'UPDATE.MTI');
    } catch (error) {
        console.error('Error saat unduh firmware:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

const downloadLatest = async (req, res) => {
    const { hardware_target } = req.params;

    try {
        const result = await pool.query(
            `SELECT id, file_path, mti_file_path, version
             FROM firmwares WHERE hardware_target = $1
             ORDER BY id DESC LIMIT 1`,
            [hardware_target]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: `Tidak ada firmware untuk hardware_target=${hardware_target}` });
        }

        const row = result.rows[0];
        const mtiAbs = await ensureMtiPackage(row);

        if (!mtiAbs) {
            return res.status(500).json({
                error: 'File UPDATE.MTI tidak tersedia dan tidak dapat dibuat ulang dari binary yang tersimpan',
            });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.download(mtiAbs, 'UPDATE.MTI');
    } catch (error) {
        console.error('Error saat unduh firmware terbaru:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

module.exports = { checkUpdate, downloadFirmware, downloadLatest };

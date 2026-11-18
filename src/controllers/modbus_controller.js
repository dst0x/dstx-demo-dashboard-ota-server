const pool = require('../database/db');

let schemaPromise;

function ensureSchema() {
    if (!schemaPromise) {
        schemaPromise = pool.query(`
            CREATE TABLE IF NOT EXISTS modbus_commands (
                id             BIGSERIAL PRIMARY KEY,
                devid          VARCHAR(20) NOT NULL,
                frame          VARCHAR(200) NOT NULL,
                description    VARCHAR(255),
                status         VARCHAR(20) DEFAULT 'pending',
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sent_at        TIMESTAMP,
                response_frame VARCHAR(200),
                response_status VARCHAR(20),
                responded_at   TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_modbus_commands_devid_status
                ON modbus_commands(devid, status);
        `).catch(err => { schemaPromise = null; throw err; });
    }
    return schemaPromise;
}

function timeoutStale(devid) {
    return pool.query(
        `UPDATE modbus_commands
         SET status = 'timeout'
         WHERE devid = $1
           AND status IN ('pending','sent')
           AND created_at < NOW() - INTERVAL '60 seconds'`,
        [devid]
    );
}

// POST /api/admin/modbus/command
const sendCommand = async (req, res) => {
    const { devid, frame, description } = req.body;
    if (!devid || !frame) {
        return res.status(400).json({ error: 'devid dan frame wajib diisi' });
    }

    try {
        await ensureSchema();
        const result = await pool.query(
            `INSERT INTO modbus_commands (devid, frame, description)
             VALUES ($1, $2, $3)
             RETURNING id, devid, frame, description, status, created_at`,
            [devid, frame.trim(), description || null]
        );
        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[Modbus] sendCommand error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

// DELETE /api/admin/modbus/command/:id
const cancelCommand = async (req, res) => {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
        return res.status(400).json({ error: 'ID tidak valid' });

    try {
        await ensureSchema();
        const result = await pool.query(
            `UPDATE modbus_commands SET status = 'cancelled'
             WHERE id = $1 AND status = 'pending'
             RETURNING id`,
            [id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ error: 'Perintah tidak ditemukan atau sudah diproses' });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

// GET /api/admin/modbus/history?devid=X&limit=50
const getHistory = async (req, res) => {
    const { devid } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    try {
        await ensureSchema();
        const result = await pool.query(
            `SELECT id, devid, frame, description, status,
                    created_at, sent_at, response_frame, response_status, responded_at
             FROM modbus_commands
             ${devid ? 'WHERE devid = $1' : ''}
             ORDER BY id DESC
             LIMIT ${devid ? '$2' : '$1'}`,
            devid ? [devid, limit] : [limit]
        );
        return res.json({ success: true, data: result.rows });
    } catch (err) {
        return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

// GET /api/device/modbus/poll?devid=X  — dipanggil oleh firmware
const pollCommand = async (req, res) => {
    const devid = String(req.query.devid || '').trim();
    if (!/^[A-Za-z0-9._:-]{1,20}$/.test(devid))
        return res.status(400).json({ error: 'devid tidak valid' });

    try {
        await ensureSchema();
        await timeoutStale(devid);

        const result = await pool.query(
            `UPDATE modbus_commands
             SET status = 'sent', sent_at = NOW()
             WHERE id = (
                 SELECT id FROM modbus_commands
                 WHERE devid = $1 AND status = 'pending'
                 ORDER BY id ASC
                 LIMIT 1
             )
             RETURNING id, frame`,
            [devid]
        );

        if (result.rowCount === 0)
            return res.json({ command_id: null });

        const row = result.rows[0];
        return res.json({ command_id: row.id, frame: row.frame });
    } catch (err) {
        console.error('[Modbus] pollCommand error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

// POST /api/device/modbus/response  — dipanggil oleh firmware setelah eksekusi
const submitResponse = async (req, res) => {
    const { devid, command_id, frame, status } = req.body;
    const id = parseInt(command_id);

    if (!devid || !Number.isInteger(id) || id <= 0)
        return res.status(400).json({ error: 'devid dan command_id wajib diisi' });

    const responseStatus = ['ok', 'error', 'timeout'].includes(status) ? status : 'ok';

    try {
        await ensureSchema();
        const result = await pool.query(
            `UPDATE modbus_commands
             SET status = 'done',
                 response_frame = $3,
                 response_status = $4,
                 responded_at = NOW()
             WHERE id = $1 AND devid = $2 AND status = 'sent'
             RETURNING id`,
            [id, devid, frame || null, responseStatus]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ error: 'Perintah tidak ditemukan atau sudah selesai' });

        return res.json({ success: true });
    } catch (err) {
        console.error('[Modbus] submitResponse error:', err);
        return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};

module.exports = { sendCommand, cancelCommand, getHistory, pollCommand, submitResponse };

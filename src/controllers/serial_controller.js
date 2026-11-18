const serialMonitor = require('../services/serial_monitor');

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const DEVID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

function ingestLog(req, res) {
    const devid = String(req.body.devid || '').trim();
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    const level = String(req.body.level || 'info').trim().toLowerCase();

    if (!DEVID_PATTERN.test(devid)) {
        return res.status(400).json({ error: 'devid wajib diisi dan hanya boleh berisi huruf, angka, titik, garis, titik dua, atau underscore' });
    }
    if (!message || message.length > 2048) {
        return res.status(400).json({ error: 'message wajib diisi dengan panjang maksimal 2048 karakter' });
    }
    if (!VALID_LEVELS.has(level)) {
        return res.status(400).json({ error: 'level harus berupa debug, info, warn, atau error' });
    }

    const data = serialMonitor.addLog({ devid, level, message });
    return res.status(202).json({ success: true, data });
}

function getLogs(req, res) {
    const data = serialMonitor.listLogs({
        devid: req.query.devid,
        level: req.query.level,
        search: req.query.search,
        limit: req.query.limit
    });

    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, data, devices: serialMonitor.getDeviceIds() });
}

function streamLogs(req, res) {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);

    const unsubscribe = serialMonitor.subscribe(entry => {
        res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
    });
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000);

    req.on('close', () => {
        clearInterval(keepAlive);
        unsubscribe();
        res.end();
    });
}

function clearLogs(req, res) {
    const removed = serialMonitor.clearLogs();
    return res.json({ success: true, removed });
}

module.exports = { clearLogs, getLogs, ingestLog, streamLogs };

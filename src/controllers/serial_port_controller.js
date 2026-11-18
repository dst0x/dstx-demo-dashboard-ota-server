const manager = require('../services/serial_port_manager');

// GET /api/admin/serialport/ports
const listPorts = async (req, res) => {
    try {
        const ports = await manager.listPorts();
        res.json({ success: true, ports, connected: manager.info() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/admin/serialport/open  { path, baudRate }
const openPort = async (req, res) => {
    const { path, baudRate = 9600 } = req.body;
    if (!path) return res.status(400).json({ error: 'path wajib diisi' });
    try {
        const info = await manager.open(path, parseInt(baudRate));
        res.json({ success: true, info });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// POST /api/admin/serialport/close
const closePort = async (req, res) => {
    try {
        await manager.close();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/admin/serialport/send  { frame, timeoutMs }
const sendFrame = async (req, res) => {
    const { frame, timeoutMs = 1000 } = req.body;
    if (!frame) return res.status(400).json({ error: 'frame wajib diisi' });
    if (!manager.isOpen()) return res.status(400).json({ error: 'Port belum dibuka' });

    try {
        const response = await manager.send(frame, parseInt(timeoutMs));
        res.json({ success: true, tx: frame, rx: response });
    } catch (err) {
        if (err.timeout) {
            res.status(408).json({ error: 'Timeout — tidak ada response dari device', received: err.received });
        } else {
            res.status(500).json({ error: err.message || String(err) });
        }
    }
};

// GET /api/admin/serialport/status
const getStatus = (req, res) => {
    res.json({ connected: manager.isOpen(), info: manager.info() });
};

// SSE stream of raw serial data
const streamData = (req, res) => {
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ connected: manager.isOpen() })}\n\n`);

    const onData = chunk => {
        const hex = Array.from(chunk).map(b => b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
        res.write(`event: data\ndata: ${JSON.stringify({ hex, ts: new Date().toISOString() })}\n\n`);
    };
    const onClose = () => res.write(`event: port_closed\ndata: {}\n\n`);
    const ka = setInterval(() => res.write(': keep-alive\n\n'), 25000);

    manager.on('data', onData);
    manager.on('close', onClose);
    req.on('close', () => {
        clearInterval(ka);
        manager.off('data', onData);
        manager.off('close', onClose);
        res.end();
    });
};

module.exports = { listPorts, openPort, closePort, sendFrame, getStatus, streamData };

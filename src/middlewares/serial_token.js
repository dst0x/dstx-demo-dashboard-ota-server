const crypto = require('crypto');

let warnedAboutMissingToken = false;

function safeEqual(actual, expected) {
    const actualBuffer = Buffer.from(String(actual || ''));
    const expectedBuffer = Buffer.from(String(expected || ''));
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireSerialIngestToken(req, res, next) {
    const expectedToken = process.env.SERIAL_INGEST_TOKEN;

    if (!expectedToken) {
        if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({ error: 'SERIAL_INGEST_TOKEN belum dikonfigurasi pada server' });
        }

        if (!warnedAboutMissingToken) {
            console.warn('[Serial Monitor] SERIAL_INGEST_TOKEN belum diatur; endpoint log hanya terbuka untuk mode development.');
            warnedAboutMissingToken = true;
        }
        return next();
    }

    if (!safeEqual(req.get('X-Device-Token'), expectedToken)) {
        return res.status(401).json({ error: 'Token device tidak valid' });
    }

    next();
}

module.exports = { requireSerialIngestToken };

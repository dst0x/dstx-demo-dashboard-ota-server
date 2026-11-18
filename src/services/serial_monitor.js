const configuredLimit = Number.parseInt(process.env.SERIAL_LOG_LIMIT, 10);
const maxLogs = Number.isInteger(configuredLimit)
    ? Math.min(Math.max(configuredLimit, 100), 10000)
    : 1000;

const logs = [];
const listeners = new Set();
let nextId = 1;

function addLog({ devid, level = 'info', message }) {
    const entry = {
        id: nextId++,
        devid,
        level,
        message,
        timestamp: new Date().toISOString()
    };

    logs.push(entry);
    if (logs.length > maxLogs) logs.splice(0, logs.length - maxLogs);

    for (const listener of listeners) {
        try {
            listener(entry);
        } catch (error) {
            console.error('[Serial Monitor] Listener error:', error.message);
        }
    }

    return entry;
}

function listLogs({ devid, level, search, limit = 500 } = {}) {
    const normalizedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 500, 1), maxLogs);
    const query = String(search || '').trim().toLowerCase();

    return logs
        .filter(entry => !devid || entry.devid === devid)
        .filter(entry => !level || entry.level === level)
        .filter(entry => !query || entry.message.toLowerCase().includes(query))
        .slice(-normalizedLimit);
}

function getDeviceIds() {
    return [...new Set(logs.map(entry => entry.devid))].sort();
}

function clearLogs() {
    const removed = logs.length;
    logs.length = 0;
    return removed;
}

function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

module.exports = { addLog, clearLogs, getDeviceIds, listLogs, subscribe };

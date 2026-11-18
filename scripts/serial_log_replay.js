require('dotenv').config();

const fs = require('fs');
const path = require('path');

const logFile = process.argv[2] || process.env.SERIAL_LOG_FILE;
const endpoint = process.env.SERIAL_API_URL || 'http://127.0.0.1:3100/api/serial/logs';
const devid = process.env.SERIAL_LOG_DEVID || 'MTI-TESTTMTISHJ';
const token = process.env.SERIAL_INGEST_TOKEN;
const delayMs = Math.min(Math.max(Number.parseInt(process.env.SERIAL_REPLAY_DELAY_MS, 10) || 100, 20), 60000);
const loopEnabled = process.env.SERIAL_REPLAY_LOOP !== 'false';
let stopping = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function inferLevel(message) {
    if (/\]\s*ERROR:/i.test(message)) return 'error';
    if (/\]\s*WARN(?:ING)?:/i.test(message)) return 'warn';
    if (/\]\s*DEBUG:/i.test(message)) return 'debug';
    return 'info';
}

function sanitize(message) {
    return message
        .replace(/((?:bluetooth\s+key|password|token)\s*:\s*)\S+/gi, '$1[REDACTED]')
        .slice(0, 2048);
}

function readLogLines() {
    const content = fs.readFileSync(logFile, 'utf8');
    return content
        .split(/\r\n|\n|\r/)
        .map(line => line.trim())
        .filter(line => /^\[\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\]/.test(line));
}

async function sendLog(message) {
    let retryDelay = 1000;

    while (!stopping) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-Token': token
                },
                body: JSON.stringify({ devid, level: inferLevel(message), message }),
                signal: AbortSignal.timeout(10000)
            });

            if (response.ok) return;
            const result = await response.text();
            if (response.status === 401 || response.status === 403) {
                throw new Error(`Token ditolak server (${response.status}): ${result}`);
            }
            throw new Error(`HTTP ${response.status}: ${result}`);
        } catch (error) {
            console.error(`[Serial Replay] Gagal mengirim: ${error.message}`);
            console.error(`[Serial Replay] Mencoba lagi dalam ${retryDelay / 1000} detik...`);
            await sleep(retryDelay);
            retryDelay = Math.min(retryDelay * 2, 10000);
        }
    }
}

async function main() {
    if (!logFile) throw new Error('SERIAL_LOG_FILE belum diatur dan path file belum diberikan.');
    if (!fs.existsSync(logFile)) throw new Error(`File log tidak ditemukan: ${logFile}`);
    if (!token) throw new Error('SERIAL_INGEST_TOKEN belum diatur di .env.');

    console.log(`[Serial Replay] File    : ${path.resolve(logFile)}`);
    console.log(`[Serial Replay] Device  : ${devid}`);
    console.log(`[Serial Replay] Endpoint: ${endpoint}`);
    console.log(`[Serial Replay] Interval: ${delayMs} ms`);
    console.log('[Serial Replay] Tekan Ctrl+C untuk berhenti.');

    do {
        const lines = readLogLines();
        console.log(`[Serial Replay] Mengirim ${lines.length} baris...`);

        for (const rawLine of lines) {
            if (stopping) break;
            await sendLog(sanitize(rawLine));
            await sleep(delayMs);
        }

        if (loopEnabled && !stopping) {
            console.log('[Serial Replay] Satu putaran selesai. Mengulang dari awal...');
            await sleep(1000);
        }
    } while (loopEnabled && !stopping);
}

process.on('SIGINT', () => {
    stopping = true;
    console.log('\n[Serial Replay] Menghentikan proses...');
});

main().catch(error => {
    console.error(`[Serial Replay] ${error.message}`);
    process.exitCode = 1;
});

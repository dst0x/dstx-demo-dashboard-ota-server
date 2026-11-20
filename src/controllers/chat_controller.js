const pool = require('../database/db');

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const BASE_SYSTEM = `Kamu adalah Asisten Mertani, AI assistant yang membantu pengguna dashboard IoT Mertani.

Keahlianmu mencakup:
- Produk Mertani Datalogger berbasis STM32 + ESP32 WiFi
- Protokol Modbus RTU: function code, format frame, CRC16, register address
- OTA firmware update: upload, check update, download, acknowledgment
- Serial monitoring dan logging data device
- Troubleshooting: koneksi WiFi ESP32, sensor tidak akurat, RS485, Cloudflare Tunnel
- Dashboard Mertani: fitur OTA, Serial Monitor, Modbus Terminal, Asisten Chat

Panduan menjawab:
- Gunakan bahasa Indonesia yang jelas dan teknis
- Gunakan bullet points atau numbered list untuk langkah-langkah
- Sertakan contoh kode atau nilai hex jika relevan
- Jika tidak tahu jawabannya, arahkan ke tim Mertani
- Jawaban singkat dan to the point`;

// ── Knowledge Base helpers ──────────────────────────────────

async function buildSystemPrompt() {
    const result = await pool.query(
        `SELECT category, title, content FROM knowledge_base ORDER BY category, id`
    );
    if (result.rows.length === 0) return BASE_SYSTEM;

    let kb = '\n\n=== KNOWLEDGE BASE ===\n';
    let lastCat = null;
    for (const row of result.rows) {
        if (row.category !== lastCat) {
            kb += `\n[${row.category}]\n`;
            lastCat = row.category;
        }
        kb += `\n## ${row.title}\n${row.content}\n`;
    }
    kb += '\n=== END KNOWLEDGE BASE ===\n\nGunakan knowledge base di atas sebagai referensi utama saat menjawab pertanyaan.';
    return BASE_SYSTEM + kb;
}

// ── Session helpers ─────────────────────────────────────────

async function getOrCreateSession(sessionKey) {
    const existing = await pool.query(
        `SELECT id FROM chat_sessions WHERE session_key = $1`, [sessionKey]
    );
    if (existing.rows.length) return existing.rows[0].id;

    const created = await pool.query(
        `INSERT INTO chat_sessions (session_key) VALUES ($1) RETURNING id`, [sessionKey]
    );
    return created.rows[0].id;
}

async function saveMessage(sessionId, role, content) {
    await pool.query(
        `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)`,
        [sessionId, role, content]
    );
    await pool.query(
        `UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [sessionId]
    );
}

// ── POST /stream ────────────────────────────────────────────

const chatStream = async (req, res) => {
    const { messages, session_key } = req.body;

    if (!Array.isArray(messages) || messages.length === 0)
        return res.status(400).json({ error: 'messages wajib diisi' });

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'your_deepseek_api_key_here')
        return res.status(503).json({ error: 'DEEPSEEK_API_KEY belum dikonfigurasi di .env server' });

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    try {
        const systemPrompt = await buildSystemPrompt();
        const lastUserMsg = messages[messages.length - 1];

        // Save user message
        let sessionId = null;
        if (session_key) {
            sessionId = await getOrCreateSession(session_key);
            if (lastUserMsg?.role === 'user') {
                await saveMessage(sessionId, 'user', lastUserMsg.content);
            }
        }

        const upstream = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                stream: true,
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
            }),
        });

        if (!upstream.ok) {
            const err = await upstream.text();
            res.write(`event: error\ndata: ${JSON.stringify({ message: `DeepSeek error ${upstream.status}: ${err}` })}\n\n`);
            return res.end();
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let full = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();

            for (const line of lines) {
                const t = line.trim();
                if (!t || t === 'data: [DONE]') continue;
                if (!t.startsWith('data: ')) continue;
                try {
                    const json = JSON.parse(t.slice(6));
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                        full += delta;
                        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                    }
                } catch (_) {}
            }
        }

        // Save assistant reply
        if (sessionId && full) {
            await saveMessage(sessionId, 'assistant', full);
        }

        res.write('event: done\ndata: {}\n\n');
        res.end();
    } catch (err) {
        console.error('[Chat] error:', err.message);
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        res.end();
    }
};

// ── GET /history?session=xxx ────────────────────────────────

const getHistory = async (req, res) => {
    const { session } = req.query;
    if (!session) return res.status(400).json({ error: 'session wajib diisi' });

    try {
        const result = await pool.query(
            `SELECT role, content FROM chat_messages
             WHERE session_id = (SELECT id FROM chat_sessions WHERE session_key = $1)
             ORDER BY id ASC`,
            [session]
        );
        res.json({ success: true, messages: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── GET /sessions ───────────────────────────────────────────

const getSessions = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT s.session_key,
                    COUNT(m.id) AS message_count,
                    MAX(m.created_at) AS last_message,
                    s.created_at,
                    s.updated_at,
                    (SELECT content FROM chat_messages
                     WHERE session_id = s.id AND role = 'user'
                     ORDER BY id ASC LIMIT 1) AS preview
             FROM chat_sessions s
             LEFT JOIN chat_messages m ON m.session_id = s.id
             GROUP BY s.id, s.session_key, s.created_at, s.updated_at
             HAVING COUNT(m.id) > 0
             ORDER BY s.updated_at DESC
             LIMIT 60`
        );
        res.json({ success: true, sessions: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── DELETE /session/:key ─────────────────────────────────────

const deleteSession = async (req, res) => {
    const { key } = req.params;
    try {
        await pool.query(`DELETE FROM chat_sessions WHERE session_key = $1`, [key]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Knowledge Base CRUD ─────────────────────────────────────

const listKnowledge = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, category, content, created_at, updated_at
             FROM knowledge_base ORDER BY category, id`
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const createKnowledge = async (req, res) => {
    const { title, category = 'Umum', content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title dan content wajib diisi' });
    try {
        const result = await pool.query(
            `INSERT INTO knowledge_base (title, category, content)
             VALUES ($1, $2, $3) RETURNING *`,
            [title, category, content]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const updateKnowledge = async (req, res) => {
    const { id } = req.params;
    const { title, category, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title dan content wajib diisi' });
    try {
        const result = await pool.query(
            `UPDATE knowledge_base SET title=$1, category=$2, content=$3, updated_at=NOW()
             WHERE id=$4 RETURNING *`,
            [title, category || 'Umum', content, id]
        );
        if (!result.rowCount) return res.status(404).json({ error: 'Entry tidak ditemukan' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const deleteKnowledge = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`DELETE FROM knowledge_base WHERE id=$1 RETURNING id`, [id]);
        if (!result.rowCount) return res.status(404).json({ error: 'Entry tidak ditemukan' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    chatStream, getHistory, getSessions, deleteSession,
    listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
};

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `Kamu adalah Asisten Mertani, AI assistant yang membantu pengguna dashboard IoT Mertani.

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
- Jawaban singkat dan to the point, hindari penjelasan yang terlalu panjang`;

// POST /api/admin/chat  — streaming SSE
const chatStream = async (req, res) => {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages wajib diisi' });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'your_deepseek_api_key_here') {
        return res.status(503).json({ error: 'DEEPSEEK_API_KEY belum dikonfigurasi di .env server' });
    }

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    try {
        const upstream = await fetch(DEEPSEEK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                stream: true,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...messages,
                ],
            }),
        });

        if (!upstream.ok) {
            const err = await upstream.text();
            res.write(`event: error\ndata: ${JSON.stringify({ message: `DeepSeek API error ${upstream.status}: ${err}` })}\n\n`);
            return res.end();
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop(); // keep incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                    const json = JSON.parse(trimmed.slice(6));
                    const delta = json.choices?.[0]?.delta?.content;
                    if (delta) {
                        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                    }
                } catch (_) {}
            }
        }

        res.write('event: done\ndata: {}\n\n');
        res.end();
    } catch (err) {
        console.error('[Chat] DeepSeek error:', err.message);
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        res.end();
    }
};

module.exports = { chatStream };

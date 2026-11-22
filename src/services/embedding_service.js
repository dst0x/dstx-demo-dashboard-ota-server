const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const CHUNK_SIZE = parseInt(process.env.EMBED_CHUNK_SIZE) || 500;
const CHUNK_OVERLAP = 50;

async function isOllamaReady() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

function sanitize(text) {
    return text
        .replace(/\x00/g, '')
        .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000); // nomic-embed-text max ~8192 tokens ≈ 4000 chars safe
}

async function embedText(text) {
    const clean = sanitize(text);
    if (!clean) throw new Error('Empty text after sanitize');
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: clean }),
        signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Ollama embed error: ${res.status} ${body.slice(0, 100)}`);
    }
    const data = await res.json();
    if (!data.embedding?.length) throw new Error('Empty embedding response');
    return data.embedding;
}

function chunkText(text) {
    const CHAR_SIZE = 1500;
    const CHAR_OVERLAP = 200;
    const clean = text.replace(/\x00/g, '').replace(/\s+/g, ' ').trim();
    const chunks = [];
    for (let i = 0; i < clean.length; i += CHAR_SIZE - CHAR_OVERLAP) {
        const chunk = clean.slice(i, i + CHAR_SIZE).trim();
        if (chunk.length > 50) chunks.push({ text: chunk, offset: i });
        if (i + CHAR_SIZE >= clean.length) break;
    }
    return chunks;
}

module.exports = { isOllamaReady, embedText, chunkText, EMBED_MODEL };

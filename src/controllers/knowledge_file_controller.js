const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const pool = require('../database/db');
const { isOllamaReady, embedText, chunkText } = require('../services/embedding_service');

async function ocrPdf(filePath) {
    const Tesseract = require('tesseract.js');
    const tmpDir = path.join('/tmp', 'ocr_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        execSync(`pdftoppm -png -r 400 -l 30 -gray "${filePath}" "${tmpDir}/page"`, { timeout: 180000 });
        const images = fs.readdirSync(tmpDir)
            .filter(f => f.endsWith('.png'))
            .sort()
            .slice(0, 30);

        if (!images.length) return '';

        const worker = await Tesseract.createWorker('eng+ind');
        const pages = [];
        for (const img of images) {
            const { data: { text } } = await worker.recognize(path.join(tmpDir, img));
            if (text.trim()) pages.push(text.trim());
        }
        await worker.terminate();
        return pages.join('\n\n');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

function layoutRender(pageData) {
    return pageData.getTextContent().then(textContent => {
        if (!textContent.items.length) return '';

        const fontSize = textContent.items.reduce((s, it) => s + Math.abs(it.transform[3] || 12), 0) / textContent.items.length;
        const yBucket = Math.max(fontSize * 0.6, 4);

        const rows = {};
        for (const item of textContent.items) {
            if (!item.str) continue;
            const y = Math.round(item.transform[5] / yBucket) * yBucket;
            if (!rows[y]) rows[y] = [];
            rows[y].push({ x: item.transform[4], text: item.str, w: item.width || 0 });
        }

        const sortedYs = Object.keys(rows).map(Number).sort((a, b) => b - a);
        const lines = [];

        for (const y of sortedYs) {
            const items = rows[y].sort((a, b) => a.x - b.x);
            let line = '';
            let lastEnd = 0;
            for (const item of items) {
                const gap = item.x - lastEnd;
                if (gap > fontSize * 3 && line) line += ' | ';
                else if (gap > fontSize * 0.3 && line) line += ' ';
                line += item.text;
                lastEnd = item.x + item.w;
            }
            if (line.trim()) lines.push(line.trim());
        }

        return lines.join('\n');
    });
}

async function extractPdf(filePath) {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);

    const layoutData = await pdfParse(buffer, { pagerender: layoutRender });
    const layoutText = (layoutData.text || '').replace(/\x00/g, '').trim();
    if (layoutText.length >= 100) return layoutText;

    const plainData = await pdfParse(buffer);
    const plainText = (plainData.text || '').replace(/\x00/g, '').trim();
    if (plainText.length >= 100) return plainText;

    console.log(`[KnowledgeFile] pdf-parse got ${plainText.length} chars, falling back to OCR: ${filePath}`);
    const ocrText = await ocrPdf(filePath);
    return ocrText || plainText;
}

async function extractDocx(filePath) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
}

async function extractXlsx(filePath) {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(filePath);
    const lines = [];
    for (const sheetName of wb.SheetNames) {
        lines.push(`[Sheet: ${sheetName}]`);
        const sheet = wb.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        lines.push(csv);
    }
    return lines.join('\n');
}

async function extractPptx(filePath) {
    const JSZip = require('jszip');
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    const texts = [];

    const slideFiles = Object.keys(zip.files)
        .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort();

    for (const name of slideFiles) {
        const xml = await zip.files[name].async('string');
        const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
        const slideText = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').trim();
        if (slideText) texts.push(slideText);
    }
    return texts.join('\n');
}

async function extractText(filePath, mimeOrExt) {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.pdf') return await extractPdf(filePath);
        if (ext === '.docx') return await extractDocx(filePath);
        if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') return await extractXlsx(filePath);
        if (ext === '.pptx') return await extractPptx(filePath);
        if (ext === '.txt' || ext === '.md') return fs.readFileSync(filePath, 'utf8');
        return null;
    } catch (e) {
        console.error('[KnowledgeFile] extract error:', e.message);
        return null;
    }
}

const uploadKnowledgeFile = async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan' });

    const { originalname, filename, size, path: filePath } = req.file;
    const ext = path.extname(originalname).toLowerCase().slice(1);

    // Cek duplikat berdasarkan nama file
    const dup = await pool.query(
        `SELECT id FROM knowledge_files WHERE original_name = $1 LIMIT 1`, [originalname]
    );
    if (dup.rowCount) {
        fs.unlinkSync(filePath);
        return res.status(409).json({ skipped: true, message: `File "${originalname}" sudah ada, dilewati.` });
    }

    const text = await extractText(filePath, ext);
    if (!text) {
        fs.unlinkSync(filePath);
        return res.status(422).json({ error: 'Tipe file tidak didukung atau gagal diekstrak' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO knowledge_files (original_name, file_type, file_size, file_path, extracted_text, text_search)
             VALUES ($1, $2, $3, $4, $5, to_tsvector('simple', $5))
             RETURNING id, original_name, file_type, file_size, created_at`,
            [originalname, ext, size, filePath, text]
        );
        const fileId = result.rows[0].id;
        res.status(201).json({ success: true, data: result.rows[0] });

        // Generate embeddings in background (non-blocking)
        setImmediate(() => generateChunkEmbeddings(fileId, text).catch(e =>
            console.error('[Embed] background error:', e.message)
        ));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

async function generateChunkEmbeddings(fileId, text) {
    if (!await isOllamaReady()) return;
    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
        try {
            const vector = await embedText(chunks[i].text);
            await pool.query(
                `INSERT INTO knowledge_chunks (file_id, chunk_index, chunk_text, embedding)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [fileId, i, chunks[i].text, JSON.stringify(vector)]
            );
        } catch (e) {
            console.error(`[Embed] chunk ${i} error:`, e.message);
        }
    }
    console.log(`[Embed] file ${fileId}: ${chunks.length} chunks embedded`);
}

// ── List ────────────────────────────────────────────────────

const listKnowledgeFiles = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, original_name, file_type, file_size, created_at,
                    length(extracted_text) AS char_count
             FROM knowledge_files ORDER BY id DESC`
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Delete ──────────────────────────────────────────────────

const deleteKnowledgeFile = async (req, res) => {
    const { id } = req.params;
    try {
        const row = await pool.query(`SELECT file_path FROM knowledge_files WHERE id=$1`, [id]);
        if (!row.rowCount) return res.status(404).json({ error: 'File tidak ditemukan' });

        const filePath = row.rows[0].file_path;
        await pool.query(`DELETE FROM knowledge_files WHERE id=$1`, [id]);
        try { fs.unlinkSync(filePath); } catch (_) {}
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ── Search (used by chat controller) ───────────────────────

const ID_STOP = new Set([
    'apa','bagaimana','cara','itu','ini','yang','di','ke','dari','dan','atau',
    'tidak','untuk','dengan','pada','dalam','adalah','ada','jika','maka','akan',
    'saya','kamu','kami','mereka','sebuah','buat','masih','sudah','belum','juga',
    'serta','karena','tapi','namun','jadi','lalu','kemudian','tentang','setelah',
    'sebelum','ketika','saat','dimana','siapa','kenapa','mengapa','berapa',
    'sesuai','ganti','ubah','cek','lihat','buka','tutup','mulai','set','mau',
    'bisa','ingin','tolong','mohon','jelaskan','bagian','apakah','kenapa',
    // English
    'the','a','an','and','or','to','of','for','in','on','at','by','how',
    'what','where','when','why','is','are','was','were','be','this','that',
    'can','i','you','we','they','it','do','does','my','your',
]);

function extractKeywords(query) {
    return [...new Set(
        query
            .split(/[\s,.:;!?()/\\[\]"']+/)
            .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
            .filter(w => w.length >= 3 && !ID_STOP.has(w.toLowerCase()))
            .slice(0, 8)
    )];
}

// Konversi keyword ke pola regex PostgreSQL.
// "mec20"  → "mec[^a-z0-9]?20"   cocok dengan mec20, MEC-20, MEC 20, MEC_20
// "s300n"  → "s[^a-z0-9]?300[^a-z0-9]?n"
function kwToRegex(kw) {
    return kw
        .replace(/([a-zA-Z])(\d)/g, '$1[^a-zA-Z0-9]?$2')
        .replace(/(\d)([a-zA-Z])/g, '$1[^a-zA-Z0-9]?$2');
}

function extractExcerpt(text, kwRegexes, maxLen = 2500) {
    const CHUNK = 1000;
    const STEP = 400;

    let bestScore = -1;
    let bestIdx = 0;

    for (let i = 0; i < text.length - CHUNK; i += STEP) {
        const chunk = text.slice(i, i + CHUNK);
        let score = 0;
        for (const rx of kwRegexes) {
            if (rx.test(chunk)) score++;
        }
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }

    if (bestScore === 0) return text.slice(0, 400);

    const bodyStart = Math.floor(text.length * 0.08);
    if (bestIdx < bodyStart) {
        for (let i = bodyStart; i < text.length - CHUNK; i += STEP) {
            const chunk = text.slice(i, i + CHUNK);
            const score = kwRegexes.reduce((s, rx) => s + (rx.test(chunk) ? 1 : 0), 0);
            if (score >= bestScore) { bestIdx = i; break; }
        }
    }

    const start = Math.max(0, bestIdx - 50);
    const end = Math.min(text.length, bestIdx + CHUNK + 200);
    return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

async function vectorSearch(query, limit = 6) {
    try {
        const queryVector = await embedText(query);
        const result = await pool.query(
            `SELECT kf.id, kf.original_name, kf.file_type, kc.chunk_text,
                    1 - (kc.embedding <=> $1::vector) AS similarity
             FROM knowledge_chunks kc
             JOIN knowledge_files kf ON kf.id = kc.file_id
             ORDER BY kc.embedding <=> $1::vector
             LIMIT $2`,
            [JSON.stringify(queryVector), limit]
        );
        return result.rows.map(row => ({
            original_name: row.original_name,
            file_type: row.file_type,
            excerpt: row.chunk_text,
            similarity: parseFloat(row.similarity).toFixed(3),
            source: 'vector',
        }));
    } catch (e) {
        console.error('[VectorSearch]', e.message);
        return null;
    }
}

async function keywordSearch(query, limit = 6) {
    const keywords = extractKeywords(query);
    if (!keywords.length) return [];
    const kwRegexes = keywords.map(kw => new RegExp(kwToRegex(kw), 'i'));
    const pgPatterns = keywords.map(kw => kwToRegex(kw));
    try {
        const conditions = pgPatterns.map((_, i) => `extracted_text ~* $${i + 1}`);
        const result = await pool.query(
            `SELECT id, original_name, file_type, extracted_text,
                    (${pgPatterns.map((_, i) => `CASE WHEN extracted_text ~* $${i + 1} THEN 1 ELSE 0 END`).join(' + ')}) AS score
             FROM knowledge_files
             WHERE ${conditions.join(' OR ')}
             ORDER BY score DESC
             LIMIT ${limit}`,
            pgPatterns
        );
        return result.rows.map(row => ({
            original_name: row.original_name,
            file_type: row.file_type,
            excerpt: extractExcerpt(row.extracted_text, kwRegexes),
            source: 'keyword',
        }));
    } catch (e) {
        console.error('[KeywordSearch]', e.message);
        return [];
    }
}

async function searchKnowledgeFiles(query, limit = 6) {
    if (!query || query.trim().length < 2) return [];

    // Coba vector search dulu kalau Ollama ready
    if (await isOllamaReady()) {
        const vectorResults = await vectorSearch(query, limit);
        if (vectorResults && vectorResults.length > 0) {
            console.log(`[Search] vector: ${vectorResults.length} hits`);
            return vectorResults;
        }
    }

    // Fallback ke keyword search
    console.log('[Search] fallback to keyword');
    return keywordSearch(query, limit);
}

// ── Re-extract ──────────────────────────────────────────────

const reextractFile = async (req, res) => {
    const { id } = req.params;
    try {
        const row = await pool.query(`SELECT * FROM knowledge_files WHERE id=$1`, [id]);
        if (!row.rowCount) return res.status(404).json({ error: 'File tidak ditemukan' });

        const file = row.rows[0];
        const text = await extractText(file.file_path);
        if (!text) return res.status(422).json({ error: 'Gagal mengekstrak teks dari file' });

        await pool.query(
            `UPDATE knowledge_files
             SET extracted_text = $1, text_search = to_tsvector('simple', $1)
             WHERE id = $2`,
            [text, id]
        );
        res.json({ success: true, char_count: text.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { uploadKnowledgeFile, listKnowledgeFiles, deleteKnowledgeFile, reextractFile, searchKnowledgeFiles };

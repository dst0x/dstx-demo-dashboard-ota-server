#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: true });

const pool = require('../src/database/db');
const path = require('path');
const fs = require('fs');

// Import the extraction functions from the controller
const { execSync } = require('child_process');

async function ocrPdf(filePath) {
    const Tesseract = require('tesseract.js');
    const tmpDir = path.join('/tmp', 'ocr_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
        execSync(`pdftoppm -png -r 200 -l 10 -gray "${filePath}" "${tmpDir}/page"`, { timeout: 60000 });
        const images = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png')).sort().slice(0, 10);
        if (!images.length) return '';
        const worker = await Tesseract.createWorker('eng+ind');
        const pages = [];
        for (const img of images) {
            try {
                const { data: { text } } = await worker.recognize(path.join(tmpDir, img));
                if (text.trim()) pages.push(text.trim());
            } catch (_) {}
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

    console.log(`  OCR fallback: ${path.basename(filePath)}`);
    const ocrText = await ocrPdf(filePath);
    return ocrText || plainText;
}

(async () => {
    const result = await pool.query(
        `SELECT id, original_name, file_path, file_type FROM knowledge_files WHERE file_type IN ('pdf', 'application/pdf') ORDER BY id`
    );
    const files = result.rows;
    console.log(`Total PDF: ${files.length}`);

    let ok = 0, skip = 0, fail = 0;
    for (const file of files) {
        if (!fs.existsSync(file.file_path)) {
            console.log(`  SKIP (file hilang): ${file.original_name}`);
            skip++;
            continue;
        }
        try {
            const text = await extractPdf(file.file_path);
            if (!text || text.length < 50) {
                console.log(`  SKIP (teks kurang): ${file.original_name}`);
                skip++;
                continue;
            }
            await pool.query(
                `UPDATE knowledge_files SET extracted_text = $1, text_search = to_tsvector('simple', $1) WHERE id = $2`,
                [text, file.id]
            );
            ok++;
            process.stdout.write(`\r  ${ok} updated, ${skip} skipped, ${fail} failed`);
        } catch (e) {
            console.log(`\n  ERROR: ${file.original_name} - ${e.message}`);
            fail++;
        }
    }
    console.log(`\nSelesai. Updated: ${ok} | Skipped: ${skip} | Failed: ${fail}`);
    await pool.end();
})();

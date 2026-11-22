#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: true });
const pool = require('../src/database/db');
const { isOllamaReady, embedText, chunkText } = require('../src/services/embedding_service');

(async () => {
    const ready = await isOllamaReady();
    if (!ready) {
        console.error('Ollama tidak dapat dijangkau. Pastikan Ollama berjalan di', process.env.OLLAMA_URL || 'http://localhost:11434');
        process.exit(1);
    }
    console.log('✓ Ollama ready');

    // Pull model check
    const tagRes = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`);
    const tags = await tagRes.json();
    const model = process.env.EMBED_MODEL || 'nomic-embed-text';
    const hasModel = tags.models?.some(m => m.name.startsWith(model));
    if (!hasModel) {
        console.log(`Model ${model} belum ada. Pull dulu dengan:\n  ollama pull ${model}\n  atau di Docker:\n  docker exec ollama ollama pull ${model}`);
        process.exit(1);
    }
    console.log(`✓ Model ${model} ready`);

    // Load only ids first to avoid holding all text in RAM
    const result = await pool.query(
        `SELECT id, original_name FROM knowledge_files
         WHERE extracted_text IS NOT NULL AND length(extracted_text) > 50
         ORDER BY id`
    );
    const files = result.rows;
    console.log(`Total file: ${files.length}`);

    let ok = 0, skip = 0, fail = 0;

    for (const file of files) {
        // Skip jika sudah ada chunks
        const existing = await pool.query(
            'SELECT COUNT(*) as c FROM knowledge_chunks WHERE file_id = $1', [file.id]
        );
        if (parseInt(existing.rows[0].c) > 0) {
            skip++;
            continue;
        }

        try {
            // Load text per-file to avoid holding all text in RAM
            const textRow = await pool.query(
                'SELECT extracted_text FROM knowledge_files WHERE id = $1', [file.id]
            );
            const extracted_text = textRow.rows[0]?.extracted_text || '';
            const chunks = chunkText(extracted_text);
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (let i = 0; i < chunks.length; i++) {
                    const vector = await embedText(chunks[i].text);
                    await client.query(
                        `INSERT INTO knowledge_chunks (file_id, chunk_index, chunk_text, embedding)
                         VALUES ($1, $2, $3, $4)`,
                        [file.id, i, chunks[i].text, JSON.stringify(vector)]
                    );
                }
                await client.query('COMMIT');
                ok++;
                process.stdout.write(`\r  ${ok} done, ${skip} skipped, ${fail} failed — ${file.original_name.slice(0, 40)}`);
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } catch (e) {
            console.log(`\n  ERROR: ${file.original_name} - ${e.message}`);
            fail++;
        }
    }

    console.log(`\n\nSelesai. Done: ${ok} | Skipped: ${skip} | Failed: ${fail}`);
    await pool.end();
})();

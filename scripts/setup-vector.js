#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: true });
const pool = require('../src/database/db');

(async () => {
    console.log('Setting up pgvector...');
    try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
        console.log('✓ pgvector extension ready');
    } catch (e) {
        console.error('✗ pgvector not available:', e.message);
        console.error('  Install with: sudo apt install postgresql-18-pgvector');
        process.exit(1);
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id          SERIAL PRIMARY KEY,
            file_id     INTEGER NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            chunk_text  TEXT NOT NULL,
            embedding   vector(768),
            created_at  TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    console.log('✓ knowledge_chunks table ready');

    await pool.query(`
        CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
        ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 50)
    `);
    console.log('✓ vector index ready');

    await pool.query(`
        CREATE INDEX IF NOT EXISTS knowledge_chunks_file_idx
        ON knowledge_chunks (file_id)
    `);
    console.log('✓ file index ready');

    console.log('\nSetup selesai. Jalankan scripts/embed-all.js untuk generate embeddings.');
    await pool.end();
})();

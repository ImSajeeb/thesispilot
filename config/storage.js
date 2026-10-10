const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_BUCKET || 'thesis-documents';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment configuration.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
});

function normalizeObjectPath(databasePath) {
    if (typeof databasePath !== 'string') return null;
    const normalized = databasePath.replace(/^\/+/, '');
    if (!normalized.startsWith('uploads/')) return null;
    if (normalized.split('/').some(part => !part || part === '.' || part === '..')) return null;
    return normalized;
}

async function uploadDocument({ folder, filename, buffer, contentType }) {
    if (!['proposals', 'finals', 'feedback'].includes(folder)) {
        throw new Error('Unsupported document folder.');
    }
    if (!filename || !/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes('..')) {
        throw new Error('Invalid document filename.');
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('The uploaded document is empty or invalid.');
    }

    const objectPath = `uploads/${folder}/${filename}`;
    const { error } = await supabase.storage.from(bucket).upload(objectPath, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: false
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return `/${objectPath}`;
}

async function createDocumentUrl(databasePath, expiresIn = 300) {
    const objectPath = normalizeObjectPath(databasePath);
    if (!objectPath) throw new Error('Invalid document path.');
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, expiresIn);
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not create a document access link.');
    return data.signedUrl;
}

async function removeDocument(databasePath) {
    const objectPath = normalizeObjectPath(databasePath);
    if (!objectPath) return;
    const { error } = await supabase.storage.from(bucket).remove([objectPath]);
    if (error) console.error('Supabase cleanup warning:', error.message);
}

module.exports = { uploadDocument, createDocumentUrl, removeDocument };

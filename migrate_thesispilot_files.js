
/**
 * ThesisPilot file migration to Supabase Storage.
 * Run from the project root:
 *   node migrate_thesispilot_files.js
 *
 * This script does NOT modify MySQL or delete local files.
 * Zero-byte files are skipped for manual review.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT = process.cwd();
const UPLOADS = path.join(ROOT, 'public', 'uploads');
const BUCKET = process.env.SUPABASE_BUCKET || 'thesis-documents';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  process.exit(1);
}

if (!fs.existsSync(UPLOADS)) {
  console.error('Uploads folder not found:', UPLOADS);
  console.error('Run this script from the ThesisPilot project root.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function getFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory()
        ? getFiles(fullPath)
        : [fullPath];
    });
}

function getContentType(file) {
  const ext = path.extname(file).toLowerCase();

  const types = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.zip': 'application/zip'
  };

  return types[ext] || 'application/octet-stream';
}

async function main() {
  const files = getFiles(UPLOADS);

  let uploaded = 0;
  let empty = 0;
  let existing = 0;
  let failed = 0;

  console.log(`Found ${files.length} files.`);
  console.log(`Supabase bucket: ${BUCKET}`);

  for (const file of files) {
    const stat = fs.statSync(file);

    // Example: uploads/proposals/file-123.pdf
    const objectPath = path.relative(
      path.join(ROOT, 'public'),
      file
    ).split(path.sep).join('/');

    if (stat.size === 0) {
      console.log(`[EMPTY - SKIPPED] ${objectPath}`);
      empty++;
      continue;
    }

    const folder = path.posix.dirname(objectPath);
    const filename = path.posix.basename(objectPath);

    // Check whether this object already exists.
    const { data: objects, error: listError } =
      await supabase.storage
        .from(BUCKET)
        .list(folder, {
          search: filename,
          limit: 100
        });

    if (listError) {
      console.error(
        `[CHECK FAILED] ${objectPath}: ${listError.message}`
      );
      failed++;
      continue;
    }

    if ((objects || []).some(item => item.name === filename)) {
      console.log(`[EXISTS - SKIPPED] ${objectPath}`);
      existing++;
      continue;
    }

    try {
      const buffer = fs.readFileSync(file);

      const { error: uploadError } =
        await supabase.storage
          .from(BUCKET)
          .upload(objectPath, buffer, {
            contentType: getContentType(file),
            upsert: false,
            cacheControl: '3600'
          });

      if (uploadError) {
        console.error(
          `[UPLOAD FAILED] ${objectPath}: ${uploadError.message}`
        );
        failed++;
        continue;
      }

      console.log(
        `[UPLOADED] ${objectPath} (${stat.size} bytes)`
      );
      uploaded++;
    } catch (err) {
      console.error(
        `[ERROR] ${objectPath}: ${err.message}`
      );
      failed++;
    }
  }

  console.log('\n===== MIGRATION SUMMARY =====');
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Already existed: ${existing}`);
  console.log(`Zero-byte files skipped: ${empty}`);
  console.log(`Failed: ${failed}`);
  console.log('Local files and MySQL were not changed.');

  if (failed > 0) {
    process.exitCode = 2;
  }
}

main().catch(err => {
  console.error('Migration stopped:', err.message);
  process.exit(1);
});

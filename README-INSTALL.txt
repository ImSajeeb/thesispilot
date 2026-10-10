THESISPILOT - PRIVATE SUPABASE DOCUMENT STORAGE PATCH

WHAT THIS PATCH DOES
- Uploads new proposal, final thesis, and supervisor feedback documents to your private Supabase Storage bucket.
- Uses in-memory Multer uploads (no new document copies are written to public/uploads).
- Preserves the existing MySQL file path format (/uploads/<folder>/<filename>).
- Replaces direct public links with /files links that check student/supervisor authorization and create a 5-minute signed URL.
- Blocks direct access to /uploads through Express static hosting.
- Does not migrate, delete, or modify existing local files.

BACK UP FIRST
1. Back up your project folder and database before replacing files.
2. Do not delete public/uploads. Keep it until you verify every document and all workflows.

COPY FILES INTO YOUR PROJECT ROOT
Copy each file/folder from this patch to the same relative path in your ThesisPilot project, overwriting only the matching files:
- app.js
- config/storage.js (new)
- middleware/upload.js
- routes/student.js
- routes/files.js (new)
- controllers/studentController.js
- controllers/supervisorController.js
- views/student/dashboard.ejs
- views/supervisor/review.ejs

DEPENDENCY
From the project root run:
  npm install @supabase/supabase-js

ENVIRONMENT
Make sure .env contains the following (values should remain private):
  SUPABASE_URL=your_project_url
  SUPABASE_SECRET_KEY=your_secret_key
  SUPABASE_BUCKET=thesis-documents

Use the exact bucket name you created. The bucket must remain PRIVATE. Do not add the secret key to Git or frontend JavaScript.

TEST IN THIS ORDER
1. Start the app and log in as a student. Submit a test proposal PDF.
2. Confirm a new object appears under uploads/proposals in the private bucket.
3. Open it from the student dashboard and confirm the link redirects to the document.
4. Log in as the assigned supervisor. Open the proposal and upload a small feedback PDF.
5. Confirm it appears under uploads/feedback and the student can open it.
6. Approve the proposal, then test a final PDF under uploads/finals.
7. While logged in as a different student, try the same /files/... URL; access should be denied.
8. Try visiting /uploads/... directly; it should return 404.

MIGRATION NOTES
- Previously migrated non-empty objects should work if their object paths match the database paths.
- Seven zero-byte files were skipped by your earlier migration. A protected link for one of those files will show a clear unavailable message. Do not delete local files until you've resolved these records.
- This patch does not add file links to chairman/admin pages; access is restricted to students and assigned supervisors for now.
- Signed links expire after 5 minutes.

IMPORTANT
Review the final deployment's session configuration and SESSION_SECRET separately before public deployment. This patch does not change session storage or deployment hosting settings.

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const studentController = require('../controllers/studentController');
const { ensureAuthenticated, isRole } = require('../middleware/auth');

// Keep uploaded PDFs in memory; controllers send them directly to private Supabase Storage.
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.pdf' && file.mimetype === 'application/pdf') return cb(null, true);
    return cb(new Error('Only PDF files are allowed.'), false);
};
const uploadOptions = { storage, fileFilter, limits: { fileSize: 15 * 1024 * 1024, files: 1 } };
const uploadProposal = multer(uploadOptions);
const uploadFinal = multer(uploadOptions);

// Apply middleware using your exact function names
router.use(ensureAuthenticated);
router.use(isRole(['student']));

// ==========================================
// DASHBOARD & PROPOSALS
// ==========================================
router.get('/dashboard', studentController.dashboard);
router.post('/proposal', uploadProposal.single('proposalDocument'), studentController.submitProposal);
router.post('/final', uploadFinal.single('finalDocument'), studentController.uploadFinalThesis);

// ==========================================
// SUPERVISOR PREFERENCES
// ==========================================
router.get('/preferences', studentController.getSupervisorPreferences);
router.post('/preferences/save', studentController.saveSupervisorPreferences);



module.exports = router;
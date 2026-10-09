const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const studentController = require('../controllers/studentController');
const { ensureAuthenticated, isRole } = require('../middleware/auth');

// Ensure upload directories exist
const proposalDir = path.join(__dirname, '../public/uploads/proposals');
const finalDir = path.join(__dirname, '../public/uploads/finals');
if (!fs.existsSync(proposalDir)) fs.mkdirSync(proposalDir, { recursive: true });
if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

// Multer storage for Proposals
const storageProposal = multer.diskStorage({
    destination: (req, file, cb) => cb(null, proposalDir),
    filename: (req, file, cb) => {
        cb(null, 'proposal-' + req.session.user.id + '-' + Date.now() + path.extname(file.originalname));
    }
});

// Multer storage for Final Theses
const storageFinal = multer.diskStorage({
    destination: (req, file, cb) => cb(null, finalDir),
    filename: (req, file, cb) => {
        cb(null, 'final-' + req.session.user.id + '-' + Date.now() + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed!'), false);
};

const uploadProposal = multer({ storage: storageProposal, fileFilter });
const uploadFinal = multer({ storage: storageFinal, fileFilter });

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
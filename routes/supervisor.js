const express = require('express');
const router = express.Router();
const supervisorController = require('../controllers/supervisorController');
const { ensureAuthenticated, isRole } = require('../middleware/auth');
const upload = require('../middleware/upload'); 

// Global middleware for all supervisor routes
router.use(ensureAuthenticated);
router.use(isRole(['supervisor']));

// Dashboard
router.get('/dashboard', supervisorController.dashboard);

// Proposal & Thesis Review
router.get('/thesis/:id/review', supervisorController.reviewThesis);
router.post('/thesis/:id/review', upload.single('feedback_file'), supervisorController.submitReview);
router.post('/thesis/:id/evaluate', supervisorController.evaluateThesis);

// Supervisor Initiating a Swap / Transfer
router.get('/swap', supervisorController.getSwapForm);
router.post('/swap', supervisorController.submitSwapRequest);

// Supervisor Approving/Rejecting Swaps (The New Workflow)
router.get('/swap-approvals', supervisorController.getSwapApprovals);
router.post('/swap-approvals/decide', supervisorController.decideSwapApproval);
router.post('/swap-approvals/cancel', supervisorController.cancelSwapRequest);

module.exports = router;
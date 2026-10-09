const express = require('express');
const router = express.Router();
const multer = require('multer');
const chairmanController = require('../controllers/chairmanController');
const { ensureAuthenticated, isRole } = require('../middleware/auth');

// Setup multer for temporary file storage (MUST BE DECLARED BEFORE ROUTES)
const upload = multer({ dest: 'public/uploads/csv/' });

router.use(ensureAuthenticated);
router.use(isRole(['chairman']));

// ========================================
// DASHBOARD & USERS
// ========================================
router.get('/dashboard', chairmanController.dashboard);
router.get('/users', chairmanController.getUsers);
router.post('/users/create', chairmanController.createUser);
router.post('/users/bulk-upload', upload.single('file'), chairmanController.bulkUploadUsers);

// ========================================
// SUPERVISOR MANAGEMENT
// ========================================
router.get('/supervisors', chairmanController.getSupervisors);
router.post('/supervisors/create', chairmanController.createSupervisor);
router.post('/supervisors/:id/update', chairmanController.updateSupervisor);
router.post('/supervisors/:id/toggle-status', chairmanController.toggleSupervisorStatus);
router.post('/supervisors/:id/toggle-availability', chairmanController.toggleSupervisorAvailability);
router.post('/supervisors/capacity', chairmanController.setSupervisorCapacity);

// ========================================
// STUDENT MANAGEMENT
// ========================================
router.get('/students', chairmanController.getStudents);
router.post('/students/create', chairmanController.createStudent);
router.post('/students/bulk-upload', upload.single('studentCsv'), chairmanController.bulkUploadStudents);

// ========================================
// STUDENT APPROVAL MANAGEMENT
// ========================================
router.get('/pending-students', chairmanController.getPendingStudents);
router.post('/students/:id/approve', chairmanController.approveStudent);
router.post('/students/:id/reject', chairmanController.rejectStudent);

// ========================================
// ALLOCATION MANAGEMENT
// ========================================
router.get('/allocation', chairmanController.getAllocationCenter);
router.post('/allocation/open', chairmanController.openAllocation);
router.post('/allocation/participants', chairmanController.saveAllocationParticipants);
router.post('/allocation/generate-preview', chairmanController.generateAllocationPreview);
router.post('/allocation/confirm', chairmanController.confirmAllocation);
router.post('/allocation/lock', chairmanController.lockAllocation);
router.post('/allocation/manual', chairmanController.manualAllocateStudent);

// --- ROUTES FOR VIEWING ALL ALLOCATIONS ---
router.get('/allocations', chairmanController.getAllocations);

// ========================================
// CAPACITIES & LOTTERY (Legacy/Alternative)
// ========================================
router.get('/capacities', chairmanController.getCapacities);
router.post('/capacities/set', chairmanController.setCapacity);
router.get('/lottery', chairmanController.getLotteryPage);
router.post('/lottery/run', chairmanController.runLottery);

// ========================================
// SWAPS
// ========================================
router.get('/swaps', chairmanController.getSwaps);
router.post('/swaps/decide', chairmanController.decideSwap);

router.post('/allocation/discard', chairmanController.discardPreview);

router.get('/theses', chairmanController.getTheses);
router.post('/sessions/set-active', chairmanController.setActiveSession);

router.post('/profile/update-password', chairmanController.updatePassword);

module.exports = router;
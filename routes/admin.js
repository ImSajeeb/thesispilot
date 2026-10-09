const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { ensureAuthenticated, isAdmin } = require('../middleware/auth');

// ============================================================
// ALL ADMIN ROUTES
// ============================================================
router.use(ensureAuthenticated, isAdmin);

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard', adminController.dashboard);

// ============================================================
// DEPARTMENTS
// ============================================================
router.get('/departments', adminController.departments);
router.post('/departments/create', adminController.createDepartment);
router.post('/departments/:id/update', adminController.updateDepartment);
router.post('/departments/:id/toggle-status', adminController.toggleDepartmentStatus);

// ============================================================
// ACADEMIC SESSIONS
// ============================================================
router.get('/sessions', adminController.sessions);
router.post('/sessions/create', adminController.createSession);
router.post('/sessions/:id/update', adminController.updateSession);
router.post('/sessions/:id/toggle-status', adminController.toggleSessionStatus);

// ============================================================
// CHAIRMEN
// ============================================================
router.get('/chairmen', adminController.chairmen);
router.post('/chairmen/create', adminController.createChairman);
router.post('/chairmen/:id/update', adminController.updateChairman);
router.post('/chairmen/:id/toggle-status', adminController.toggleChairmanStatus);
router.post('/chairmen/:id/replace', adminController.replaceChairman);

// ============================================================
// GLOBAL SUPERVISOR MANAGEMENT (NEW)
// ============================================================
router.get('/supervisors', adminController.getSupervisors);
router.post('/supervisors/create', adminController.createSupervisor);
router.post('/supervisors/:id/delete', adminController.deleteSupervisor);

// ============================================================
// GLOBAL STUDENT MANAGEMENT (NEW)
// ============================================================
router.get('/students', adminController.getStudents);
router.post('/students/:id/delete', adminController.deleteStudent);

// ============================================================
// GLOBAL SUPERVISOR MANAGEMENT (NEW)
// ============================================================
router.get('/supervisors', adminController.getSupervisors);
router.post('/supervisors/create', adminController.createSupervisor);
router.post('/supervisors/:id/update', adminController.updateSupervisor); // NEW
router.post('/supervisors/:id/toggle-status', adminController.toggleSupervisorStatus); // NEW
router.post('/supervisors/:id/delete', adminController.deleteSupervisor);

// ============================================================
// DEPARTMENTS
// ============================================================
router.get('/departments', adminController.departments);
router.post('/departments/create', adminController.createDepartment);
router.post('/departments/:id/update', adminController.updateDepartment);
router.post('/departments/:id/toggle-status', adminController.toggleDepartmentStatus);
router.post('/departments/:id/delete', adminController.deleteDepartment); // NEW

// ============================================================
// ACADEMIC SESSIONS
// ============================================================
router.get('/sessions', adminController.sessions);
router.post('/sessions/create', adminController.createSession);
router.post('/sessions/:id/update', adminController.updateSession);
router.post('/sessions/:id/toggle-status', adminController.toggleSessionStatus);
router.post('/sessions/:id/delete', adminController.deleteSession); // NEW

// ============================================================
// GLOBAL STUDENT MANAGEMENT
// ============================================================
router.get('/students', adminController.getStudents);
router.post('/students/:id/update', adminController.updateStudent); // NEW
router.post('/students/:id/delete', adminController.deleteStudent);

// Account Management Routes
router.post('/users/:id/reactivate', adminController.reactivateAccount);
router.post('/users/:id/hard-delete', adminController.hardDeleteAccount);

// routes/admin.js
router.post('/users/:id/reset-password', adminController.forceResetPassword);

module.exports = router;
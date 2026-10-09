const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');


// Login page
router.get('/login', (req, res) => {

    if (req.session.user) {
        return res.redirect(
            `/${req.session.user.role}/dashboard`
        );
    }

    res.render('auth/login');
});


// Login
router.post('/login', authController.login);


// Logout
router.get('/logout', authController.logout);

router.get(
    '/register',
    authController.getStudentRegistration
);

router.post(
    '/register',
    authController.registerStudent
);

router.get(
    '/verify-email/:token',
    authController.verifyEmail
);
// ... existing routes ...

// GET verification page
router.get('/verify-email', authController.getVerifyEmail);

// POST verification submission
router.post('/verify-email', authController.submitVerifyEmail);

// Forgot Password Flow (Students Only)
router.get('/forgot-password', authController.getForgotPassword);
router.post('/forgot-password', authController.submitForgotPassword);

router.get('/reset-otp', authController.getResetOtp);
router.post('/reset-otp', authController.submitResetOtp);

router.get('/reset-password', authController.getResetPassword);
router.post('/reset-password', authController.submitResetPassword);

module.exports = router;
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const nodemailer = require('nodemailer');

const transporter = require('../config/mailer');
exports.login = async (req, res) => {

    const { email, password } = req.body;

    try {

        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ? LIMIT 1',
            [email.trim().toLowerCase()]
        );

        if (users.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/auth/login');
        }

        const user = users[0];

        // Email verification check
        if (!user.is_verified) {
            req.flash(
                'error',
                'Your email address has not been verified yet.'
            );
            return res.redirect('/auth/login');
        }

        // Account status check
        if (user.account_status !== 'active') {

            if (user.account_status === 'pending') {
                req.flash(
                    'error',
                    'Your account is still pending approval.'
                );
            } else if (user.account_status === 'disabled') {
                req.flash(
                    'error',
                    'Your account has been disabled.'
                );
            } else if (user.account_status === 'suspended') {
                req.flash(
                    'error',
                    'Your account has been suspended.'
                );
            } else {
                req.flash(
                    'error',
                    'Your account is not currently active.'
                );
            }

            return res.redirect('/auth/login');
        }

        // Password verification
        const isMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isMatch) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/auth/login');
        }

        // Update last login
        await db.execute(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        // Store only required information in session
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        req.flash(
            'success',
            `Welcome back, ${user.name}!`
        );

        return res.redirect(`/${user.role}/dashboard`);

    } catch (error) {

        console.error('Login error:', error);

        req.flash(
            'error',
            'An error occurred during login.'
        );

        return res.redirect('/auth/login');
    }
};


exports.logout = (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.error('Logout error:', err);
        }

        res.redirect('/auth/login');
    });
};



const crypto = require('crypto');

// ========================================
// STUDENT REGISTRATION FORM
// ========================================

exports.getStudentRegistration = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect(`/${req.session.user.role}/dashboard`);
        }

        const [departments] = await db.execute(
            `
            SELECT id, name, code
            FROM departments
            WHERE status = 'active'
            ORDER BY name ASC
            `
        );

        const [sessions] = await db.execute(
            `
            SELECT
                s.id,
                s.department_id,
                s.session_name,
                s.start_year,
                s.end_year
            FROM academic_sessions s
            INNER JOIN departments d
                ON d.id = s.department_id
            WHERE s.status = 'active'
              AND d.status = 'active'
            ORDER BY s.start_year DESC, s.session_name ASC
            `
        );

        return res.render('auth/register', {
            departments,
            sessions
        });

    } catch (error) {
        console.error('Student registration form error:', error);

        req.flash('error', 'Unable to load registration form.');
        return res.redirect('/auth/login');
    }
};



exports.registerStudent = async (req, res) => {
    try {
        const { name, email, password, confirm_password, student_id, phone, department_id, session_id } = req.body;

        if (password !== confirm_password) {
            req.flash('error', 'Passwords do not match.');
            return res.redirect('/auth/register');
        }

        // Check if email or student ID already exists in DB
        const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        const [existingStudent] = await db.execute('SELECT id FROM student_profiles WHERE student_id = ?', [student_id.trim()]);
        
        if (existingUser.length > 0 || existingStudent.length > 0) {
            req.flash('error', 'An account with this Email or Student ID already exists.');
            return res.redirect('/auth/register');
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedPassword = await bcrypt.hash(password, 12);

        // Store pending registration data and OTP in session (Expires in 10 minutes implicitly via session life, or we enforce it)
        req.session.pendingRegistration = {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            passwordHash: hashedPassword,
            student_id: student_id.trim(),
            phone: phone ? phone.trim() : null,
            department_id,
            session_id
        };
        req.session.registrationOtp = otpCode;

        // Send OTP Email
const mailOptions = {
            from: '"ThesisPilot Security" <your.actual.email@gmail.com>', // MUST exactly match your auth user
            to: req.session.pendingRegistration.email,
            subject: 'ThesisPilot - Verify Your Email',
            // Always include a plain text version for spam filters!
            text: `Hello ${req.session.pendingRegistration.name},\n\nYour 6-digit verification code for ThesisPilot is: ${otpCode}\n\nIf you did not request this, please ignore this email.`,
            // Your existing HTML version
            html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #0f172a;">Verify Your Account</h2>
                    <p style="color: #475569;">Hello ${req.session.pendingRegistration.name},</p>
                    <p style="color: #475569;">Please use the following 6-digit verification code to complete your ThesisPilot registration:</p>
                    <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2563eb; border-radius: 8px; margin: 20px 0;">
                        ${otpCode}
                    </div>
                    <p style="color: #475569; font-size: 0.9em;">If you did not request this, please ignore this email.</p>
                </div>
            `
        };
        
        transporter.sendMail(mailOptions).catch(err => console.error('OTP Email error:', err));

        req.flash('success', 'Verification code sent! Please check your email.');
        res.redirect('/auth/verify-email');

    } catch (error) {
        console.error('Registration error:', error);
        req.flash('error', 'Registration failed. Please try again.');
        res.redirect('/auth/register');
    }
};

// =======================================================
// 2. RENDER OTP VERIFICATION PAGE
// =======================================================
exports.getVerifyEmail = (req, res) => {
    // Prevent access if no pending registration exists
    if (!req.session.pendingRegistration) {
        req.flash('error', 'Your session expired. Please register again.');
        return res.redirect('/auth/register');
    }
    res.render('auth/verify-email', { email: req.session.pendingRegistration.email });
};

// =======================================================
// 3. HANDLE OTP SUBMISSION & CREATE ACCOUNT
// =======================================================
exports.submitVerifyEmail = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.session.pendingRegistration || !req.session.registrationOtp) {
            req.flash('error', 'Session expired. Please register again.');
            return res.redirect('/auth/register');
        }

        if (otp.trim() !== req.session.registrationOtp) {
            req.flash('error', 'Invalid verification code. Please try again.');
            return res.redirect('/auth/verify-email');
        }

        // OTP is correct! Now save the user to the database
        // OTP is correct! Now save the user to the database
        const data = req.session.pendingRegistration;
        
        // ADDED PRE-CHECK: Validate session belongs to the selected department
        const [validSession] = await db.execute(
            `SELECT id FROM academic_sessions WHERE id = ? AND department_id = ? AND status = 'active' LIMIT 1`,
            [data.session_id, data.department_id]
        );

        if (validSession.length === 0) {
            req.flash('error', 'The selected academic session is invalid or does not belong to your department.');
            return res.redirect('/auth/register');
        }



        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Create User
            const [userResult] = await connection.execute(`
                INSERT INTO users (name, email, password_hash, role, account_status, is_verified) 
                VALUES (?, ?, ?, 'student', 'active', 1)
            `, [data.name, data.email, data.passwordHash]);

            // 2. Create Student Profile (Pending Chairman Approval)
            await connection.execute(`
                INSERT INTO student_profiles (user_id, department_id, session_id, student_id, phone, registration_status) 
                VALUES (?, ?, ?, ?, ?, 'pending')
            `, [userResult.insertId, data.department_id, data.session_id, data.student_id, data.phone]);

            await connection.commit();
        } catch (dbErr) {
            await connection.rollback();
            throw dbErr;
        } finally {
            connection.release();
        }

        // Clear session data
        delete req.session.pendingRegistration;
        delete req.session.registrationOtp;

        req.flash('success', 'Email verified successfully! Your account is now pending Chairman approval.');
        res.redirect('/auth/login');

    } catch (error) {
        console.error('OTP Verification error:', error);
        req.flash('error', 'Failed to verify account.');
        res.redirect('/auth/verify-email');
    }
};

// ========================================
// EMAIL VERIFICATION
// ========================================

exports.verifyEmail = async (req, res) => {

    const { token } = req.params;

    try {

        if (!token) {
            req.flash('error', 'Invalid verification link.');
            return res.redirect('/auth/login');
        }

        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const [tokens] = await db.execute(
            `
            SELECT
                id,
                user_id,
                expires_at,
                verified_at
            FROM email_verification_tokens
            WHERE token_hash = ?
            LIMIT 1
            `,
            [tokenHash]
        );

        if (tokens.length === 0) {
            req.flash(
                'error',
                'Invalid or expired verification link.'
            );

            return res.redirect('/auth/login');
        }

        const verification = tokens[0];

        if (verification.verified_at) {
            req.flash(
                'success',
                'Your email has already been verified.'
            );

            return res.redirect('/auth/login');
        }

        if (new Date(verification.expires_at) < new Date()) {
            req.flash(
                'error',
                'This verification link has expired.'
            );

            return res.redirect('/auth/login');
        }

        // Verify user
        await db.execute(
            `
            UPDATE users
            SET is_verified = TRUE
            WHERE id = ?
            `,
            [verification.user_id]
        );

        // Mark token as used
        await db.execute(
            `
            UPDATE email_verification_tokens
            SET verified_at = NOW()
            WHERE id = ?
            `,
            [verification.id]
        );

        req.flash(
            'success',
            'Email verified successfully. Your account is now waiting for Chairman approval.'
        );

        return res.redirect('/auth/login');

    } catch (error) {

        console.error('Email verification error:', error);

        req.flash(
            'error',
            'Unable to verify your email.'
        );

        return res.redirect('/auth/login');
    }
};


// =======================================================
// FORGOT PASSWORD FLOW
// =======================================================

exports.getForgotPassword = (req, res) => {
    res.render('auth/forgot-password');
};

exports.submitForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email.trim().toLowerCase();

        // Check if a STUDENT account exists with this email
        const [users] = await db.execute('SELECT id, name FROM users WHERE email = ? AND role = "student" LIMIT 1', [normalizedEmail]);
        
        if (users.length === 0) {
            req.flash('error', 'No student account found with that email address.');
            return res.redirect('/auth/forgot-password');
        }

        const user = users[0];
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Save to session
        req.session.resetEmail = normalizedEmail;
        req.session.resetOtp = otpCode;
        req.session.resetVerified = false;

        // Send OTP Email
        const mailOptions = {
            from: '"ThesisPilot Security" <your.actual.email@gmail.com>',
            to: normalizedEmail,
            subject: 'ThesisPilot - Password Reset OTP',
            text: `Hello ${user.name},\n\nYour password reset code is: ${otpCode}\n\nIf you did not request this, please ignore this email.`,
            html: `
                <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #0f172a;">Password Reset</h2>
                    <p style="color: #475569;">Hello ${user.name},</p>
                    <p style="color: #475569;">Use the following 6-digit code to reset your password:</p>
                    <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #2563eb; border-radius: 8px;">
                        ${otpCode}
                    </div>
                </div>
            `
        };
        
        transporter.sendMail(mailOptions).catch(err => console.error('Reset OTP Email error:', err));

        req.flash('success', 'Password reset code sent! Please check your email.');
        res.redirect('/auth/reset-otp');

    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error', 'Failed to process request.');
        res.redirect('/auth/forgot-password');
    }
};

exports.getResetOtp = (req, res) => {
    if (!req.session.resetEmail || !req.session.resetOtp) {
        req.flash('error', 'Session expired. Please request a new password reset.');
        return res.redirect('/auth/forgot-password');
    }
    res.render('auth/reset-otp', { email: req.session.resetEmail });
};

exports.submitResetOtp = (req, res) => {
    const { otp } = req.body;
    
    if (!req.session.resetOtp) {
        req.flash('error', 'Session expired. Please request a new password reset.');
        return res.redirect('/auth/forgot-password');
    }

    if (otp.trim() !== req.session.resetOtp) {
        req.flash('error', 'Invalid verification code. Please try again.');
        return res.redirect('/auth/reset-otp');
    }

    // Mark as verified
    req.session.resetVerified = true;
    res.redirect('/auth/reset-password');
};

exports.getResetPassword = (req, res) => {
    if (!req.session.resetVerified) {
        req.flash('error', 'Please verify your OTP code first.');
        return res.redirect('/auth/reset-otp');
    }
    res.render('auth/reset-password');
};

exports.submitResetPassword = async (req, res) => {
    try {
        if (!req.session.resetVerified || !req.session.resetEmail) {
            req.flash('error', 'Session expired. Please start over.');
            return res.redirect('/auth/forgot-password');
        }

        const { password, confirm_password } = req.body;

        if (password !== confirm_password) {
            req.flash('error', 'Passwords do not match.');
            return res.redirect('/auth/reset-password');
        }

        if (password.length < 4) {
            req.flash('error', 'Password must be at least 4 characters long.');
            return res.redirect('/auth/reset-password');
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Update database
        await db.execute('UPDATE users SET password_hash = ? WHERE email = ? AND role = "student"', [hashedPassword, req.session.resetEmail]);

        // Clear session securely
        delete req.session.resetEmail;
        delete req.session.resetOtp;
        delete req.session.resetVerified;

        req.flash('success', 'Password reset successfully! You can now log in.');
        res.redirect('/auth/login');

    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error', 'Failed to reset password.');
        res.redirect('/auth/reset-password');
    }
};
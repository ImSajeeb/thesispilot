
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const transporter = require('../config/mailer');
const crypto = require('crypto');

// ========================================
// LOGIN
// ========================================

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

        if (!user.is_verified) {
            req.flash(
                'error',
                'Your email address has not been verified yet.'
            );
            return res.redirect('/auth/login');
        }

        if (user.account_status !== 'active') {
            if (user.account_status === 'pending') {
                req.flash('error', 'Your account is still pending approval.');
            } else if (user.account_status === 'disabled') {
                req.flash('error', 'Your account has been disabled.');
            } else if (user.account_status === 'suspended') {
                req.flash('error', 'Your account has been suspended.');
            } else {
                req.flash('error', 'Your account is not currently active.');
            }

            return res.redirect('/auth/login');
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isMatch) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/auth/login');
        }

        await db.execute(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        req.flash('success', `Welcome back, ${user.name}!`);

        return res.redirect(`/${user.role}/dashboard`);

    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'An error occurred during login.');
        return res.redirect('/auth/login');
    }
};

// ========================================
// LOGOUT
// ========================================

exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }

        res.redirect('/auth/login');
    });
};

// ========================================
// STUDENT REGISTRATION FORM
// ========================================

exports.getStudentRegistration = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect(`/${req.session.user.role}/dashboard`);
        }

        const [departments] = await db.execute(
            `SELECT id, name, code
             FROM departments
             WHERE status = 'active'
             ORDER BY name ASC`
        );

        const [sessions] = await db.execute(
            `SELECT
                s.id,
                s.department_id,
                s.session_name,
                s.start_year,
                s.end_year
             FROM academic_sessions s
             INNER JOIN departments d ON d.id = s.department_id
             WHERE s.status = 'active'
               AND d.status = 'active'
             ORDER BY s.start_year DESC, s.session_name ASC`
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

// ========================================
// STUDENT REGISTRATION
// ========================================

exports.registerStudent = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            confirm_password,
            student_id,
            phone,
            department_id,
            session_id
        } = req.body;

        if (password !== confirm_password) {
            req.flash('error', 'Passwords do not match.');
            return res.redirect('/auth/register');
        }

        const normalizedEmail = email.trim().toLowerCase();

        const [existingUser] = await db.execute(
            'SELECT id FROM users WHERE email = ?',
            [normalizedEmail]
        );

        const [existingStudent] = await db.execute(
            'SELECT id FROM student_profiles WHERE student_id = ?',
            [student_id.trim()]
        );

        if (existingUser.length > 0 || existingStudent.length > 0) {
            req.flash(
                'error',
                'An account with this Email or Student ID already exists.'
            );
            return res.redirect('/auth/register');
        }

        const otpCode = crypto.randomInt(100000, 1000000).toString();
        const hashedPassword = await bcrypt.hash(password, 12);

        req.session.pendingRegistration = {
            name: name.trim(),
            email: normalizedEmail,
            passwordHash: hashedPassword,
            student_id: student_id.trim(),
            phone: phone ? phone.trim() : null,
            department_id,
            session_id
        };

        req.session.registrationOtp = otpCode;

        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: normalizedEmail,
            subject: 'ThesisPilot - Verify Your Email',
            text: `Hello ${name.trim()},

Your 6-digit verification code for ThesisPilot is: ${otpCode}

If you did not request this, please ignore this email.`,
            html: `
                <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
                    <h2>Verify Your Account</h2>
                    <p>Hello ${name.trim()},</p>
                    <p>Your ThesisPilot verification code is:</p>
                    <div style="padding:15px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:5px">
                        ${otpCode}
                    </div>
                    <p>If you did not request this, please ignore this email.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        req.flash(
            'success',
            'Verification code sent! Please check your email.'
        );

        return res.redirect('/auth/verify-email');

    } catch (error) {
        console.error('Registration error:', error);
        req.flash('error', 'Registration failed. Please try again.');
        return res.redirect('/auth/register');
    }
};

// ========================================
// EMAIL VERIFICATION PAGE
// ========================================

exports.getVerifyEmail = (req, res) => {
    if (!req.session.pendingRegistration) {
        req.flash('error', 'Your session expired. Please register again.');
        return res.redirect('/auth/register');
    }

    return res.render('auth/verify-email', {
        email: req.session.pendingRegistration.email
    });
};

// ========================================
// VERIFY REGISTRATION OTP
// ========================================

exports.submitVerifyEmail = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.session.pendingRegistration ||
            !req.session.registrationOtp) {
            req.flash('error', 'Session expired. Please register again.');
            return res.redirect('/auth/register');
        }

        if (!otp || otp.trim() !== req.session.registrationOtp) {
            req.flash('error', 'Invalid verification code. Please try again.');
            return res.redirect('/auth/verify-email');
        }

        const data = req.session.pendingRegistration;

        const [validSession] = await db.execute(
            `SELECT id
             FROM academic_sessions
             WHERE id = ?
               AND department_id = ?
               AND status = 'active'
             LIMIT 1`,
            [data.session_id, data.department_id]
        );

        if (validSession.length === 0) {
            req.flash(
                'error',
                'The selected academic session is invalid or does not belong to your department.'
            );
            return res.redirect('/auth/register');
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [userResult] = await connection.execute(
                `INSERT INTO users
                    (name, email, password_hash, role, account_status, is_verified)
                 VALUES (?, ?, ?, 'student', 'active', 1)`,
                [data.name, data.email, data.passwordHash]
            );

            await connection.execute(
                `INSERT INTO student_profiles
                    (user_id, department_id, session_id, student_id, phone, registration_status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [
                    userResult.insertId,
                    data.department_id,
                    data.session_id,
                    data.student_id,
                    data.phone
                ]
            );

            await connection.commit();

        } catch (dbErr) {
            await connection.rollback();
            throw dbErr;

        } finally {
            connection.release();
        }

        delete req.session.pendingRegistration;
        delete req.session.registrationOtp;

        req.flash(
            'success',
            'Email verified successfully! Your account is now pending Chairman approval.'
        );

        return res.redirect('/auth/login');

    } catch (error) {
        console.error('OTP Verification error:', error);
        req.flash('error', 'Failed to verify account.');
        return res.redirect('/auth/verify-email');
    }
};

// ========================================
// EMAIL VERIFICATION LINK
// ========================================

exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            req.flash('error', 'Invalid verification link.');
            return res.redirect('/auth/login');
        }

        const tokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const [tokens] = await db.execute(
            `SELECT id, user_id, expires_at, verified_at
             FROM email_verification_tokens
             WHERE token_hash = ?
             LIMIT 1`,
            [tokenHash]
        );

        if (tokens.length === 0) {
            req.flash('error', 'Invalid or expired verification link.');
            return res.redirect('/auth/login');
        }

        const verification = tokens[0];

        if (verification.verified_at) {
            req.flash('success', 'Your email has already been verified.');
            return res.redirect('/auth/login');
        }

        if (new Date(verification.expires_at) < new Date()) {
            req.flash('error', 'This verification link has expired.');
            return res.redirect('/auth/login');
        }

        await db.execute(
            'UPDATE users SET is_verified = TRUE WHERE id = ?',
            [verification.user_id]
        );

        await db.execute(
            'UPDATE email_verification_tokens SET verified_at = NOW() WHERE id = ?',
            [verification.id]
        );

        req.flash(
            'success',
            'Email verified successfully. Your account is now waiting for Chairman approval.'
        );

        return res.redirect('/auth/login');

    } catch (error) {
        console.error('Email verification error:', error);
        req.flash('error', 'Unable to verify your email.');
        return res.redirect('/auth/login');
    }
};

// ========================================
// FORGOT PASSWORD PAGE
// ========================================

exports.getForgotPassword = (req, res) => {
    return res.render('auth/forgot-password');
};

// ========================================
// SUBMIT FORGOT PASSWORD REQUEST
// ========================================

exports.submitForgotPassword = async (req, res) => {
    try {
        const normalizedEmail = String(req.body.email || '')
            .trim()
            .toLowerCase();

        if (!normalizedEmail) {
            req.flash('error', 'Please enter your email address.');
            return res.redirect('/auth/forgot-password');
        }

        // Parameterized role value fixes the SQL error seen on Render.
        const [users] = await db.execute(
            'SELECT id, name FROM users WHERE email = ? AND role = ? LIMIT 1',
            [normalizedEmail, 'student']
        );

        if (users.length === 0) {
            req.flash(
                'error',
                'No student account found with that email address.'
            );
            return res.redirect('/auth/forgot-password');
        }

        const user = users[0];
        const otpCode = crypto.randomInt(100000, 1000000).toString();

        req.session.resetEmail = normalizedEmail;
        req.session.resetOtp = otpCode;
        req.session.resetVerified = false;
        req.session.resetOtpExpiresAt = Date.now() + 10 * 60 * 1000;

        const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: normalizedEmail,
            subject: 'ThesisPilot - Password Reset OTP',
            text: `Hello ${user.name},

Your password reset code is: ${otpCode}

This code expires in 10 minutes. If you did not request this, please ignore this email.`,
            html: `
                <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:20px">
                    <h2>Password Reset</h2>
                    <p>Hello ${user.name},</p>
                    <p>Use this six-digit code to reset your password:</p>
                    <div style="padding:15px;text-align:center;font-size:24px;font-weight:bold;letter-spacing:5px">
                        ${otpCode}
                    </div>
                    <p>This code expires in 10 minutes.</p>
                </div>
            `
        };

        // Await delivery so SMTP failures are visible in Render logs.
        await transporter.sendMail(mailOptions);

        return req.session.save((sessionError) => {
            if (sessionError) {
                console.error('Forgot password session save error:', sessionError);
                req.flash('error', 'Unable to start password reset. Please try again.');
                return res.redirect('/auth/forgot-password');
            }

            req.flash(
                'success',
                'Password reset code sent! Please check your email.'
            );

            return res.redirect('/auth/reset-otp');
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error', 'Failed to process request.');
        return res.redirect('/auth/forgot-password');
    }
};

// ========================================
// RESET OTP PAGE
// ========================================

exports.getResetOtp = (req, res) => {
    if (!req.session.resetEmail || !req.session.resetOtp) {
        req.flash(
            'error',
            'Session expired. Please request a new password reset.'
        );
        return res.redirect('/auth/forgot-password');
    }

    if (req.session.resetOtpExpiresAt &&
        Date.now() > req.session.resetOtpExpiresAt) {
        delete req.session.resetEmail;
        delete req.session.resetOtp;
        delete req.session.resetVerified;
        delete req.session.resetOtpExpiresAt;

        req.flash('error', 'Your reset code has expired. Please request a new one.');
        return res.redirect('/auth/forgot-password');
    }

    return res.render('auth/reset-otp', {
        email: req.session.resetEmail
    });
};

// ========================================
// VERIFY RESET OTP
// ========================================

exports.submitResetOtp = (req, res) => {
    const otp = String(req.body.otp || '').trim();

    if (!req.session.resetOtp || !req.session.resetEmail) {
        req.flash(
            'error',
            'Session expired. Please request a new password reset.'
        );
        return res.redirect('/auth/forgot-password');
    }

    if (req.session.resetOtpExpiresAt &&
        Date.now() > req.session.resetOtpExpiresAt) {
        delete req.session.resetEmail;
        delete req.session.resetOtp;
        delete req.session.resetVerified;
        delete req.session.resetOtpExpiresAt;

        req.flash('error', 'Your reset code has expired. Please request a new one.');
        return res.redirect('/auth/forgot-password');
    }

    if (otp !== req.session.resetOtp) {
        req.flash('error', 'Invalid verification code. Please try again.');
        return res.redirect('/auth/reset-otp');
    }

    req.session.resetVerified = true;

    return req.session.save((err) => {
        if (err) {
            console.error('Reset OTP session save error:', err);
            req.flash('error', 'Unable to verify the code. Please try again.');
            return res.redirect('/auth/reset-otp');
        }

        return res.redirect('/auth/reset-password');
    });
};

// ========================================
// RESET PASSWORD PAGE
// ========================================

exports.getResetPassword = (req, res) => {
    if (!req.session.resetVerified) {
        req.flash('error', 'Please verify your OTP code first.');
        return res.redirect('/auth/reset-otp');
    }

    return res.render('auth/reset-password');
};

// ========================================
// SUBMIT NEW PASSWORD
// ========================================

exports.submitResetPassword = async (req, res) => {
    try {
        if (!req.session.resetVerified || !req.session.resetEmail) {
            req.flash('error', 'Session expired. Please start over.');
            return res.redirect('/auth/forgot-password');
        }

        if (req.session.resetOtpExpiresAt &&
            Date.now() > req.session.resetOtpExpiresAt) {
            delete req.session.resetEmail;
            delete req.session.resetOtp;
            delete req.session.resetVerified;
            delete req.session.resetOtpExpiresAt;

            req.flash('error', 'Your reset code has expired. Please request a new one.');
            return res.redirect('/auth/forgot-password');
        }

        const { password, confirm_password } = req.body;

        if (!password || password !== confirm_password) {
            req.flash('error', 'Passwords do not match.');
            return res.redirect('/auth/reset-password');
        }

        if (password.length < 4) {
            req.flash('error', 'Password must be at least 8 characters long.');
            return res.redirect('/auth/reset-password');
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const resetEmail = req.session.resetEmail;
        const transientDbErrors = new Set([
            'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE',
            'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
            'ER_SERVER_SHUTDOWN', 'ER_CON_COUNT_ERROR'
        ]);

        let updated = false;
        let lastDbError;

        // Retry only this idempotent password update. Reuse the same hash on
        // every attempt, and verify the stored hash if a connection drops.
        for (let attempt = 1; attempt <= 3 && !updated; attempt += 1) {
            try {
                const [result] = await db.execute(
                    'UPDATE users SET password_hash = ? WHERE email = ? AND role = ?',
                    [hashedPassword, resetEmail, 'student']
                );

                if (result.affectedRows === 1) {
                    updated = true;
                    break;
                }

                // MySQL may report zero changed rows if the first attempt
                // already committed before its response was lost.
                const [rows] = await db.execute(
                    'SELECT password_hash FROM users WHERE email = ? AND role = ? LIMIT 1',
                    [resetEmail, 'student']
                );
                updated = rows.length === 1 &&
                    await bcrypt.compare(password, rows[0].password_hash);
                if (!updated) break;
            } catch (error) {
                lastDbError = error;
                if (!transientDbErrors.has(error.code) || attempt === 3) break;

                // The update may have reached MySQL before the connection
                // failed. Check the stored hash before deciding to retry.
                try {
                    const [rows] = await db.execute(
                        'SELECT password_hash FROM users WHERE email = ? AND role = ? LIMIT 1',
                        [resetEmail, 'student']
                    );
                    if (rows.length === 1 && await bcrypt.compare(password, rows[0].password_hash)) {
                        updated = true;
                        break;
                    }
                } catch (verifyError) {
                    lastDbError = verifyError;
                }

                await new Promise((resolve) => setTimeout(resolve, attempt * 750));
            }
        }

        if (!updated) {
            if (lastDbError) {
                console.error('Reset password database update failed:', {
                    code: lastDbError.code || 'UNKNOWN',
                    message: lastDbError.message
                });
                req.flash('error', 'Database is temporarily unavailable. Please try again shortly.');
                return res.redirect('/auth/reset-password');
            }

            req.flash('error', 'Unable to update the student account password. Please request a new reset code if needed.');
            return res.redirect('/auth/forgot-password');
        }

        delete req.session.resetEmail;
        delete req.session.resetOtp;
        delete req.session.resetVerified;
        delete req.session.resetOtpExpiresAt;

        return req.session.save((err) => {
            if (err) {
                console.error('Reset password session cleanup error:', err);
                req.flash('error', 'Password was changed, but the session could not be cleared.');
                return res.redirect('/auth/login');
            }

            req.flash('success', 'Password reset successfully! You can now log in.');
            return res.redirect('/auth/login');
        });

    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error', 'Failed to reset password.');
        return res.redirect('/auth/reset-password');
    }
};

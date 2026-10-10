const db = require('../config/database');
const crypto = require('crypto');
const { uploadDocument, removeDocument } = require('../config/storage');


// DASHBOARD

exports.dashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // 1. Get student profile
        const [profiles] = await db.execute(`
            SELECT id, department_id, session_id, student_id, registration_status
            FROM student_profiles 
            WHERE user_id = ? LIMIT 1
        `, [userId]);

        if (profiles.length === 0) {
            req.flash('error', 'Student profile not found.');
            return res.redirect('/');
        }
        const student = profiles[0];

        // 2. Get authoritative supervisor allocation (INCLUDE 'swapped' status)
        const [allocations] = await db.execute(`
            SELECT a.supervisor_id, a.allocation_status, u.name AS supervisor_name, u.email AS supervisor_email, 
                   sp.supervisor_id AS supervisor_code, sp.designation
            FROM allocations a
            INNER JOIN allocation_runs ar ON a.allocation_run_id = ar.id
            INNER JOIN supervisor_profiles sp ON a.supervisor_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            WHERE a.student_id = ? AND a.allocation_status IN ('allocated', 'swapped') AND ar.status = 'locked'
            ORDER BY a.id DESC LIMIT 1
        `, [student.id]);

        const allocation = allocations.length > 0 ? allocations[0] : null;

        // 3. Check if we need to show a swap notification (Only show ONCE per new supervisor in the session)
        let showSwapNotification = false;
        if (allocation && allocation.allocation_status === 'swapped') {
            // If the session hasn't recorded seeing this specific supervisor swap yet
            if (req.session.notifiedSwapSupervisorId !== allocation.supervisor_id) {
                showSwapNotification = true;
                req.session.notifiedSwapSupervisorId = allocation.supervisor_id; // Mark as seen
            }
        }

        // 4. Get or initialize thesis record
        let [theses] = await db.execute(`
            SELECT * FROM theses WHERE student_id = ? LIMIT 1
        `, [student.id]);

        let thesis = theses.length > 0 ? theses[0] : null;

        // 5. Auto-update thesis status if allocation is locked
        if (allocation && (!thesis || thesis.status === 'registered' || thesis.status === 'pending_allocation')) {
            if (!thesis) {
                await db.execute(`
                    INSERT INTO theses (student_id, session_id, status)
                    VALUES (?, ?, 'supervisor_allocated')
                `, [student.id, student.session_id]);
                
                const [newTheses] = await db.execute(`SELECT * FROM theses WHERE student_id = ? LIMIT 1`, [student.id]);
                thesis = newTheses[0];
            } else {
                await db.execute(`
                    UPDATE theses SET status = 'supervisor_allocated' WHERE id = ?
                `, [thesis.id]);
                thesis.status = 'supervisor_allocated';
            }
        }

        res.render('student/dashboard', {
            student,
            allocation,
            thesis,
            user: req.session.user,
            showSwapNotification // Pass the one-time flag to the view
        });

    } catch (error) {
        console.error('Student dashboard error:', error);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/');
    }
};
// ============================================================
// SUBMIT PROPOSAL (Text + PDF)
// ============================================================
exports.submitProposal = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { title, abstract } = req.body;

        if (!title || !abstract || !req.file) {
            req.flash('error', 'Title, abstract, and a PDF file are all required.');
            return res.redirect('/student/dashboard');
        }

        const [profiles] = await db.execute(`SELECT id FROM student_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        if(profiles.length === 0) return res.redirect('/');
        const studentId = profiles[0].id;

        const [theses] = await db.execute(`SELECT id, status FROM theses WHERE student_id = ? LIMIT 1`, [studentId]);
        
        if (theses.length === 0) {
            req.flash('error', 'Thesis record not found.');
            return res.redirect('/student/dashboard');
        }

        const thesis = theses[0];

        if (thesis.status !== 'supervisor_allocated' && thesis.status !== 'revision_required') {
            req.flash('error', 'You cannot submit a proposal at this time.');
            return res.redirect('/student/dashboard');
        }

        const filename = `proposal-${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
        const filePath = await uploadDocument({
            folder: 'proposals', filename, buffer: req.file.buffer, contentType: 'application/pdf'
        });

        try {
            await db.execute(`
                UPDATE theses 
                SET title = ?, abstract = ?, proposal_file = ?, status = 'proposal_submitted', updated_at = NOW() 
                WHERE id = ?
            `, [title.trim(), abstract.trim(), filePath, thesis.id]);
        } catch (dbError) {
            await removeDocument(filePath);
            throw dbError;
        }

        await db.execute(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description, ip_address)
            VALUES (?, 'proposal_submitted', 'thesis', ?, 'Student submitted thesis proposal with document.', ?)
        `, [userId, thesis.id, req.ip || '']);

        req.flash('success', 'Thesis proposal submitted successfully! Awaiting supervisor review.');
        res.redirect('/student/dashboard');

    } catch (error) {
        console.error('Submit proposal error:', error);
        req.flash('error', 'Failed to submit proposal.');
        res.redirect('/student/dashboard');
    }
};

// ============================================================
// UPLOAD FINAL THESIS
// ============================================================
exports.uploadFinalThesis = async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please select a file to upload (PDF only).');
            return res.redirect('/student/dashboard');
        }

        const userId = req.session.user.id;
        const [profiles] = await db.execute(`SELECT id FROM student_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        if (profiles.length === 0) {
            req.flash('error', 'Student profile not found.');
            return res.redirect('/student/dashboard');
        }
        const studentId = profiles[0].id;

        const filename = `final-${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
        const filePath = await uploadDocument({
            folder: 'finals', filename, buffer: req.file.buffer, contentType: 'application/pdf'
        });

        try {
            const [result] = await db.execute(`
                UPDATE theses 
                SET final_file = ?, status = 'final_submitted', updated_at = NOW() 
                WHERE student_id = ? AND status = 'proposal_approved'
            `, [filePath, studentId]);
            if (result.affectedRows === 0) {
                await removeDocument(filePath);
                req.flash('error', 'Your proposal must be approved before submitting the final thesis.');
                return res.redirect('/student/dashboard');
            }
        } catch (dbError) {
            await removeDocument(filePath);
            throw dbError;
        }

        req.flash('success', 'Final thesis uploaded successfully! Awaiting final grade from your supervisor.');
        res.redirect('/student/dashboard');
    } catch (error) {
        console.error('Final upload error:', error);
        req.flash('error', 'Failed to upload final thesis.');
        res.redirect('/student/dashboard');
    }
};

// ============================================================
// STUDENT SUPERVISOR PREFERENCES
// ============================================================
exports.getSupervisorPreferences = async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [studentRows] = await db.execute(
            `
            SELECT sp.id, sp.student_id, sp.department_id, sp.session_id, sp.registration_status,
                   u.name, u.email, d.name AS department_name, d.code AS department_code,
                   s.session_name, s.start_year, s.end_year, s.status AS session_status
            FROM student_profiles sp
            INNER JOIN users u ON u.id = sp.user_id
            INNER JOIN departments d ON d.id = sp.department_id
            INNER JOIN academic_sessions s ON s.id = sp.session_id
            WHERE sp.user_id = ? LIMIT 1
            `, [userId]
        );

        if (studentRows.length === 0) {
            req.flash('error', 'Student profile not found.');
            return res.redirect('/student/dashboard');
        }

        const student = studentRows[0];

        if (student.registration_status !== 'approved') {
            req.flash('error', 'Supervisor preferences are available only after Chairman approval.');
            return res.redirect('/student/dashboard');
        }

        const sessionId = student.session_id;
        const departmentId = student.department_id;

        const [runRows] = await db.execute(`
            SELECT id, strategy, status, started_at, completed_at, created_at, updated_at
            FROM allocation_runs WHERE department_id = ? AND session_id = ? ORDER BY id DESC LIMIT 1
        `, [departmentId, sessionId]);

        const allocationRun = runRows.length > 0 ? runRows[0] : null;

        let preferencesLocked = false;
        if (allocationRun && ['confirmed', 'locked', 'cancelled'].includes(allocationRun.status)) {
            preferencesLocked = true;
        }

        const [supervisors] = await db.execute(`
            SELECT sp.id, sp.supervisor_id, sp.designation, sp.specialization, sp.capacity AS default_capacity, sp.is_available,
                   u.name, u.email, u.account_status,
                   COALESCE(sc.capacity, sp.capacity) AS session_capacity,
                   COALESCE(assigned.assigned_count, 0) AS assigned_count
            FROM supervisor_profiles sp
            INNER JOIN users u ON u.id = sp.user_id
            LEFT JOIN supervisor_capacities sc ON sc.supervisor_id = sp.id AND sc.session_id = ?
            LEFT JOIN (
                SELECT a.supervisor_id, COUNT(*) AS assigned_count FROM allocations a
                INNER JOIN allocation_runs ar ON ar.id = a.allocation_run_id
                WHERE ar.department_id = ? AND ar.session_id = ? AND ar.status IN ('confirmed', 'locked') AND a.allocation_status IN ('allocated', 'swapped')
                GROUP BY a.supervisor_id
            ) assigned ON assigned.supervisor_id = sp.id
            WHERE sp.department_id = ? AND u.account_status = 'active' AND sp.is_available = 1
            ORDER BY u.name ASC
        `, [sessionId, departmentId, sessionId, departmentId]);

        const [preferences] = await db.execute(`
            SELECT pref.id, pref.supervisor_id, pref.priority, sp.supervisor_id AS supervisor_code,
                   u.name, u.email, sp.designation, sp.specialization
            FROM supervisor_preferences pref
            INNER JOIN supervisor_profiles sp ON sp.id = pref.supervisor_id
            INNER JOIN users u ON u.id = sp.user_id
            WHERE pref.student_id = ? AND pref.session_id = ?
            ORDER BY pref.priority ASC
        `, [student.id, sessionId]);

        return res.render('student/supervisor-preferences', {
            student, supervisors, preferences, allocationRun, preferencesLocked
        });

    } catch (error) {
        console.error('Supervisor preferences page error:', error);
        req.flash('error', 'Unable to load supervisor preferences.');
        return res.redirect('/student/dashboard');
    }
};

exports.saveSupervisorPreferences = async (req, res) => {
    const userId = req.session.user.id;
    try {
        const [studentRows] = await db.execute(`
            SELECT sp.id, sp.department_id, sp.session_id, sp.registration_status
            FROM student_profiles sp WHERE sp.user_id = ? LIMIT 1
        `, [userId]);

        if (studentRows.length === 0) return res.redirect('/student/preferences');
        const student = studentRows[0];

        if (student.registration_status !== 'approved') {
            req.flash('error', 'You are not approved to submit supervisor preferences.');
            return res.redirect('/student/preferences');
        }

        const [runRows] = await db.execute(`
            SELECT id, status FROM allocation_runs WHERE department_id = ? AND session_id = ? ORDER BY id DESC LIMIT 1
        `, [student.department_id, student.session_id]);

        const allocationRun = runRows.length > 0 ? runRows[0] : null;

        if (allocationRun && ['confirmed', 'locked', 'cancelled'].includes(allocationRun.status)) {
            req.flash('error', 'Supervisor preferences are locked for this allocation.');
            return res.redirect('/student/preferences');
        }

        let selectedSupervisors = req.body.supervisor_ids || [];
        if (!Array.isArray(selectedSupervisors)) selectedSupervisors = [selectedSupervisors];

        selectedSupervisors = selectedSupervisors
            .filter(id => id !== undefined && id !== null && String(id).trim() !== '')
            .map(id => Number(id));
        selectedSupervisors = [...new Set(selectedSupervisors)];

        if (selectedSupervisors.length === 0) {
            req.flash('error', 'Please select at least one supervisor.');
            return res.redirect('/student/preferences');
        }

        if (selectedSupervisors.length > 10) {
            req.flash('error', 'You can select a maximum of 10 supervisors.');
            return res.redirect('/student/preferences');
        }

        const placeholders = selectedSupervisors.map(() => '?').join(',');
        const [validSupervisors] = await db.execute(`
            SELECT sp.id FROM supervisor_profiles sp
            INNER JOIN users u ON u.id = sp.user_id
            WHERE sp.department_id = ? AND sp.is_available = 1 AND u.account_status = 'active' AND sp.id IN (${placeholders})
        `, [student.department_id, ...selectedSupervisors]);

        if (validSupervisors.length !== selectedSupervisors.length) {
            req.flash('error', 'One or more selected supervisors are no longer available.');
            return res.redirect('/student/preferences');
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute(`DELETE FROM supervisor_preferences WHERE student_id = ? AND session_id = ?`, [student.id, student.session_id]);
            for (let i = 0; i < selectedSupervisors.length; i++) {
                await connection.execute(`
                    INSERT INTO supervisor_preferences (student_id, session_id, supervisor_id, priority) VALUES (?, ?, ?, ?)
                `, [student.id, student.session_id, selectedSupervisors[i], i + 1]);
            }
            await connection.commit();
        } catch (transactionError) {
            await connection.rollback();
            throw transactionError;
        } finally {
            connection.release();
        }

        req.flash('success', 'Supervisor preference list saved successfully.');
        return res.redirect('/student/preferences');

    } catch (error) {
        console.error('Save supervisor preferences error:', error);
        req.flash('error', 'Failed to save supervisor preferences.');
        return res.redirect('/student/preferences');
    }
};



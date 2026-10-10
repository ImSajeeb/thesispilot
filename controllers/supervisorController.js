const db = require('../config/database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { uploadDocument, removeDocument } = require('../config/storage');


const transporter = require('../config/mailer');
exports.dashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [profiles] = await db.execute(`SELECT id, department_id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        if (profiles.length === 0) {
            req.flash('error', 'Supervisor profile not found.');
            return res.redirect('/');
        }
        const supervisorId = profiles[0].id;
        const departmentId = profiles[0].department_id;

        // Get academic sessions for the department filter dropdown

// Get all running academic sessions for the department filter dropdown
              const [sessions] = await db.execute(
            `
            SELECT
                id,
                session_name,
                start_year,
                end_year,
                status
            FROM academic_sessions
            WHERE department_id = ?
              AND status != 'inactive'
            ORDER BY start_year DESC, id DESC
            `,
            [departmentId]
        );

        // Determine selected session: 
  
        let selectedSessionId = req.query.session_id;
        if (selectedSessionId === undefined) {
            const activeSession = sessions.find(s => s.status === 'active');
            selectedSessionId = activeSession ? activeSession.id.toString() : '';
        }

        const statusFilter = req.query.status || '';
        const searchFilter = (req.query.search || '').trim();

        // Build query with filters
        let query = `
            SELECT a.id AS allocation_id, u.name AS student_name, u.email AS student_email,
                   sp.student_id AS student_code, t.id AS thesis_id, t.title, t.status AS thesis_status, t.updated_at,
                   s.session_name, s.id AS session_id
            FROM allocations a
            INNER JOIN allocation_runs ar ON a.allocation_run_id = ar.id
            INNER JOIN academic_sessions s ON ar.session_id = s.id
            INNER JOIN student_profiles sp ON a.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            LEFT JOIN theses t ON sp.id = t.student_id
            WHERE a.supervisor_id = ? AND a.allocation_status IN ('allocated', 'swapped') AND ar.status = 'locked'
        `;

        const params = [supervisorId];

        if (selectedSessionId && selectedSessionId !== 'all') {
            query += ` AND ar.session_id = ?`;
            params.push(selectedSessionId);
        }

        if (statusFilter) {
            if (statusFilter === 'awaiting') {
                query += ` AND (t.status IS NULL OR t.status = 'supervisor_allocated')`;
            } else {
                query += ` AND t.status = ?`;
                params.push(statusFilter);
            }
        }

        if (searchFilter) {
            query += ` AND (u.name LIKE ? OR sp.student_id LIKE ? OR t.title LIKE ?)`;
            const sVal = `%${searchFilter}%`;
            params.push(sVal, sVal, sVal);
        }

        query += ` ORDER BY t.updated_at DESC, u.name ASC`;

        const [students] = await db.execute(query, params);

        res.render('supervisor/dashboard', { 
            user: req.session.user, 
            students, 
            sessions, 
            filters: { sessionId: selectedSessionId, status: statusFilter, search: searchFilter } 
        });
    } catch (error) {
        console.error('Supervisor dashboard error:', error);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/');
    }
};
// ============================================================
// REVIEW THESIS PAGE
// ============================================================

exports.reviewThesis = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const thesisId = req.params.id;

        const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        if (profiles.length === 0) return res.redirect('/supervisor/dashboard');
        const supervisorId = profiles[0].id;

        // Make sure to allow BOTH allocated and swapped students!
        const [theses] = await db.execute(`
            SELECT t.*, u.name AS student_name, sp.student_id AS student_code 
            FROM theses t
            INNER JOIN student_profiles sp ON t.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            INNER JOIN allocations a ON a.student_id = sp.id
            WHERE t.id = ? AND a.supervisor_id = ? AND a.allocation_status IN ('allocated', 'swapped')
        `, [thesisId, supervisorId]);

        if (theses.length === 0) {
            req.flash('error', 'Thesis not found or you are not authorized to view it.');
            return res.redirect('/supervisor/dashboard');
        }

        res.render('supervisor/review', {
            user: req.session.user,
            thesis: theses[0]
        });

    } catch (error) {
        console.error('Review thesis error:', error);
        req.flash('error', 'Failed to load thesis for review.');
        res.redirect('/supervisor/dashboard');
    }
};
// ============================================================
// SUBMIT PROPOSAL REVIEW
// exports.submitReview = async (req, res) => {
//     try {
//         const userId = req.session.user.id;
//         const thesisId = req.params.id;
//         const { decision, feedback } = req.body;

//         const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
//         const supervisorId = profiles[0].id;

//         // Verify authorization for both allocated and swapped students
//         const [theses] = await db.execute(`
//             SELECT t.id, t.status FROM theses t
//             INNER JOIN allocations a ON t.student_id = a.student_id
//             WHERE t.id = ? AND a.supervisor_id = ? AND a.allocation_status IN ('allocated', 'swapped')
//         `, [thesisId, supervisorId]);

//         if (theses.length === 0) {
//             req.flash('error', 'Unauthorized access.');
//             return res.redirect('/supervisor/dashboard');
//         }

//         if (theses[0].status === 'completed') {
//             req.flash('error', 'This thesis is already marked as completed and cannot be modified.');
//             return res.redirect(`/supervisor/thesis/${thesisId}/review`);
//         }

//         if (!['approve', 'revision', 'under_review'].includes(decision)) {
//             req.flash('error', 'Invalid decision selected.');
//             return res.redirect(`/supervisor/thesis/${thesisId}/review`);
//         }

//         let newStatus = 'under_review';
//         if (decision === 'approve') newStatus = 'proposal_approved';
//         else if (decision === 'revision') newStatus = 'revision_required';

//         // Check if a feedback file was uploaded
//         let filePath = null;
//         if (req.file) {
//             filePath = '/uploads/feedback/' + req.file.filename;
//         }

//         // Update database (only overwrite the file if a new one is uploaded)
//         if (filePath) {
//             await db.execute(`
//                 UPDATE theses SET status = ?, supervisor_feedback = ?, supervisor_feedback_file = ?, updated_at = NOW() WHERE id = ?
//             `, [newStatus, feedback.trim(), filePath, thesisId]);
//         } else {
//             await db.execute(`
//                 UPDATE theses SET status = ?, supervisor_feedback = ?, updated_at = NOW() WHERE id = ?
//             `, [newStatus, feedback.trim(), thesisId]);
//         }

//         req.flash('success', `Review submitted. Status updated to: ${newStatus.replace('_', ' ').toUpperCase()}.`);
//         res.redirect('/supervisor/dashboard');

//     } catch (error) {
//         console.error('Submit review error:', error);
//         req.flash('error', 'Failed to submit review decision.');
//         res.redirect('/supervisor/dashboard');
//     }
// };
exports.submitReview = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const thesisId = req.params.id;
        const { decision, feedback } = req.body;

        const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        if (profiles.length === 0) {
            req.flash('error', 'Supervisor profile not found.');
            return res.redirect('/supervisor/dashboard');
        }
        const supervisorId = profiles[0].id;

        // Verify authorization and fetch student details for email
        const [theses] = await db.execute(`
            SELECT t.id, t.status, t.title, u.email, u.name AS student_name 
            FROM theses t
            INNER JOIN allocations a ON t.student_id = a.student_id
            INNER JOIN student_profiles sp ON t.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            WHERE t.id = ? AND a.supervisor_id = ? AND a.allocation_status IN ('allocated', 'swapped')
        `, [thesisId, supervisorId]);

        if (theses.length === 0) {
            req.flash('error', 'Unauthorized access.');
            return res.redirect('/supervisor/dashboard');
        }

        if (theses[0].status === 'completed') {
            req.flash('error', 'This thesis is already marked as completed and cannot be modified.');
            return res.redirect(`/supervisor/thesis/${thesisId}/review`);
        }

        if (!['approve', 'revision', 'under_review'].includes(decision)) {
            req.flash('error', 'Invalid decision selected.');
            return res.redirect(`/supervisor/thesis/${thesisId}/review`);
        }

        let newStatus = 'under_review';
        let emailSubject = 'Proposal is Under Review';
        let emailMessage = 'Your supervisor has started reviewing your thesis proposal.';

        if (decision === 'approve') {
            newStatus = 'proposal_approved';
            emailSubject = 'Proposal Approved!';
            emailMessage = 'Great news! Your supervisor has approved your thesis proposal. You may now proceed with your research and eventually submit your final thesis.';
        } else if (decision === 'revision') {
            newStatus = 'revision_required';
            emailSubject = 'Proposal Revision Required';
            emailMessage = 'Your supervisor has requested revisions on your proposal. Please log in to view their feedback and upload an updated document.';
        }

        let filePath = null;
        if (req.file) {
            const ext = require('path').extname(req.file.originalname || '').toLowerCase();
            const filename = `file-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
            filePath = await uploadDocument({
                folder: 'feedback', filename, buffer: req.file.buffer,
                contentType: req.file.mimetype || 'application/octet-stream'
            });
        }

        try {
            if (filePath) {
                await db.execute(`UPDATE theses SET status = ?, supervisor_feedback = ?, supervisor_feedback_file = ?, updated_at = NOW() WHERE id = ?`, [newStatus, (feedback || '').trim(), filePath, thesisId]);
            } else {
                await db.execute(`UPDATE theses SET status = ?, supervisor_feedback = ?, updated_at = NOW() WHERE id = ?`, [newStatus, (feedback || '').trim(), thesisId]);
            }
        } catch (dbError) {
            if (filePath) await removeDocument(filePath);
            throw dbError;
        }

        // Send Notification Email to Student
        const mailOptions = {
            from: '"ThesisPilot" <your.actual.email@gmail.com>',
            to: theses[0].email,
            subject: `${emailSubject} - ThesisPilot`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #0f172a;">${emailSubject}</h2>
                    <p>Hello ${theses[0].student_name},</p>
                    <p>${emailMessage}</p>
                    <hr>
                    <p><strong>Feedback Notes:</strong> ${feedback ? feedback : '<i>Please check dashboard for attached files.</i>'}</p>
                </div>
            `
        };
        transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));

        req.flash('success', `Review submitted. Student has been notified.`);
        res.redirect('/supervisor/dashboard');

    } catch (error) {
        console.error('Submit review error:', error);
        req.flash('error', 'Failed to submit review decision.');
        res.redirect('/supervisor/dashboard');
    }
};
// ============================================================
// EVALUATE FINAL THESIS


exports.evaluateThesis = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const thesisId = req.params.id;
        const { final_grade, feedback } = req.body;

        const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        const supervisorId = profiles[0].id;

        // Verify authorization for both allocated and swapped students
        const [theses] = await db.execute(`
            SELECT t.id FROM theses t
            INNER JOIN allocations a ON t.student_id = a.student_id
            WHERE t.id = ? AND a.supervisor_id = ? AND a.allocation_status IN ('allocated', 'swapped')
        `, [thesisId, supervisorId]);

        if (theses.length === 0) {
            req.flash('error', 'Unauthorized access.');
            return res.redirect('/supervisor/dashboard');
        }

        await db.execute(`
            UPDATE theses 
            SET final_grade = ?, supervisor_feedback = CONCAT(IFNULL(supervisor_feedback, ''), '\nFinal Eval: ', ?), status = 'completed', updated_at = NOW() 
            WHERE id = ?
        `, [final_grade, feedback.trim(), thesisId]);

        req.flash('success', 'Final evaluation completed and grade assigned!');
        res.redirect('/supervisor/dashboard');

    } catch (error) {
        console.error('Final evaluation error:', error);
        req.flash('error', 'Failed to save final evaluation.');
        res.redirect('/supervisor/dashboard');
    }
};

exports.getSwapForm = async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        const [profiles] = await db.execute(`SELECT id, department_id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        if (profiles.length === 0) return res.redirect('/supervisor/dashboard');
        
        const supervisorId = profiles[0].id;
        const departmentId = profiles[0].department_id;

        const selectedSessionId = req.query.session_id || '';
        const searchFilter = (req.query.search || '').trim();

// Get all running academic sessions for the filter dropdown (excluding archived batches)
        const [sessions] = await db.execute(
            `
            SELECT
                id,
                session_name,
                start_year,
                end_year,
                status
            FROM academic_sessions
            WHERE department_id = ?
              AND status != 'inactive'
            ORDER BY start_year DESC, id DESC
            `,
            [departmentId]
        );
        // 2. Get supervisor's current students with filters
        let studentQuery = `
            SELECT a.student_id, u.name AS student_name, sp.student_id AS student_code, t.id AS thesis_id, s.session_name
            FROM allocations a
            INNER JOIN allocation_runs ar ON a.allocation_run_id = ar.id
            INNER JOIN academic_sessions s ON ar.session_id = s.id
            INNER JOIN student_profiles sp ON a.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            LEFT JOIN theses t ON t.student_id = sp.id
            WHERE a.supervisor_id = ? AND a.allocation_status IN ('allocated', 'swapped') AND ar.status = 'locked'
        `;
        const studentParams = [supervisorId];

        if (selectedSessionId) {
            studentQuery += ` AND ar.session_id = ?`;
            studentParams.push(selectedSessionId);
        }
        if (searchFilter) {
            studentQuery += ` AND (u.name LIKE ? OR sp.student_id LIKE ?)`;
            const sVal = `%${searchFilter}%`;
            studentParams.push(sVal, sVal);
        }
        studentQuery += ` ORDER BY u.name ASC`;

        const [myStudents] = await db.execute(studentQuery, studentParams);

        // 3. Get other supervisors in the department
        const [otherSupervisors] = await db.execute(`
            SELECT sp.id AS supervisor_id, u.name AS supervisor_name, sp.capacity,
            COALESCE(assigned.assigned_count, 0) AS assigned_count
            FROM supervisor_profiles sp
            INNER JOIN users u ON sp.user_id = u.id
            LEFT JOIN (
                SELECT supervisor_id, COUNT(*) AS assigned_count FROM allocations 
                WHERE allocation_status IN ('allocated', 'swapped') GROUP BY supervisor_id
            ) assigned ON assigned.supervisor_id = sp.id
            WHERE sp.department_id = ? AND sp.is_available = 1 AND u.account_status = 'active' AND sp.id != ?
            ORDER BY u.name ASC
        `, [departmentId, supervisorId]);

        // 4. Get other students for mutual swaps
        const [otherStudents] = await db.execute(`
            SELECT a.student_id, u.name AS student_name, sp.student_id AS student_code, 
                   a.supervisor_id, sup_u.name AS supervisor_name
            FROM allocations a
            INNER JOIN allocation_runs ar ON a.allocation_run_id = ar.id
            INNER JOIN student_profiles sp ON a.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            INNER JOIN supervisor_profiles sup_p ON a.supervisor_id = sup_p.id
            INNER JOIN users sup_u ON sup_p.user_id = sup_u.id
            WHERE a.supervisor_id != ? AND a.allocation_status IN ('allocated', 'swapped') AND ar.status = 'locked'
            ORDER BY sup_u.name ASC, u.name ASC
        `, [supervisorId]);

        res.render('supervisor/swap', {
            user: req.session.user,
            myStudents,
            otherSupervisors,
            otherStudents,
            sessions,
            filters: { sessionId: selectedSessionId, search: searchFilter }
        });

    } catch (error) {
        console.error('Get swap form error:', error);
        req.flash('error', 'Failed to load swap form.');
        res.redirect('/supervisor/dashboard');
    }
};


exports.submitSwapRequest = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { my_student_id, swap_type, target_supervisor_id, reason } = req.body;

        if (!my_student_id || !swap_type || !reason) {
            req.flash('error', 'Please fill in all required fields.');
            return res.redirect('/supervisor/swap');
        }

        const [existingRequests] = await db.execute(`
            SELECT id FROM swap_requests 
            WHERE student_id = ? AND status IN ('pending_requested_supervisor', 'pending_chairman', 'pending_current_supervisor')
            LIMIT 1
        `, [my_student_id]);

        if (existingRequests.length > 0) {
            req.flash('error', 'An active transfer or swap request already exists for this student.');
            return res.redirect('/supervisor/swap');
        }

        const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        const currentSupervisorId = profiles[0].id;

        let requested_supervisor_id = null;
        let final_target_student_id = null; // Variable to hold target student

        if (swap_type === 'transfer') {
            if (!target_supervisor_id) {
                req.flash('error', 'Please select a receiving supervisor.');
                return res.redirect('/supervisor/swap');
            }
            requested_supervisor_id = target_supervisor_id;
        } else if (swap_type === 'mutual') {
            const { target_student_id } = req.body;
            if (!target_student_id) {
                req.flash('error', 'Please select a target student for mutual swap.');
                return res.redirect('/supervisor/swap');
            }
            const [targetAlloc] = await db.execute(`
                SELECT supervisor_id FROM allocations 
                WHERE student_id = ? AND allocation_status IN ('allocated', 'swapped') LIMIT 1
            `, [target_student_id]);

            if (targetAlloc.length === 0) {
                req.flash('error', 'Selected target student does not have an active supervisor.');
                return res.redirect('/supervisor/swap');
            }
            requested_supervisor_id = targetAlloc[0].supervisor_id;
            final_target_student_id = target_student_id; // Save target student
        }

        const [theses] = await db.execute(`SELECT id FROM theses WHERE student_id = ? LIMIT 1`, [my_student_id]);
        const thesisId = theses.length > 0 ? theses[0].id : null;

        // Insert including target_student_id
        await db.execute(`
            INSERT INTO swap_requests (thesis_id, student_id, target_student_id, current_supervisor_id, requested_supervisor_id, reason, requested_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_requested_supervisor')
        `, [thesisId, my_student_id, final_target_student_id, currentSupervisorId, requested_supervisor_id, reason.trim(), userId]);

        req.flash('success', 'Transfer/swap request submitted successfully!');
        res.redirect('/supervisor/swap-approvals');

    } catch (error) {
        console.error('Submit supervisor swap error:', error);
        req.flash('error', 'Failed to submit request.');
        res.redirect('/supervisor/swap');
    }
};

// ADD THIS NEW FUNCTION: View incoming/outgoing requests needing approval

// exports.getSwapApprovals = async (req, res) => {
//     try {
//         const userId = req.session.user.id;
//         const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
//         const supervisorId = profiles[0].id;

//         // Outgoing requests: Transfers initiated by me, waiting for the receiving supervisor to accept
//         const [outgoingRequests] = await db.execute(`
//             SELECT sr.*, u.name AS student_name, rs_u.name AS requested_supervisor_name
//             FROM swap_requests sr
//             INNER JOIN student_profiles sp ON sr.student_id = sp.id
//             INNER JOIN users u ON sp.user_id = u.id
//             INNER JOIN supervisor_profiles rs_p ON sr.requested_supervisor_id = rs_p.id
//             INNER JOIN users rs_u ON rs_p.user_id = rs_u.id
//             WHERE sr.current_supervisor_id = ? AND sr.status = 'pending_requested_supervisor'
//         `, [supervisorId]);

//         // Incoming requests: Other supervisors wanting to transfer students to me
//         const [incomingRequests] = await db.execute(`
//             SELECT sr.*, u.name AS student_name, cs_u.name AS current_supervisor_name
//             FROM swap_requests sr
//             INNER JOIN student_profiles sp ON sr.student_id = sp.id
//             INNER JOIN users u ON sp.user_id = u.id
//             INNER JOIN supervisor_profiles cs_p ON sr.current_supervisor_id = cs_p.id
//             INNER JOIN users cs_u ON cs_p.user_id = cs_u.id
//             WHERE sr.requested_supervisor_id = ? AND sr.status = 'pending_requested_supervisor'
//         `, [supervisorId]);

//         res.render('supervisor/swap-approvals', {
//             user: req.session.user,
//             outgoingRequests,
//             incomingRequests
//         });
//     } catch (error) {
//         console.error('Get swap approvals error:', error);
//         req.flash('error', 'Failed to load approvals.');
//         res.redirect('/supervisor/dashboard');
//     }
// };
exports.getSwapApprovals = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        const supervisorId = profiles[0].id;

        // Fetch Outgoing requests WITH target student name
        const [outgoingRequests] = await db.execute(`
            SELECT sr.*, u.name AS student_name, rs_u.name AS requested_supervisor_name,
                   ts_u.name AS target_student_name
            FROM swap_requests sr
            INNER JOIN student_profiles sp ON sr.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            INNER JOIN supervisor_profiles rs_p ON sr.requested_supervisor_id = rs_p.id
            INNER JOIN users rs_u ON rs_p.user_id = rs_u.id
            LEFT JOIN student_profiles ts_p ON sr.target_student_id = ts_p.id
            LEFT JOIN users ts_u ON ts_p.user_id = ts_u.id
            WHERE sr.current_supervisor_id = ? AND sr.status IN ('pending_requested_supervisor', 'pending_chairman')
        `, [supervisorId]);

        // Fetch Incoming requests WITH target student name
        const [incomingRequests] = await db.execute(`
            SELECT sr.*, u.name AS student_name, cs_u.name AS current_supervisor_name,
                   ts_u.name AS target_student_name
            FROM swap_requests sr
            INNER JOIN student_profiles sp ON sr.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            INNER JOIN supervisor_profiles cs_p ON sr.current_supervisor_id = cs_p.id
            INNER JOIN users cs_u ON cs_p.user_id = cs_u.id
            LEFT JOIN student_profiles ts_p ON sr.target_student_id = ts_p.id
            LEFT JOIN users ts_u ON ts_p.user_id = ts_u.id
            WHERE sr.requested_supervisor_id = ? AND sr.status = 'pending_requested_supervisor'
        `, [supervisorId]);

        res.render('supervisor/swap-approvals', {
            user: req.session.user,
            outgoingRequests,
            incomingRequests
        });
    } catch (error) {
        console.error('Get swap approvals error:', error);
        req.flash('error', 'Failed to load approvals.');
        res.redirect('/supervisor/dashboard');
    }
};

// ADD THIS NEW FUNCTION: Process the approval decision
// exports.decideSwapApproval = async (req, res) => {
//     try {
//         const { swap_id, decision, current_stage } = req.body;

//         let nextStatus = 'rejected';
        
//         if (decision === 'approve') {
//             if (current_stage === 'pending_current_supervisor') {
//                 nextStatus = 'pending_requested_supervisor'; // Passes to the receiving supervisor
//             } else if (current_stage === 'pending_requested_supervisor') {
//                 nextStatus = 'pending_chairman'; // Passes to the Chairman for final execution
//             }
//         }

//         await db.execute(`UPDATE swap_requests SET status = ? WHERE id = ?`, [nextStatus, swap_id]);

//         req.flash('success', `Request ${decision === 'approve' ? 'approved and forwarded' : 'rejected'}.`);
//         res.redirect('/supervisor/swap-approvals');

//     } catch (error) {
//         console.error('Decide swap approval error:', error);
//         req.flash('error', 'Failed to process decision.');
//         res.redirect('/supervisor/swap-approvals');
//     }
// };
exports.decideSwapApproval = async (req, res) => {
    try {
        const { swap_id, decision, current_stage } = req.body;

        let nextStatus = 'rejected';
        
        if (decision === 'approve') {
            if (current_stage === 'pending_current_supervisor') {
                nextStatus = 'pending_requested_supervisor';
            } else if (current_stage === 'pending_requested_supervisor') {
                nextStatus = 'pending_chairman'; // Passes to Chairman for final execution
            }
        }

        await db.execute(`UPDATE swap_requests SET status = ? WHERE id = ?`, [nextStatus, swap_id]);

        req.flash('success', `Request ${decision === 'approve' ? 'approved and forwarded to the Chairman' : 'rejected'}.`);
        res.redirect('/supervisor/swap-approvals');

    } catch (error) {
        console.error('Decide swap approval error:', error);
        req.flash('error', 'Failed to process decision.');
        res.redirect('/supervisor/swap-approvals');
    }
};

exports.cancelSwapRequest = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { swap_id } = req.body;

        const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
        if (profiles.length === 0) return res.redirect('/supervisor/dashboard');
        const supervisorId = profiles[0].id;

        // Allow cancellation if the request is still pending either supervisor or chairman approval
        await db.execute(`
            DELETE FROM swap_requests 
            WHERE id = ? AND current_supervisor_id = ? AND status IN ('pending_requested_supervisor', 'pending_chairman')
        `, [swap_id, supervisorId]);

        req.flash('success', 'Transfer request cancelled successfully.');
        res.redirect('/supervisor/swap-approvals');

    } catch (error) {
        console.error('Cancel swap request error:', error);
        req.flash('error', 'Failed to cancel transfer request.');
        res.redirect('/supervisor/swap-approvals');
    }
};

// exports.cancelSwapRequest = async (req, res) => {
//     try {
//         const userId = req.session.user.id;
//         const { swap_id } = req.body;

//         // Verify the request belongs to this supervisor as the initiator/current supervisor
//         const [profiles] = await db.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1`, [userId]);
//         if (profiles.length === 0) return res.redirect('/supervisor/dashboard');
//         const supervisorId = profiles[0].id;

//         await db.execute(`
//             DELETE FROM swap_requests 
//             WHERE id = ? AND current_supervisor_id = ? AND status = 'pending_requested_supervisor'
//         `, [swap_id, supervisorId]);

//         req.flash('success', 'Transfer request cancelled successfully.');
//         res.redirect('/supervisor/swap-approvals');

//     } catch (error) {
//         console.error('Cancel swap request error:', error);
//         req.flash('error', 'Failed to cancel transfer request.');
//         res.redirect('/supervisor/swap-approvals');
//     }
// };
const db = require('../config/database');
const nodemailer = require('nodemailer');


const transporter = require('../config/mailer');

exports.dashboard = async (req, res) => {
    try {
        // ----------------------------------------
        // Get current Chairman's department
        // ----------------------------------------

        const [chairmanRows] = await db.execute(
            `
            SELECT
                cp.department_id,
                d.name AS department_name,
                d.code AS department_code
            FROM chairman_profiles cp
            INNER JOIN departments d
                ON d.id = cp.department_id
            WHERE cp.user_id = ?
              AND cp.is_current = 1
            LIMIT 1
            `,
            [req.session.user.id]
        );

        if (chairmanRows.length === 0) {
            req.flash(
                'error',
                'Chairman profile or department not found.'
            );

            return res.redirect('/');
        }

        const chairman = chairmanRows[0];
        const departmentId = chairman.department_id;


  // Fetch all running academic sessions (excluding inactive/archived graduated batches)
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
       
        // Determine active session based on chairman's focus choice, or fallback to latest session

        let activeSession = null;
        if (req.session.chairmanSessionId) {
            activeSession = sessions.find(s => Number(s.id) === Number(req.session.chairmanSessionId));
        }
        if (!activeSession) {
            activeSession = sessions.find(s => s.status === 'active') || sessions[0];
        }
        const activeSessionId = activeSession ? activeSession.id : null;


        // ----------------------------------------
        // Student statistics (Scoped to active session)
        // ----------------------------------------

        const [studentStats] = await db.execute(
            `
            SELECT
                COUNT(*) AS total_students,

                SUM(
                    CASE
                        WHEN sp.registration_status = 'pending'
                        THEN 1
                        ELSE 0
                    END
                ) AS pending_students,

                SUM(
                    CASE
                        WHEN sp.registration_status = 'approved'
                        THEN 1
                        ELSE 0
                    END
                ) AS approved_students

            FROM student_profiles sp

            WHERE sp.department_id = ?
              AND sp.session_id = ?
            `,
            [departmentId, activeSessionId || 0]
        );


        // ----------------------------------------
        // Supervisor statistics
        // ----------------------------------------

        const [supervisorStats] = await db.execute(
            `
            SELECT
                COUNT(*) AS total_supervisors,

                SUM(
                    CASE
                        WHEN sp.is_available = 1
                        AND u.account_status = 'active'
                        THEN 1
                        ELSE 0
                    END
                ) AS available_supervisors

            FROM supervisor_profiles sp

            INNER JOIN users u
                ON u.id = sp.user_id

            WHERE sp.department_id = ?
              AND u.account_status != 'archived'
            `,
            [departmentId]
        );


        // ----------------------------------------
        // Allocation statistics (Scoped to active session)
        // ----------------------------------------

        const [allocationStats] = await db.execute(
            `
            SELECT

                COUNT(DISTINCT CASE
                    WHEN a.allocation_status IN ('allocated', 'swapped')
                    THEN a.student_id
                END) AS allocated_students,

                COUNT(DISTINCT CASE
                    WHEN a.allocation_status = 'cancelled'
                    THEN a.student_id
                END) AS cancelled_allocations

            FROM allocations a

            INNER JOIN allocation_runs ar
                ON ar.id = a.allocation_run_id

            INNER JOIN student_profiles sp
                ON sp.id = a.student_id

            WHERE sp.department_id = ?
              AND ar.session_id = ?
            `,
            [departmentId, activeSessionId || 0]
        );


        // ----------------------------------------
        // Students without supervisor (Scoped to active session)
        // ----------------------------------------

        const [unallocatedStats] = await db.execute(
            `
            SELECT COUNT(*) AS students_without_supervisor

            FROM student_profiles sp

            INNER JOIN users u
                ON u.id = sp.user_id

            LEFT JOIN allocations a
                ON a.student_id = sp.id
                AND a.allocation_status IN ('allocated', 'swapped')

            WHERE sp.department_id = ?
              AND sp.session_id = ?
              AND sp.registration_status = 'approved'
              AND u.account_status = 'active'
              AND a.id IS NULL
            `,
            [departmentId, activeSessionId || 0]
        );


        // ----------------------------------------
        // Thesis status statistics (Scoped to active session)
        // ----------------------------------------

        const [thesisStats] = await db.execute(
            `
            SELECT

                COUNT(*) AS total_theses,

                SUM(
                    CASE
                        WHEN t.status = 'supervisor_allocated'
                        THEN 1
                        ELSE 0
                    END
                ) AS supervisor_allocated,

                SUM(
                    CASE
                        WHEN t.status = 'proposal_submitted'
                        THEN 1
                        ELSE 0
                    END
                ) AS proposal_submitted,

                SUM(
                    CASE
                        WHEN t.status = 'under_review'
                        THEN 1
                        ELSE 0
                    END
                ) AS under_review,

                SUM(
                    CASE
                        WHEN t.status = 'revision_required'
                        THEN 1
                        ELSE 0
                    END
                ) AS revision_required,

                SUM(
                    CASE
                        WHEN t.status = 'proposal_approved'
                        THEN 1
                        ELSE 0
                    END
                ) AS proposal_approved,

                SUM(
                    CASE
                        WHEN t.status = 'final_submitted'
                        THEN 1
                        ELSE 0
                    END
                ) AS final_submitted,

                SUM(
                    CASE
                        WHEN t.status = 'under_evaluation'
                        THEN 1
                        ELSE 0
                    END
                ) AS under_evaluation,

                SUM(
                    CASE
                        WHEN t.status = 'completed'
                        THEN 1
                        ELSE 0
                    END
                ) AS completed

            FROM theses t

            INNER JOIN student_profiles sp
                ON sp.id = t.student_id

            WHERE sp.department_id = ?
              AND sp.session_id = ?
            `,
            [departmentId, activeSessionId || 0]
        );


        // ----------------------------------------
        // Pending swap requests (Scoped to active session)
        // ----------------------------------------

        const [swapStats] = await db.execute(
            `
            SELECT COUNT(*) AS pending_swaps
            FROM swap_requests sr
            INNER JOIN student_profiles sp
                ON sp.id = sr.student_id
            WHERE sp.department_id = ?
              AND sp.session_id = ?
              AND sr.status = 'pending_chairman'
            `,
            [departmentId, activeSessionId || 0]
        );

        // ----------------------------------------
        // Render dashboard
        // ----------------------------------------

        return res.render(
            'chairman/dashboard',
            {
                chairman,
                selectedSession: activeSession,
                stats: {
                    students: Number(studentStats[0].total_students || 0),
                    pendingStudents: Number(studentStats[0].pending_students || 0),
                    approvedStudents: Number(studentStats[0].approved_students || 0),
                    supervisors: Number(supervisorStats[0].total_supervisors || 0),
                    availableSupervisors: Number(supervisorStats[0].available_supervisors || 0),
                    allocatedStudents: Number(allocationStats[0].allocated_students || 0),
                    studentsWithoutSupervisor: Number(unallocatedStats[0].students_without_supervisor || 0),
                    cancelledAllocations: Number(allocationStats[0].cancelled_allocations || 0),
                    totalTheses: Number(thesisStats[0].total_theses || 0),
                    supervisorAllocated: Number(thesisStats[0].supervisor_allocated || 0),
                    proposalSubmitted: Number(thesisStats[0].proposal_submitted || 0),
                    underReview: Number(thesisStats[0].under_review || 0),
                    revisionRequired: Number(thesisStats[0].revision_required || 0),
                    proposalApproved: Number(thesisStats[0].proposal_approved || 0),
                    finalSubmitted: Number(thesisStats[0].final_submitted || 0),
                    underEvaluation: Number(thesisStats[0].under_evaluation || 0),
                    completed: Number(thesisStats[0].completed || 0),
                    pendingSwaps: Number(swapStats[0].pending_swaps || 0)
                },
                sessions
            }
        );

    } catch (error) {
        console.error('Chairman dashboard error:', error);
        req.flash('error', 'Failed to load Chairman dashboard.');
        return res.redirect('/');
    }
};

exports.getUsers = async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, name, university_id, email, role, is_verified, created_at FROM users WHERE id != ? ORDER BY created_at DESC', [req.session.user.id]);
        res.render('chairman/users', { users });
    } catch (error) {
        console.error('Get users error:', error);
        req.flash('error', 'Failed to load users list.');
        res.redirect('/chairman/dashboard');
    }
};

exports.createUser = async (req, res) => {
    const { name, university_id, email, role } = req.body;

    try {
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ? OR (university_id = ? AND university_id != "")', [email, university_id]);
        if (existing.length > 0) {
            req.flash('error', 'A user with that email or University ID already exists.');
            return res.redirect('/chairman/users');
        }

        const defaultPassword = 'Welcome123!';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        // Convert empty string to null for supervisors who might not have an ID
        const uid = university_id ? university_id.trim() : null;

        await db.execute(
            'INSERT INTO users (name, university_id, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, TRUE)',
            [name.trim(), uid, email.trim(), hashedPassword, role]
        );

        req.flash('success', `${role.charAt(0).toUpperCase() + role.slice(1)} ${name} added successfully!`);
        res.redirect('/chairman/users');
    } catch (error) {
        console.error('Create user error:', error);
        req.flash('error', 'Failed to create user.');
        res.redirect('/chairman/users');
    }
};

exports.bulkUploadUsers = async (req, res) => {
    if (!req.file) {
        req.flash('error', 'Please select a CSV file to upload.');
        return res.redirect('/chairman/users');
    }

    const results = [];
    const defaultPassword = 'Welcome123!';

    try {
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                let addedCount = 0;

                for (const row of results) {
                    const name = row.name || row.Name;
                    const email = row.email || row.Email;
                    let role = row.role || row.Role;
                    const university_id = row.university_id || row.University_ID || row.id || null; // Capture ID

                    if (name && email && role) {
                        role = role.toLowerCase().trim();

                        if (role === 'student' || role === 'supervisor') {
                            const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email.trim()]);

                            if (existing.length === 0) {
                                await db.execute(
                                    'INSERT INTO users (name, university_id, email, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?, TRUE)',
                                    [name.trim(), university_id ? university_id.trim() : null, email.trim(), hashedPassword, role]
                                );
                                addedCount++;
                            }
                        }
                    }
                }

                fs.unlinkSync(req.file.path);
                req.flash('success', `Bulk upload complete! Successfully added ${addedCount} new users.`);
                res.redirect('/chairman/users');
            });
    } catch (error) {
        console.error('Bulk upload error:', error);
        if (req.file) fs.unlinkSync(req.file.path);
        req.flash('error', 'Failed to process the CSV file.');
        res.redirect('/chairman/users');
    }
};

exports.getCapacities = async (req, res) => {
    try {
        const [capacities] = await db.execute(`
            SELECT u.id as supervisor_id, u.name, u.email, 
                   COALESCE(sc.max_students, 5) as max_students, 
                   COALESCE(sc.current_count, 0) as current_count
            FROM users u
            LEFT JOIN supervisor_capacities sc ON u.id = sc.supervisor_id
            WHERE u.role = 'supervisor'
            ORDER BY u.name ASC
        `);
        res.render('chairman/capacities', { capacities });
    } catch (error) {
        console.error('Get capacities error:', error);
        req.flash('error', 'Failed to load capacities.');
        res.redirect('/chairman/dashboard');
    }
};

exports.setCapacity = async (req, res) => {
    const { supervisor_id, max_students } = req.body;
    try {
        await db.execute(`
            INSERT INTO supervisor_capacities (supervisor_id, max_students, current_count) 
            VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE max_students = VALUES(max_students)
        `, [supervisor_id, max_students]);

        req.flash('success', 'Capacity updated successfully!');
        res.redirect('/chairman/capacities');
    } catch (error) {
        console.error('Set capacity error:', error);
        req.flash('error', 'Failed to update capacity.');
        res.redirect('/chairman/capacities');
    }
};

exports.getLotteryPage = async (req, res) => {
    try {
        const [pendingTheses] = await db.execute(`
            SELECT t.*, u.name, u.university_id, u.email 
            FROM theses t 
            JOIN users u ON t.student_id = u.id 
            WHERE t.status = 'pending_allocation'
        `);

        const [supervisors] = await db.execute(`
            SELECT u.id as supervisor_id, u.name, 
                   COALESCE(sc.max_students, 5) as max_students, 
                   COALESCE(sc.current_count, 0) as current_count
            FROM users u
            LEFT JOIN supervisor_capacities sc ON u.id = sc.supervisor_id
            WHERE u.role = 'supervisor'
        `);
        res.render('chairman/lottery', { pendingTheses, supervisors });
    } catch (error) {
        console.error('Lottery page error:', error);
        req.flash('error', 'Failed to load lottery data.');
        res.redirect('/chairman/dashboard');
    }
};

exports.runLottery = async (req, res) => {
    try {
        const [theses] = await db.execute('SELECT id, student_id, preferred_supervisors FROM theses WHERE status = "pending_allocation"');
        if (theses.length === 0) {
            req.flash('error', 'No pending students waiting for allocation.');
            return res.redirect('/chairman/lottery');
        }

        const [supervisors] = await db.execute(`
            SELECT u.id as supervisor_id, COALESCE(sc.max_students, 5) as max_students, COALESCE(sc.current_count, 0) as current_count
            FROM users u LEFT JOIN supervisor_capacities sc ON u.id = sc.supervisor_id
            WHERE u.role = 'supervisor'
        `);

        let allocatedCount = 0;
        const shuffledTheses = theses.sort(() => 0.5 - Math.random());

        for (let thesis of shuffledTheses) {
            let assignedSupId = null;
            let prefs = [];

            try { prefs = thesis.preferred_supervisors ? JSON.parse(thesis.preferred_supervisors) : []; } catch (e) { prefs = []; }

            for (let prefId of prefs) {
                let sup = supervisors.find(s => s.supervisor_id == prefId);
                if (sup && sup.current_count < sup.max_students) {
                    assignedSupId = sup.supervisor_id;
                    sup.current_count++;
                    break;
                }
            }

            if (!assignedSupId) {
                let availableSups = supervisors.filter(s => s.current_count < s.max_students);
                if (availableSups.length > 0) {
                    let randomIndex = Math.floor(Math.random() * availableSups.length);
                    let randomSup = availableSups[randomIndex];
                    assignedSupId = randomSup.supervisor_id;
                    randomSup.current_count++;
                }
            }

            if (assignedSupId) {
                await db.execute('UPDATE theses SET supervisor_id = ?, status = "allocated" WHERE id = ?', [assignedSupId, thesis.id]);
                await db.execute(`
                    INSERT INTO supervisor_capacities (supervisor_id, max_students, current_count) 
                    VALUES (?, 5, 1)
                    ON DUPLICATE KEY UPDATE current_count = current_count + 1
                `, [assignedSupId]);
                allocatedCount++;
            }
        }
        req.flash('success', `Lottery Run Complete! Successfully allocated ${allocatedCount} students.`);
        res.redirect('/chairman/lottery');
    } catch (error) {
        console.error('Run lottery error:', error);
        req.flash('error', 'An error occurred while running the lottery algorithm.');
        res.redirect('/chairman/lottery');
    }
};
exports.getAllocations = async (req, res) => {
    try {
        const chairmanUserId = req.session.user.id;

        // Get current Chairman's department
        const [chairmanRows] = await db.execute(`
            SELECT
                cp.department_id
            FROM chairman_profiles cp
            WHERE cp.user_id = ?
              AND cp.is_current = 1
            LIMIT 1
        `, [chairmanUserId]);

        if (chairmanRows.length === 0) {
            req.flash('error', 'Current Chairman profile not found.');
            return res.redirect('/chairman/dashboard');
        }

        const departmentId = chairmanRows[0].department_id;

        // Get all thesis allocations for this department
        const [theses] = await db.execute(`
            SELECT
                t.id AS thesis_id,
                t.title,
                t.status AS thesis_status,

                sp.id AS student_profile_id,
                sp.student_id AS student_code,

                su.name AS student_name,
                su.email AS student_email,

                sup.id AS supervisor_profile_id,
                sup.supervisor_id AS supervisor_code,
                sv.name AS supervisor_name,

                ar.id AS allocation_run_id,
                ar.session_id,
                ar.status AS allocation_run_status,
                ar.strategy AS allocation_strategy,

                a.priority_matched,
                a.allocation_status,
                a.allocated_at

            FROM allocations a

            INNER JOIN allocation_runs ar
                ON ar.id = a.allocation_run_id

            INNER JOIN student_profiles sp
                ON sp.id = a.student_id

            INNER JOIN users su
                ON su.id = sp.user_id

            INNER JOIN supervisor_profiles sup
                ON sup.id = a.supervisor_id

            INNER JOIN users sv
                ON sv.id = sup.user_id

            LEFT JOIN theses t
                ON t.student_id = sp.id

            WHERE sp.department_id = ?

            ORDER BY
                a.allocated_at DESC,
                sp.student_id ASC
        `, [departmentId]);

        res.render('chairman/allocations', {
            theses
        });

    } catch (error) {
        console.error('Get allocations error:', error);

        req.flash(
            'error',
            'Failed to load allocations.'
        );

        return res.redirect('/chairman/dashboard');
    }
};

// exports.getSwaps = async (req, res) => {
//     try {
//         const chairmanUserId = req.session.user.id;

//         const [chairmen] = await db.execute(`SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`, [chairmanUserId]);
//         if (chairmen.length === 0) return res.redirect('/chairman/dashboard');
//         const departmentId = chairmen[0].department_id;

//         const [swaps] = await db.execute(`
//             SELECT sr.*, 
//                    stu1_u.name AS student_name, sp1.student_id AS student_code,
//                    cs_u.name AS current_supervisor_name, rs_u.name AS requested_supervisor_name,
//                    stu2_u.name AS target_student_name, sp2.student_id AS target_student_code
//             FROM swap_requests sr
//             INNER JOIN student_profiles sp1 ON sr.student_id = sp1.id
//             INNER JOIN users stu1_u ON sp1.user_id = stu1_u.id
//             INNER JOIN supervisor_profiles cs_p ON sr.current_supervisor_id = cs_p.id
//             INNER JOIN users cs_u ON cs_p.user_id = cs_u.id
//             INNER JOIN supervisor_profiles rs_p ON sr.requested_supervisor_id = rs_p.id
//             INNER JOIN users rs_u ON rs_p.user_id = rs_u.id
//             LEFT JOIN student_profiles sp2 ON sr.target_student_id = sp2.id
//             LEFT JOIN users stu2_u ON sp2.user_id = stu2_u.id
//             WHERE sp1.department_id = ? AND sr.status = 'pending_chairman'
//             ORDER BY sr.created_at ASC
//         `, [departmentId]);

//         const studentRequests = swaps.filter(s => s.requested_by === 'student');
//         const supervisorRequests = swaps.filter(s => s.requested_by === 'supervisor');

//         res.render('chairman/swaps', { studentRequests, supervisorRequests });
//     } catch (error) {
//         console.error('Get swaps error:', error);
//         req.flash('error', 'Failed to load swap requests.');
//         res.redirect('/chairman/dashboard');
//     }
// };

// ============================================================
// SWAP REQUESTS MANAGEMENT
// ============================================================
// ============================================================
// SWAP & TRANSFER REQUESTS MANAGEMENT
// ============================================================
exports.getSwaps = async (req, res) => {
    try {
        const chairmanUserId = req.session.user.id;

        // Get current Chairman's department
        const [chairmen] = await db.execute(
            `SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`, 
            [chairmanUserId]
        );
        
        if (chairmen.length === 0) {
            req.flash('error', 'Chairman profile not found.');
            return res.redirect('/chairman/dashboard');
        }
        const departmentId = chairmen[0].department_id;

        // Get academic sessions for the filter
  // Fetch all running academic sessions (excluding inactive/archived graduated batches)
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

        // Determine which session to view
        let selectedSessionId = req.query.session_id;
        if (!selectedSessionId) {
            const activeSession = sessions.find(s => s.status === 'active');
            selectedSessionId = activeSession ? activeSession.id : (sessions.length > 0 ? sessions[0].id : null);
        }

        // Fetch requests that have passed the second supervisor and are awaiting Chairman
        let query = `
            SELECT sr.*, 
                   stu_u.name AS student_name, sp.student_id AS student_code,
                   cs_u.name AS current_supervisor_name, rs_u.name AS requested_supervisor_name
            FROM swap_requests sr
            INNER JOIN student_profiles sp ON sr.student_id = sp.id
            INNER JOIN users stu_u ON sp.user_id = stu_u.id
            INNER JOIN supervisor_profiles cs_p ON sr.current_supervisor_id = cs_p.id
            INNER JOIN users cs_u ON cs_p.user_id = cs_u.id
            INNER JOIN supervisor_profiles rs_p ON sr.requested_supervisor_id = rs_p.id
            INNER JOIN users rs_u ON rs_p.user_id = rs_u.id
            WHERE sp.department_id = ? 
              AND sp.session_id = ? 
              AND sr.status = 'pending_chairman'
            ORDER BY sr.created_at ASC
        `;

        const params = [departmentId, selectedSessionId];
        const [swapRequests] = await db.execute(query, params);

        res.render('chairman/swaps', { 
            swapRequests,
            sessions,
            selectedSessionId
        });
        
    } catch (error) {
        console.error('Get swaps error:', error);
        req.flash('error', 'Failed to load transfer requests.');
        res.redirect('/chairman/dashboard');
    }
};

exports.decideSwap = async (req, res) => {
    const { swap_id, decision } = req.body; 
    const chairmanUserId = req.session.user.id;

    try {
        const [requests] = await db.execute(`
            SELECT sr.*, 
                   u1.email AS student_email, u1.name AS student_name,
                   sup_u.name AS new_supervisor_name
            FROM swap_requests sr
            INNER JOIN student_profiles sp ON sr.student_id = sp.id
            INNER JOIN users u1 ON sp.user_id = u1.id
            INNER JOIN supervisor_profiles sup_p ON sr.requested_supervisor_id = sup_p.id
            INNER JOIN users sup_u ON sup_p.user_id = sup_u.id
            WHERE sr.id = ?
        `, [swap_id]);
        
        if (requests.length === 0) return res.redirect('/chairman/swaps');
        const swap = requests[0];

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            if (decision === 'approve') {
                await connection.execute(`
                    UPDATE allocations SET supervisor_id = ?, allocation_status = 'swapped' 
                    WHERE student_id = ? AND supervisor_id = ?
                `, [swap.requested_supervisor_id, swap.student_id, swap.current_supervisor_id]);

                if (swap.target_student_id) {
                    await connection.execute(`
                        UPDATE allocations SET supervisor_id = ?, allocation_status = 'swapped' 
                        WHERE student_id = ? AND supervisor_id = ?
                    `, [swap.current_supervisor_id, swap.target_student_id, swap.requested_supervisor_id]);
                }

                await connection.execute(`UPDATE swap_requests SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`, [chairmanUserId, swap_id]);

                // Email primary student
                const mailOptions = {
                    from: '"ThesisPilot" <your.actual.email@gmail.com>',
                    to: swap.student_email,
                    subject: 'Supervisor Swap Approved - ThesisPilot',
                    html: `<p>Hello ${swap.student_name},</p><p>Good news! Your supervisor swap/transfer request has been <strong>approved</strong> by the Chairman.</p><p>Your new supervisor is <strong>${swap.new_supervisor_name}</strong>.</p>`
                };
                transporter.sendMail(mailOptions).catch(err => console.error(err));

            } else {
                await connection.execute(`UPDATE swap_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`, [chairmanUserId, swap_id]);
                
                const mailOptions = {
                    from: '"ThesisPilot" <your.actual.email@gmail.com>',
                    to: swap.student_email,
                    subject: 'Supervisor Swap Rejected - ThesisPilot',
                    html: `<p>Hello ${swap.student_name},</p><p>Your supervisor swap/transfer request was unfortunately <strong>rejected</strong> by the Chairman. Your current assignment remains unchanged.</p>`
                };
                transporter.sendMail(mailOptions).catch(err => console.error(err));
            }

            await connection.commit();
        } catch (txnErr) {
            await connection.rollback();
            throw txnErr;
        } finally {
            connection.release();
        }

        req.flash('success', `Swap request ${decision === 'approve' ? 'approved' : 'rejected'} and student notified.`);
        res.redirect('/chairman/swaps');

    } catch (error) {
        console.error('Swap decision error:', error);
        req.flash('error', 'Failed to process swap decision.');
        res.redirect('/chairman/swaps');
    }
};

// SUPERVISOR MANAGEMENT
// ============================================================
exports.getSupervisors = async (req, res) => {
    try {
        // Get current Chairman's department
        const [chairmanRows] = await db.execute(
            `SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`,
            [req.session.user.id]
        );

        if (chairmanRows.length === 0) {
            req.flash('error', 'Chairman profile or department not found.');
            return res.redirect('/chairman/dashboard');
        }

        const departmentId = chairmanRows[0].department_id;

        // Get academic sessions for this department
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

        // Determine which session to view (Default to active session if none selected)
        let selectedSessionId = req.query.session_id;
        if (!selectedSessionId) {
            const activeSession = sessions.find(s => s.status === 'active');
            selectedSessionId = activeSession ? activeSession.id : (sessions.length > 0 ? sessions[0].id : null);
        }

        // Get supervisors, joining session-specific capacities and allocations
        let query = `
            SELECT
                sp.id,
                sp.user_id,
                sp.department_id,
                sp.supervisor_id,
                sp.designation,
                sp.specialization,
                sp.capacity AS default_capacity,
                sp.is_available,
                sp.created_at,
                
                u.name,
                u.email,
                u.account_status,
                u.is_verified,
                
                sc.capacity AS session_capacity,
                
                COUNT(
                    DISTINCT CASE
                        WHEN a.allocation_status IN ('allocated', 'swapped')
                        AND ar.session_id = ?
                        THEN a.student_id
                    END
                ) AS assigned_students

            FROM supervisor_profiles sp
            
            INNER JOIN users u ON u.id = sp.user_id
            
            -- Fetch override capacity for the selected session
            LEFT JOIN supervisor_capacities sc ON sc.supervisor_id = sp.id AND sc.session_id = ?
            
            -- Fetch allocations and run info to count active students
            LEFT JOIN allocations a ON a.supervisor_id = sp.id
            LEFT JOIN allocation_runs ar ON ar.id = a.allocation_run_id

            WHERE sp.department_id = ?

            GROUP BY
                sp.id, sp.user_id, sp.department_id, sp.supervisor_id, sp.designation, sp.specialization,
                sp.capacity, sp.is_available, sp.created_at, u.name, u.email, u.account_status, u.is_verified, sc.capacity
                
            ORDER BY u.name ASC
        `;

        const params = [selectedSessionId, selectedSessionId, departmentId];
        const [supervisors] = await db.execute(query, params);

        return res.render('chairman/supervisors', {
            supervisors,
            sessions,
            selectedSessionId
        });

    } catch (error) {
        console.error('Get supervisors error:', error);
        req.flash('error', 'Unable to load supervisors.');
        return res.redirect('/chairman/dashboard');
    }
};
exports.createSupervisor = async (req, res) => {

    const {
        name,
        email,
        password,
        supervisor_id,
        designation,
        specialization,
        capacity
    } = req.body;

    if (
        !name ||
        !email ||
        !password ||
        !supervisor_id
    ) {

        req.flash(
            'error',
            'Name, email, password, and Supervisor ID are required.'
        );

        return res.redirect('/chairman/supervisors');
    }


    if (password.length < 4) {

        req.flash(
            'error',
            'Password must contain at least 4 characters.'
        );

        return res.redirect('/chairman/supervisors');
    }


    const parsedCapacity =
        Number.isInteger(Number(capacity))
            ? Number(capacity)
            : 5;


    if (parsedCapacity < 0) {

        req.flash(
            'error',
            'Capacity cannot be negative.'
        );

        return res.redirect('/chairman/supervisors');
    }


    const chairmanUserId =
        req.session.user.id;


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
         * Get Chairman department
         */

        const [chairmen] =
            await connection.execute(
                `
                SELECT department_id
                FROM chairman_profiles
                WHERE user_id = ?
                  AND is_current = TRUE
                LIMIT 1
                `,
                [chairmanUserId]
            );


        if (chairmen.length === 0) {

            throw new Error(
                'Chairman department information was not found.'
            );
        }


        const departmentId =
            chairmen[0].department_id;


        const normalizedEmail =
            email.trim().toLowerCase();

        const normalizedSupervisorId =
            supervisor_id.trim();


        /*
         * Check email
         */

        const [existingEmail] =
            await connection.execute(
                `
                SELECT id
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [normalizedEmail]
            );


        if (existingEmail.length > 0) {

            throw new Error(
                'This email address is already registered.'
            );
        }


        /*
         * Check Supervisor ID
         */

        const [existingSupervisorId] =
            await connection.execute(
                `
                SELECT id
                FROM supervisor_profiles
                WHERE supervisor_id = ?
                LIMIT 1
                `,
                [normalizedSupervisorId]
            );


        if (existingSupervisorId.length > 0) {

            throw new Error(
                'This Supervisor ID is already in use.'
            );
        }


        /*
         * Hash password
         */

        const passwordHash =
            await bcrypt.hash(
                password,
                12
            );


        /*
         * Create user
         */

        const [userResult] =
            await connection.execute(
                `
                INSERT INTO users
                (
                    name,
                    email,
                    password_hash,
                    role,
                    account_status,
                    is_verified
                )

                VALUES
                (
                    ?,
                    ?,
                    ?,
                    'supervisor',
                    'active',
                    TRUE
                )
                `,
                [
                    name.trim(),
                    normalizedEmail,
                    passwordHash
                ]
            );


        const userId =
            userResult.insertId;


        /*
         * Create Supervisor profile
         */

        const [profileResult] =
            await connection.execute(
                `
                INSERT INTO supervisor_profiles
                (
                    user_id,
                    department_id,
                    supervisor_id,
                    designation,
                    specialization,
                    capacity,
                    is_available
                )

                VALUES
                (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    TRUE
                )
                `,
                [
                    userId,
                    departmentId,
                    normalizedSupervisorId,
                    designation
                        ? designation.trim()
                        : null,
                    specialization
                        ? specialization.trim()
                        : null,
                    parsedCapacity
                ]
            );


        const supervisorProfileId =
            profileResult.insertId;


        /*
         * Audit log
         */

        await connection.execute(
            `
            INSERT INTO audit_logs
            (
                user_id,
                action,
                entity_type,
                entity_id,
                description
            )

            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?
            )
            `,
            [
                chairmanUserId,
                'create',
                'supervisor',
                userId,
                `Created Supervisor ${name.trim()} (${normalizedSupervisorId}).`
            ]
        );


        await connection.commit();


        req.flash(
            'success',
            'Supervisor created successfully.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } catch (error) {

        await connection.rollback();


        console.error(
            'Create supervisor error:',
            error
        );


        req.flash(
            'error',
            error.message ||
            'Failed to create supervisor.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } finally {

        connection.release();
    }
};

exports.updateSupervisor = async (req, res) => {

    const supervisorProfileId =
        req.params.id;


    const {
        name,
        email,
        supervisor_id,
        designation,
        specialization,
        capacity
    } = req.body;


    if (
        !name ||
        !email ||
        !supervisor_id
    ) {

        req.flash(
            'error',
            'Name, email, and Supervisor ID are required.'
        );

        return res.redirect(
            '/chairman/supervisors'
        );
    }


    const parsedCapacity =
        Number(capacity);


    if (
        !Number.isInteger(parsedCapacity) ||
        parsedCapacity < 0
    ) {

        req.flash(
            'error',
            'Capacity must be a valid non-negative number.'
        );

        return res.redirect(
            '/chairman/supervisors'
        );
    }


    const chairmanUserId =
        req.session.user.id;


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
         * Get Chairman department
         */

        const [chairmen] =
            await connection.execute(
                `
                SELECT department_id
                FROM chairman_profiles
                WHERE user_id = ?
                  AND is_current = TRUE
                LIMIT 1
                `,
                [chairmanUserId]
            );


        if (chairmen.length === 0) {

            throw new Error(
                'Chairman department information was not found.'
            );
        }


        const departmentId =
            chairmen[0].department_id;


        /*
         * Get Supervisor
         */

        const [supervisors] =
            await connection.execute(
                `
                SELECT
                    sp.id,
                    sp.user_id,
                    sp.department_id,
                    sp.supervisor_id

                FROM supervisor_profiles sp

                WHERE sp.id = ?
                  AND sp.department_id = ?

                LIMIT 1
                `,
                [
                    supervisorProfileId,
                    departmentId
                ]
            );


        if (supervisors.length === 0) {

            throw new Error(
                'Supervisor not found in your department.'
            );
        }


        const supervisor =
            supervisors[0];


        const normalizedEmail =
            email.trim().toLowerCase();

        const normalizedSupervisorId =
            supervisor_id.trim();


        /*
         * Check email
         */

        const [emailCheck] =
            await connection.execute(
                `
                SELECT id
                FROM users
                WHERE email = ?
                  AND id != ?
                LIMIT 1
                `,
                [
                    normalizedEmail,
                    supervisor.user_id
                ]
            );


        if (emailCheck.length > 0) {

            throw new Error(
                'This email address is already used by another account.'
            );
        }


        /*
         * Check Supervisor ID
         */

        const [supervisorIdCheck] =
            await connection.execute(
                `
                SELECT id
                FROM supervisor_profiles
                WHERE supervisor_id = ?
                  AND id != ?
                LIMIT 1
                `,
                [
                    normalizedSupervisorId,
                    supervisorProfileId
                ]
            );


        if (supervisorIdCheck.length > 0) {

            throw new Error(
                'This Supervisor ID is already in use.'
            );
        }


        /*
         * Update user
         */

        await connection.execute(
            `
            UPDATE users

            SET
                name = ?,
                email = ?

            WHERE id = ?
            `,
            [
                name.trim(),
                normalizedEmail,
                supervisor.user_id
            ]
        );


        /*
         * Update Supervisor profile
         */

        await connection.execute(
            `
            UPDATE supervisor_profiles

            SET
                supervisor_id = ?,
                designation = ?,
                specialization = ?,
                capacity = ?

            WHERE id = ?
              AND department_id = ?
            `,
            [
                normalizedSupervisorId,
                designation
                    ? designation.trim()
                    : null,
                specialization
                    ? specialization.trim()
                    : null,
                parsedCapacity,
                supervisorProfileId,
                departmentId
            ]
        );


        /*
         * Audit
         */

        await connection.execute(
            `
            INSERT INTO audit_logs
            (
                user_id,
                action,
                entity_type,
                entity_id,
                description
            )

            VALUES (?, ?, ?, ?, ?)
            `,
            [
                chairmanUserId,
                'update',
                'supervisor',
                supervisor.user_id,
                `Updated Supervisor ${name.trim()}.`
            ]
        );


        await connection.commit();


        req.flash(
            'success',
            'Supervisor updated successfully.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } catch (error) {

        await connection.rollback();


        console.error(
            'Update supervisor error:',
            error
        );


        req.flash(
            'error',
            error.message ||
            'Failed to update supervisor.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } finally {

        connection.release();
    }
};

exports.toggleSupervisorStatus = async (req, res) => {

    const supervisorProfileId =
        req.params.id;


    const chairmanUserId =
        req.session.user.id;


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
         * Get Chairman department
         */

        const [chairmen] =
            await connection.execute(
                `
                SELECT department_id
                FROM chairman_profiles
                WHERE user_id = ?
                  AND is_current = TRUE
                LIMIT 1
                `,
                [chairmanUserId]
            );


        if (chairmen.length === 0) {

            throw new Error(
                'Chairman department information was not found.'
            );
        }


        const departmentId =
            chairmen[0].department_id;


        /*
         * Get Supervisor
         */

        const [supervisors] =
            await connection.execute(
                `
                SELECT
                    sp.id,
                    sp.user_id,
                    sp.department_id,
                    sp.is_available,

                    u.name,
                    u.account_status

                FROM supervisor_profiles sp

                INNER JOIN users u
                    ON u.id = sp.user_id

                WHERE sp.id = ?
                  AND sp.department_id = ?

                LIMIT 1
                `,
                [
                    supervisorProfileId,
                    departmentId
                ]
            );


        if (supervisors.length === 0) {

            throw new Error(
                'Supervisor not found in your department.'
            );
        }


        const supervisor =
            supervisors[0];


        /*
         * Disable
         */

        if (
            supervisor.account_status === 'active'
        ) {

            await connection.execute(
                `
                UPDATE users

                SET account_status = 'disabled'

                WHERE id = ?
                `,
                [supervisor.user_id]
            );


            /*
             * Also make unavailable
             */

            await connection.execute(
                `
                UPDATE supervisor_profiles

                SET is_available = FALSE

                WHERE id = ?
                  AND department_id = ?
                `,
                [
                    supervisorProfileId,
                    departmentId
                ]
            );


            req.flash(
                'success',
                'Supervisor disabled successfully.'
            );
        }


        /*
         * Enable
         */

        else if (
            supervisor.account_status === 'disabled'
        ) {

            await connection.execute(
                `
                UPDATE users

                SET account_status = 'active'

                WHERE id = ?
                `,
                [supervisor.user_id]
            );


            await connection.execute(
                `
                UPDATE supervisor_profiles

                SET is_available = TRUE

                WHERE id = ?
                  AND department_id = ?
                `,
                [
                    supervisorProfileId,
                    departmentId
                ]
            );


            req.flash(
                'success',
                'Supervisor enabled successfully.'
            );
        }


        else {

            throw new Error(
                'Supervisor account cannot be toggled from its current status.'
            );
        }


        /*
         * Audit
         */

        await connection.execute(
            `
            INSERT INTO audit_logs
            (
                user_id,
                action,
                entity_type,
                entity_id,
                description
            )

            VALUES (?, ?, ?, ?, ?)
            `,
            [
                chairmanUserId,
                'status_change',
                'supervisor',
                supervisor.user_id,
                `Changed Supervisor status for ${supervisor.name}.`
            ]
        );


        await connection.commit();


        res.redirect(
            '/chairman/supervisors'
        );


    } catch (error) {

        await connection.rollback();


        console.error(
            'Toggle supervisor error:',
            error
        );


        req.flash(
            'error',
            error.message ||
            'Failed to change supervisor status.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } finally {

        connection.release();
    }
};


exports.toggleSupervisorAvailability = async (req, res) => {

    const supervisorProfileId =
        req.params.id;


    const chairmanUserId =
        req.session.user.id;


    try {

        const [chairmen] =
            await db.execute(
                `
                SELECT department_id
                FROM chairman_profiles
                WHERE user_id = ?
                  AND is_current = TRUE
                LIMIT 1
                `,
                [chairmanUserId]
            );


        if (chairmen.length === 0) {

            req.flash(
                'error',
                'Chairman department information was not found.'
            );

            return res.redirect(
                '/chairman/supervisors'
            );
        }


        const departmentId =
            chairmen[0].department_id;


        const [supervisors] =
            await db.execute(
                `
                SELECT
                    id,
                    is_available

                FROM supervisor_profiles

                WHERE id = ?
                  AND department_id = ?

                LIMIT 1
                `,
                [
                    supervisorProfileId,
                    departmentId
                ]
            );


        if (supervisors.length === 0) {

            req.flash(
                'error',
                'Supervisor not found in your department.'
            );

            return res.redirect(
                '/chairman/supervisors'
            );
        }


        const current =
            supervisors[0].is_available;


        await db.execute(
            `
            UPDATE supervisor_profiles

            SET is_available = ?

            WHERE id = ?
              AND department_id = ?
            `,
            [
                current ? 0 : 1,
                supervisorProfileId,
                departmentId
            ]
        );


        req.flash(
            'success',
            current
                ? 'Supervisor marked as unavailable.'
                : 'Supervisor marked as available.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } catch (error) {

        console.error(
            'Toggle supervisor availability error:',
            error
        );


        req.flash(
            'error',
            'Failed to update supervisor availability.'
        );


        res.redirect(
            '/chairman/supervisors'
        );
    }
};


exports.setSupervisorCapacity = async (req, res) => {

    const {
        supervisor_id,
        session_id,
        capacity
    } = req.body;


    const parsedCapacity =
        Number(capacity);


    if (
        !Number.isInteger(parsedCapacity) ||
        parsedCapacity < 0
    ) {

        req.flash(
            'error',
            'Capacity must be a valid non-negative number.'
        );

        return res.redirect(
            '/chairman/supervisors'
        );
    }


    const chairmanUserId =
        req.session.user.id;


    const connection =
        await db.getConnection();


    try {

        await connection.beginTransaction();


        /*
         * Get Chairman department
         */

        const [chairmen] =
            await connection.execute(
                `
                SELECT department_id
                FROM chairman_profiles
                WHERE user_id = ?
                  AND is_current = TRUE
                LIMIT 1
                `,
                [chairmanUserId]
            );


        if (chairmen.length === 0) {

            throw new Error(
                'Chairman department information was not found.'
            );
        }


        const departmentId =
            chairmen[0].department_id;


        /*
         * Verify Supervisor belongs to department
         */

        const [supervisors] =
            await connection.execute(
                `
                SELECT id
                FROM supervisor_profiles

                WHERE id = ?
                  AND department_id = ?

                LIMIT 1
                `,
                [
                    supervisor_id,
                    departmentId
                ]
            );


        if (supervisors.length === 0) {

            throw new Error(
                'Supervisor does not belong to your department.'
            );
        }


        /*
         * Verify Session belongs to department
         */

        const [sessions] =
            await connection.execute(
                `
                SELECT id
                FROM academic_sessions

                WHERE id = ?
                  AND department_id = ?

                LIMIT 1
                `,
                [
                    session_id,
                    departmentId
                ]
            );


        if (sessions.length === 0) {

            throw new Error(
                'Selected session does not belong to your department.'
            );
        }


        /*
         * Check existing used capacity
         */

        const [existing] =
            await connection.execute(
                `
                SELECT
                    id,
                    used_capacity

                FROM supervisor_capacities

                WHERE supervisor_id = ?
                  AND session_id = ?

                LIMIT 1
                `,
                [
                    supervisor_id,
                    session_id
                ]
            );


        if (
            existing.length > 0 &&
            parsedCapacity < existing[0].used_capacity
        ) {

            throw new Error(
                `Capacity cannot be lower than the current used capacity (${existing[0].used_capacity}).`
            );
        }


        /*
         * Insert or update
         */

        await connection.execute(
            `
            INSERT INTO supervisor_capacities
            (
                supervisor_id,
                session_id,
                capacity,
                used_capacity,
                status
            )

            VALUES
            (
                ?,
                ?,
                ?,
                0,
                'active'
            )

            ON DUPLICATE KEY UPDATE
                capacity = VALUES(capacity),
                status = 'active'
            `,
            [
                supervisor_id,
                session_id,
                parsedCapacity
            ]
        );


        /*
         * Audit
         */

        await connection.execute(
            `
            INSERT INTO audit_logs
            (
                user_id,
                action,
                entity_type,
                entity_id,
                description
            )

            VALUES (?, ?, ?, ?, ?)
            `,
            [
                chairmanUserId,
                'update',
                'supervisor_capacity',
                supervisor_id,
                `Updated session-wise supervisor capacity to ${parsedCapacity}.`
            ]
        );


        await connection.commit();


        req.flash(
            'success',
            'Supervisor session capacity updated successfully.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } catch (error) {

        await connection.rollback();


        console.error(
            'Set supervisor capacity error:',
            error
        );


        req.flash(
            'error',
            error.message ||
            'Failed to update supervisor capacity.'
        );


        res.redirect(
            '/chairman/supervisors'
        );


    } finally {

        connection.release();
    }
};




// ========================================
// STUDENT APPROVAL MANAGEMENT
// ========================================

// exports.getPendingStudents = async (req, res) => {
//     try {
//         // Get current Chairman's department
//         const [chairmanRows] = await db.execute(
//             `
//             SELECT department_id
//             FROM chairman_profiles
//             WHERE user_id = ?
//               AND is_current = 1
//             LIMIT 1
//             `,
//             [req.session.user.id]
//         );

//         if (chairmanRows.length === 0) {
//             req.flash('error', 'Chairman profile or department not found.');
//             return res.redirect('/chairman/dashboard');
//         }

//         const departmentId = chairmanRows[0].department_id;

//         // Get pending students from this department only
//         const [students] = await db.execute(
//             `
//             SELECT
//                 sp.id,
//                 sp.user_id,
//                 sp.student_id,
//                 sp.phone,
//                 sp.registration_status,
//                 sp.created_at,

//                 u.name,
//                 u.email,
//                 u.is_verified,
//                 u.account_status,

//                 d.name AS department_name,
//                 d.code AS department_code,

//                 s.session_name,
//                 s.start_year,
//                 s.end_year

//             FROM student_profiles sp

//             INNER JOIN users u
//                 ON u.id = sp.user_id

//             INNER JOIN departments d
//                 ON d.id = sp.department_id

//             INNER JOIN academic_sessions s
//                 ON s.id = sp.session_id

//             WHERE sp.department_id = ?
//               AND sp.registration_status = 'pending'

//             ORDER BY sp.created_at ASC
//             `,
//             [departmentId]
//         );

//         return res.render('chairman/pending-students', {
//             students
//         });

//     } catch (error) {
//         console.error('Get pending students error:', error);

//         req.flash(
//             'error',
//             'Unable to load pending student registrations.'
//         );

//         return res.redirect('/chairman/dashboard');
//     }
// };

// ========================================
// STUDENT APPROVAL MANAGEMENT
// ========================================

exports.getPendingStudents = async (req, res) => {
    try {
        const [chairmanRows] = await db.execute(
            `
            SELECT department_id
            FROM chairman_profiles
            WHERE user_id = ?
              AND is_current = 1
            LIMIT 1
            `,
            [req.session.user.id]
        );

        if (chairmanRows.length === 0) {
            req.flash('error', 'Chairman profile or department not found.');
            return res.redirect('/chairman/dashboard');
        }

        const departmentId = chairmanRows[0].department_id;

        // Added "AND u.account_status = 'active'" to filter out admin-deleted accounts
        const [students] = await db.execute(
            `
            SELECT
                sp.id,
                sp.user_id,
                sp.student_id,
                sp.phone,
                sp.registration_status,
                sp.created_at,

                u.name,
                u.email,
                u.is_verified,
                u.account_status,

                d.name AS department_name,
                d.code AS department_code,

                s.session_name,
                s.start_year,
                s.end_year

            FROM student_profiles sp
            INNER JOIN users u ON u.id = sp.user_id
            INNER JOIN departments d ON d.id = sp.department_id
            INNER JOIN academic_sessions s ON s.id = sp.session_id

            WHERE sp.department_id = ?
              AND sp.registration_status = 'pending'
              AND u.account_status = 'active' 

            ORDER BY sp.created_at ASC
            `,
            [departmentId]
        );

        return res.render('chairman/pending-students', { students });

    } catch (error) {
        console.error('Get pending students error:', error);
        req.flash('error', 'Unable to load pending student registrations.');
        return res.redirect('/chairman/dashboard');
    }
};



// ========================================
// APPROVE STUDENT
// ========================================
exports.approveStudent = async (req, res) => {
    const studentProfileId = req.params.id;

    try {
        const [chairmanRows] = await db.execute(`SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`, [req.session.user.id]);
        if (chairmanRows.length === 0) return res.redirect('/chairman/pending-students');
        const departmentId = chairmanRows[0].department_id;

        const [students] = await db.execute(`
            SELECT sp.id, sp.user_id, u.name, u.email
            FROM student_profiles sp
            INNER JOIN users u ON u.id = sp.user_id
            WHERE sp.id = ? AND sp.department_id = ? AND sp.registration_status = 'pending' LIMIT 1
        `, [studentProfileId, departmentId]);

        if (students.length === 0) {
            req.flash('error', 'Pending student not found or access denied.');
            return res.redirect('/chairman/pending-students');
        }

        const student = students[0];
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            await connection.execute(`UPDATE users SET account_status = 'active' WHERE id = ?`, [student.user_id]);
            await connection.execute(`
                UPDATE student_profiles SET registration_status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?
            `, [req.session.user.id, studentProfileId]);

            await connection.commit();
        } catch (transactionError) {
            await connection.rollback();
            throw transactionError;
        } finally {
            connection.release();
        }

        // Send Approval Email
        const mailOptions = {
            from: '"ThesisPilot Admin" <your.actual.email@gmail.com>',
            to: student.email,
            subject: 'ThesisPilot Registration Approved!',
            text: `Hello ${student.name},\n\nGreat news! Your account has been officially approved by the Chairman.\n\nYou can now log in to the portal to submit your supervisor preferences and manage your thesis project.\n\nBest,\nThesisPilot Team`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #16a34a;">Account Approved!</h2>
                    <p>Hello ${student.name},</p>
                    <p>Great news! Your ThesisPilot account has been officially approved by your department Chairman.</p>
                    <p>You can now log in to the portal to submit your supervisor preferences and track your thesis milestones.</p>
                </div>
            `
        };
        transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));

        req.flash('success', `${student.name} has been approved successfully and notified via email.`);
        return res.redirect('/chairman/pending-students');

    } catch (error) {
        console.error('Approve student error:', error);
        req.flash('error', 'Unable to approve student.');
        return res.redirect('/chairman/pending-students');
    }
};
// ========================================
// REJECT STUDENT (HARD RESET WORKFLOW)
// ========================================

exports.rejectStudent = async (req, res) => {
    const studentProfileId = req.params.id;

    try {
        // Get current Chairman's department
        const [chairmanRows] = await db.execute(
            `
            SELECT department_id
            FROM chairman_profiles
            WHERE user_id = ?
              AND is_current = 1
            LIMIT 1
            `,
            [req.session.user.id]
        );

        if (chairmanRows.length === 0) {
            req.flash('error', 'Chairman profile or department not found.');
            return res.redirect('/chairman/pending-students');
        }

        const departmentId = chairmanRows[0].department_id;

        // Find pending student in Chairman's department AND fetch their email
        const [students] = await db.execute(
            `
            SELECT
                sp.id,
                sp.user_id,
                sp.registration_status,
                u.name,
                u.email
            FROM student_profiles sp
            INNER JOIN users u
                ON u.id = sp.user_id
            WHERE sp.id = ?
              AND sp.department_id = ?
              AND sp.registration_status = 'pending'
            LIMIT 1
            `,
            [studentProfileId, departmentId]
        );

        if (students.length === 0) {
            req.flash('error', 'Pending student not found or access denied.');
            return res.redirect('/chairman/pending-students');
        }

        const student = students[0];
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Hard Reset: Delete the student profile data completely
            await connection.execute(`DELETE FROM student_profiles WHERE id = ?`, [studentProfileId]);

            // 2. Hard Reset: Delete the base user account (wipes login credentials)
            await connection.execute(`DELETE FROM users WHERE id = ?`, [student.user_id]);

            // 3. Audit log (Record that a rejection/deletion took place)
            await connection.execute(
                `
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description)
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    req.session.user.id,
                    'student_rejected',
                    'student_profile',
                    studentProfileId,
                    `Student "${student.name}" rejected by Chairman. Pending account permanently deleted.`
                ]
            );

            await connection.commit();
        } catch (transactionError) {
            await connection.rollback();
            throw transactionError;
        } finally {
            connection.release();
        }

        // Send Rejection Email
        const mailOptions = {
            from: '"ThesisPilot Admin" <your.project.email@gmail.com>',
            to: student.email,
            subject: 'ThesisPilot Registration Declined',
            text: `Hello ${student.name},\n\nYour registration for the ThesisPilot platform has been declined by the department Chairman. Your pending account has been removed from our system.\n\nPlease double-check your Student ID and Academic Session, and submit a new registration.\n\nBest,\nThesisPilot Team`
        };
        transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));

        req.flash('success', `${student.name}'s registration has been rejected. Their pending account was deleted.`);
        return res.redirect('/chairman/pending-students');

    } catch (error) {
        console.error('Reject student error:', error);
        req.flash('error', 'Unable to reject student.');
        return res.redirect('/chairman/pending-students');
    }
};





// ============================================================
// STUDENT MANAGEMENT
// ============================================================
exports.getStudents = async (req, res) => {
    try {
        // Get current Chairman's department
        const [chairmanRows] = await db.execute(
            `SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`,
            [req.session.user.id]
        );

        if (chairmanRows.length === 0) {
            req.flash('error', 'Chairman profile or department not found.');
            return res.redirect('/chairman/dashboard');
        }

        const departmentId = chairmanRows[0].department_id;

        // Get filters from URL query
        const search = (req.query.search || '').trim();
        const sessionId = req.query.session_id || '';
        const status = req.query.status || '';
        const allocationStatus = req.query.allocation_status || '';
        const supervisorId = req.query.supervisor_id || '';

            let query = `
                    SELECT
                        sp.id,
                        sp.user_id,
                        sp.student_id,
                        sp.phone,
                        sp.registration_status,
                        sp.approved_at,
                        sp.created_at,

                        u.name,
                        u.email,
                        u.account_status,
                        u.is_verified,

                        s.id AS session_id,
                        s.session_name,
                        s.start_year,
                        s.end_year,

                        a.supervisor_id AS allocated_supervisor_id,
                        sup_u.name AS allocated_supervisor_name

                    FROM student_profiles sp

                    INNER JOIN users u
                        ON u.id = sp.user_id

                    INNER JOIN academic_sessions s
                        ON s.id = sp.session_id

                    LEFT JOIN allocations a 
                        ON a.student_id = sp.id AND a.allocation_status IN ('allocated', 'swapped')
                    LEFT JOIN supervisor_profiles sup_p 
                        ON a.supervisor_id = sup_p.id
                    LEFT JOIN users sup_u 
                        ON sup_p.user_id = sup_u.id

                    WHERE sp.department_id = ?
                    AND u.account_status = 'active'
                `;

        const params = [departmentId];

        // 1. Search Filter
        if (search) {
            query += ` AND (u.name LIKE ? OR u.email LIKE ? OR sp.student_id LIKE ?)`;
            const searchValue = `%${search}%`;
            params.push(searchValue, searchValue, searchValue);
        }

        // 2. Session Filter
        if (sessionId) {
            query += ` AND sp.session_id = ?`;
            params.push(sessionId);
        }

        // 3. Registration Status Filter
        if (status) {
            query += ` AND sp.registration_status = ?`;
            params.push(status);
        }

        // 4. Allocation Status Filter (Allocated / Unallocated)
        if (allocationStatus === 'allocated') {
            query += ` AND a.id IS NOT NULL`;
        } else if (allocationStatus === 'unallocated') {
            query += ` AND a.id IS NULL AND sp.registration_status = 'approved'`;
        }

        // 5. Supervisor Filter
        if (supervisorId) {
            query += ` AND a.supervisor_id = ?`;
            params.push(supervisorId);
        }

        query += ` ORDER BY sp.created_at DESC, u.name ASC`;

        const [students] = await db.execute(query, params);

        // Get department sessions for the filter dropdown
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

        // Fetch active supervisors for the filter and manual assign dropdowns
        const [supervisors] = await db.execute(`
            SELECT sp.id, u.name, sp.capacity, COALESCE(assigned.assigned_count, 0) AS assigned_count
            FROM supervisor_profiles sp
            INNER JOIN users u ON sp.user_id = u.id
            LEFT JOIN (
                SELECT supervisor_id, COUNT(*) AS assigned_count FROM allocations 
                WHERE allocation_status IN ('allocated', 'swapped') GROUP BY supervisor_id
            ) assigned ON assigned.supervisor_id = sp.id
            WHERE sp.department_id = ? AND sp.is_available = 1 AND u.account_status = 'active'
            ORDER BY u.name ASC
        `, [departmentId]);

        return res.render('chairman/students', {
            students,
            sessions,
            supervisors,
            filters: { search, sessionId, status, allocationStatus, supervisorId }
        });

    } catch (error) {
        console.error('Get students error:', error);
        req.flash('error', 'Unable to load students.');
        return res.redirect('/chairman/dashboard');
    }
};

// ========================================
// ALLOCATION CENTER - STEP 12A
// ========================================
exports.getAllocationCenter = async (req, res) => {
    try {

        // ----------------------------------------
        // Find current Chairman's department
        // ----------------------------------------

        const [chairmanRows] = await db.execute(
            `
            SELECT
                cp.department_id,
                d.name AS department_name,
                d.code AS department_code
            FROM chairman_profiles cp
            INNER JOIN departments d
                ON d.id = cp.department_id
            WHERE cp.user_id = ?
              AND cp.is_current = 1
            LIMIT 1
            `,
            [req.session.user.id]
        );

        if (chairmanRows.length === 0) {
            req.flash('error', 'Chairman profile or department not found.');
            return res.redirect('/chairman/dashboard');
        }

        const chairman = chairmanRows[0];
        const departmentId = chairman.department_id;


        // ----------------------------------------
        // Get department sessions
        // ----------------------------------------

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

        let selectedSessionId = req.query.session_id ? Number(req.query.session_id) : null;

        if (!selectedSessionId) {
            const activeSession = sessions.find(session => session.status === 'active');
            if (activeSession) selectedSessionId = activeSession.id;
        }

        if (!selectedSessionId) {
            return res.render('chairman/allocation', {
                chairman, sessions, selectedSessionId: null, allocationRun: null,
                students: [], supervisors: [], previewResults: [], finalAllocations: [],
                summary: { totalStudents: 0, eligibleStudents: 0, studentsWithPreferences: 0, studentsWithoutPreferences: 0, allocatedStudents: 0, totalSupervisors: 0, availableSupervisors: 0, totalCapacity: 0 }
            });
        }

        const selectedSession = sessions.find(session => Number(session.id) === selectedSessionId);

        if (!selectedSession) {
            req.flash('error', 'Invalid academic session selected.');
            return res.redirect('/chairman/allocation');
        }


        // ----------------------------------------
        // Find latest allocation run
        // ----------------------------------------

        const [runRows] = await db.execute(
            `
            SELECT id, department_id, session_id, created_by, strategy, status, started_at, completed_at, created_at, updated_at
            FROM allocation_runs
            WHERE department_id = ? AND session_id = ?
            ORDER BY id DESC LIMIT 1
            `,
            [departmentId, selectedSessionId]
        );

        const allocationRun = runRows.length > 0 ? runRows[0] : null;

        let selectedStudentIds = [];
        let selectedSupervisorIds = [];

        if (allocationRun) {
            const [selectedStudents] = await db.execute(`SELECT student_id FROM allocation_student_participants WHERE allocation_run_id = ?`, [allocationRun.id]);
            selectedStudentIds = selectedStudents.map(row => Number(row.student_id));

            const [selectedSupervisors] = await db.execute(`SELECT supervisor_id FROM allocation_participants WHERE allocation_run_id = ?`, [allocationRun.id]);
            selectedSupervisorIds = selectedSupervisors.map(row => Number(row.supervisor_id));
        }

        const currentRunId = allocationRun ? allocationRun.id : null;

        // ----------------------------------------
        // Get eligible students
        // ----------------------------------------

        const [students] = await db.execute(
            `
            SELECT
                sp.id, sp.student_id, sp.user_id, sp.phone, sp.registration_status, sp.created_at,
                u.name, u.email, u.account_status, u.is_verified,
                COALESCE(pref.preference_count, 0) AS preference_count,
                pref.highest_priority,
                CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS is_allocated,
                a.supervisor_id AS allocated_supervisor_id,
                su.name AS allocated_supervisor_name,
                a.priority_matched
            FROM student_profiles sp
            INNER JOIN users u ON u.id = sp.user_id
            LEFT JOIN (
                SELECT student_id, COUNT(*) AS preference_count, MIN(priority) AS highest_priority
                FROM supervisor_preferences WHERE session_id = ? GROUP BY student_id
            ) pref ON pref.student_id = sp.id
            LEFT JOIN allocations a ON a.student_id = sp.id AND a.allocation_run_id = ?
            LEFT JOIN supervisor_profiles asp ON asp.id = a.supervisor_id
            LEFT JOIN users su ON su.id = asp.user_id
            WHERE sp.department_id = ? AND sp.session_id = ? AND sp.registration_status = 'approved' AND u.account_status = 'active'
            ORDER BY is_allocated ASC, preference_count DESC, u.name ASC
            `,
            [selectedSessionId, currentRunId || 0, departmentId, selectedSessionId]
        );

        // ----------------------------------------
        // Get supervisors and capacity
        // ----------------------------------------

        const [supervisors] = await db.execute(
            `
            SELECT
                sp.id, sp.user_id, sp.supervisor_id, sp.designation, sp.specialization, sp.capacity AS default_capacity, sp.is_available,
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
            WHERE sp.department_id = ? AND u.account_status != 'archived'
            ORDER BY u.name ASC
            `,
            [selectedSessionId, departmentId, selectedSessionId, departmentId]
        );

        // ----------------------------------------
        // Fetch Preview Results (if preview)
        // ----------------------------------------
        let previewResults = [];
        if (allocationRun && allocationRun.status === 'preview') {
            const [pResults] = await db.execute(`
                SELECT
                    apr.id, apr.student_id AS student_profile_id, apr.supervisor_id AS supervisor_profile_id, apr.priority_matched, apr.result_status, apr.reason,
                    stu_u.name AS student_name, stu_u.email AS student_email, sp.student_id AS student_code,
                    sup_u.name AS supervisor_name, sup_p.supervisor_id AS supervisor_code
                FROM allocation_preview_results apr
                INNER JOIN student_profiles sp ON apr.student_id = sp.id
                INNER JOIN users stu_u ON sp.user_id = stu_u.id
                LEFT JOIN supervisor_profiles sup_p ON apr.supervisor_id = sup_p.id
                LEFT JOIN users sup_u ON sup_p.user_id = sup_u.id
                WHERE apr.allocation_run_id = ?
                ORDER BY stu_u.name ASC
            `, [allocationRun.id]);
            previewResults = pResults;
        }

        // ----------------------------------------
        // Fetch Final Allocations (if confirmed/locked)
        // ----------------------------------------
        let finalAllocations = [];
        if (allocationRun && (allocationRun.status === 'confirmed' || allocationRun.status === 'locked')) {
            const [fResults] = await db.execute(`
                SELECT
                    a.id, a.student_id AS student_profile_id, a.supervisor_id AS supervisor_profile_id, a.priority_matched, a.allocation_status,
                    stu_u.name AS student_name, stu_u.email AS student_email, sp.student_id AS student_code,
                    sup_u.name AS supervisor_name, sup_p.supervisor_id AS supervisor_code
                FROM allocations a
                INNER JOIN student_profiles sp ON a.student_id = sp.id
                INNER JOIN users stu_u ON sp.user_id = stu_u.id
                INNER JOIN supervisor_profiles sup_p ON a.supervisor_id = sup_p.id
                INNER JOIN users sup_u ON sup_p.user_id = sup_u.id
                WHERE a.allocation_run_id = ?
                ORDER BY stu_u.name ASC
            `, [allocationRun.id]);
            finalAllocations = fResults;
        }

        // ----------------------------------------
        // Summary calculations
        // ----------------------------------------

        const totalStudents = students.length;
        const eligibleStudents = students.length;
        const studentsWithPreferences = students.filter(student => Number(student.preference_count) > 0).length;
        const studentsWithoutPreferences = eligibleStudents - studentsWithPreferences;
        const allocatedStudents = students.filter(student => Number(student.is_allocated) === 1).length;
        const totalSupervisors = supervisors.length;
        const availableSupervisors = supervisors.filter(supervisor => Number(supervisor.is_available) === 1 && supervisor.account_status === 'active' && Number(supervisor.assigned_count) < Number(supervisor.session_capacity)).length;
        const totalCapacity = supervisors.reduce((total, supervisor) => total + Number(supervisor.session_capacity || 0), 0);

        return res.render('chairman/allocation', {
            chairman, sessions, selectedSessionId, selectedSession, allocationRun,
            students, supervisors, previewResults, finalAllocations, selectedStudentIds, selectedSupervisorIds,
            summary: { totalStudents, eligibleStudents, studentsWithPreferences, studentsWithoutPreferences, allocatedStudents, totalSupervisors, availableSupervisors, totalCapacity }
        });

    } catch (error) {
        console.error('Allocation center error:', error);
        req.flash('error', 'Unable to load Allocation Center.');
        return res.redirect('/chairman/dashboard');
    }
};

exports.openAllocation = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const chairmanUserId = req.session.user.id;
        const { session_id, strategy } = req.body;

        // --------------------------------------------------------
        // Validate input
        // --------------------------------------------------------

        if (!session_id) {
            req.flash(
                'error',
                'Academic session is required.'
            );

            return res.redirect('/chairman/allocation');
        }

        const allowedStrategies = [
            'preference_priority',
            'random_lottery',
            'balanced',
            'hybrid'
        ];

        if (!allowedStrategies.includes(strategy)) {
            req.flash(
                'error',
                'Invalid allocation strategy selected.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${session_id}`
            );
        }

        // --------------------------------------------------------
        // Get current Chairman
        // --------------------------------------------------------

        const [chairmanRows] = await connection.execute(`
            SELECT
                cp.department_id,
                d.name AS department_name
            FROM chairman_profiles cp

            INNER JOIN departments d
                ON d.id = cp.department_id

            WHERE cp.user_id = ?
              AND cp.is_current = 1

            LIMIT 1
        `, [chairmanUserId]);

        if (chairmanRows.length === 0) {
            req.flash(
                'error',
                'Current Chairman profile not found.'
            );

            return res.redirect('/chairman/dashboard');
        }

        const departmentId =
            chairmanRows[0].department_id;

        // --------------------------------------------------------
        // Verify session belongs to Chairman's department
        // --------------------------------------------------------

        const [sessionRows] = await connection.execute(`
            SELECT
                id,
                session_name,
                status
            FROM academic_sessions
            WHERE id = ?
              AND department_id = ?
            LIMIT 1
        `, [
            session_id,
            departmentId
        ]);

        if (sessionRows.length === 0) {
            req.flash(
                'error',
                'Selected academic session does not belong to your department.'
            );

            return res.redirect('/chairman/allocation');
        }

        // --------------------------------------------------------
        // Check for existing active allocation run
        // --------------------------------------------------------

        const [existingRuns] = await connection.execute(`
            SELECT
                id,
                status,
                strategy
            FROM allocation_runs
            WHERE department_id = ?
              AND session_id = ?
              AND status IN (
                  'open',
                  'preview',
                  'confirmed',
                  'locked'
              )
            ORDER BY id DESC
            LIMIT 1
        `, [
            departmentId,
            session_id
        ]);

        if (existingRuns.length > 0) {

            const existingRun = existingRuns[0];

            req.flash(
                'error',
                `An allocation run already exists for this session (Run #${existingRun.id}, status: ${existingRun.status}).`
            );

            return res.redirect(
                `/chairman/allocation?session_id=${session_id}`
            );
        }

        // --------------------------------------------------------
        // Create allocation run
        // --------------------------------------------------------

        await connection.beginTransaction();

        const [result] = await connection.execute(`
            INSERT INTO allocation_runs
            (
                department_id,
                session_id,
                created_by,
                strategy,
                status,
                started_at
            )
            VALUES (?, ?, ?, ?, 'open', NOW())
        `, [
            departmentId,
            session_id,
            chairmanUserId,
            strategy
        ]);

        const allocationRunId = result.insertId;

        // --------------------------------------------------------
        // Audit log
        // --------------------------------------------------------

        await connection.execute(`
            INSERT INTO audit_logs
            (
                user_id,
                action,
                entity_type,
                entity_id,
                description,
                ip_address
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            chairmanUserId,
            'allocation_run_opened',
            'allocation_run',
            allocationRunId,
            `Opened allocation run #${allocationRunId} for session ${sessionRows[0].session_name} using strategy ${strategy}.`,
            req.ip
        ]);

        await connection.commit();

        req.flash(
            'success',
            `Allocation Run #${allocationRunId} opened successfully.`
        );

        return res.redirect(
            `/chairman/allocation?session_id=${session_id}`
        );

    } catch (error) {

        await connection.rollback();

        console.error(
            'Open allocation error:',
            error
        );

        req.flash(
            'error',
            'Failed to open allocation run.'
        );

        return res.redirect(
            `/chairman/allocation?session_id=${req.body.session_id || ''}`
        );

    } finally {
        connection.release();
    }
};

exports.saveAllocationParticipants = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const chairmanUserId = req.session.user.id;

        let { session_id, student_ids, supervisor_ids } = req.body;

        console.log('--------------------------------------------');
        console.log('SAVE ALLOCATION PARTICIPANTS');
        console.log('Chairman User ID:', chairmanUserId);
        console.log('Received Session ID:', session_id);
        console.log('Received Student IDs:', student_ids);
        console.log('Received Supervisor IDs:', supervisor_ids);
        console.log('--------------------------------------------');

        // --------------------------------------------------
        // 1. NORMALIZE SESSION ID
        // --------------------------------------------------

        if (Array.isArray(session_id)) {
            session_id = session_id[0];
        }

        const sessionId = Number(session_id);

        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            req.flash('error', 'Invalid academic session.');
            return res.redirect('/chairman/allocation');
        }

        // --------------------------------------------------
        // 2. NORMALIZE STUDENT IDS
        // --------------------------------------------------

        if (student_ids === undefined) {
            student_ids = [];
        } else if (!Array.isArray(student_ids)) {
            student_ids = [student_ids];
        }

        student_ids = student_ids
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0);

        // --------------------------------------------------
        // 3. NORMALIZE SUPERVISOR IDS
        // --------------------------------------------------

        if (supervisor_ids === undefined) {
            supervisor_ids = [];
        } else if (!Array.isArray(supervisor_ids)) {
            supervisor_ids = [supervisor_ids];
        }

        supervisor_ids = supervisor_ids
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0);

        // Remove duplicates
        student_ids = [...new Set(student_ids)];
        supervisor_ids = [...new Set(supervisor_ids)];

        if (student_ids.length === 0) {
            req.flash('error', 'Please select at least one student.');
            return res.redirect(`/chairman/allocation?session_id=${sessionId}`);
        }

        if (supervisor_ids.length === 0) {
            req.flash('error', 'Please select at least one supervisor.');
            return res.redirect(`/chairman/allocation?session_id=${sessionId}`);
        }

        // --------------------------------------------------
        // 4. FIND CURRENT CHAIRMAN
        // --------------------------------------------------

        const [chairmanRows] = await connection.execute(`
            SELECT
                cp.department_id,
                d.name AS department_name
            FROM chairman_profiles cp
            INNER JOIN departments d
                ON d.id = cp.department_id
            WHERE cp.user_id = ?
              AND cp.is_current = 1
            LIMIT 1
        `, [chairmanUserId]);

        if (chairmanRows.length === 0) {
            req.flash('error', 'Current Chairman profile not found.');
            return res.redirect('/chairman/dashboard');
        }

        const departmentId = chairmanRows[0].department_id;

        // --------------------------------------------------
        // 5. VERIFY ACADEMIC SESSION
        // --------------------------------------------------

        const [sessionRows] = await connection.execute(`
            SELECT
                id,
                session_name,
                department_id,
                status
            FROM academic_sessions
            WHERE id = ?
              AND department_id = ?
            LIMIT 1
        `, [sessionId, departmentId]);

        if (sessionRows.length === 0) {
            req.flash(
                'error',
                'Selected academic session does not belong to your department.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }

        // --------------------------------------------------
        // 6. FIND OPEN ALLOCATION RUN
        // --------------------------------------------------

        const [runRows] = await connection.execute(`
            SELECT
                id,
                session_id,
                department_id,
                strategy,
                status
            FROM allocation_runs
            WHERE id = (
                SELECT MAX(id)
                FROM allocation_runs
                WHERE department_id = ?
                  AND session_id = ?
                  AND status = 'open'
            )
            LIMIT 1
        `, [departmentId, sessionId]);

        if (runRows.length === 0) {
            req.flash(
                'error',
                'No open allocation run exists for this academic session.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }

        const allocationRun = runRows[0];
        const allocationRunId = allocationRun.id;

        // --------------------------------------------------
        // 7. VERIFY STUDENTS BELONG TO THIS DEPARTMENT/SESSION
        // --------------------------------------------------

        const studentPlaceholders = student_ids.map(() => '?').join(',');

        const [validStudents] = await connection.execute(`
            SELECT
                sp.id,
                sp.student_id,
                sp.department_id,
                sp.session_id,
                sp.registration_status,
                u.account_status
            FROM student_profiles sp
            INNER JOIN users u
                ON u.id = sp.user_id
            WHERE sp.id IN (${studentPlaceholders})
              AND sp.department_id = ?
              AND sp.session_id = ?
              AND sp.registration_status = 'approved'
              AND u.account_status = 'active'
        `, [
            ...student_ids,
            departmentId,
            sessionId
        ]);

        const validStudentIds = validStudents.map(
            student => Number(student.id)
        );

        const invalidStudentIds = student_ids.filter(
            id => !validStudentIds.includes(id)
        );

        if (invalidStudentIds.length > 0) {
            req.flash(
                'error',
                'One or more selected students are not eligible for this allocation.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }


        
        // --------------------------------------------------
        // 8. VERIFY SUPERVISORS AND FETCH TRUE CAPACITY
        // --------------------------------------------------

        const supervisorPlaceholders = supervisor_ids.map(() => '?').join(',');

        const [validSupervisors] = await connection.execute(`
            SELECT
                sp.id,
                sp.supervisor_id,
                sp.department_id,
                sp.is_available,
                COALESCE(sc.capacity, sp.capacity) AS capacity
            FROM supervisor_profiles sp
            INNER JOIN users u
                ON u.id = sp.user_id
            LEFT JOIN supervisor_capacities sc
                ON sc.supervisor_id = sp.id AND sc.session_id = ?
            WHERE sp.id IN (${supervisorPlaceholders})
              AND sp.department_id = ?
              AND u.account_status = 'active'
        `, [
            sessionId,
            ...supervisor_ids,
            departmentId
        ]);

        const validSupervisorIds = validSupervisors.map(
            supervisor => Number(supervisor.id)
        );

        const invalidSupervisorIds = supervisor_ids.filter(
            id => !validSupervisorIds.includes(id)
        );

        if (invalidSupervisorIds.length > 0) {
            req.flash(
                'error',
                'One or more selected supervisors are invalid or do not belong to your department.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }


        // --------------------------------------------------
        // 9. SAVE PARTICIPANTS
        // --------------------------------------------------

        await connection.beginTransaction();

        // Clear previous participant selections for this run.
        await connection.execute(`
            DELETE FROM allocation_student_participants
            WHERE allocation_run_id = ?
        `, [allocationRunId]);

        await connection.execute(`
            DELETE FROM allocation_participants
            WHERE allocation_run_id = ?
        `, [allocationRunId]);

        // --------------------------------------------------
        // 10. INSERT SELECTED STUDENTS
        // --------------------------------------------------

        for (const studentId of student_ids) {
            await connection.execute(`
                INSERT INTO allocation_student_participants
                (
                    allocation_run_id,
                    student_id
                )
                VALUES (?, ?)
            `, [
                allocationRunId,
                studentId
            ]);
        }

        // --------------------------------------------------
        // 11. INSERT SELECTED SUPERVISORS
        // --------------------------------------------------

        for (const supervisor of validSupervisors) {
            await connection.execute(`
                INSERT INTO allocation_participants
                (
                    allocation_run_id,
                    supervisor_id,
                    capacity
                )
                VALUES (?, ?, ?)
            `, [
                allocationRunId,
                supervisor.id,
                Number(supervisor.capacity || 0)
            ]);
        }

        // --------------------------------------------------
        // 12. AUDIT LOG
        // --------------------------------------------------

        await connection.execute(`
            INSERT INTO audit_logs
            (
                user_id,
                action,
                entity_type,
                entity_id,
                description,
                ip_address
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            chairmanUserId,
            'allocation_participants_saved',
            'allocation_run',
            allocationRunId,
            `Saved ${student_ids.length} student(s) and ${supervisor_ids.length} supervisor(s) for allocation run #${allocationRunId}.`,
            req.ip
        ]);

        await connection.commit();

        console.log('Allocation participants saved successfully.');
        console.log('Allocation Run:', allocationRunId);
        console.log('Students:', student_ids);
        console.log('Supervisors:', supervisor_ids);

        req.flash(
            'success',
            `Allocation participants saved successfully. ${student_ids.length} student(s) and ${supervisor_ids.length} supervisor(s) selected.`
        );

        return res.redirect(
            `/chairman/allocation?session_id=${sessionId}`
        );

    } catch (error) {

        await connection.rollback();

        console.error('Save allocation participants error:', error);

        req.flash(
            'error',
            'Failed to save allocation participants.'
        );

        const rawSessionId = Array.isArray(req.body.session_id)
            ? req.body.session_id[0]
            : req.body.session_id;

        const fallbackSessionId = Number(rawSessionId);

        if (
            Number.isInteger(fallbackSessionId) &&
            fallbackSessionId > 0
        ) {
            return res.redirect(
                `/chairman/allocation?session_id=${fallbackSessionId}`
            );
        }

        return res.redirect('/chairman/allocation');

    } finally {
        connection.release();
    }
};



// ============================================================
// GENERATE ALLOCATION PREVIEW
// ============================================================
exports.generateAllocationPreview = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const chairmanUserId = req.session.user.id;

        let { session_id } = req.body;

        console.log('--------------------------------------------');
        console.log('GENERATE ALLOCATION PREVIEW');
        console.log('Chairman User ID:', chairmanUserId);
        console.log('Received Session ID:', session_id);
        console.log('--------------------------------------------');

        // --------------------------------------------------
        // 1. NORMALIZE SESSION ID
        // --------------------------------------------------

        if (Array.isArray(session_id)) {
            session_id = session_id[0];
        }

        const sessionId = Number(session_id);

        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            req.flash('error', 'Invalid academic session.');
            return res.redirect('/chairman/allocation');
        }

        // --------------------------------------------------
        // 2. FIND CURRENT CHAIRMAN
        // --------------------------------------------------

        const [chairmanRows] = await connection.execute(`
            SELECT
                cp.department_id,
                d.name AS department_name
            FROM chairman_profiles cp
            INNER JOIN departments d
                ON d.id = cp.department_id
            WHERE cp.user_id = ?
              AND cp.is_current = 1
            LIMIT 1
        `, [chairmanUserId]);

        if (chairmanRows.length === 0) {
            req.flash('error', 'Current Chairman profile not found.');
            return res.redirect('/chairman/dashboard');
        }

        const departmentId = chairmanRows[0].department_id;

        // --------------------------------------------------
        // 3. VERIFY ACADEMIC SESSION
        // --------------------------------------------------

        const [sessionRows] = await connection.execute(`
            SELECT
                id,
                session_name,
                department_id,
                status
            FROM academic_sessions
            WHERE id = ?
              AND department_id = ?
            LIMIT 1
        `, [sessionId, departmentId]);

        if (sessionRows.length === 0) {
            req.flash(
                'error',
                'Selected academic session does not belong to your department.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }

        // --------------------------------------------------
        // 4. FIND OPEN ALLOCATION RUN
        // --------------------------------------------------

        const [runRows] = await connection.execute(`
            SELECT
                id,
                department_id,
                session_id,
                strategy,
                status
            FROM allocation_runs
            WHERE department_id = ?
              AND session_id = ?
              AND status = 'open'
            ORDER BY id DESC
            LIMIT 1
        `, [
            departmentId,
            sessionId
        ]);

        if (runRows.length === 0) {
            req.flash(
                'error',
                'No open allocation run exists for this session.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }

        const allocationRun = runRows[0];
        const allocationRunId = allocationRun.id;

        console.log('Allocation Run:', allocationRunId);
        console.log('Strategy:', allocationRun.strategy);

        // --------------------------------------------------
        // 5. GET SELECTED STUDENTS
        // --------------------------------------------------

        const [selectedStudents] = await connection.execute(`
            SELECT
                asp.student_id
            FROM allocation_student_participants asp
            WHERE asp.allocation_run_id = ?
            ORDER BY asp.student_id ASC
        `, [allocationRunId]);

        if (selectedStudents.length === 0) {
            req.flash(
                'error',
                'No students have been selected for this allocation.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }

        const selectedStudentIds = selectedStudents.map(
            row => Number(row.student_id)
        );

        console.log('Selected Students:', selectedStudentIds);

        // --------------------------------------------------
        // 6. GET SELECTED SUPERVISORS
        // --------------------------------------------------

        const [selectedSupervisors] = await connection.execute(`
            SELECT
                ap.supervisor_id,
                ap.capacity
            FROM allocation_participants ap
            WHERE ap.allocation_run_id = ?
            ORDER BY ap.supervisor_id ASC
        `, [allocationRunId]);

        if (selectedSupervisors.length === 0) {
            req.flash(
                'error',
                'No supervisors have been selected for this allocation.'
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }

        console.log(
            'Selected Supervisors:',
            selectedSupervisors.map(row => ({
                supervisorId: Number(row.supervisor_id),
                capacity: Number(row.capacity)
            }))
        );

        // --------------------------------------------------
        // 7. CHECK TOTAL CAPACITY
        // --------------------------------------------------

        const totalCapacity = selectedSupervisors.reduce(
            (total, supervisor) =>
                total + Number(supervisor.capacity || 0),
            0
        );

        if (totalCapacity < selectedStudentIds.length) {
            req.flash(
                'error',
                `Insufficient supervisor capacity. Selected students: ${selectedStudentIds.length}, available capacity: ${totalCapacity}.`
            );

            return res.redirect(
                `/chairman/allocation?session_id=${sessionId}`
            );
        }

        // --------------------------------------------------
        // 8. LOAD STUDENT PREFERENCES
        // --------------------------------------------------

        const studentPlaceholders =
            selectedStudentIds.map(() => '?').join(',');

        const [preferences] = await connection.execute(`
            SELECT
                sp.student_id,
                sp.supervisor_id,
                sp.priority
            FROM supervisor_preferences sp
            WHERE sp.session_id = ?
              AND sp.student_id IN (${studentPlaceholders})
            ORDER BY
                sp.student_id ASC,
                sp.priority ASC
        `, [
            sessionId,
            ...selectedStudentIds
        ]);

        console.log('Preference rows:', preferences.length);

        // --------------------------------------------------
        // 9. LOAD EXISTING ASSIGNMENTS
        // --------------------------------------------------

        const supervisorIds = selectedSupervisors.map(
            supervisor => Number(supervisor.supervisor_id)
        );

        const supervisorPlaceholders =
            supervisorIds.map(() => '?').join(',');

        const [existingAssignments] = await connection.execute(`
            SELECT
                a.supervisor_id,
                COUNT(*) AS assigned_count
            FROM allocations a
            INNER JOIN allocation_runs ar
                ON ar.id = a.allocation_run_id
            WHERE a.supervisor_id IN (${supervisorPlaceholders})
              AND ar.session_id = ?
              AND a.allocation_status IN ('allocated', 'swapped')
            GROUP BY a.supervisor_id
        `, [
            ...supervisorIds,
            sessionId
        ]);

        // --------------------------------------------------
        // 10. BUILD SUPERVISOR CAPACITY MAP
        // --------------------------------------------------

        const supervisorMap = new Map();

        selectedSupervisors.forEach(supervisor => {
            supervisorMap.set(
                Number(supervisor.supervisor_id),
                {
                    capacity: Number(supervisor.capacity || 0),
                    used: 0
                }
            );
        });

        existingAssignments.forEach(row => {
            const supervisorId = Number(row.supervisor_id);

            if (supervisorMap.has(supervisorId)) {
                supervisorMap.get(supervisorId).used =
                    Number(row.assigned_count || 0);
            }
        });

        // --------------------------------------------------
        // 11. BUILD STUDENT PREFERENCE MAP
        // --------------------------------------------------

        const preferenceMap = new Map();

        preferences.forEach(row => {
            const studentId = Number(row.student_id);
            const supervisorId = Number(row.supervisor_id);
            const priority = Number(row.priority);

            if (!preferenceMap.has(studentId)) {
                preferenceMap.set(studentId, []);
            }

            preferenceMap.get(studentId).push({
                supervisorId,
                priority
            });
        });

        // --------------------------------------------------
        // 12. PREPARE STUDENT ORDER
        // --------------------------------------------------

        let studentOrder = [...selectedStudentIds];

        if (allocationRun.strategy === 'random_lottery') {
            studentOrder.sort(() => Math.random() - 0.5);
        }

        if (allocationRun.strategy === 'hybrid') {
            studentOrder.sort(() => Math.random() - 0.5);
        }

        // --------------------------------------------------
        // 13. GENERATE PREVIEW
        // --------------------------------------------------

        const previewResults = [];

        for (const studentId of studentOrder) {

            const studentPreferences =
                preferenceMap.get(studentId) || [];

            let assignedSupervisorId = null;
            let matchedPriority = null;
            let reason = null;

            // ----------------------------------------------
            // FIRST: TRY STUDENT PREFERENCES
            // ----------------------------------------------

            for (const preference of studentPreferences) {

                const supervisor =
                    supervisorMap.get(preference.supervisorId);

                if (!supervisor) {
                    continue;
                }

                if (supervisor.used >= supervisor.capacity) {
                    continue;
                }

                assignedSupervisorId =
                    preference.supervisorId;

                matchedPriority =
                    preference.priority;

                supervisor.used += 1;

                reason =
                    `Assigned according to supervisor preference #${preference.priority}.`;

                break;
            }

            // ----------------------------------------------
            // BALANCED / HYBRID FALLBACK
            // ----------------------------------------------

            if (
                !assignedSupervisorId &&
                (
                    allocationRun.strategy === 'balanced' ||
                    allocationRun.strategy === 'hybrid'
                )
            ) {

                let bestSupervisorId = null;
                let bestLoadRatio = Infinity;

                for (const [
                    supervisorId,
                    supervisor
                ] of supervisorMap.entries()) {

                    if (
                        supervisor.used >=
                        supervisor.capacity
                    ) {
                        continue;
                    }

                    const loadRatio =
                        supervisor.capacity > 0
                            ? supervisor.used /
                              supervisor.capacity
                            : Infinity;

                    if (loadRatio < bestLoadRatio) {
                        bestLoadRatio = loadRatio;
                        bestSupervisorId = supervisorId;
                    }
                }

                if (bestSupervisorId !== null) {

                    assignedSupervisorId =
                        bestSupervisorId;

                    matchedPriority = null;

                    supervisorMap.get(
                        bestSupervisorId
                    ).used += 1;

                    reason =
                        'Assigned using balanced capacity fallback.';
                }
            }

            // ----------------------------------------------
            // RANDOM FALLBACK
            // ----------------------------------------------

            if (
                !assignedSupervisorId &&
                allocationRun.strategy === 'random_lottery'
            ) {

                const availableSupervisors = [];

                for (const [
                    supervisorId,
                    supervisor
                ] of supervisorMap.entries()) {

                    if (
                        supervisor.used <
                        supervisor.capacity
                    ) {
                        availableSupervisors.push(
                            supervisorId
                        );
                    }
                }

                if (availableSupervisors.length > 0) {

                    const randomIndex =
                        Math.floor(
                            Math.random() *
                            availableSupervisors.length
                        );

                    assignedSupervisorId =
                        availableSupervisors[randomIndex];

                    matchedPriority = null;

                    supervisorMap.get(
                        assignedSupervisorId
                    ).used += 1;

                    reason =
                        'Assigned using random lottery fallback.';
                }
            }

            // ----------------------------------------------
            // PREFERENCE PRIORITY FAILURE
            // ----------------------------------------------

            if (!assignedSupervisorId) {

                if (studentPreferences.length === 0) {
                    reason =
                        'Student has no supervisor preferences.';
                } else {
                    reason =
                        'All preferred supervisors are at capacity or were not selected.';
                }
            }

            // ----------------------------------------------
            // SAVE RESULT IN MEMORY
            // ----------------------------------------------

            previewResults.push({
                studentId,
                supervisorId: assignedSupervisorId,
                priorityMatched: matchedPriority,
                status: assignedSupervisorId
                    ? 'assigned'
                    : 'unassigned',
                reason
            });
        }

        // --------------------------------------------------
        // 14. COUNTS
        // --------------------------------------------------

        const assignedCount =
            previewResults.filter(
                result => result.status === 'assigned'
            ).length;

        const unassignedCount =
            previewResults.filter(
                result => result.status === 'unassigned'
            ).length;

        console.log('--------------------------------------------');
        console.log('PREVIEW GENERATED');
        console.log('Total:', previewResults.length);
        console.log('Assigned:', assignedCount);
        console.log('Unassigned:', unassignedCount);
        console.log('--------------------------------------------');

        // --------------------------------------------------
        // 15. SAVE PREVIEW
        // --------------------------------------------------

        await connection.beginTransaction();

        await connection.execute(`
            DELETE FROM allocation_preview_results
            WHERE allocation_run_id = ?
        `, [allocationRunId]);

        for (const result of previewResults) {

            await connection.execute(`
                INSERT INTO allocation_preview_results
                (
                    allocation_run_id,
                    student_id,
                    supervisor_id,
                    priority_matched,
                    result_status,
                    reason
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                allocationRunId,
                result.studentId,
                result.supervisorId,
                result.priorityMatched,
                result.status,
                result.reason
            ]);
        }

        // --------------------------------------------------
        // 16. CHANGE RUN STATUS
        // --------------------------------------------------

        await connection.execute(`
            UPDATE allocation_runs
            SET
                status = 'preview',
                completed_at = NOW()
            WHERE id = ?
        `, [allocationRunId]);

        // --------------------------------------------------
        // 17. AUDIT LOG
        // --------------------------------------------------

        await connection.execute(`
            INSERT INTO audit_logs
            (
                user_id,
                action,
                entity_type,
                entity_id,
                description,
                ip_address
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            chairmanUserId,
            'allocation_preview_generated',
            'allocation_run',
            allocationRunId,
            `Generated allocation preview. ${assignedCount} students assigned and ${unassignedCount} students unassigned.`,
            req.ip
        ]);

        await connection.commit();

        req.flash(
            'success',
            `Allocation preview generated successfully. ${assignedCount} students assigned, ${unassignedCount} unassigned.`
        );

        return res.redirect(
            `/chairman/allocation?session_id=${sessionId}`
        );

    } catch (error) {

        await connection.rollback();

        console.error(
            'Generate allocation preview error:',
            error
        );

        req.flash(
            'error',
            `Failed to generate allocation preview: ${error.message}`
        );

        const rawSessionId =
            Array.isArray(req.body.session_id)
                ? req.body.session_id[0]
                : req.body.session_id;

        const fallbackSessionId =
            Number(rawSessionId);

        if (
            Number.isInteger(fallbackSessionId) &&
            fallbackSessionId > 0
        ) {
            return res.redirect(
                `/chairman/allocation?session_id=${fallbackSessionId}`
            );
        }

        return res.redirect(
            '/chairman/allocation'
        );

    } finally {
        connection.release();
    }
};


// ============================================================
// CONFIRM ALLOCATION - STEP 5
// ============================================================
exports.confirmAllocation = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const chairmanUserId = req.session.user.id;
        let { session_id } = req.body;

        if (Array.isArray(session_id)) session_id = session_id[0];
        const sessionId = Number(session_id);

        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            req.flash('error', 'Invalid academic session.');
            return res.redirect('/chairman/allocation');
        }

        // 1. Get Chairman Department
        const [chairmen] = await connection.execute(`
            SELECT department_id FROM chairman_profiles 
            WHERE user_id = ? AND is_current = 1 LIMIT 1
        `, [chairmanUserId]);

        if (chairmen.length === 0) {
            req.flash('error', 'Current Chairman profile not found.');
            return res.redirect('/chairman/dashboard');
        }
        const departmentId = chairmen[0].department_id;

        // 2. Find the 'preview' Allocation Run
        const [runRows] = await connection.execute(`
            SELECT id FROM allocation_runs 
            WHERE department_id = ? AND session_id = ? AND status = 'preview' 
            ORDER BY id DESC LIMIT 1
        `, [departmentId, sessionId]);

        if (runRows.length === 0) {
            req.flash('error', 'No preview allocation run found to confirm.');
            return res.redirect(`/chairman/allocation?session_id=${sessionId}`);
        }
        const allocationRunId = runRows[0].id;

        // 3. Get all 'assigned' preview results
        const [previewResults] = await connection.execute(`
            SELECT student_id, supervisor_id, priority_matched 
            FROM allocation_preview_results 
            WHERE allocation_run_id = ? AND result_status = 'assigned'
        `, [allocationRunId]);

        await connection.beginTransaction();

        // 4. Clear any existing allocations for this run (safety measure)
        await connection.execute(`
            DELETE FROM allocations WHERE allocation_run_id = ?
        `, [allocationRunId]);

        // 5. Insert final allocations
        for (const result of previewResults) {
            await connection.execute(`
                INSERT INTO allocations 
                (allocation_run_id, student_id, supervisor_id, priority_matched, allocation_status, allocated_at)
                VALUES (?, ?, ?, ?, 'allocated', NOW())
            `, [
                allocationRunId, 
                result.student_id, 
                result.supervisor_id, 
                result.priority_matched
            ]);
        }

        // 6. Update run status to confirmed
        await connection.execute(`
            UPDATE allocation_runs 
            SET status = 'confirmed', updated_at = NOW() 
            WHERE id = ?
        `, [allocationRunId]);

        // 7. Audit log
        await connection.execute(`
            INSERT INTO audit_logs 
            (user_id, action, entity_type, entity_id, description, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            chairmanUserId, 
            'allocation_confirmed', 
            'allocation_run', 
            allocationRunId, 
            `Confirmed allocation run #${allocationRunId}. ${previewResults.length} students assigned.`, 
            req.ip
        ]);

        await connection.commit();

        req.flash('success', `Allocation confirmed successfully! ${previewResults.length} assignments have been saved.`);
        return res.redirect(`/chairman/allocation?session_id=${sessionId}`);

    } catch (error) {
        await connection.rollback();
        console.error('Confirm allocation error:', error);
        req.flash('error', 'Failed to confirm allocation.');
        return res.redirect('/chairman/allocation');
    } finally {
        connection.release();
    }
};



// ============================================================
// LOCK ALLOCATION - STEP 6
// ============================================================

// exports.lockAllocation = async (req, res) => {
//     const connection = await db.getConnection();

//     try {
//         const chairmanUserId = req.session.user.id;
//         let { session_id } = req.body;

//         if (Array.isArray(session_id)) session_id = session_id[0];
//         const sessionId = Number(session_id);

//         if (!Number.isInteger(sessionId) || sessionId <= 0) {
//             req.flash('error', 'Invalid academic session.');
//             return res.redirect('/chairman/allocation');
//         }

//         const [chairmen] = await connection.execute(`
//             SELECT department_id FROM chairman_profiles 
//             WHERE user_id = ? AND is_current = 1 LIMIT 1
//         `, [chairmanUserId]);

//         if (chairmen.length === 0) {
//             req.flash('error', 'Current Chairman profile not found.');
//             return res.redirect('/chairman/dashboard');
//         }
//         const departmentId = chairmen[0].department_id;

//         const [runRows] = await connection.execute(`
//             SELECT id FROM allocation_runs 
//             WHERE department_id = ? AND session_id = ? AND status = 'confirmed' 
//             ORDER BY id DESC LIMIT 1
//         `, [departmentId, sessionId]);

//         if (runRows.length === 0) {
//             req.flash('error', 'No confirmed allocation run found to lock.');
//             return res.redirect(`/chairman/allocation?session_id=${sessionId}`);
//         }
//         const allocationRunId = runRows[0].id;

//         await connection.beginTransaction();

//         // 1. Lock the run
//         await connection.execute(`
//             UPDATE allocation_runs SET status = 'locked', updated_at = NOW() WHERE id = ?
//         `, [allocationRunId]);

//         // 2. Synchronize all assigned students in the theses table
//         const [allocations] = await connection.execute(`
//             SELECT student_id FROM allocations 
//             WHERE allocation_run_id = ? AND allocation_status = 'allocated'
//         `, [allocationRunId]);

//         for (const alloc of allocations) {
//             const [theses] = await connection.execute(`
//                 SELECT id, status FROM theses WHERE student_id = ? LIMIT 1
//             `, [alloc.student_id]);

//             if (theses.length === 0) {
//                 await connection.execute(`
//                     INSERT INTO theses (student_id, session_id, status)
//                     VALUES (?, ?, 'supervisor_allocated')
//                 `, [alloc.student_id, sessionId]);
//             } else if (theses[0].status === 'registered' || theses[0].status === 'pending_allocation') {
//                 await connection.execute(`
//                     UPDATE theses SET status = 'supervisor_allocated' WHERE id = ?
//                 `, [theses[0].id]);
//             }
//         }

//         // 3. Audit log
//         await connection.execute(`
//             INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description, ip_address)
//             VALUES (?, ?, ?, ?, ?, ?)
//         `, [chairmanUserId, 'allocation_locked', 'allocation_run', allocationRunId, `Locked allocation run #${allocationRunId} and updated student thesis statuses.`, req.ip]);

//         await connection.commit();

//         req.flash('success', 'Allocation Run is now LOCKED. Supervisor assignments are authoritative.');
//         return res.redirect(`/chairman/allocation?session_id=${sessionId}`);

//     } catch (error) {
//         await connection.rollback();
//         console.error('Lock allocation error:', error);
//         req.flash('error', 'Failed to lock allocation.');
//         return res.redirect('/chairman/allocation');
//     } finally {
//         connection.release();
//     }
// };
// ============================================================
// LOCK ALLOCATION - STEP 6
// ============================================================
exports.lockAllocation = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const chairmanUserId = req.session.user.id;
        let { session_id } = req.body;

        if (Array.isArray(session_id)) session_id = session_id[0];
        const sessionId = Number(session_id);

        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            req.flash('error', 'Invalid academic session.');
            return res.redirect('/chairman/allocation');
        }

        const [chairmen] = await connection.execute(`
            SELECT department_id FROM chairman_profiles 
            WHERE user_id = ? AND is_current = 1 LIMIT 1
        `, [chairmanUserId]);
        const departmentId = chairmen[0].department_id;

        const [runRows] = await connection.execute(`
            SELECT id FROM allocation_runs 
            WHERE department_id = ? AND session_id = ? AND status = 'confirmed' 
            ORDER BY id DESC LIMIT 1
        `, [departmentId, sessionId]);

        if (runRows.length === 0) {
            req.flash('error', 'No confirmed allocation run found to lock.');
            return res.redirect(`/chairman/allocation?session_id=${sessionId}`);
        }
        const allocationRunId = runRows[0].id;

        await connection.beginTransaction();

        await connection.execute(`UPDATE allocation_runs SET status = 'locked', updated_at = NOW() WHERE id = ?`, [allocationRunId]);

        // Fetch allocations WITH student and supervisor details for emails
        const [allocations] = await connection.execute(`
            SELECT a.student_id, u.email, u.name AS student_name, sup_u.name AS supervisor_name
            FROM allocations a
            INNER JOIN student_profiles sp ON a.student_id = sp.id
            INNER JOIN users u ON sp.user_id = u.id
            INNER JOIN supervisor_profiles sup ON a.supervisor_id = sup.id
            INNER JOIN users sup_u ON sup.user_id = sup_u.id
            WHERE a.allocation_run_id = ? AND a.allocation_status = 'allocated'
        `, [allocationRunId]);

        for (const alloc of allocations) {
            const [theses] = await connection.execute(`SELECT id, status FROM theses WHERE student_id = ? LIMIT 1`, [alloc.student_id]);

            if (theses.length === 0) {
                await connection.execute(`INSERT INTO theses (student_id, session_id, status) VALUES (?, ?, 'supervisor_allocated')`, [alloc.student_id, sessionId]);
            } else if (theses[0].status === 'registered' || theses[0].status === 'pending_allocation') {
                await connection.execute(`UPDATE theses SET status = 'supervisor_allocated' WHERE id = ?`, [theses[0].id]);
            }

            // Send Allocation Email
            const mailOptions = {
                from: '"ThesisPilot" <your.actual.email@gmail.com>',
                to: alloc.email,
                subject: 'Supervisor Allocated - ThesisPilot',
                html: `
                    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                        <h2 style="color: #0f172a;">Supervisor Allocated!</h2>
                        <p>Hello ${alloc.student_name},</p>
                        <p>The department has finalized the supervisor allocations for your academic session.</p>
                        <p>You have been assigned to: <strong>${alloc.supervisor_name}</strong></p>
                        <p>Log in to your dashboard to view details and submit your thesis proposal.</p>
                    </div>
                `
            };
            transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));
        }

        await connection.execute(`
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [chairmanUserId, 'allocation_locked', 'allocation_run', allocationRunId, `Locked allocation run #${allocationRunId}.`, req.ip]);

        await connection.commit();
        req.flash('success', 'Allocation Run is now LOCKED. Students have been notified via email.');
        return res.redirect(`/chairman/allocation?session_id=${sessionId}`);

    } catch (error) {
        await connection.rollback();
        console.error('Lock allocation error:', error);
        req.flash('error', 'Failed to lock allocation.');
        return res.redirect('/chairman/allocation');
    } finally {
        connection.release();
    }
};

// CREATE STUDENT (CHAIRMAN DIRECT ADD)
// ============================================================
exports.createStudent = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { name, email, student_id, phone, session_id } = req.body;
        const chairmanUserId = req.session.user.id;

        const [chairmen] = await connection.execute(`SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`, [chairmanUserId]);
        if (chairmen.length === 0) return res.redirect('/chairman/students');
        const departmentId = chairmen[0].department_id;

        const normalizedEmail = email.trim().toLowerCase();

        // Check if email or student ID exists
        const [existing] = await connection.execute(`
            SELECT u.email, sp.student_id FROM users u 
            LEFT JOIN student_profiles sp ON u.id = sp.user_id 
            WHERE u.email = ? OR sp.student_id = ?
        `, [normalizedEmail, student_id.trim()]);

        if (existing.length > 0) {
            req.flash('error', 'A user with this email or Student ID already exists.');
            return res.redirect('/chairman/students');
        }

        const defaultPasswordHash = await bcrypt.hash('Welcome123!', 10);

        await connection.beginTransaction();

        // 1. Create User
        const [userResult] = await connection.execute(`
            INSERT INTO users (name, email, password_hash, role, account_status, is_verified) 
            VALUES (?, ?, ?, 'student', 'active', 1)
        `, [name.trim(), normalizedEmail, defaultPasswordHash]);
        
        // 2. Create Approved Student Profile
        await connection.execute(`
            INSERT INTO student_profiles (user_id, department_id, session_id, student_id, phone, registration_status, approved_by, approved_at) 
            VALUES (?, ?, ?, ?, ?, 'approved', ?, NOW())
        `, [userResult.insertId, departmentId, session_id, student_id.trim(), phone || null, chairmanUserId]);

        await connection.commit();

        // Send Welcome Email
        const mailOptions = {
            from: '"ThesisPilot Admin" <your.actual.email@gmail.com>',
            to: normalizedEmail,
            subject: 'Welcome to ThesisPilot - Account Created',
            text: `Hello ${name.trim()},\n\nYour department Chairman has manually registered your account on ThesisPilot.\n\nLogin Email: ${normalizedEmail}\nTemporary Password: Welcome123!\n\nPlease log in and change your password immediately.`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #0f172a;">Welcome to ThesisPilot</h2>
                    <p>Hello ${name.trim()},</p>
                    <p>Your department Chairman has manually registered your account.</p>
                    <p><strong>Login Email:</strong> ${normalizedEmail}<br>
                    <strong>Temporary Password:</strong> Welcome123!</p>
                    <p style="color: #dc2626;"><strong>Please log in and change your password immediately.</strong></p>
                </div>
            `
        };
        transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));

        req.flash('success', `Student ${name} added successfully. Credentials emailed.`);
        res.redirect('/chairman/students');

    } catch (error) {
        await connection.rollback();
        console.error('Create student error:', error);
        req.flash('error', 'Failed to create student.');
        res.redirect('/chairman/students');
    } finally {
        connection.release();
    }
};

// MANUAL ALLOCATION (FOR LATE STUDENTS & REASSIGNMENTS)
// ============================================================
// exports.manualAllocateStudent = async (req, res) => {
//     const connection = await db.getConnection();
//     try {
//         const { student_profile_id, supervisor_profile_id, session_id } = req.body;
//         const chairmanUserId = req.session.user.id;

//         const [chairmen] = await connection.execute(`SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`, [chairmanUserId]);
//         const departmentId = chairmen[0].department_id;

//         const [runRows] = await connection.execute(`
//             SELECT id FROM allocation_runs 
//             WHERE department_id = ? AND session_id = ? AND status = 'locked' 
//             ORDER BY id DESC LIMIT 1
//         `, [departmentId, session_id]);

//         if (runRows.length === 0) {
//             req.flash('error', 'You must have a LOCKED allocation run for this session before you can manually assign or reassign students.');
//             return res.redirect('/chairman/students');
//         }
//         const allocationRunId = runRows[0].id;

//         await connection.beginTransaction();

//         await connection.execute(`
//             INSERT INTO allocations (allocation_run_id, student_id, supervisor_id, allocation_status, allocated_at) 
//             VALUES (?, ?, ?, 'allocated', NOW())
//             ON DUPLICATE KEY UPDATE 
//                 supervisor_id = VALUES(supervisor_id),
//                 allocation_status = 'allocated',
//                 allocated_at = NOW()
//         `, [allocationRunId, student_profile_id, supervisor_profile_id]);

//         const [theses] = await connection.execute(`SELECT id, status FROM theses WHERE student_id = ? LIMIT 1`, [student_profile_id]);
//         if (theses.length === 0) {
//             await connection.execute(`INSERT INTO theses (student_id, session_id, status) VALUES (?, ?, 'supervisor_allocated')`, [student_profile_id, session_id]);
//         } else if (['registered', 'pending_allocation'].includes(theses[0].status)) {
//             await connection.execute(`UPDATE theses SET status = 'supervisor_allocated' WHERE id = ?`, [theses[0].id]);
//         }

//         // Fetch details for Email
//         const [details] = await connection.execute(`
//             SELECT u.email, u.name AS student_name, sup_u.name AS supervisor_name
//             FROM student_profiles sp
//             INNER JOIN users u ON sp.user_id = u.id
//             CROSS JOIN supervisor_profiles sup
//             INNER JOIN users sup_u ON sup.user_id = sup_u.id
//             WHERE sp.id = ? AND sup.id = ?
//         `, [student_profile_id, supervisor_profile_id]);

//         await connection.commit();

//         if (details.length > 0) {
//             const mailOptions = {
//                 from: '"ThesisPilot" <your.actual.email@gmail.com>',
//                 to: details[0].email,
//                 subject: 'Supervisor Update - ThesisPilot',
//                 html: `<p>Hello ${details[0].student_name},</p><p>Your thesis supervisor has been updated by the department. You are now assigned to: <strong>${details[0].supervisor_name}</strong>.</p><p>Please log in to your dashboard to continue your work.</p>`
//             };
//             transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));
//         }

//         req.flash('success', 'Student manually assigned/reassigned successfully and notified via email.');
//         res.redirect('/chairman/students');

//     } catch (error) {
//         await connection.rollback();
//         console.error('Manual allocate/reassign error:', error);
//         req.flash('error', 'Failed to manually allocate or reassign student.');
//         res.redirect('/chairman/students');
//     } finally {
//         connection.release();
//     }
// };
// ============================================================
// MANUAL ALLOCATION (FOR LATE STUDENTS & REASSIGNMENTS)
// ============================================================
exports.manualAllocateStudent = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { student_profile_id, supervisor_profile_id, session_id } = req.body;
        const chairmanUserId = req.session.user.id;

        const [chairmen] = await connection.execute(`SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`, [chairmanUserId]);
        const departmentId = chairmen[0].department_id;

        const [runRows] = await connection.execute(`
            SELECT id FROM allocation_runs 
            WHERE department_id = ? AND session_id = ? AND status = 'locked' 
            ORDER BY id DESC LIMIT 1
        `, [departmentId, session_id]);

        if (runRows.length === 0) {
            req.flash('error', 'You must have a LOCKED allocation run for this session before you can manually assign or reassign students.');
            return res.redirect('/chairman/students');
        }
        const allocationRunId = runRows[0].id;

        await connection.beginTransaction();

        await connection.execute(`
            INSERT INTO allocations (allocation_run_id, student_id, supervisor_id, allocation_status, allocated_at) 
            VALUES (?, ?, ?, 'allocated', NOW())
            ON DUPLICATE KEY UPDATE 
                supervisor_id = VALUES(supervisor_id),
                allocation_status = 'allocated',
                allocated_at = NOW()
        `, [allocationRunId, student_profile_id, supervisor_profile_id]);

        const [theses] = await connection.execute(`SELECT id, status FROM theses WHERE student_id = ? LIMIT 1`, [student_profile_id]);
        if (theses.length === 0) {
            await connection.execute(`INSERT INTO theses (student_id, session_id, status) VALUES (?, ?, 'supervisor_allocated')`, [student_profile_id, session_id]);
        } else if (['registered', 'pending_allocation'].includes(theses[0].status)) {
            await connection.execute(`UPDATE theses SET status = 'supervisor_allocated' WHERE id = ?`, [theses[0].id]);
        }

        // Fetch details for Email
        const [details] = await connection.execute(`
            SELECT u.email, u.name AS student_name, sup_u.name AS supervisor_name
            FROM student_profiles sp
            INNER JOIN users u ON sp.user_id = u.id
            CROSS JOIN supervisor_profiles sup
            INNER JOIN users sup_u ON sup.user_id = sup_u.id
            WHERE sp.id = ? AND sup.id = ?
        `, [student_profile_id, supervisor_profile_id]);

        await connection.commit();

        if (details.length > 0) {
            const mailOptions = {
                from: '"ThesisPilot" <your.actual.email@gmail.com>',
                to: details[0].email,
                subject: 'Supervisor Update - ThesisPilot',
                html: `<p>Hello ${details[0].student_name},</p><p>Your thesis supervisor has been updated by the department. You are now assigned to: <strong>${details[0].supervisor_name}</strong>.</p><p>Please log in to your dashboard to continue your work.</p>`
            };
            transporter.sendMail(mailOptions).catch(err => console.error('Email error:', err));
        }

        req.flash('success', 'Student manually assigned/reassigned successfully and notified via email.');
        res.redirect('/chairman/students');

    } catch (error) {
        await connection.rollback();
        console.error('Manual allocate/reassign error:', error);
        req.flash('error', 'Failed to manually allocate or reassign student.');
        res.redirect('/chairman/students');
    } finally {
        connection.release();
    }
};

const fs = require('fs');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');


// ============================================================
// BULK UPLOAD STUDENTS (CSV)
// ============================================================
exports.bulkUploadStudents = async (req, res) => {
    if (!req.file || !req.file.path) {
        req.flash('error', 'Please upload a valid CSV file.');
        return res.redirect('/chairman/students');
    }

    const { session_id } = req.body;
    const chairmanUserId = req.session.user.id;
    const results = [];
    const connection = await db.getConnection();

    try {
        const [chairmen] = await connection.execute(`SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`, [chairmanUserId]);
        if (chairmen.length === 0) {
            req.flash('error', 'Chairman department not found.');
            return res.redirect('/chairman/students');
        }
        const departmentId = chairmen[0].department_id;
        const defaultPasswordHash = await bcrypt.hash('Welcome123!', 10);

        // Parse CSV with error handling on the stream
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', (err) => {
                    console.error('CSV Parser Stream Error:', err);
                    reject(err);
                });
        });

        await connection.beginTransaction();
        let addedCount = 0;

        for (const row of results) {
            const cleanRow = {};
            for (let key in row) {
                cleanRow[key.trim().toLowerCase()] = row[key];
            }

            const student_id = (cleanRow.id || cleanRow.student_id || cleanRow.university_id) ? String(cleanRow.id || cleanRow.student_id || cleanRow.university_id).trim() : null;
            const name = (cleanRow.name) ? String(cleanRow.name).trim() : null;
            const rawEmail = cleanRow.email || cleanRow.mail;
            const email = rawEmail ? String(rawEmail).trim().toLowerCase() : null;

            if (student_id && name && email) {
                // Check if BOTH the email or the student_id already exist in the database
                const [existingUser] = await connection.execute(`SELECT id FROM users WHERE email = ?`, [email]);
                const [existingStudentProfile] = await connection.execute(`SELECT id FROM student_profiles WHERE student_id = ?`, [student_id]);
                
                if (existingUser.length === 0 && existingStudentProfile.length === 0) {
                    const [userResult] = await connection.execute(`
                        INSERT INTO users (name, email, password_hash, role, account_status, is_verified) 
                        VALUES (?, ?, ?, 'student', 'active', 1)
                    `, [name, email, defaultPasswordHash]);

                    await connection.execute(`
                        INSERT INTO student_profiles (user_id, department_id, session_id, student_id, registration_status, approved_by, approved_at) 
                        VALUES (?, ?, ?, ?, 'approved', ?, NOW())
                    `, [userResult.insertId, departmentId, session_id, student_id, chairmanUserId]);
                    
                    addedCount++;
                }
            }
        }

        await connection.commit();
        
        // Clean up uploaded file safely
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        req.flash('success', `Bulk upload complete! Successfully registered and approved ${addedCount} students.`);
        res.redirect('/chairman/students');

    } catch (error) {
        await connection.rollback();
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Bulk upload execution error:', error);
        req.flash('error', 'Failed to process CSV file. Check terminal for details.');
        res.redirect('/chairman/students');
    } finally {
        connection.release();
    }
};

// ==========================================
// DISCARD ALLOCATION PREVIEW
// ==========================================
// exports.discardPreview = async (req, res) => {
//     const { session_id } = req.body;
    
//     try {
//         const connection = await db.getConnection();
//         try {
//             await connection.beginTransaction();

//             // Find the current preview run for this session
//             const [runs] = await connection.execute(
//                 `SELECT id FROM allocation_runs WHERE session_id = ? AND status = 'preview' LIMIT 1`,
//                 [session_id]
//             );

//             if (runs.length > 0) {
//                 const runId = runs[0].id;
                
//                 // 1. Delete the draft preview results from the correct table
//                 await connection.execute(`DELETE FROM allocation_preview_results WHERE allocation_run_id = ?`, [runId]);
                
//                 // 2. Reset the run status back to 'open'
//                 await connection.execute(`UPDATE allocation_runs SET status = 'open' WHERE id = ?`, [runId]);
//             }

//             await connection.commit();
//             req.flash('success', 'Preview discarded. You can now adjust participants and run the algorithm again.');
            
//         } catch (err) {
//             await connection.rollback();
//             throw err;
//         } finally {
//             connection.release();
//         }
        
//         res.redirect(`/chairman/allocation?session_id=${session_id}`);
        
//     } catch (error) {
//         console.error('Discard preview error:', error);
//         req.flash('error', 'Failed to discard the preview.');
//         res.redirect(`/chairman/allocation?session_id=${session_id}`);
//     }
// };

// ==========================================
// DISCARD ALLOCATION & START FROM BEGINNING
// ==========================================
exports.discardPreview = async (req, res) => {
    const { session_id } = req.body;
    
    try {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Find the current active run for this session (whether it's in preview or open state)
            const [runs] = await connection.execute(
                `SELECT id FROM allocation_runs WHERE session_id = ? AND status IN ('open', 'preview') LIMIT 1`,
                [session_id]
            );

            if (runs.length > 0) {
                const runId = runs[0].id;
                
                // 1. Delete the draft preview results
                await connection.execute(`DELETE FROM allocation_preview_results WHERE allocation_run_id = ?`, [runId]);
                
                // 2. Delete the saved participants (students and supervisors)
                await connection.execute(`DELETE FROM allocation_student_participants WHERE allocation_run_id = ?`, [runId]);
                await connection.execute(`DELETE FROM allocation_participants WHERE allocation_run_id = ?`, [runId]);

                // 3. Delete the allocation run completely to reset back to Step 1
                await connection.execute(`DELETE FROM allocation_runs WHERE id = ?`, [runId]);
            }

            await connection.commit();
            req.flash('success', 'Allocation discarded completely. You can now choose a new strategy and start from the beginning.');
            
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
        
        res.redirect(`/chairman/allocation?session_id=${session_id}`);
        
    } catch (error) {
        console.error('Discard preview error:', error);
        req.flash('error', 'Failed to discard the allocation.');
        res.redirect(`/chairman/allocation?session_id=${session_id}`);
    }
};

// THESIS MANAGEMENT
// ============================================================
exports.getTheses = async (req, res) => {
    try {
        const chairmanUserId = req.session.user.id;

        // 1. Get Chairman's Department
        const [chairmanRows] = await db.execute(
            `SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`,
            [chairmanUserId]
        );

        if (chairmanRows.length === 0) {
            req.flash('error', 'Chairman profile not found.');
            return res.redirect('/chairman/dashboard');
        }
        const departmentId = chairmanRows[0].department_id;

        // 2. Get Academic Sessions for Filter
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

        // Determine selected session (Default to active session)
        let selectedSessionId = req.query.session_id;
        if (!selectedSessionId) {
            const activeSession = sessions.find(s => s.status === 'active');
            selectedSessionId = activeSession ? activeSession.id : (sessions.length > 0 ? sessions[0].id : null);
        }

        const statusFilter = req.query.status || '';

        // 3. Build Thesis Query (Fetching supervisor through allocations)
        let query = `
            SELECT 
                t.id AS thesis_id,
                t.title,
                t.status AS thesis_status,
                t.updated_at,
                
                sp.student_id AS student_code,
                stu_u.name AS student_name,
                stu_u.email AS student_email,
                
                sup_p.supervisor_id AS supervisor_code,
                sup_u.name AS supervisor_name,
                
                s.session_name
            FROM theses t
            INNER JOIN student_profiles sp ON t.student_id = sp.id
            INNER JOIN users stu_u ON sp.user_id = stu_u.id
            
            -- Join allocations to find the assigned supervisor for this student
            LEFT JOIN allocations a ON a.student_id = sp.id AND a.allocation_status IN ('allocated', 'swapped')
            LEFT JOIN supervisor_profiles sup_p ON a.supervisor_id = sup_p.id
            LEFT JOIN users sup_u ON sup_p.user_id = sup_u.id
            
            INNER JOIN academic_sessions s ON sp.session_id = s.id
            WHERE sp.department_id = ?
        `;

        const params = [departmentId];

        if (selectedSessionId) {
            query += ` AND sp.session_id = ?`;
            params.push(selectedSessionId);
        }

        if (statusFilter) {
            query += ` AND t.status = ?`;
            params.push(statusFilter);
        }

        query += ` ORDER BY t.updated_at DESC, stu_u.name ASC`;

        const [theses] = await db.execute(query, params);

        res.render('chairman/theses', {
            theses,
            sessions,
            selectedSessionId,
            statusFilter
        });

    } catch (error) {
        console.error('Get theses error:', error);
        req.flash('error', 'Failed to load thesis management data.');
        res.redirect('/chairman/dashboard');
    }
};




exports.setActiveSession = async (req, res) => {
    const { session_id } = req.body;
    const chairmanUserId = req.session.user.id;

    try {
        const [chairmen] = await db.execute(
            `SELECT department_id FROM chairman_profiles WHERE user_id = ? AND is_current = 1 LIMIT 1`,
            [chairmanUserId]
        );

        if (chairmen.length === 0) {
            req.flash('error', 'Chairman profile not found.');
            return res.redirect('/chairman/dashboard');
        }

        const [sessions] = await db.execute(
            `SELECT id FROM academic_sessions WHERE id = ? AND department_id = ? LIMIT 1`,
            [session_id, chairmen[0].department_id]
        );

        if (sessions.length === 0) {
            req.flash('error', 'Invalid academic session selected.');
            return res.redirect('/chairman/dashboard');
        }

        // Save chairman working focus in session memory ONLY
        req.session.chairmanSessionId = session_id;

        req.flash('success', 'Dashboard focus updated successfully.');
        res.redirect('/chairman/dashboard');

    } catch (error) {
        console.error('Set active session error:', error);
        req.flash('error', 'Failed to update active session.');
        res.redirect('/chairman/dashboard');
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { current_password, new_password, confirm_password } = req.body;

        if (new_password !== confirm_password) {
            req.flash('error', 'New passwords do not match.');
            return res.redirect('/chairman/dashboard');
        }

        if (!new_password || new_password.length < 4) {
            req.flash('error', 'New password must be at least 4 characters long.');
            return res.redirect('/chairman/dashboard');
        }

        const [users] = await db.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
        if (users.length === 0) {
            req.flash('error', 'User account not found.');
            return res.redirect('/');
        }

        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(current_password, users[0].password_hash);
        if (!isMatch) {
            req.flash('error', 'Incorrect current password entered.');
            return res.redirect('/chairman/dashboard');
        }

        const hashedNewPassword = await bcrypt.hash(new_password, 12);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hashedNewPassword, userId]);

        req.flash('success', 'Password updated successfully!');
        res.redirect('/chairman/dashboard');
    } catch (error) {
        console.error('Update password error:', error);
        req.flash('error', 'Failed to update password.');
        res.redirect('/chairman/dashboard');
    }
};
const db = require('../config/database');


// ============================================================
// ADMIN DASHBOARD
// ============================================================



exports.dashboard = async (req, res) => {
    try {
        // Fetch quick statistics for the dashboard
        const [deptCount] = await db.execute('SELECT COUNT(*) as count FROM departments');
        const [sessionCount] = await db.execute('SELECT COUNT(*) as count FROM academic_sessions');
        const [chairmanCount] = await db.execute('SELECT COUNT(*) as count FROM chairman_profiles WHERE is_current = 1');
        const [supervisorCount] = await db.execute('SELECT COUNT(*) as count FROM supervisor_profiles');
        const [studentCount] = await db.execute('SELECT COUNT(*) as count FROM student_profiles'); // NEW

        res.render('admin/dashboard', {
            user: req.session.user,
            stats: {
                departments: deptCount[0].count,
                sessions: sessionCount[0].count,
                chairmen: chairmanCount[0].count,
                supervisors: supervisorCount[0].count,
                students: studentCount[0].count // NEW
            }
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        req.flash('error', 'Failed to load dashboard.');
        res.redirect('/');
    }
};



// ============================================================
// DEPARTMENT LIST
// ============================================================

exports.departments = async (req, res) => {

    try {

        const [departments] = await db.execute(`
            SELECT
                d.id,
                d.name,
                d.code,
                d.description,
                d.status,
                d.created_at,

                (
                    SELECT COUNT(*)
                    FROM academic_sessions s
                    WHERE s.department_id = d.id
                ) AS session_count,

                (
                    SELECT COUNT(*)
                    FROM student_profiles sp
                    WHERE sp.department_id = d.id
                ) AS student_count,

                (
                    SELECT COUNT(*)
                    FROM supervisor_profiles sv
                    WHERE sv.department_id = d.id
                ) AS supervisor_count,

                (
                    SELECT COUNT(*)
                    FROM chairman_profiles cp
                    WHERE cp.department_id = d.id
                ) AS chairman_count

            FROM departments d
            ORDER BY d.name ASC
        `);


        res.render('admin/departments', {
            departments
        });


    } catch (error) {

        console.error(
            'Department list error:',
            error
        );

        req.flash(
            'error',
            'Unable to load departments.'
        );

        res.redirect('/admin/dashboard');
    }
};


// ============================================================
// CREATE DEPARTMENT
// ============================================================


// ==========================================
// DEPARTMENTS CRUD
// ==========================================

// exports.createDepartment = async (req, res) => {
//     const { name, code, description } = req.body;

//     try {
//         const departmentName = name.trim();
//         const departmentCode = code.trim().toUpperCase();

//         if (!departmentName || !departmentCode) {
//             req.flash('error', 'Department name and code are required.');
//             return res.redirect('/admin/departments');
//         }

//         // Check duplicate name
//         const [duplicateName] = await db.execute(
//             `SELECT id FROM departments WHERE name = ? LIMIT 1`, 
//             [departmentName]
//         );

//         if (duplicateName.length > 0) {
//             req.flash('error', 'Another department already uses this name.');
//             return res.redirect('/admin/departments');
//         }

//         // Check duplicate code
//         const [duplicateCode] = await db.execute(
//             `SELECT id FROM departments WHERE code = ? LIMIT 1`, 
//             [departmentCode]
//         );

//         if (duplicateCode.length > 0) {
//             req.flash('error', 'Another department already uses this code.');
//             return res.redirect('/admin/departments');
//         }

//         // Insert department
//         const [result] = await db.execute(
//             `INSERT INTO departments (name, code, description) VALUES (?, ?, ?)`,
//             [
//                 departmentName, 
//                 departmentCode, 
//                 description ? description.trim() : null
//             ]
//         );

//         // Log action
//         await db.execute(
//             `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'CREATE_DEPARTMENT', 'department', ?, ?)`,
//             [
//                 req.session.user.id,
//                 result.insertId,
//                 `Created department ${departmentName} (${departmentCode})`
//             ]
//         );

//         req.flash('success', 'Department created successfully.');
//         res.redirect('/admin/departments');

//     } catch (error) {
//         console.error('Create department error:', error);
//         req.flash('error', 'Unable to create department.');
//         res.redirect('/admin/departments');
//     }
// };

// exports.updateDepartment = async (req, res) => {
//     const departmentId = req.params.id;
//     const { name, code, description } = req.body;

//     try {
//         const departmentName = name.trim();
//         const departmentCode = code.trim().toUpperCase();

//         if (!departmentName || !departmentCode) {
//             req.flash('error', 'Department name and code are required.');
//             return res.redirect('/admin/departments');
//         }

//         // Check duplicate name
//         const [duplicateName] = await db.execute(
//             `SELECT id FROM departments WHERE name = ? AND id != ? LIMIT 1`,
//             [departmentName, departmentId]
//         );

//         if (duplicateName.length > 0) {
//             req.flash('error', 'Another department already uses this name.');
//             return res.redirect('/admin/departments');
//         }

//         // Check duplicate code
//         const [duplicateCode] = await db.execute(
//             `SELECT id FROM departments WHERE code = ? AND id != ? LIMIT 1`,
//             [departmentCode, departmentId]
//         );

//         if (duplicateCode.length > 0) {
//             req.flash('error', 'Another department already uses this code.');
//             return res.redirect('/admin/departments');
//         }

//         const [result] = await db.execute(
//             `UPDATE departments SET name = ?, code = ?, description = ? WHERE id = ?`,
//             [
//                 departmentName,
//                 departmentCode,
//                 description ? description.trim() : null,
//                 departmentId
//             ]
//         );

//         if (result.affectedRows === 0) {
//             req.flash('error', 'Department not found.');
//             return res.redirect('/admin/departments');
//         }

//         await db.execute(
//             `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'UPDATE_DEPARTMENT', 'department', ?, ?)`,
//             [
//                 req.session.user.id,
//                 departmentId,
//                 `Updated department ${departmentName} (${departmentCode})`
//             ]
//         );

//         req.flash('success', 'Department updated successfully.');
//         res.redirect('/admin/departments');

//     } catch (error) {
//         console.error('Update department error:', error);
//         req.flash('error', 'Unable to update department.');
//         res.redirect('/admin/departments');
//     }
// };

// ==========================================
// DEPARTMENTS CRUD
// ==========================================

exports.createDepartment = async (req, res) => {
    const { name, code } = req.body;

    try {
        const departmentName = name ? name.trim() : '';
        const departmentCode = code ? code.trim().toUpperCase() : '';

        if (!departmentName || !departmentCode) {
            req.flash('error', 'Department name and code are required.');
            return res.redirect('/admin/departments');
        }

        // Check duplicate name
        const [duplicateName] = await db.execute(
            `SELECT id FROM departments WHERE name = ? LIMIT 1`, 
            [departmentName]
        );

        if (duplicateName.length > 0) {
            req.flash('error', 'Another department already uses this name.');
            return res.redirect('/admin/departments');
        }

        // Check duplicate code
        const [duplicateCode] = await db.execute(
            `SELECT id FROM departments WHERE code = ? LIMIT 1`, 
            [departmentCode]
        );

        if (duplicateCode.length > 0) {
            req.flash('error', 'Another department already uses this code.');
            return res.redirect('/admin/departments');
        }

        // Insert department
        const [result] = await db.execute(
            `INSERT INTO departments (name, code) VALUES (?, ?)`,
            [departmentName, departmentCode]
        );

        // Log action (Safe check for audit_logs)
        if (req.session && req.session.user) {
            try {
                await db.execute(
                    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'CREATE_DEPARTMENT', 'department', ?, ?)`,
                    [
                        req.session.user.id,
                        result.insertId,
                        `Created department ${departmentName} (${departmentCode})`
                    ]
                );
            } catch (auditError) {
                console.warn('Audit log skipped:', auditError.message);
            }
        }

        req.flash('success', 'Department created successfully.');
        res.redirect('/admin/departments');

    } catch (error) {
        console.error('Create department error:', error);
        req.flash('error', 'Unable to create department.');
        res.redirect('/admin/departments');
    }
};

exports.updateDepartment = async (req, res) => {
    const departmentId = req.params.id;
    const { name, code } = req.body;

    try {
        const departmentName = name ? name.trim() : '';
        const departmentCode = code ? code.trim().toUpperCase() : '';

        if (!departmentName || !departmentCode) {
            req.flash('error', 'Department name and code are required.');
            return res.redirect('/admin/departments');
        }

        // Check duplicate name
        const [duplicateName] = await db.execute(
            `SELECT id FROM departments WHERE name = ? AND id != ? LIMIT 1`,
            [departmentName, departmentId]
        );

        if (duplicateName.length > 0) {
            req.flash('error', 'Another department already uses this name.');
            return res.redirect('/admin/departments');
        }

        // Check duplicate code
        const [duplicateCode] = await db.execute(
            `SELECT id FROM departments WHERE code = ? AND id != ? LIMIT 1`,
            [departmentCode, departmentId]
        );

        if (duplicateCode.length > 0) {
            req.flash('error', 'Another department already uses this code.');
            return res.redirect('/admin/departments');
        }

        const [result] = await db.execute(
            `UPDATE departments SET name = ?, code = ? WHERE id = ?`,
            [departmentName, departmentCode, departmentId]
        );

        if (result.affectedRows === 0) {
            req.flash('error', 'Department not found.');
            return res.redirect('/admin/departments');
        }

        // Log action
        if (req.session && req.session.user) {
            try {
                await db.execute(
                    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'UPDATE_DEPARTMENT', 'department', ?, ?)`,
                    [
                        req.session.user.id,
                        departmentId,
                        `Updated department ${departmentName} (${departmentCode})`
                    ]
                );
            } catch (auditError) {
                console.warn('Audit log skipped:', auditError.message);
            }
        }

        req.flash('success', 'Department updated successfully.');
        res.redirect('/admin/departments');

    } catch (error) {
        console.error('\n=== UPDATE DEPARTMENT ERROR ===');
        console.error(error);
        console.error('===============================\n');
        
        req.flash('error', 'Unable to update department. Check terminal for details.');
        res.redirect('/admin/departments');
    }
};
// ============================================================
// TOGGLE DEPARTMENT STATUS
// ============================================================

exports.toggleDepartmentStatus = async (req, res) => {

    const departmentId = req.params.id;


    try {

        const [departments] = await db.execute(
            `SELECT id, name, status
             FROM departments
             WHERE id = ?
             LIMIT 1`,
            [departmentId]
        );


        if (departments.length === 0) {

            req.flash(
                'error',
                'Department not found.'
            );

            return res.redirect('/admin/departments');
        }


        const department = departments[0];

        const newStatus =
            department.status === 'active'
                ? 'inactive'
                : 'active';


        await db.execute(
            `UPDATE departments
             SET status = ?
             WHERE id = ?`,
            [
                newStatus,
                departmentId
            ]
        );


        await db.execute(
            `INSERT INTO audit_logs
                (user_id, action, entity_type, entity_id, description)
             VALUES
                (?, 'CHANGE_DEPARTMENT_STATUS', 'department', ?, ?)`,
            [
                req.session.user.id,
                departmentId,
                `${department.name} changed from ${department.status} to ${newStatus}`
            ]
        );


        req.flash(
            'success',
            `Department ${newStatus === 'active'
                ? 'activated'
                : 'deactivated'
            } successfully.`
        );

        res.redirect('/admin/departments');


    } catch (error) {

        console.error(
            'Toggle department error:',
            error
        );

        req.flash(
            'error',
            'Unable to change department status.'
        );

        res.redirect('/admin/departments');
    }
};


// ============================================================
// ACADEMIC SESSION LIST
// ============================================================

exports.sessions = async (req, res) => {
    try {
        const { department_id, session_name } = req.query;

        // Base query using your original robust subqueries
        let query = `
            SELECT
                s.id,
                s.department_id,
                s.session_name,
                s.start_year,
                s.end_year,
                s.status,
                s.created_at,
                d.name AS department_name,
                d.code AS department_code,
                (
                    SELECT COUNT(*)
                    FROM student_profiles sp
                    WHERE sp.session_id = s.id
                ) AS student_count,
                (
                    SELECT COUNT(*)
                    FROM theses t
                    WHERE t.session_id = s.id
                ) AS thesis_count
            FROM academic_sessions s
            INNER JOIN departments d
                ON d.id = s.department_id
            WHERE 1=1
        `;
        const params = [];

        // Apply dynamic filters
        if (department_id) {
            query += ` AND s.department_id = ?`;
            params.push(department_id);
        }
        if (session_name) {
            query += ` AND s.session_name = ?`;
            params.push(session_name);
        }

        // Apply your original sorting
        query += ` ORDER BY d.name ASC, s.start_year DESC, s.session_name DESC`;

        const [sessions] = await db.execute(query, params);

        // Fetch active departments for the filter and modal
        const [departments] = await db.execute(`
            SELECT id, name, code
            FROM departments
            WHERE status = 'active'
            ORDER BY name ASC
        `);

        // Fetch unique session names for the filter dropdown
        const [uniqueSessions] = await db.execute(`
            SELECT DISTINCT session_name, start_year
            FROM academic_sessions
            ORDER BY start_year DESC, session_name DESC
        `);

        res.render('admin/sessions', {
            sessions,
            departments,
            uniqueSessions,
            filters: { department_id, session_name }
        });

    } catch (error) {
        console.error('Session list error:', error);
        req.flash('error', 'Unable to load academic sessions.');
        res.redirect('/admin/dashboard');
    }
};


// ============================================================
// CREATE ACADEMIC SESSION
// ============================================================

exports.createSession = async (req, res) => {

    const {
        department_id,
        session_name,
        start_year,
        end_year
    } = req.body;


    try {

        const departmentId = Number(department_id);

        const sessionName = session_name
            .trim();

        const startYear = start_year
            ? Number(start_year)
            : null;

        const endYear = end_year
            ? Number(end_year)
            : null;


        if (!departmentId || !sessionName) {

            req.flash(
                'error',
                'Department and session name are required.'
            );

            return res.redirect('/admin/sessions');
        }


        // ----------------------------------------------------
        // Verify department
        // ----------------------------------------------------

        const [departments] = await db.execute(
            `SELECT id, name, code
             FROM departments
             WHERE id = ?
             AND status = 'active'
             LIMIT 1`,
            [departmentId]
        );


        if (departments.length === 0) {

            req.flash(
                'error',
                'Selected department does not exist or is inactive.'
            );

            return res.redirect('/admin/sessions');
        }


        // ----------------------------------------------------
        // Validate years
        // ----------------------------------------------------

        if (
            startYear !== null &&
            endYear !== null &&
            (
                startYear < 2000 ||
                endYear < startYear
            )
        ) {

            req.flash(
                'error',
                'Please enter valid session years.'
            );

            return res.redirect('/admin/sessions');
        }


        // ----------------------------------------------------
        // Check duplicate session
        // ----------------------------------------------------

        const [existingSession] = await db.execute(
            `SELECT id
             FROM academic_sessions
             WHERE department_id = ?
             AND session_name = ?
             LIMIT 1`,
            [
                departmentId,
                sessionName
            ]
        );


        if (existingSession.length > 0) {

            req.flash(
                'error',
                'This session already exists in the selected department.'
            );

            return res.redirect('/admin/sessions');
        }


        // ----------------------------------------------------
        // Create session
        // ----------------------------------------------------

        const [result] = await db.execute(
            `INSERT INTO academic_sessions
                (
                    department_id,
                    session_name,
                    start_year,
                    end_year,
                    status
                )
             VALUES
                (?, ?, ?, ?, 'active')`,
            [
                departmentId,
                sessionName,
                startYear,
                endYear
            ]
        );


        // ----------------------------------------------------
        // Audit log
        // ----------------------------------------------------

        await db.execute(
            `INSERT INTO audit_logs
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
                    'CREATE_ACADEMIC_SESSION',
                    'academic_session',
                    ?,
                    ?
                )`,
            [
                req.session.user.id,
                result.insertId,
                `Created session ${sessionName} for ${departments[0].name}`
            ]
        );


        req.flash(
            'success',
            'Academic session created successfully.'
        );

        res.redirect('/admin/sessions');


    } catch (error) {

        console.error(
            'Create session error:',
            error
        );

        req.flash(
            'error',
            'Unable to create academic session.'
        );

        res.redirect('/admin/sessions');
    }
};


// ============================================================
// UPDATE ACADEMIC SESSION
// ============================================================

exports.updateSession = async (req, res) => {

    const sessionId = req.params.id;

    const {
        department_id,
        session_name,
        start_year,
        end_year
    } = req.body;


    try {

        const departmentId = Number(department_id);

        const sessionName = session_name.trim();

        const startYear = start_year
            ? Number(start_year)
            : null;

        const endYear = end_year
            ? Number(end_year)
            : null;


        if (!departmentId || !sessionName) {

            req.flash(
                'error',
                'Department and session name are required.'
            );

            return res.redirect('/admin/sessions');
        }


        // ----------------------------------------------------
        // Check department
        // ----------------------------------------------------

        const [departments] = await db.execute(
            `SELECT id, name
             FROM departments
             WHERE id = ?
             AND status = 'active'
             LIMIT 1`,
            [departmentId]
        );


        if (departments.length === 0) {

            req.flash(
                'error',
                'Selected department is invalid or inactive.'
            );

            return res.redirect('/admin/sessions');
        }


        // ----------------------------------------------------
        // Validate years
        // ----------------------------------------------------

        if (
            startYear !== null &&
            endYear !== null &&
            (
                startYear < 2000 ||
                endYear < startYear
            )
        ) {

            req.flash(
                'error',
                'Please enter valid session years.'
            );

            return res.redirect('/admin/sessions');
        }


        // ----------------------------------------------------
        // Check duplicate
        // ----------------------------------------------------

        const [duplicate] = await db.execute(
            `SELECT id
             FROM academic_sessions
             WHERE department_id = ?
             AND session_name = ?
             AND id != ?
             LIMIT 1`,
            [
                departmentId,
                sessionName,
                sessionId
            ]
        );


        if (duplicate.length > 0) {

            req.flash(
                'error',
                'Another session with this name already exists in this department.'
            );

            return res.redirect('/admin/sessions');
        }


        const [result] = await db.execute(
            `UPDATE academic_sessions
             SET
                department_id = ?,
                session_name = ?,
                start_year = ?,
                end_year = ?
             WHERE id = ?`,
            [
                departmentId,
                sessionName,
                startYear,
                endYear,
                sessionId
            ]
        );


        if (result.affectedRows === 0) {

            req.flash(
                'error',
                'Academic session not found.'
            );

            return res.redirect('/admin/sessions');
        }


        await db.execute(
            `INSERT INTO audit_logs
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
                    'UPDATE_ACADEMIC_SESSION',
                    'academic_session',
                    ?,
                    ?
                )`,
            [
                req.session.user.id,
                sessionId,
                `Updated academic session ${sessionName}`
            ]
        );


        req.flash(
            'success',
            'Academic session updated successfully.'
        );

        res.redirect('/admin/sessions');


    } catch (error) {

        console.error(
            'Update session error:',
            error
        );

        req.flash(
            'error',
            'Unable to update academic session.'
        );

        res.redirect('/admin/sessions');
    }
};


// ============================================================
// TOGGLE SESSION STATUS
// ============================================================

// exports.toggleSessionStatus = async (req, res) => {

//     const sessionId = req.params.id;


//     try {

//         const [sessions] = await db.execute(
//             `SELECT
//                 id,
//                 session_name,
//                 status
//              FROM academic_sessions
//              WHERE id = ?
//              LIMIT 1`,
//             [sessionId]
//         );


//         if (sessions.length === 0) {

//             req.flash(
//                 'error',
//                 'Academic session not found.'
//             );

//             return res.redirect('/admin/sessions');
//         }


//         const session = sessions[0];

//         const newStatus =
//             session.status === 'active'
//                 ? 'inactive'
//                 : 'active';


//         await db.execute(
//             `UPDATE academic_sessions
//              SET status = ?
//              WHERE id = ?`,
//             [
//                 newStatus,
//                 sessionId
//             ]
//         );


//         await db.execute(
//             `INSERT INTO audit_logs
//                 (
//                     user_id,
//                     action,
//                     entity_type,
//                     entity_id,
//                     description
//                 )
//              VALUES
//                 (
//                     ?,
//                     'CHANGE_SESSION_STATUS',
//                     'academic_session',
//                     ?,
//                     ?
//                 )`,
//             [
//                 req.session.user.id,
//                 sessionId,
//                 `${session.session_name} changed from ${session.status} to ${newStatus}`
//             ]
//         );


//         req.flash(
//             'success',
//             `Session ${
//                 newStatus === 'active'
//                     ? 'activated'
//                     : 'deactivated'
//             } successfully.`
//         );

//         res.redirect('/admin/sessions');


//     } catch (error) {

//         console.error(
//             'Toggle session error:',
//             error
//         );

//         req.flash(
//             'error',
//             'Unable to change session status.'
//         );

//         res.redirect('/admin/sessions');
//     }
// };

// ============================================================
// TOGGLE SESSION STATUS (WITH STUDENT CASCADE)
// ============================================================
// exports.toggleSessionStatus = async (req, res) => {
//     const sessionId = req.params.id;
//     const connection = await db.getConnection();

//     try {
//         await connection.beginTransaction();

//         const [sessions] = await connection.execute(
//             `SELECT id, session_name, status, department_id FROM academic_sessions WHERE id = ? LIMIT 1`,
//             [sessionId]
//         );

//         if (sessions.length === 0) {
//             throw new Error('Academic session not found.');
//         }

//         const session = sessions[0];
//         const newStatus = session.status === 'active' ? 'inactive' : 'active';

//         // 1. Toggle session status
//         await connection.execute(
//             `UPDATE academic_sessions SET status = ? WHERE id = ?`,
//             [newStatus, sessionId]
//         );

//         // 2. Cascading update: If active -> set students active. If inactive -> archive students.
//         const targetUserAccountStatus = newStatus === 'active' ? 'active' : 'archived';

//         await connection.execute(
//             `
//             UPDATE users u
//             INNER JOIN student_profiles sp ON sp.user_id = u.id
//             SET u.account_status = ?
//             WHERE sp.session_id = ?
//             `,
//             [targetUserAccountStatus, sessionId]
//         );

//         await connection.commit();
//         req.flash('success', `Session ${newStatus === 'active' ? 'activated' : 'archived'} successfully. Students updated.`);
//         res.redirect('/admin/sessions');

//     } catch (error) {
//         await connection.rollback();
//         console.error('Toggle session error:', error);
//         req.flash('error', 'Unable to change session status.');
//         res.redirect('/admin/sessions');
//     } finally {
//         connection.release();
//     }
// };
exports.toggleSessionStatus = async (req, res) => {
    const sessionId = req.params.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [sessions] = await connection.execute(
            `SELECT id, session_name, status, department_id FROM academic_sessions WHERE id = ? LIMIT 1`,
            [sessionId]
        );

        if (sessions.length === 0) {
            throw new Error('Academic session not found.');
        }

        const session = sessions[0];
        const newStatus = session.status === 'active' ? 'inactive' : 'active';

        // 1. Update session status
        await connection.execute(
            `UPDATE academic_sessions SET status = ? WHERE id = ?`,
            [newStatus, sessionId]
        );

        // 2. Cascade student account statuses
        const targetUserAccountStatus = newStatus === 'active' ? 'active' : 'archived';

        await connection.execute(
            `
            UPDATE users u
            INNER JOIN student_profiles sp ON sp.user_id = u.id
            SET u.account_status = ?
            WHERE sp.session_id = ?
            `,
            [targetUserAccountStatus, sessionId]
        );

        await connection.commit();
        req.flash('success', `Session ${newStatus === 'active' ? 'activated' : 'archived'} successfully. Student accounts updated.`);
        res.redirect('/admin/sessions');

    } catch (error) {
        await connection.rollback();
        console.error('Toggle session error:', error);
        req.flash('error', 'Unable to change session status.');
        res.redirect('/admin/sessions');
    } finally {
        connection.release();
    }
};
// ============================================================
// CHAIRMAN LIST
// ============================================================

exports.chairmen = async (req, res) => {
    try {
        const [chairmen] = await db.execute(`
            SELECT
                cp.id,
                cp.user_id,
                cp.department_id,
                cp.employee_id,
                cp.designation,
                cp.is_current,

                u.name,
                u.email,
                u.account_status,
                u.is_verified,
                u.created_at,

                d.name AS department_name,
                d.code AS department_code

            FROM chairman_profiles cp

            INNER JOIN users u
                ON u.id = cp.user_id

            INNER JOIN departments d
                ON d.id = cp.department_id

            ORDER BY
                d.name ASC,
                cp.is_current DESC,
                u.name ASC
        `);

        const [departments] = await db.execute(`
            SELECT
                d.id,
                d.name,
                d.code,
                d.status,

                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM chairman_profiles cp
                        INNER JOIN users u
                            ON u.id = cp.user_id
                        WHERE cp.department_id = d.id
                          AND cp.is_current = TRUE
                          AND u.account_status = 'active'
                    )
                    THEN 1
                    ELSE 0
                END AS has_chairman

            FROM departments d

            ORDER BY d.name ASC
        `);

        res.render('admin/chairmen', {
            chairmen,
            departments
        });

    } catch (error) {

        console.error('Chairmen page error:', error);

        req.flash(
            'error',
            'Unable to load Chairman management page.'
        );

        res.redirect('/admin/dashboard');
    }
};


// ============================================================
// CREATE CHAIRMAN
// ============================================================

exports.createChairman = async (req, res) => {

    const {
        name,
        email,
        password,
        employee_id,
        department_id
    } = req.body;

    if (
        !name ||
        !email ||
        !password ||
        !employee_id ||
        !department_id
    ) {
        req.flash(
            'error',
            'All Chairman fields are required.'
        );

        return res.redirect('/admin/chairmen');
    }

    if (password.length < 4) {
        req.flash(
            'error',
            'Password must contain at least 4 characters.'
        );

        return res.redirect('/admin/chairmen');
    }

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        const normalizedEmail =
            email.trim().toLowerCase();

        const normalizedEmployeeId =
            employee_id.trim();

        /*
         * Check department
         */

        const [departments] = await connection.execute(
            `
            SELECT id, name
            FROM departments
            WHERE id = ?
              AND status = 'active'
            LIMIT 1
            `,
            [department_id]
        );

        if (departments.length === 0) {
            throw new Error(
                'Selected department does not exist or is inactive.'
            );
        }

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
         * Check employee ID
         */

        const [existingEmployee] =
            await connection.execute(
                `
                SELECT id
                FROM chairman_profiles
                WHERE employee_id = ?
                LIMIT 1
                `,
                [normalizedEmployeeId]
            );

        if (existingEmployee.length > 0) {
            throw new Error(
                'This employee ID is already assigned to a Chairman.'
            );
        }

        /*
         * Check current Chairman
         */

        const [existingChairman] =
            await connection.execute(
                `
                SELECT cp.id
                FROM chairman_profiles cp

                INNER JOIN users u
                    ON u.id = cp.user_id

                WHERE cp.department_id = ?
                  AND cp.is_current = TRUE
                  AND u.account_status = 'active'

                LIMIT 1
                `,
                [department_id]
            );

        if (existingChairman.length > 0) {
            throw new Error(
                'This department already has a current Chairman.'
            );
        }

        /*
         * Hash password
         */

        const passwordHash =
            await bcrypt.hash(password, 12);

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
                VALUES (?, ?, ?, 'chairman', 'active', TRUE)
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
         * Create Chairman profile
         */

        await connection.execute(
            `
            INSERT INTO chairman_profiles
            (
                user_id,
                department_id,
                employee_id,
                is_current
            )
            VALUES (?, ?, ?, TRUE)
            `,
            [
                userId,
                department_id,
                normalizedEmployeeId
            ]
        );

        /*
         * Chairman history
         */

        await connection.execute(
            `
            INSERT INTO chairman_history
            (
                department_id,
                chairman_user_id,
                action,
                notes
            )
            VALUES (?, ?, 'assigned', ?)
            `,
            [
                department_id,
                userId,
                'Chairman assigned to department.'
            ]
        );

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
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                req.session.user.id,
                'create',
                'chairman',
                userId,
                `Created Chairman ${name.trim()} for department ${departments[0].name}.`
            ]
        );

        await connection.commit();

        req.flash(
            'success',
            'Chairman created successfully.'
        );

        res.redirect('/admin/chairmen');

    } catch (error) {

        await connection.rollback();

        console.error(
            'Create Chairman error:',
            error
        );

        req.flash(
            'error',
            error.message ||
            'Unable to create Chairman.'
        );

        res.redirect('/admin/chairmen');

    } finally {

        connection.release();
    }
};

// ============================================================
// EDIT CHAIRMAN
// ============================================================

exports.updateChairman = async (req, res) => {

    const chairmanId = req.params.id;

    const {
        name,
        email,
        employee_id,
        department_id
    } = req.body;

    if (
        !name ||
        !email ||
        !employee_id ||
        !department_id
    ) {
        req.flash(
            'error',
            'All Chairman fields are required.'
        );

        return res.redirect('/admin/chairmen');
    }

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        const normalizedEmail =
            email.trim().toLowerCase();

        const normalizedEmployeeId =
            employee_id.trim();

        /*
         * Find Chairman
         */

        const [chairmen] =
            await connection.execute(
                `
                SELECT
                    cp.id,
                    cp.user_id,
                    cp.department_id,
                    cp.is_current
                FROM chairman_profiles cp
                WHERE cp.id = ?
                LIMIT 1
                `,
                [chairmanId]
            );

        if (chairmen.length === 0) {
            throw new Error(
                'Chairman not found.'
            );
        }

        const chairman = chairmen[0];

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
                    chairman.user_id
                ]
            );

        if (emailCheck.length > 0) {
            throw new Error(
                'This email address is already used by another account.'
            );
        }

        /*
         * Check employee ID
         */

        const [employeeCheck] =
            await connection.execute(
                `
                SELECT id
                FROM chairman_profiles
                WHERE employee_id = ?
                  AND id != ?
                LIMIT 1
                `,
                [
                    normalizedEmployeeId,
                    chairmanId
                ]
            );

        if (employeeCheck.length > 0) {
            throw new Error(
                'This employee ID is already used by another Chairman.'
            );
        }

        /*
         * Check department
         */

        const [departments] =
            await connection.execute(
                `
                SELECT id, name
                FROM departments
                WHERE id = ?
                  AND status = 'active'
                LIMIT 1
                `,
                [department_id]
            );

        if (departments.length === 0) {
            throw new Error(
                'Selected department is inactive or does not exist.'
            );
        }

        /*
         * If changing department,
         * make sure new department has no current Chairman.
         */

        if (
            chairman.is_current &&
            Number(chairman.department_id) !==
            Number(department_id)
        ) {

            const [existingChairman] =
                await connection.execute(
                    `
                    SELECT cp.id
                    FROM chairman_profiles cp

                    INNER JOIN users u
                        ON u.id = cp.user_id

                    WHERE cp.department_id = ?
                      AND cp.is_current = TRUE
                      AND cp.id != ?

                    LIMIT 1
                    `,
                    [
                        department_id,
                        chairmanId
                    ]
                );

            if (existingChairman.length > 0) {
                throw new Error(
                    'The selected department already has a current Chairman.'
                );
            }
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
                chairman.user_id
            ]
        );

        /*
         * Update profile
         */

        await connection.execute(
            `
            UPDATE chairman_profiles
            SET
                employee_id = ?,
                department_id = ?
            WHERE id = ?
            `,
            [
                normalizedEmployeeId,
                department_id,
                chairmanId
            ]
        );

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
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                req.session.user.id,
                'update',
                'chairman',
                chairman.user_id,
                `Updated Chairman ${name.trim()}.`
            ]
        );

        await connection.commit();

        req.flash(
            'success',
            'Chairman information updated successfully.'
        );

        res.redirect('/admin/chairmen');

    } catch (error) {

        await connection.rollback();

        console.error(
            'Update Chairman error:',
            error
        );

        req.flash(
            'error',
            error.message ||
            'Unable to update Chairman.'
        );

        res.redirect('/admin/chairmen');

    } finally {

        connection.release();
    }
};

// ============================================================
// DISABLE / ENABLE CHAIRMAN
// ============================================================

exports.toggleChairmanStatus = async (req, res) => {

    const chairmanId = req.params.id;

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        const [chairmen] =
            await connection.execute(
                `
                SELECT
                    cp.id,
                    cp.user_id,
                    cp.department_id,
                    cp.is_current,
                    u.name,
                    u.account_status
                FROM chairman_profiles cp

                INNER JOIN users u
                    ON u.id = cp.user_id

                WHERE cp.id = ?

                LIMIT 1
                `,
                [chairmanId]
            );

        if (chairmen.length === 0) {
            throw new Error(
                'Chairman not found.'
            );
        }

        const chairman = chairmen[0];

        /*
         * ENABLE
         */

        if (chairman.account_status === 'disabled') {

            const [existing] =
                await connection.execute(
                    `
                    SELECT cp.id
                    FROM chairman_profiles cp

                    INNER JOIN users u
                        ON u.id = cp.user_id

                    WHERE cp.department_id = ?
                      AND cp.is_current = TRUE
                      AND cp.id != ?
                      AND u.account_status = 'active'

                    LIMIT 1
                    `,
                    [
                        chairman.department_id,
                        chairman.id
                    ]
                );

            if (existing.length > 0) {
                throw new Error(
                    'This department already has another active Chairman.'
                );
            }

            await connection.execute(
                `
                UPDATE users
                SET account_status = 'active'
                WHERE id = ?
                `,
                [chairman.user_id]
            );

            await connection.execute(
                `
                UPDATE chairman_profiles
                SET is_current = TRUE
                WHERE id = ?
                `,
                [chairman.id]
            );

            await connection.execute(
                `
                INSERT INTO chairman_history
                (
                    department_id,
                    chairman_user_id,
                    action,
                    notes
                )
                VALUES (?, ?, 'assigned', ?)
                `,
                [
                    chairman.department_id,
                    chairman.user_id,
                    'Chairman account enabled and restored as current.'
                ]
            );

            req.flash(
                'success',
                'Chairman enabled successfully.'
            );

        }

        /*
         * DISABLE
         */

        else if (chairman.account_status === 'active') {

            await connection.execute(
                `
                UPDATE users
                SET account_status = 'disabled'
                WHERE id = ?
                `,
                [chairman.user_id]
            );

            await connection.execute(
                `
                UPDATE chairman_profiles
                SET is_current = FALSE
                WHERE id = ?
                `,
                [chairman.id]
            );

            await connection.execute(
                `
                INSERT INTO chairman_history
                (
                    department_id,
                    chairman_user_id,
                    action,
                    notes
                )
                VALUES (?, ?, 'removed', ?)
                `,
                [
                    chairman.department_id,
                    chairman.user_id,
                    'Chairman account disabled.'
                ]
            );

            req.flash(
                'success',
                'Chairman disabled successfully.'
            );

        }

        else {
            throw new Error(
                'This Chairman account cannot be toggled from its current status.'
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
                req.session.user.id,
                'status_change',
                'chairman',
                chairman.user_id,
                `Changed Chairman status for ${chairman.name}.`
            ]
        );

        await connection.commit();

        res.redirect('/admin/chairmen');

    } catch (error) {

        await connection.rollback();

        console.error(
            'Toggle Chairman error:',
            error
        );

        req.flash(
            'error',
            error.message ||
            'Unable to change Chairman status.'
        );

        res.redirect('/admin/chairmen');

    } finally {

        connection.release();
    }
};
// ============================================================
// REPLACE CHAIRMAN
// ============================================================

exports.replaceChairman = async (req, res) => {

    const chairmanId = req.params.id;

    const {
        name,
        email,
        password,
        employee_id,
        notes
    } = req.body;

    if (
        !name ||
        !email ||
        !password ||
        !employee_id
    ) {
        req.flash(
            'error',
            'Name, email, password, and employee ID are required.'
        );

        return res.redirect('/admin/chairmen');
    }

    if (password.length < 4) {
        req.flash(
            'error',
            'Password must contain at least 4 characters.'
        );

        return res.redirect('/admin/chairmen');
    }

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        /*
         * Get current Chairman
         */

        const [chairmen] =
            await connection.execute(
                `
                SELECT
                    cp.id,
                    cp.user_id,
                    cp.department_id,
                    cp.is_current,

                    u.name,
                    u.email,

                    d.name AS department_name

                FROM chairman_profiles cp

                INNER JOIN users u
                    ON u.id = cp.user_id

                INNER JOIN departments d
                    ON d.id = cp.department_id

                WHERE cp.id = ?

                LIMIT 1
                `,
                [chairmanId]
            );

        if (chairmen.length === 0) {
            throw new Error(
                'Current Chairman not found.'
            );
        }

        const currentChairman = chairmen[0];

        if (!currentChairman.is_current) {
            throw new Error(
                'This Chairman is not currently assigned.'
            );
        }

        const normalizedEmail =
            email.trim().toLowerCase();

        const normalizedEmployeeId =
            employee_id.trim();

        /*
         * Check email
         */

        const [emailCheck] =
            await connection.execute(
                `
                SELECT id
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [normalizedEmail]
            );

        if (emailCheck.length > 0) {
            throw new Error(
                'This email address is already registered.'
            );
        }

        /*
         * Check employee ID
         */

        const [employeeCheck] =
            await connection.execute(
                `
                SELECT id
                FROM chairman_profiles
                WHERE employee_id = ?
                LIMIT 1
                `,
                [normalizedEmployeeId]
            );

        if (employeeCheck.length > 0) {
            throw new Error(
                'This employee ID is already assigned.'
            );
        }

        /*
         * Hash password
         */

        const passwordHash =
            await bcrypt.hash(password, 12);

        /*
         * Create new user
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
                VALUES (?, ?, ?, 'chairman', 'active', TRUE)
                `,
                [
                    name.trim(),
                    normalizedEmail,
                    passwordHash
                ]
            );

        const newChairmanUserId =
            userResult.insertId;

        /*
         * Make old Chairman historical
         */

        await connection.execute(
            `
            UPDATE chairman_profiles
            SET is_current = FALSE
            WHERE id = ?
            `,
            [currentChairman.id]
        );

        /*
         * Disable old account
         */

        await connection.execute(
            `
            UPDATE users
            SET account_status = 'disabled'
            WHERE id = ?
            `,
            [currentChairman.user_id]
        );

        /*
         * Create new current Chairman
         */

        await connection.execute(
            `
            INSERT INTO chairman_profiles
            (
                user_id,
                department_id,
                employee_id,
                is_current
            )
            VALUES (?, ?, ?, TRUE)
            `,
            [
                newChairmanUserId,
                currentChairman.department_id,
                normalizedEmployeeId
            ]
        );

        /*
         * History
         */

        await connection.execute(
            `
            INSERT INTO chairman_history
            (
                department_id,
                chairman_user_id,
                action,
                replaced_by_user_id,
                notes
            )
            VALUES (?, ?, 'replaced', ?, ?)
            `,
            [
                currentChairman.department_id,
                currentChairman.user_id,
                newChairmanUserId,
                notes ||
                `Replaced by ${name.trim()}.`
            ]
        );

        await connection.execute(
            `
            INSERT INTO chairman_history
            (
                department_id,
                chairman_user_id,
                action,
                notes
            )
            VALUES (?, ?, 'assigned', ?)
            `,
            [
                currentChairman.department_id,
                newChairmanUserId,
                `Assigned as replacement Chairman for ${currentChairman.department_name}.`
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
                req.session.user.id,
                'replace',
                'chairman',
                newChairmanUserId,
                `Replaced Chairman ${currentChairman.name} with ${name.trim()} for ${currentChairman.department_name}.`
            ]
        );

        await connection.commit();

        req.flash(
            'success',
            `${name.trim()} is now the current Chairman of ${currentChairman.department_name}.`
        );

        res.redirect('/admin/chairmen');

    } catch (error) {

        await connection.rollback();

        console.error(
            'Replace Chairman error:',
            error
        );

        req.flash(
            'error',
            error.message ||
            'Unable to replace Chairman.'
        );

        res.redirect('/admin/chairmen');

    } finally {

        connection.release();
    }
};


const bcrypt = require('bcryptjs');

// ==========================================
// ADMIN: GLOBAL SUPERVISORS
// ==========================================
// ==========================================
// ADMIN: GLOBAL SUPERVISORS
// ==========================================
exports.getSupervisors = async (req, res) => {
    try {
        const { department_id } = req.query;
        // FIXED: Correctly querying supervisor_profiles instead of student_profiles
        let query = `
            SELECT sp.id, sp.supervisor_id, sp.designation, u.id AS user_id, u.name, u.email, u.account_status, d.name AS department_name
            FROM supervisor_profiles sp
            INNER JOIN users u ON sp.user_id = u.id
            INNER JOIN departments d ON sp.department_id = d.id
        `;
        const params = [];
        if (department_id) {
            query += ` WHERE sp.department_id = ?`;
            params.push(department_id);
        }
        query += ` ORDER BY d.name ASC, u.name ASC`;

        const [supervisors] = await db.execute(query, params);
        const [departments] = await db.execute(`SELECT id, name FROM departments ORDER BY name ASC`);

        res.render('admin/supervisors', { supervisors, departments, filters: { department_id } });
    } catch (error) {
        console.error('Get supervisors error:', error);
        req.flash('error', 'Failed to load supervisors.');
        res.redirect('/admin/dashboard');
    }
};

exports.updateSupervisor = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { name, email, department_id, supervisor_id, designation } = req.body;
        const profileId = req.params.id;

        const normalizedEmail = email ? email.trim().toLowerCase() : '';

        await connection.beginTransaction();

        // 1. Get the user_id attached to this supervisor profile
        const [profiles] = await connection.execute(`SELECT user_id FROM supervisor_profiles WHERE id = ?`, [profileId]);
        if (profiles.length === 0) {
            throw new Error('Supervisor profile not found.');
        }
        const userId = profiles[0].user_id;

        // 2. Check if the email is ALREADY used by a DIFFERENT user
        const [emailCheck] = await connection.execute(
            `SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1`, 
            [normalizedEmail, userId]
        );

        if (emailCheck.length > 0) {
            console.log(`Email conflict: "${normalizedEmail}" is already used by user ID ${emailCheck[0].id}`);
            throw new Error(`The email "${normalizedEmail}" is already used by another account in the system.`);
        }

        // 3. Update supervisor profile
        await connection.execute(`
            UPDATE supervisor_profiles 
            SET department_id = ?, supervisor_id = ?, designation = ? 
            WHERE id = ?
        `, [department_id, supervisor_id.trim(), designation.trim(), profileId]);

        // 4. Update user details
        await connection.execute(`
            UPDATE users SET name = ?, email = ? WHERE id = ?
        `, [name.trim(), normalizedEmail, userId]);

        await connection.commit();
        req.flash('success', 'Supervisor details updated successfully.');
        res.redirect('/admin/supervisors');
    } catch (error) {
        await connection.rollback();
        console.error('Update supervisor error:', error);
        req.flash('error', error.message || 'Failed to update supervisor.');
        res.redirect('/admin/supervisors');
    } finally {
        connection.release();
    }
};

exports.createSupervisor = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { name, email, department_id, supervisor_id, designation } = req.body;
        
        const [existing] = await connection.execute(`SELECT id FROM users WHERE email = ?`, [email.trim()]);
        if (existing.length > 0) {
            req.flash('error', 'Email already in use.');
            return res.redirect('/admin/supervisors');
        }

        const defaultPassword = await bcrypt.hash('Faculty123!', 10);

        await connection.beginTransaction();
        const [userResult] = await connection.execute(`
            INSERT INTO users (name, email, password_hash, role, account_status, is_verified) 
            VALUES (?, ?, ?, 'supervisor', 'active', 1)
        `, [name.trim(), email.trim().toLowerCase(), defaultPassword]);

        await connection.execute(`
            INSERT INTO supervisor_profiles (user_id, department_id, supervisor_id, designation, is_available) 
            VALUES (?, ?, ?, ?, 1)
        `, [userResult.insertId, department_id, supervisor_id.trim(), designation.trim()]);

        await connection.commit();
        req.flash('success', `Supervisor ${name} added system-wide.`);
        res.redirect('/admin/supervisors');
    } catch (error) {
        await connection.rollback();
        req.flash('error', 'Failed to create supervisor.');
        res.redirect('/admin/supervisors');
    } finally {
        connection.release();
    }
};

exports.deleteSupervisor = async (req, res) => {
    try {
        const supervisorProfileId = req.params.id;
        const [profiles] = await db.execute(`SELECT user_id FROM supervisor_profiles WHERE id = ?`, [supervisorProfileId]);
        if (profiles.length > 0) {
            // Soft delete: Disable user account so they can't log in, but history is preserved
            await db.execute(`UPDATE users SET account_status = 'archived' WHERE id = ?`, [profiles[0].user_id]);
            req.flash('success', 'Supervisor account permanently archived/disabled.');
        }
        res.redirect('/admin/supervisors');
    } catch (error) {
        req.flash('error', 'Failed to delete supervisor.');
        res.redirect('/admin/supervisors');
    }
};

// ==========================================
// ADMIN: GLOBAL STUDENTS
// ==========================================
exports.getStudents = async (req, res) => {
    try {
        const { department_id, session_id } = req.query;
        let query = `
            SELECT sp.id, sp.student_id, u.id AS user_id, u.name, u.email, u.account_status, d.name AS department_name, s.session_name
            FROM student_profiles sp
            INNER JOIN users u ON sp.user_id = u.id
            INNER JOIN departments d ON sp.department_id = d.id
            INNER JOIN academic_sessions s ON sp.session_id = s.id
            WHERE 1=1
        `;
        const params = [];
        if (department_id) { query += ` AND sp.department_id = ?`; params.push(department_id); }
        if (session_id) { query += ` AND sp.session_id = ?`; params.push(session_id); }
        query += ` ORDER BY d.name ASC, s.session_name DESC, u.name ASC`;

        const [students] = await db.execute(query, params);
        const [departments] = await db.execute(`SELECT id, name FROM departments ORDER BY name ASC`);
        const [sessions] = await db.execute(`SELECT id, session_name FROM academic_sessions ORDER BY session_name DESC`);

        res.render('admin/students', { students, departments, sessions, filters: { department_id, session_id } });
    } catch (error) {
        req.flash('error', 'Failed to load students.');
        res.redirect('/admin/dashboard');
    }
};

exports.deleteStudent = async (req, res) => {
    try {
        const studentProfileId = req.params.id;
        const [profiles] = await db.execute(`SELECT user_id FROM student_profiles WHERE id = ?`, [studentProfileId]);
        if (profiles.length > 0) {
            await db.execute(`UPDATE users SET account_status = 'archived' WHERE id = ?`, [profiles[0].user_id]);
            req.flash('success', 'Student account permanently archived/disabled.');
        }
        res.redirect('/admin/students');
    } catch (error) {
        req.flash('error', 'Failed to delete student.');
        res.redirect('/admin/students');
    }
};


// Add these functions below your createSupervisor function

// exports.updateSupervisor = async (req, res) => {
//     const connection = await db.getConnection();
//     try {
//         const { name, email, department_id, supervisor_id, designation } = req.body;
//         const profileId = req.params.id;

//         await connection.beginTransaction();

//         // Update profile
//         await connection.execute(`
//             UPDATE supervisor_profiles 
//             SET department_id = ?, supervisor_id = ?, designation = ? 
//             WHERE id = ?
//         `, [department_id, supervisor_id.trim(), designation.trim(), profileId]);

//         // Get user_id to update name/email
//         const [profiles] = await connection.execute(`SELECT user_id FROM supervisor_profiles WHERE id = ?`, [profileId]);
//         if (profiles.length > 0) {
//             await connection.execute(`
//                 UPDATE users SET name = ?, email = ? WHERE id = ?
//             `, [name.trim(), email.trim().toLowerCase(), profiles[0].user_id]);
//         }

//         await connection.commit();
//         req.flash('success', 'Supervisor details updated successfully.');
//         res.redirect('/admin/supervisors');
//     } catch (error) {
//         await connection.rollback();
//         console.error(error);
//         req.flash('error', 'Failed to update supervisor.');
//         res.redirect('/admin/supervisors');
//     } finally {
//         connection.release();
//     }
// };
exports.updateSupervisor = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { name, email, department_id, supervisor_id, designation } = req.body;
        const profileId = req.params.id;

        const normalizedEmail = email ? email.trim().toLowerCase() : '';

        await connection.beginTransaction();

        // 1. Get the user_id attached to this supervisor profile
        const [profiles] = await connection.execute(`SELECT user_id FROM supervisor_profiles WHERE id = ?`, [profileId]);
        if (profiles.length === 0) {
            throw new Error('Supervisor profile not found.');
        }
        const userId = profiles[0].user_id;

        // 2. Check if the email is ALREADY used by a DIFFERENT user
        const [emailCheck] = await connection.execute(
            `SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1`, 
            [normalizedEmail, userId]
        );

        if (emailCheck.length > 0) {
            throw new Error('This email address is already used by another account.');
        }

        // 3. Update supervisor profile
        await connection.execute(`
            UPDATE supervisor_profiles 
            SET department_id = ?, supervisor_id = ?, designation = ? 
            WHERE id = ?
        `, [department_id, supervisor_id.trim(), designation.trim(), profileId]);

        // 4. Update user details
        await connection.execute(`
            UPDATE users SET name = ?, email = ? WHERE id = ?
        `, [name.trim(), normalizedEmail, userId]);

        await connection.commit();
        req.flash('success', 'Supervisor details updated successfully.');
        res.redirect('/admin/supervisors');
    } catch (error) {
        await connection.rollback();
        console.error('Update supervisor error:', error);
        req.flash('error', error.message || 'Failed to update supervisor.');
        res.redirect('/admin/supervisors');
    } finally {
        connection.release();
    }
};
exports.toggleSupervisorStatus = async (req, res) => {
    try {
        const profileId = req.params.id;
        const [profiles] = await db.execute(`SELECT user_id FROM supervisor_profiles WHERE id = ?`, [profileId]);
        
        if (profiles.length > 0) {
            const userId = profiles[0].user_id;
            const [users] = await db.execute(`SELECT account_status FROM users WHERE id = ?`, [userId]);
            
            if (users.length > 0) {
                const newStatus = users[0].account_status === 'active' ? 'disabled' : 'active';
                await db.execute(`UPDATE users SET account_status = ? WHERE id = ?`, [newStatus, userId]);
                req.flash('success', `Supervisor account has been ${newStatus}.`);
            }
        }
        res.redirect('/admin/supervisors');
    } catch (error) {
        req.flash('error', 'Failed to toggle status.');
        res.redirect('/admin/supervisors');
    }
};

// ==========================================
// DEPARTMENTS CRUD
// ==========================================
// exports.updateDepartment = async (req, res) => {
//     try {
//         const { name, short_code } = req.body;
//         await db.execute('UPDATE departments SET name = ?, short_code = ? WHERE id = ?', [name.trim(), short_code.trim(), req.params.id]);
//         req.flash('success', 'Department updated successfully.');
//         res.redirect('/admin/departments');
//     } catch (error) {
//         req.flash('error', 'Failed to update department.');
//         res.redirect('/admin/departments');
//     }
// };
exports.updateDepartment = async (req, res) => {
    const departmentId = req.params.id;
    const { name, code, description } = req.body;

    try {
        // Safe trimming in case the form sends undefined
        const departmentName = name ? name.trim() : '';
        const departmentCode = code ? code.trim().toUpperCase() : '';

        if (!departmentName || !departmentCode) {
            req.flash('error', 'Department name and code are required.');
            return res.redirect('/admin/departments');
        }

        // Check duplicate name
        const [duplicateName] = await db.execute(
            `SELECT id FROM departments WHERE name = ? AND id != ? LIMIT 1`,
            [departmentName, departmentId]
        );

        if (duplicateName.length > 0) {
            req.flash('error', 'Another department already uses this name.');
            return res.redirect('/admin/departments');
        }

        // Check duplicate code
        const [duplicateCode] = await db.execute(
            `SELECT id FROM departments WHERE code = ? AND id != ? LIMIT 1`,
            [departmentCode, departmentId]
        );

        if (duplicateCode.length > 0) {
            req.flash('error', 'Another department already uses this code.');
            return res.redirect('/admin/departments');
        }

        const [result] = await db.execute(
            `UPDATE departments SET name = ?, code = ?, description = ? WHERE id = ?`,
            [
                departmentName,
                departmentCode,
                description ? description.trim() : null,
                departmentId
            ]
        );

        if (result.affectedRows === 0) {
            req.flash('error', 'Department not found.');
            return res.redirect('/admin/departments');
        }

        // Only log if the audit_logs table exists and session user is valid
        if (req.session && req.session.user) {
            try {
                await db.execute(
                    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description) VALUES (?, 'UPDATE_DEPARTMENT', 'department', ?, ?)`,
                    [
                        req.session.user.id,
                        departmentId,
                        `Updated department ${departmentName} (${departmentCode})`
                    ]
                );
            } catch (auditError) {
                console.warn('Audit log skipped (table might not exist):', auditError.message);
            }
        }

        req.flash('success', 'Department updated successfully.');
        res.redirect('/admin/departments');

    } catch (error) {
        // THIS WILL PRINT THE EXACT REASON TO YOUR TERMINAL
        console.error('\n=== UPDATE DEPARTMENT ERROR ===');
        console.error(error);
        console.error('===============================\n');
        
        req.flash('error', 'Unable to update department. Check terminal for details.');
        res.redirect('/admin/departments');
    }
};

exports.deleteDepartment = async (req, res) => {
    try {
        await db.execute('DELETE FROM departments WHERE id = ?', [req.params.id]);
        req.flash('success', 'Department deleted permanently.');
        res.redirect('/admin/departments');
    } catch (error) {
        req.flash('error', 'Cannot delete department. It contains active supervisors, students, or sessions.');
        res.redirect('/admin/departments');
    }
};

// ==========================================
// SESSIONS CRUD
// ==========================================
exports.updateSession = async (req, res) => {
    try {
        const { session_name, start_year, end_year, department_id } = req.body;
        await db.execute('UPDATE academic_sessions SET session_name = ?, start_year = ?, end_year = ?, department_id = ? WHERE id = ?', 
            [session_name.trim(), start_year, end_year, department_id, req.params.id]);
        req.flash('success', 'Session updated successfully.');
        res.redirect('/admin/sessions');
    } catch (error) {
        req.flash('error', 'Failed to update session.');
        res.redirect('/admin/sessions');
    }
};

exports.deleteSession = async (req, res) => {
    try {
        await db.execute('DELETE FROM academic_sessions WHERE id = ?', [req.params.id]);
        req.flash('success', 'Session deleted permanently.');
        res.redirect('/admin/sessions');
    } catch (error) {
        req.flash('error', 'Cannot delete session. It has students or allocation data attached.');
        res.redirect('/admin/sessions');
    }
};

// ==========================================
// STUDENTS UPDATE (Admin Override)
// ==========================================
exports.updateStudent = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { name, email, student_id, department_id, session_id } = req.body;
        const profileId = req.params.id;

        await connection.beginTransaction();

        await connection.execute(`
            UPDATE student_profiles SET student_id = ?, department_id = ?, session_id = ? WHERE id = ?
        `, [student_id.trim(), department_id, session_id, profileId]);

        const [profiles] = await connection.execute(`SELECT user_id FROM student_profiles WHERE id = ?`, [profileId]);
        if (profiles.length > 0) {
            await connection.execute(`
                UPDATE users SET name = ?, email = ? WHERE id = ?
            `, [name.trim(), email.trim().toLowerCase(), profiles[0].user_id]);
        }

        await connection.commit();
        req.flash('success', 'Student details updated successfully.');
        res.redirect('/admin/students');
    } catch (error) {
        await connection.rollback();
        req.flash('error', 'Failed to update student.');
        res.redirect('/admin/students');
    } finally {
        connection.release();
    }
};



// ========================================
// REACTIVATE ACCOUNT
// ========================================
exports.reactivateAccount = async (req, res) => {
    try {
        const targetUserId = req.params.id;

        // Change status back to active
        await db.execute(`UPDATE users SET account_status = 'active' WHERE id = ?`, [targetUserId]);

        req.flash('success', 'Account reactivated successfully. They can now log in.');
        
        // Safely redirect back to the page they came from
        res.redirect(req.get('referer') || '/admin/dashboard');
    } catch (error) {
        console.error('Reactivate account error:', error);
        req.flash('error', 'Failed to reactivate account.');
        res.redirect(req.get('referer') || '/admin/dashboard');
    }
};

// ========================================
// PERMANENTLY DELETE ACCOUNT
// ========================================
// exports.hardDeleteAccount = async (req, res) => {
//     try {
//         const targetUserId = req.params.id;
//         const connection = await db.getConnection();

//         try {
//             await connection.beginTransaction();

//             // 1. Delete associated profiles first (prevents foreign key constraint errors)
//             await connection.execute(`DELETE FROM student_profiles WHERE user_id = ?`, [targetUserId]);
//             await connection.execute(`DELETE FROM supervisor_profiles WHERE user_id = ?`, [targetUserId]);
//             await connection.execute(`DELETE FROM chairman_profiles WHERE user_id = ?`, [targetUserId]);

//             // 2. Delete the base user account
//             await connection.execute(`DELETE FROM users WHERE id = ?`, [targetUserId]);

//             await connection.commit();
//             req.flash('success', 'Account permanently wiped from the database.');
//         } catch (txnError) {
//             await connection.rollback();
//             throw txnError;
//         } finally {
//             connection.release();
//         }

//         // Safely redirect back to the page they came from
//         res.redirect(req.get('referer') || '/admin/dashboard');
//     } catch (error) {
//         console.error('Hard delete error:', error);
//         req.flash('error', 'Failed to permanently delete account. They may have existing thesis records.');
//         res.redirect(req.get('referer') || '/admin/dashboard');
//     }
// };

// ========================================
// PERMANENTLY DELETE ACCOUNT (WITH CASCADING CLEANUP)
// ========================================
exports.hardDeleteAccount = async (req, res) => {
    try {
        const targetUserId = req.params.id;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 1. If user has a student profile, clean up all student-related foreign keys first
            const [studentProfiles] = await connection.execute(`SELECT id FROM student_profiles WHERE user_id = ?`, [targetUserId]);
            if (studentProfiles.length > 0) {
                const studentProfileId = studentProfiles[0].id;

                await connection.execute(`DELETE FROM allocations WHERE student_id = ?`, [studentProfileId]);
                await connection.execute(`DELETE FROM allocation_student_participants WHERE student_id = ?`, [studentProfileId]);
                await connection.execute(`DELETE FROM supervisor_preferences WHERE student_id = ?`, [studentProfileId]);
                await connection.execute(`DELETE FROM swap_requests WHERE student_id = ? OR target_student_id = ?`, [studentProfileId, studentProfileId]);
                await connection.execute(`DELETE FROM theses WHERE student_id = ?`, [studentProfileId]);
                await connection.execute(`DELETE FROM student_profiles WHERE id = ?`, [studentProfileId]);
            }

            // 2. If user has a supervisor profile, clean up supervisor-related foreign keys
            const [supervisorProfiles] = await connection.execute(`SELECT id FROM supervisor_profiles WHERE user_id = ?`, [targetUserId]);
            if (supervisorProfiles.length > 0) {
                const supervisorProfileId = supervisorProfiles[0].id;

                await connection.execute(`DELETE FROM allocations WHERE supervisor_id = ?`, [supervisorProfileId]);
                await connection.execute(`DELETE FROM allocation_participants WHERE supervisor_id = ?`, [supervisorProfileId]);
                await connection.execute(`DELETE FROM supervisor_capacities WHERE supervisor_id = ?`, [supervisorProfileId]);
                await connection.execute(`DELETE FROM swap_requests WHERE current_supervisor_id = ? OR requested_supervisor_id = ?`, [supervisorProfileId, supervisorProfileId]);
                await connection.execute(`DELETE FROM supervisor_profiles WHERE id = ?`, [supervisorProfileId]);
            }

            // 3. If user has a chairman profile, clean up chairman history/profiles
            const [chairmanProfiles] = await connection.execute(`SELECT id FROM chairman_profiles WHERE user_id = ?`, [targetUserId]);
            if (chairmanProfiles.length > 0) {
                await connection.execute(`DELETE FROM chairman_history WHERE chairman_user_id = ? OR replaced_by_user_id = ?`, [targetUserId, targetUserId]);
                await connection.execute(`DELETE FROM chairman_profiles WHERE user_id = ?`, [targetUserId]);
            }

            // 4. Clean up logs and allocation runs created by this user
            await connection.execute(`DELETE FROM audit_logs WHERE user_id = ?`, [targetUserId]);
            await connection.execute(`UPDATE allocation_runs SET created_by = NULL WHERE created_by = ?`, [targetUserId]);

            // 5. Finally, delete the base user account
            await connection.execute(`DELETE FROM users WHERE id = ?`, [targetUserId]);

            await connection.commit();
            req.flash('success', 'Account and all related records permanently wiped from the database.');
        } catch (txnError) {
            await connection.rollback();
            throw txnError;
        } finally {
            connection.release();
        }

        res.redirect(req.get('referer') || '/admin/dashboard');
    } catch (error) {
        console.error('Hard delete error:', error);
        req.flash('error', 'Failed to permanently delete account due to database constraints.');
        res.redirect(req.get('referer') || '/admin/dashboard');
    }
};


// ========================================
// ADMIN FORCE RESET PASSWORD
// ========================================
exports.forceResetPassword = async (req, res) => {
    try {
        const targetUserId = req.params.id;
        const { new_password } = req.body;

        if (!new_password || new_password.length < 4) {
            req.flash('error', 'Password must be at least 4 characters long.');
            return res.redirect(req.get('referer') || '/admin/dashboard');
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(new_password, 12);

        await db.execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashedPassword, targetUserId]);

        req.flash('success', 'User password has been force-reset successfully.');
        res.redirect(req.get('referer') || '/admin/dashboard');
    } catch (error) {
        console.error('Force reset password error:', error);
        req.flash('error', 'Failed to reset password.');
        res.redirect(req.get('referer') || '/admin/dashboard');
    }
};
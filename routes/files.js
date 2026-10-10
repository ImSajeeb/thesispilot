const express = require('express');
const db = require('../config/database');
const { createDocumentUrl } = require('../config/storage');
const { ensureAuthenticated } = require('../middleware/auth');

const router = express.Router();
const fileKinds = {
    proposal: { column: 'proposal_file', folder: 'proposals' },
    final: { column: 'final_file', folder: 'finals' },
    feedback: { column: 'supervisor_feedback_file', folder: 'feedback' }
};

router.get('/:kind/:filename', ensureAuthenticated, async (req, res) => {
    try {
        const kind = fileKinds[req.params.kind];
        const filename = req.params.filename;
        if (!kind || !/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes('..')) {
            return res.status(400).send('Invalid document link.');
        }

        const databasePath = `/uploads/${kind.folder}/${filename}`;
        const role = req.session.user?.role;
        let rows = [];

        if (role === 'student') {
            const [profiles] = await db.execute(
                'SELECT id FROM student_profiles WHERE user_id = ? LIMIT 1',
                [req.session.user.id]
            );
            if (profiles.length) {
                const [matches] = await db.execute(
                    `SELECT t.id FROM theses t WHERE t.student_id = ? AND t.${kind.column} = ? LIMIT 1`,
                    [profiles[0].id, databasePath]
                );
                rows = matches;
            }
        } else if (role === 'supervisor') {
            const [profiles] = await db.execute(
                'SELECT id FROM supervisor_profiles WHERE user_id = ? LIMIT 1',
                [req.session.user.id]
            );
            if (profiles.length) {
                const [matches] = await db.execute(
                    `SELECT t.id FROM theses t
                     INNER JOIN allocations a ON a.student_id = t.student_id
                     WHERE a.supervisor_id = ?
                       AND a.allocation_status IN ('allocated', 'swapped')
                       AND t.${kind.column} = ?
                     LIMIT 1`,
                    [profiles[0].id, databasePath]
                );
                rows = matches;
            }
        } else {
            return res.status(403).send('You are not authorized to access this document.');
        }

        if (!rows.length) {
            return res.status(404).send('Document not found or you are not authorized to access it.');
        }

        let signedUrl;
        try {
            signedUrl = await createDocumentUrl(databasePath, 300);
        } catch (storageError) {
            console.error('Document link error:', storageError.message);
            return res.status(404).send('This document is not available in storage. It may be an empty file that was skipped during migration.');
        }
        return res.redirect(signedUrl);
    } catch (error) {
        console.error('Protected document route error:', error);
        return res.status(500).send('Unable to open the document right now.');
    }
});

module.exports = router;

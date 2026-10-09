module.exports = {

    // User must be logged in
    ensureAuthenticated: (req, res, next) => {
        if (req.session.user) {
            return next();
        }

        req.flash('error', 'Please log in to access this resource.');
        return res.redirect('/auth/login');
    },

    // User must have one of the specified roles
    isRole: (roles) => {
        return (req, res, next) => {

            if (!req.session.user) {
                req.flash('error', 'Please log in.');
                return res.redirect('/auth/login');
            }

            if (!roles.includes(req.session.user.role)) {
                req.flash(
                    'error',
                    'Access denied. You do not have permission to view this page.'
                );
                return res.redirect('/');
            }

            next();
        };
    },

    // Admin only
    isAdmin: (req, res, next) => {

        if (!req.session.user) {
            req.flash('error', 'Please log in.');
            return res.redirect('/auth/login');
        }

        if (req.session.user.role !== 'admin') {
            req.flash('error', 'Admin access required.');
            return res.redirect('/');
        }

        next();
    },

    // Chairman only
    isChairman: (req, res, next) => {

        if (!req.session.user) {
            req.flash('error', 'Please log in.');
            return res.redirect('/auth/login');
        }

        if (req.session.user.role !== 'chairman') {
            req.flash('error', 'Chairman access required.');
            return res.redirect('/');
        }

        next();
    },

    // Supervisor only
    isSupervisor: (req, res, next) => {

        if (!req.session.user) {
            req.flash('error', 'Please log in.');
            return res.redirect('/auth/login');
        }

        if (req.session.user.role !== 'supervisor') {
            req.flash('error', 'Supervisor access required.');
            return res.redirect('/');
        }

        next();
    },

    // Student only
    isStudent: (req, res, next) => {

        if (!req.session.user) {
            req.flash('error', 'Please log in.');
            return res.redirect('/auth/login');
        }

        if (req.session.user.role !== 'student') {
            req.flash('error', 'Student access required.');
            return res.redirect('/');
        }

        next();
    }
};
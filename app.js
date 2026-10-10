
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

require('dotenv').config();

const app = express();

// ============================================================
// BASIC APP CONFIGURATION
// ============================================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Required for secure cookies behind Render's reverse proxy.
app.set('trust proxy', 1);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Prevent direct public access to uploaded thesis documents.
app.use((req, res, next) => {
    if (
        req.path === '/uploads' ||
        req.path.startsWith('/uploads/')
    ) {
        return res.status(404).send(
            'Document access must use an authenticated file link.'
        );
    }

    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// SESSION CONFIGURATION
// ============================================================

// Restore the original in-memory session store temporarily.
// This isolates the MySQL-backed session-store change.
if (!process.env.SESSION_SECRET) {
    throw new Error(
        'SESSION_SECRET is missing from the environment.'
    );
}

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    }
}));

// ============================================================
// FLASH MESSAGES
// ============================================================

app.use(flash());

// ============================================================
// GLOBAL TEMPLATE VARIABLES
// ============================================================

app.use((req, res, next) => {
    res.locals.successMsg = req.flash('success');
    res.locals.errorMsg = req.flash('error');
    res.locals.user = req.session.user || null;

    next();
});

// ============================================================
// ROUTES
// ============================================================

app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/chairman', require('./routes/chairman'));
app.use('/student', require('./routes/student'));
app.use('/supervisor', require('./routes/supervisor'));
app.use('/files', require('./routes/files'));
app.use('/admin', require('./routes/admin'));

// ============================================================
// SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`ThesisPilot server running on port ${PORT}`);
});

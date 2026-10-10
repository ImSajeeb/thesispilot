const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db = require('./config/database'); // Import your database pool
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

const app = express();
// ============================================================
// BASIC APP CONFIGURATION
// ============================================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.set('trust proxy', 1);
// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploaded thesis documents must never be served directly from the public folder.
app.use((req, res, next) => {
    if (req.path === '/uploads' || req.path.startsWith('/uploads/')) {
        return res.status(404).send('Document access must use an authenticated file link.');
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public')));


// ============================================================
// SESSION
// ============================================================

// Configure the MySQL session store
const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000, // Checks every 15 minutes
    expiration: 86400000 // Sessions last for 24 hours
}, db);

app.use(session({
    key: 'thesispilot_session',
    secret: process.env.SESSION_SECRET,
    store: sessionStore, // Use the database for session storage
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
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
const net = require('net');
const dns = require('dns');

const host = process.env.DB_HOST;
const port = Number(process.env.DB_PORT);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
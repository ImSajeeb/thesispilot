
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const MySQLStore = require('express-mysql-session')(session);

const app = express();

// ============================================================
// BASIC APP CONFIGURATION
// ============================================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Required when running behind Render's reverse proxy.
app.set('trust proxy', 1);

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploaded thesis documents must not be served directly
// from the public folder.
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
// MYSQL SESSION STORE
// ============================================================

const sessionDbOptions = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,

    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,

    // Session configuration.
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000,

    // The session store uses its own table.
    // It does not replace your existing application tables.
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
};

// Use the same CA-verified TLS approach as config/database.js.
if (process.env.DB_SSL === 'true') {
    const caPath = process.env.DB_SSL_CA
        ? path.resolve(process.env.DB_SSL_CA)
        : path.join(__dirname, 'config', 'ca.pem');

    if (!fs.existsSync(caPath)) {
        throw new Error(
            `MySQL CA certificate not found: ${caPath}`
        );
    }

    sessionDbOptions.ssl = {
        ca: fs.readFileSync(caPath, 'utf8'),
        rejectUnauthorized: true
    };
}

// Create persistent session storage.
const sessionStore = new MySQLStore(sessionDbOptions);

// Log session-store readiness or initialization failure.
sessionStore.onReady()
    .then(() => {
        console.log('MySQL session store ready');
    })
    .catch((error) => {
        console.error(
            'MySQL session store initialization failed:',
            error
        );
    });

// ============================================================
// EXPRESS SESSION
// ============================================================

if (!process.env.SESSION_SECRET) {
    throw new Error(
        'SESSION_SECRET is missing from the environment.'
    );
}

app.use(session({
    name: 'thesispilot.sid',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
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
    console.log(`Server running on port ${PORT}`);
});

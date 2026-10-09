const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

const app = express();
// Make sure this is at the top of app.js

// Add this before your routes!
app.use(express.static(path.join(__dirname, 'public')));
// ============================================================
// BASIC APP CONFIGURATION
// ============================================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));


// ============================================================
// SESSION
// ============================================================

app.use(session({
    secret: process.env.SESSION_SECRET,

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

app.use('/admin', require('./routes/admin'));


// Admin routes will be added next.
// app.use('/admin', require('./routes/admin'));


// ============================================================
// SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
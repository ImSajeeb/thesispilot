const nodemailer = require('nodemailer');

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) {
    console.warn('SMTP_USER or SMTP_PASS is not configured. Email delivery will not work until both are set.');
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user,
        pass
    }
});

module.exports = transporter;

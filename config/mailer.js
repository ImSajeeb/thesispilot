
const { google } = require('googleapis');

const requiredEnv = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'GMAIL_USER'
];

function getGmailClient() {
    const missing = requiredEnv.filter(
        (key) => !process.env[key]
    );

    if (missing.length) {
        throw new Error(
            `Missing Gmail configuration: ${missing.join(', ')}`
        );
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });

    return google.gmail({
        version: 'v1',
        auth: oauth2Client
    });
}

function encodeHeader(value) {
    return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function createRawMessage(mailOptions) {
    const to = Array.isArray(mailOptions.to)
        ? mailOptions.to.join(', ')
        : mailOptions.to;

    if (!to) {
        throw new Error('Email recipient is required.');
    }

    const from = process.env.GMAIL_USER;
    const subject = mailOptions.subject || '(No subject)';
    const text = mailOptions.text || '';
    const html = mailOptions.html;

    const headers = [
        `From: ThesisPilot <${from}>`,
        `To: ${to}`,
        `Subject: ${encodeHeader(subject)}`,
        'MIME-Version: 1.0'
    ];

    let message;

    if (html) {
        const boundary = `thesispilot_${Date.now()}_${Math.random()
            .toString(16).slice(2)}`;

        headers.push(
            `Content-Type: multipart/alternative; boundary="${boundary}"`
        );

        message = [
            ...headers,
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(text, 'utf8').toString('base64'),
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(html, 'utf8').toString('base64'),
            `--${boundary}--`,
            ''
        ].join('\r\n');
    } else {
        headers.push(
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64'
        );

        message = [
            ...headers,
            '',
            Buffer.from(text, 'utf8').toString('base64'),
            ''
        ].join('\r\n');
    }

    return Buffer.from(message, 'utf8').toString('base64url');
}

module.exports = {
    async sendMail(mailOptions) {
        const gmail = getGmailClient();

        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: createRawMessage(mailOptions)
            }
        });

        return {
            messageId: response.data.id,
            response: response.data.threadId
        };
    }
};

const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const useSSL = process.env.DB_SSL === 'true';

const poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // ADDED: Prevent Aiven from dropping idle connections
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
};

// Use certificate-verified TLS when connecting to Aiven[cite: 7].
if (useSSL) {
    const caPath = process.env.DB_SSL_CA
        ? path.resolve(process.env.DB_SSL_CA)
        : path.join(__dirname, 'ca.pem');

    if (!fs.existsSync(caPath)) {
        throw new Error(
            `MySQL CA certificate not found: ${caPath}`
        );
    }

    poolConfig.ssl = {
        ca: fs.readFileSync(caPath, 'utf8'),
        rejectUnauthorized: true
    };
}

const pool = mysql.createPool(poolConfig);
const promisePool = pool.promise();

// Verify the database connection[cite: 7].
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        return;
    }

    console.log('Database connected successfully');
    connection.release();
});

module.exports = promisePool;
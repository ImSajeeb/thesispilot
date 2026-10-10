'use strict';

const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
    throw new Error(`Missing database configuration: ${missingEnv.join(', ')}`);
}

const useSSL = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Math.max(2, Number(process.env.DB_CONNECTION_LIMIT || 5)),
    maxIdle: Math.max(1, Number(process.env.DB_CONNECTION_LIMIT || 5)),
    idleTimeout: 60_000,
    queueLimit: 0,
    // Aiven connections may take longer to establish from a hosted app.
    connectTimeout: 30_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

if (useSSL) {
    const caPath = process.env.DB_SSL_CA
        ? path.resolve(process.env.DB_SSL_CA)
        : path.join(__dirname, 'ca.pem');

    if (!fs.existsSync(caPath)) {
        throw new Error(`MySQL CA certificate not found: ${caPath}`);
    }

    poolConfig.ssl = {
        ca: fs.readFileSync(caPath, 'utf8'),
        rejectUnauthorized: true
    };
}

const pool = mysql.createPool(poolConfig);
const promisePool = pool.promise();

// Log connection-level failures without logging credentials or SQL parameters.
pool.on('connection', (connection) => {
    connection.on('error', (error) => {
        console.error('[DB CONNECTION ERROR]', {
            code: error.code || 'UNKNOWN',
            fatal: Boolean(error.fatal),
            message: error.message
        });
    });
});

// Keep the web process alive if Aiven is temporarily unreachable at startup.
// mysql2 will create fresh pooled connections for later queries automatically.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function verifyDatabaseConnection() {
    let attempt = 0;
    while (true) {
        let connection;
        try {
            connection = await promisePool.getConnection();
            await connection.ping();
            console.log('[DB] MySQL connection verified successfully.');
            connection.release();
            return;
        } catch (error) {
            if (connection) connection.release();
            attempt += 1;
            console.error('[DB] Initial connection attempt failed; will retry.', {
                attempt,
                code: error.code || 'UNKNOWN',
                message: error.message
            });
            await delay(Math.min(15_000, 2_000 * attempt));
        }
    }
}

void verifyDatabaseConnection();

module.exports = promisePool;

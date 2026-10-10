const mysql = require('mysql2/promise'); // 1. Changed to native promises
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
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
};

// Use certificate-verified TLS when connecting to Aiven
if (useSSL) {
    const caPath = process.env.DB_SSL_CA
        ? path.resolve(process.env.DB_SSL_CA)
        : path.join(__dirname, 'ca.pem');

    if (!fs.existsSync(caPath)) {
        console.warn(`Warning: MySQL CA certificate not found at ${caPath}`);
    } else {
        poolConfig.ssl = {
            ca: fs.readFileSync(caPath, 'utf8'),
            rejectUnauthorized: true
        };
    }
}

// 2. Create the native promise pool directly
const pool = mysql.createPool(poolConfig);

// 3. Verify the connection using Promises instead of callbacks
pool.getConnection()
    .then(connection => {
        console.log('Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('Database connection failed:', err.message);
    });

// 4. Export the native pool
module.exports = pool;
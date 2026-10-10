const mysql = require('mysql2');
require('dotenv').config();

const poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 26229), // Ensure this matches Aiven's port
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ssl: {
        rejectUnauthorized: false // Forces SSL natively for Aiven without needing a local ca.pem file
    }
};

const pool = mysql.createPool(poolConfig);
const promisePool = pool.promise();

// Verify the connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Database connected successfully');
        connection.release();
    }
});

// Export only the promise-based pool for your controllers
module.exports = promisePool;
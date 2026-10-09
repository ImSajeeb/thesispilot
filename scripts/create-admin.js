const bcrypt = require('bcryptjs');
const readline = require('readline');
const db = require('../config/database');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function createAdmin() {
    try {
        console.log('\n======================================');
        console.log('       ThesisPilot Admin Setup');
        console.log('======================================\n');

        const name = (await ask('Admin name: ')).trim();
        const email = (await ask('Admin email: ')).trim().toLowerCase();
        const password = await ask('Admin password: ');
        const confirmPassword = await ask('Confirm password: ');

        // -----------------------------
        // Validation
        // -----------------------------
        if (!name || !email || !password) {
            console.log('\nAll fields are required.');
            return;
        }

        if (password !== confirmPassword) {
            console.log('\nPasswords do not match.');
            return;
        }

        // Changed minimum length requirement from 8 to 4
        if (password.length < 4) {
            console.log('\nPassword must be at least 4 characters.');
            return;
        }

        // -----------------------------
        // Check existing email
        // -----------------------------
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        if (existingUsers.length > 0) {
            console.log('\nA user with this email already exists.');
            return;
        }

        // -----------------------------
        // Hash password
        // -----------------------------
        const passwordHash = await bcrypt.hash(password, 12);

        // -----------------------------
        // Create Admin
        // -----------------------------
        const [result] = await db.execute(
            `INSERT INTO users
                (name, email, password_hash, role, account_status, is_verified)
             VALUES
                (?, ?, ?, 'admin', 'active', TRUE)`,
            [name, email, passwordHash]
        );

        console.log('\n======================================');
        console.log('Admin account created successfully!');
        console.log('======================================');
        console.log(`Admin ID: ${result.insertId}`);
        console.log(`Name: ${name}`);
        console.log(`Email: ${email}`);
        console.log('Role: admin');
        console.log('Status: active');
        console.log('======================================\n');

    } catch (error) {
        console.error('\nFailed to create Admin:', error.message);
    } finally {
        rl.close();
        await db.end();
    }
}

createAdmin();
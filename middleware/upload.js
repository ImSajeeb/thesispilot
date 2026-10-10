const multer = require('multer');
const path = require('path');

const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.zip']);
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.has(ext)) {
        return cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and ZIP are allowed.'));
    }
    cb(null, true);
};

module.exports = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter
});

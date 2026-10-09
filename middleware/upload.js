const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dir = 'public/uploads/';
        
        // Route the file to the correct subfolder based on the input name
        if (file.fieldname === 'feedback_file') {
            dir += 'feedback/';
        } else if (file.fieldname === 'proposal') {
            dir += 'proposals/';
        } else if (file.fieldname === 'final_thesis') {
            dir += 'finals/';
        } else {
            dir += 'misc/';
        }

        // Ensure the directory exists before saving
        fs.mkdirSync(dir, { recursive: true });
        
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Create a unique filename to prevent overwriting
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'file-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter (Optional: only allow certain file types)
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and ZIP are allowed.'));
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB file size limit
    fileFilter: fileFilter
});

module.exports = upload;
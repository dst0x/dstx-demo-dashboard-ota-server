const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'storage/firmwares/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'stm32-' + uniqueSuffix + '.bin');
    }
});

const fileFilter = (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.bin')) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file .bin yang diperbolehkan!'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

module.exports = upload;
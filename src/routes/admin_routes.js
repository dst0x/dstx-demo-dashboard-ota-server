const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { uploadFirmware } = require('../controllers/admin_controller');

router.post('/upload', upload.single('firmware'), uploadFirmware);

module.exports = router;
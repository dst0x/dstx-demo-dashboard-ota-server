const express = require('express');
const router = express.Router();
const {
    acknowledgeDownload,
    checkUpdate,
    downloadFirmware,
    downloadLatest,
} = require('../controllers/ota_controller');

router.get('/check', checkUpdate);
router.post('/ack', acknowledgeDownload);
router.get('/download/latest', downloadLatest);
router.get('/download/latest/:hardware_target', downloadLatest);
router.get('/download/:id', downloadFirmware);

module.exports = router;

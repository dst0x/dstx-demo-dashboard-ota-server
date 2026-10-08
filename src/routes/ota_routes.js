const express = require('express');
const router = express.Router();
const { checkUpdate, downloadFirmware, downloadLatest } = require('../controllers/ota_controller');

router.get('/check', checkUpdate);
router.get('/download/latest/:hardware_target', downloadLatest);
router.get('/download/:id', downloadFirmware);

module.exports = router;
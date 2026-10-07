const express = require('express');
const router = express.Router();
const { checkUpdate, downloadFirmware } = require('../controllers/ota_controller');

router.get('/check', checkUpdate);
router.get('/download/:id', downloadFirmware);

module.exports = router;
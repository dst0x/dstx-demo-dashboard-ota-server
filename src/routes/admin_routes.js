const express = require('express');
const router = express.Router();
const { uploadFirmware, getAllFirmwares, deleteFirmware } = require('../controllers/admin_controller');
const upload = require('../middlewares/upload');

router.post('/upload', upload.single('firmware'), uploadFirmware);
router.get('/firmwares', getAllFirmwares);
router.delete('/firmware/:id', deleteFirmware);

module.exports = router;

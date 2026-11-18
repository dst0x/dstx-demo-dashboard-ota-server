const express = require('express');
const { listPorts, openPort, closePort, sendFrame, getStatus, streamData } = require('../controllers/serial_port_controller');

const router = express.Router();

router.get('/ports', listPorts);
router.get('/status', getStatus);
router.get('/stream', streamData);
router.post('/open', openPort);
router.post('/close', closePort);
router.post('/send', sendFrame);

module.exports = router;

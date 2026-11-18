const express = require('express');
const { clearLogs, getLogs, ingestLog, streamLogs } = require('../controllers/serial_controller');
const { requireSerialIngestToken } = require('../middlewares/serial_token');

const deviceRouter = express.Router();
const adminRouter = express.Router();

deviceRouter.post('/logs', requireSerialIngestToken, ingestLog);

adminRouter.get('/logs', getLogs);
adminRouter.get('/stream', streamLogs);
adminRouter.delete('/logs', clearLogs);

module.exports = { adminRouter, deviceRouter };

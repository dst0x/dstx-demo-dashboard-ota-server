const express = require('express');
const { sendCommand, cancelCommand, getHistory, pollCommand, submitResponse } = require('../controllers/modbus_controller');

const adminRouter = express.Router();
const deviceRouter = express.Router();

// Admin (requires auth via server.js middleware)
adminRouter.post('/command', sendCommand);
adminRouter.delete('/command/:id', cancelCommand);
adminRouter.get('/history', getHistory);

// Device (no auth — same pattern as OTA endpoints)
deviceRouter.get('/poll', pollCommand);
deviceRouter.post('/response', submitResponse);

module.exports = { adminRouter, deviceRouter };

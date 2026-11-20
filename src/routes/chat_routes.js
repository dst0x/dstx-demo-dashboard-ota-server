const express = require('express');
const { chatStream } = require('../controllers/chat_controller');

const router = express.Router();
router.post('/stream', chatStream);

module.exports = router;

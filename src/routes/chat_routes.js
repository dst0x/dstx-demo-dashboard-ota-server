const express = require('express');
const {
    chatStream, getHistory, getSessions, deleteSession,
    listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
} = require('../controllers/chat_controller');

const router = express.Router();

router.post('/stream',           chatStream);
router.get('/history',           getHistory);
router.get('/sessions',          getSessions);
router.delete('/session/:key',   deleteSession);

router.get('/knowledge',         listKnowledge);
router.post('/knowledge',        createKnowledge);
router.put('/knowledge/:id',     updateKnowledge);
router.delete('/knowledge/:id',  deleteKnowledge);

module.exports = router;

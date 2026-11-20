const path = require('path');
const express = require('express');
const multer = require('multer');
const {
    chatStream, getHistory, getSessions, deleteSession,
    listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge,
    submitFeedback, getReviewData,
} = require('../controllers/chat_controller');
const {
    uploadKnowledgeFile, listKnowledgeFiles, deleteKnowledgeFile, reextractFile,
} = require('../controllers/knowledge_file_controller');

const router = express.Router();

const kfStorage = multer.diskStorage({
    destination: path.resolve(__dirname, '../../uploads/knowledge'),
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, Date.now() + '_' + safe);
    },
});
const kfUpload = multer({
    storage: kfStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.txt', '.md', '.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    },
});

router.post('/stream',           chatStream);
router.get('/history',           getHistory);
router.get('/sessions',          getSessions);
router.delete('/session/:key',   deleteSession);

router.get('/knowledge',         listKnowledge);
router.post('/knowledge',        createKnowledge);
router.put('/knowledge/:id',     updateKnowledge);
router.delete('/knowledge/:id',  deleteKnowledge);

router.get('/knowledge-files',                listKnowledgeFiles);
router.post('/knowledge-files', kfUpload.single('file'), uploadKnowledgeFile);
router.delete('/knowledge-files/:id',         deleteKnowledgeFile);
router.post('/knowledge-files/:id/reextract', reextractFile);

router.post('/feedback',  submitFeedback);
router.get('/review',     getReviewData);

module.exports = router;

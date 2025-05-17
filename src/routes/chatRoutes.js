const express = require('express');
const router = express.Router();
// const chatController = require('../controllers/chatController');
const { handleTextMessage } = require('../controllers/chat/handleTextMessage');
const { handleVoiceMessage } = require('../controllers/chat/handleVoiceMessage');
const { handleInitialMessage } = require('../controllers/chat/handleInitialMessage');
const { upload, createUploadsDir } = require('../utils/multerConfig');

// Ensure uploads directory exists
createUploadsDir();

// Handle text messages
router.post('/message', handleTextMessage);

// Handle voice messages
router.post('/voice', upload.single('audio'), handleVoiceMessage);

router.get('/initial-state', handleInitialMessage);

module.exports = router;

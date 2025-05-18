const express = require('express');
const router = express.Router();
// const chatController = require('../controllers/chatController');
const { handleTextMessage } = require('../controllers/chat/handleTextMessage');
const { handleVoiceMessage } = require('../controllers/chat/handleVoiceMessage');
const { handleInitialMessage } = require('../controllers/chat/handleInitialMessage');
const { handleUserResponse } = require('../controllers/chat/handleUserResponse');
const { setCollectedInformation, storeChatHistory } = require('../controllers/chat/setChatData');
const { protect } = require('../middleware/authMiddleware');

const { upload, createUploadsDir } = require('../utils/multerConfig');

createUploadsDir();

router.post('/message', handleTextMessage);

router.post('/voice', upload.single('audio'), handleVoiceMessage);

router.get('/initial-state', handleInitialMessage);

router.post('/user-response', handleUserResponse);

// New protected endpoints
router.post('/set-collected-information', protect, setCollectedInformation);
router.post('/store-chat-history', protect, storeChatHistory);

module.exports = router;

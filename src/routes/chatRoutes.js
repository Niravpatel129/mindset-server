const express = require('express');
const router = express.Router();
// const chatController = require('../controllers/chatController');
const { handleTextMessage } = require('../controllers/chat/handleTextMessage');
const { handleVoiceMessage } = require('../controllers/chat/handleVoiceMessage');
const { handleInitialMessage } = require('../controllers/chat/handleInitialMessage');
const { handleUserResponse } = require('../controllers/chat/handleUserResponse');

const { upload, createUploadsDir } = require('../utils/multerConfig');

createUploadsDir();

router.post('/message', handleTextMessage);

router.post('/voice', upload.single('audio'), handleVoiceMessage);

router.get('/initial-state', handleInitialMessage);

router.post('/user-response', handleUserResponse);

module.exports = router;

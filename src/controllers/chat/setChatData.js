const Chat = require('../../models/chatModel');
const asyncHandler = require('express-async-handler');

/**
 * Set collected information and next goal data
 * @route POST /api/chat/set-collected-information
 */
const setCollectedInformation = asyncHandler(async (req, res) => {
  const { collectedInformation, nextGoalDisplay, nextGoalTiming } = req.body;
  const userId = req.user ? req.user._id : null; // Assuming authentication middleware sets req.user

  if (!userId) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  // Find existing chat document or create a new one
  let chatData = await Chat.findOne({ userId });

  if (!chatData) {
    chatData = new Chat({ userId });
  }

  // Update the fields
  chatData.collectedInformation = collectedInformation;
  chatData.nextGoalDisplay = nextGoalDisplay;
  chatData.nextGoalTiming = nextGoalTiming;

  await chatData.save();

  res.status(200).json({ success: true });
});

/**
 * Store chat history
 * @route POST /api/chat/store-chat-history
 */
const storeChatHistory = asyncHandler(async (req, res) => {
  const { chatHistory } = req.body;
  const userId = req.user ? req.user._id : null; // Assuming authentication middleware sets req.user

  if (!userId) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  // Find existing chat document or create a new one
  let chatData = await Chat.findOne({ userId });

  if (!chatData) {
    chatData = new Chat({ userId });
  }

  // Update the chat history
  chatData.chatHistory = chatHistory;

  await chatData.save();

  res.status(200).json({ success: true });
});

module.exports = {
  setCollectedInformation,
  storeChatHistory,
};

const chatService = require('../../services/chatService');

exports.handleTextMessage = async (req, res) => {
  try {
    const { message, options } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await chatService.sendMessage(message, options);
    res.json(response);
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

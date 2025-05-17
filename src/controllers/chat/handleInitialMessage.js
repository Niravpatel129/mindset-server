const chatService = require('../../services/chatService');

exports.handleInitialMessage = async (req, res) => {
  try {
    // TODO: Implement logic for initial message/state
    const response = await chatService.sendMessage('Initial State Request', {}); // Placeholder
    res.json({ message: 'Initial state fetched successfully', data: response });
  } catch (error) {
    console.error('Initial message error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

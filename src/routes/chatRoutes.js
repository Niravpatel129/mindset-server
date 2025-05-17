const express = require('express');
const router = express.Router();

// Handle chat messages
router.post('/message', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // TODO: Add your chat processing logic here
    // For now, we'll just echo back a simple response
    const response = {
      message: `Thank you for sharing. I heard: "${message}". Would you like to tell me more?`,
    };

    res.json(response);
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

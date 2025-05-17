exports.handleInitialMessage = async (req, res) => {
  try {
    res.json({
      message: 'Hey Nehal, your goal was to go to the gym, were you able to do it?',
    });
  } catch (error) {
    console.error('Initial message error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const chatService = require('../../services/chatService');
const fs = require('fs').promises;

exports.handleVoiceMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    // Transcribe the audio file
    const transcription = await chatService.transcribeAudio(req.file.path);

    // Get ChatGPT response for the transcribed text
    const response = await chatService.sendMessage(transcription, req.body.options);

    // Clean up the uploaded file
    await fs.unlink(req.file.path);

    // Return both transcription and response
    res.json({
      transcription,
      response: response.message,
      usage: response.usage,
    });
  } catch (error) {
    // Clean up the uploaded file in case of error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    console.error('Voice message error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

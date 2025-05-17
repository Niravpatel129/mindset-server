const OpenAI = require('openai');
const fs = require('fs');

class ChatService {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async transcribeAudio(audioFilePath) {
    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
      });

      return transcription.text;
    } catch (error) {
      console.error('Audio transcription error:', error);
      throw new Error('Failed to transcribe audio');
    }
  }

  async sendMessage(message, options = {}) {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [{ role: 'user', content: message }],
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 150,
      });

      return {
        message: completion.choices[0].message.content,
        usage: completion.usage,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error('Failed to get response from ChatGPT');
    }
  }
}

module.exports = new ChatService();

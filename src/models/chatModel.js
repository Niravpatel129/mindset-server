const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    chatHistory: {
      type: Array,
      default: [],
    },
    collectedInformation: {
      type: Object,
      default: {},
    },
    nextGoalDisplay: {
      type: String,
      default: '',
    },
    nextGoalTiming: {
      type: String,
      default: '',
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Chat', chatSchema);

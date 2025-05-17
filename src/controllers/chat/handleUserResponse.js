const chatService = require('../../services/chatService');

const ROLE_ASSISTANT = 'You are a reflective coach';

// Helper functions to identify assistant message content patterns
const isInitialQuery = (text) =>
  text && text.includes('your goal was') && text.includes('were you able to do it?');
const isWhyQuery = (text) =>
  text &&
  (text.includes('Why were you able to accomplish this goal') ||
    text.includes('why were you NOT able to accomplish this goal?'));
const isNextGoalQuery = (text) => text && text.includes("What's your goal for tomorrow?");
const isConclusion = (text) =>
  text && text.includes('Good luck.') && text.includes('This is the end of this reflection.');

// System prompts that instruct the AI what question to ask or action to take for the current turn.
const STAGE_SYSTEM_PROMPTS = {
  // Instructs AI to ask the 'Why' question, assuming user just provided/confirmed the outcome.
  REQUEST_WHY: `${ROLE_ASSISTANT}. User shared their outcome. Ask: 'Why were you able to accomplish this, or why not?' Be direct.`,

  // Instructs AI to ask for the 'Next Goal', assuming user just provided the 'Why'.
  REQUEST_NEXT_GOAL: `${ROLE_ASSISTANT}. User shared their reasons or indicated uncertainty. Briefly acknowledge, then ask: 'What\'s your goal for tomorrow?' Be direct.`,

  // Instructs AI to conclude, assuming user just provided the 'Next Goal'.
  REQUEST_CONCLUDE: `${ROLE_ASSISTANT}. User shared their next goal. Respond only: 'Good luck.'`,

  POST_CONCLUSION_DEFAULT: `${ROLE_ASSISTANT}. Reflection ended. How else can I help?`,
  // Fallback if something is unexpected - though the logic aims to always target a bucket.
  GENERAL_GUIDANCE: `${ROLE_ASSISTANT}. Let's continue your reflection.`,
};

const STAGE_KEYS = {
  AWAITING_INITIAL_RESPONSE: 'AWAITING_INITIAL_RESPONSE', // For clarity if needed, though outcomeProvided handles it
  AWAITING_WHY: 'AWAITING_WHY',
  AWAITING_NEXT_GOAL: 'AWAITING_NEXT_GOAL',
  AWAITING_CONCLUSION: 'AWAITING_CONCLUSION',
  CONCLUDED: 'CONCLUDED',
  GENERAL_GUIDANCE: 'GENERAL_GUIDANCE',
};

// New: To identify the nature of the assistant's last relevant prompt
const PREVIOUS_ASSISTANT_ACTION = {
  NONE: 'NONE',
  ASKED_INITIAL: 'ASKED_INITIAL',
  ASKED_WHY: 'ASKED_WHY',
  ASKED_NEXT_GOAL: 'ASKED_NEXT_GOAL',
  CONCLUDED_SESSION: 'CONCLUDED_SESSION',
};

function determineStageAndInstruction(priorChatHistory) {
  let outcomeProvided = false;
  let whyProvided = false;
  let nextGoalProvided = false;
  let conversationConcluded = false;

  let lastAssistantQueryType = null;
  let previousAssistantActionPrompt = PREVIOUS_ASSISTANT_ACTION.NONE;

  for (let i = 0; i < priorChatHistory.length; i++) {
    const message = priorChatHistory[i];
    if (message.role === 'assistant') {
      if (isInitialQuery(message.content)) {
        lastAssistantQueryType = 'initial';
        previousAssistantActionPrompt = PREVIOUS_ASSISTANT_ACTION.ASKED_INITIAL;
      } else if (isWhyQuery(message.content)) {
        lastAssistantQueryType = 'why';
        previousAssistantActionPrompt = PREVIOUS_ASSISTANT_ACTION.ASKED_WHY;
      } else if (isNextGoalQuery(message.content)) {
        lastAssistantQueryType = 'nextGoal';
        previousAssistantActionPrompt = PREVIOUS_ASSISTANT_ACTION.ASKED_NEXT_GOAL;
      } else if (isConclusion(message.content)) {
        lastAssistantQueryType = 'conclusion';
        conversationConcluded = true;
        previousAssistantActionPrompt = PREVIOUS_ASSISTANT_ACTION.CONCLUDED_SESSION;
      } else {
        // Non-stage-setting assistant message doesn't reset previousAssistantActionPrompt
        // It means the last significant prompt still stands.
        lastAssistantQueryType = null;
      }
    } else if (message.role === 'user') {
      if (lastAssistantQueryType === 'initial') outcomeProvided = true;
      else if (lastAssistantQueryType === 'why') whyProvided = true;
      else if (lastAssistantQueryType === 'nextGoal') nextGoalProvided = true;
    }
  }

  const collectedInfo = { outcomeProvided, whyProvided, nextGoalProvided };

  if (conversationConcluded) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.POST_CONCLUSION_DEFAULT,
      currentStage: STAGE_KEYS.CONCLUDED,
      collectedInfo,
      previousAssistantActionPrompt,
    };
  }

  if (!outcomeProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_WHY,
      currentStage: STAGE_KEYS.AWAITING_WHY,
      collectedInfo,
      previousAssistantActionPrompt, // Will be NONE or ASKED_INITIAL if history is short
    };
  }

  if (!whyProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_WHY,
      currentStage: STAGE_KEYS.AWAITING_WHY,
      collectedInfo,
      previousAssistantActionPrompt,
    };
  }

  if (!nextGoalProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_NEXT_GOAL,
      currentStage: STAGE_KEYS.AWAITING_NEXT_GOAL,
      collectedInfo,
      previousAssistantActionPrompt,
    };
  }

  return {
    systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_CONCLUDE,
    currentStage: STAGE_KEYS.AWAITING_CONCLUSION,
    collectedInfo,
    previousAssistantActionPrompt,
  };
}

const UNCERTAINTY_PHRASES = ['i am not sure', "i don't know", 'not sure', 'unsure', 'no idea'];

exports.handleUserResponse = async (req, res) => {
  try {
    const { currentUserMessage, chatHistory } = req.body;

    if (!currentUserMessage || !currentUserMessage.content) {
      return res.status(400).json({ error: 'currentUserMessage with content is required' });
    }

    const priorMessages = chatHistory || [];

    let stageInfo = determineStageAndInstruction(priorMessages);

    let systemInstructionForLlm = stageInfo.systemInstructionText;
    let currentStageForResponse = stageInfo.currentStage;
    let collectedInfoForResponse = { ...stageInfo.collectedInfo };

    const currentUserIsUncertain = UNCERTAINTY_PHRASES.some((phrase) =>
      currentUserMessage.content.toLowerCase().includes(phrase),
    );

    // If the current stage is to collect "Why" and the user expresses uncertainty,
    // then treat "Why" as addressed and move to asking for the "Next Goal".
    if (stageInfo.currentStage === STAGE_KEYS.AWAITING_WHY && currentUserIsUncertain) {
      systemInstructionForLlm = STAGE_SYSTEM_PROMPTS.REQUEST_NEXT_GOAL;
      currentStageForResponse = STAGE_KEYS.AWAITING_NEXT_GOAL;
      collectedInfoForResponse.whyProvided = true; // Mark 'why' as addressed
    }

    const historyForLlm = [{ role: 'system', content: systemInstructionForLlm }, ...priorMessages];

    const aiResponse = await chatService.sendMessage(currentUserMessage.content, historyForLlm, {
      model: 'gpt-3.5-turbo',
    });

    let finalReportedStage = currentStageForResponse;
    // If the AI was instructed to conclude and its response is indeed a conclusion
    if (
      systemInstructionForLlm === STAGE_SYSTEM_PROMPTS.REQUEST_CONCLUDE &&
      isConclusion(aiResponse.message.content)
    ) {
      finalReportedStage = STAGE_KEYS.CONCLUDED;
    }

    res.json({
      aiMessage: aiResponse.message,
      currentStage: finalReportedStage,
      collectedInformation: collectedInfoForResponse,
    });
  } catch (error) {
    console.error('User response error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

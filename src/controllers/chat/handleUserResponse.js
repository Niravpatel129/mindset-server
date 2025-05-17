const chatService = require('../../services/chatService');

const ROLE_ASSISTANT = 'You are a reflective coach';

// Helper functions to identify assistant message content patterns (can be used by AI or fallback logic)
const isInitialQuery = (text) =>
  text && text.includes('your goal was') && text.includes('were you able to do it?');
const isWhyQuery = (text) =>
  text && (text.includes('Why were you able to accomplish this') || text.includes('why not?'));
const isNextGoalQuery = (text) => text && text.includes("What's your goal for tomorrow?");
const isConclusion = (text) => text && text.includes('Good luck.');

const STAGE_SYSTEM_PROMPTS = {
  REQUEST_WHY: `${ROLE_ASSISTANT}. User shared their outcome. Ask: \'Why were you able to accomplish this, or why not?\' Be direct.`,
  REQUEST_NEXT_GOAL: `${ROLE_ASSISTANT}. User shared their reasons or indicated uncertainty. Briefly acknowledge, then ask: \'What\\\'s your goal for tomorrow?\' Be direct.`,
  REQUEST_CONCLUDE: `${ROLE_ASSISTANT}. User shared their next goal. Respond only: \'Good luck.\'`,
  POST_CONCLUSION_DEFAULT: `${ROLE_ASSISTANT}. Reflection ended. How else can I help?`,
  GENERAL_GUIDANCE: `${ROLE_ASSISTANT}. Let\'s continue your reflection.`,
};

const STAGE_KEYS = {
  AWAITING_INITIAL_RESPONSE: 'AWAITING_INITIAL_RESPONSE',
  AWAITING_WHY: 'AWAITING_WHY',
  AWAITING_NEXT_GOAL: 'AWAITING_NEXT_GOAL',
  AWAITING_CONCLUSION: 'AWAITING_CONCLUSION',
  CONCLUDED: 'CONCLUDED',
  GENERAL_GUIDANCE: 'GENERAL_GUIDANCE',
  ERROR_STATE: 'ERROR_STATE', // New key for when AI state analysis fails
};

const ASSISTANT_PROMPT_TYPES = {
  NONE: 'NONE',
  ASKED_INITIAL: 'ASKED_INITIAL',
  ASKED_WHY: 'ASKED_WHY',
  ASKED_NEXT_GOAL: 'ASKED_NEXT_GOAL',
  CONCLUDED_SESSION: 'CONCLUDED_SESSION',
};

const STATE_ANALYSIS_SYSTEM_PROMPT = `You are a precise conversation state analyzer. Your sole task is to analyze the provided chat history (a JSON string) and determine the state of a reflective coaching conversation. The conversation aims to collect three key pieces of information from the user:\n1.  **Outcome**: Did the user achieve their previous goal? (e.g., respond to \"were you able to do it?\")\n2.  **Why**: The reasons for the outcome. (e.g., respond to \"Why were you able/unable...?\")\n3.  **Next Goal**: The user's goal for the next period. (e.g., respond to \"What's your goal for tomorrow?\")\n\nBased on the history, identify and output ONLY a single, raw, valid JSON object with the following fields:\n- \\\`outcomeProvided\\\`: boolean (true if user stated outcome after an initial question)\n- \\\`whyProvided\\\`: boolean (true if user provided reasons or explicit uncertainty like \"I don't know\" after a \"why\" question)\n- \\\`nextGoalProvided\\\`: boolean (true if user stated next goal after a \"next goal\" question)\n- \\\`conversationConcluded\\\`: boolean (true if assistant has said \"Good luck.\" and ended reflection)\n- \\\`lastSignificantAssistantPromptType\\\`: string, one of [\"${Object.values(
  ASSISTANT_PROMPT_TYPES,
).join(
  '", "',
)}\"]. This must reflect the last *key information-seeking question* from the assistant or if it concluded. Soft follow-ups (e.g., \"How did that feel?\") do not count as the last significant prompt if a primary question (like initial or why) was asked before it and not yet fully answered.\n\nYour entire response must be ONLY the JSON object, starting with { and ending with }. Do not include any other text, explanations, or markdown. Adhere strictly to JSON format, as if in JSON mode.\nExample of desired output format:\n{\n  \"outcomeProvided\": true,\n  \"whyProvided\": false,\n  \"nextGoalProvided\": false,\n  \"conversationConcluded\": false,\n  \"lastSignificantAssistantPromptType\": \"${
  ASSISTANT_PROMPT_TYPES.ASKED_INITIAL
}\"\n}`;

async function getAIAnalyzedState(priorChatHistory) {
  try {
    const historyString = JSON.stringify(priorChatHistory);
    console.log('AI Analysis Input (priorChatHistory String):', historyString);

    const analysisResponse = await chatService.sendMessage(
      historyString,
      [{ role: 'system', content: STATE_ANALYSIS_SYSTEM_PROMPT }],
      { model: 'gpt-3.5-turbo' },
    );

    console.log('Raw AI Analysis Response object:', JSON.stringify(analysisResponse));
    console.log('Raw AI Analysis Response content:', analysisResponse?.message?.content);

    if (analysisResponse && typeof analysisResponse.message === 'string') {
      let jsonString = analysisResponse.message.trim();
      console.log('Trimmed JSON string for parsing:', jsonString);
      let parsedState;

      try {
        // First, try direct parsing
        parsedState = JSON.parse(jsonString);
      } catch (e) {
        // If direct parsing fails, try to extract JSON object using regex
        const jsonMatch = jsonString.match(/\\{.*\\}/s);
        if (jsonMatch && jsonMatch[0]) {
          try {
            parsedState = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            console.error(
              'Failed to parse extracted JSON from AI analysis:',
              e2,
              'Original content:',
              jsonString,
            );
            // Fall through to default error state if regex-extracted JSON also fails to parse
          }
        } else {
          console.error(
            'Direct JSON parsing failed and no JSON object found via regex. Content:',
            jsonString,
          );
          // Fall through to default error state if no JSON object pattern is found
        }
      }

      // Validate the parsed state if parsing was successful
      if (
        parsedState &&
        typeof parsedState.outcomeProvided === 'boolean' &&
        typeof parsedState.whyProvided === 'boolean' &&
        typeof parsedState.nextGoalProvided === 'boolean' &&
        typeof parsedState.conversationConcluded === 'boolean' &&
        Object.values(ASSISTANT_PROMPT_TYPES).includes(
          parsedState.lastSignificantAssistantPromptType,
        )
      ) {
        return parsedState;
      } else if (parsedState) {
        console.error('Parsed JSON from AI analysis did not match expected schema:', parsedState);
      } else {
        console.error('All parsing attempts failed for AI analysis content.');
      }
    } else {
      console.error(
        'No valid string content received in analysisResponse.message for AI state analysis. Full response:',
        JSON.stringify(analysisResponse),
      );
    }
  } catch (error) {
    console.error('Error in getAIAnalyzedState:', error);
  }
  // Fallback to a default/error state if AI analysis fails
  return {
    outcomeProvided: false,
    whyProvided: false,
    nextGoalProvided: false,
    conversationConcluded: false,
    lastSignificantAssistantPromptType: ASSISTANT_PROMPT_TYPES.NONE,
    error: true, // Indicate that this is a fallback
  };
}

function determineNextStepFromAIState(aiState) {
  const {
    outcomeProvided,
    whyProvided,
    nextGoalProvided,
    conversationConcluded,
    lastSignificantAssistantPromptType,
  } = aiState;
  const collectedInfo = { outcomeProvided, whyProvided, nextGoalProvided };

  if (aiState.error) {
    // If AI state analysis failed
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.GENERAL_GUIDANCE, // Or a specific error handling prompt
      currentStage: STAGE_KEYS.ERROR_STATE,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  if (conversationConcluded) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.POST_CONCLUSION_DEFAULT,
      currentStage: STAGE_KEYS.CONCLUDED,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  if (!outcomeProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_WHY, // AI should ask Why after outcome
      currentStage: STAGE_KEYS.AWAITING_WHY,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  if (!whyProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_WHY,
      currentStage: STAGE_KEYS.AWAITING_WHY,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  if (!nextGoalProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_NEXT_GOAL,
      currentStage: STAGE_KEYS.AWAITING_NEXT_GOAL,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  return {
    systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_CONCLUDE,
    currentStage: STAGE_KEYS.AWAITING_CONCLUSION,
    collectedInfo,
    lastSignificantAssistantPromptType,
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

    // Step 1: Get AI-analyzed state
    const aiAnalyzedState = await getAIAnalyzedState(priorMessages);

    // Step 2: Determine next step based on AI-analyzed state
    // Note: determineNextStepFromAIState provides the "default" next step based on AI analysis.
    // This might be overridden by uncertainty logic.
    let derivedStepInfo = determineNextStepFromAIState(aiAnalyzedState);

    let systemInstructionForLlm = derivedStepInfo.systemInstructionText;
    let currentStageForResponse = derivedStepInfo.currentStage;
    // Use the collectedInfo as determined by the AI analysis
    let collectedInfoForResponse = {
      outcomeProvided: aiAnalyzedState.outcomeProvided,
      whyProvided: aiAnalyzedState.whyProvided,
      nextGoalProvided: aiAnalyzedState.nextGoalProvided,
    };

    const currentUserIsUncertain = UNCERTAINTY_PHRASES.some((phrase) =>
      currentUserMessage.content.toLowerCase().includes(phrase),
    );

    // Uncertainty handling: If AI analysis implies we're waiting for "Why", and user is uncertain
    if (currentStageForResponse === STAGE_KEYS.AWAITING_WHY && currentUserIsUncertain) {
      systemInstructionForLlm = STAGE_SYSTEM_PROMPTS.REQUEST_NEXT_GOAL;
      currentStageForResponse = STAGE_KEYS.AWAITING_NEXT_GOAL;
      collectedInfoForResponse.whyProvided = true; // Mark 'why' as addressed due to uncertainty
    }

    const historyForLlm = [
      { role: 'system', content: systemInstructionForLlm },
      ...priorMessages,
      // We don't add currentUserMessage here if chatService.sendMessage expects it as a separate param
    ];

    // Step 3: Generate actual AI response to the user
    const aiResponse = await chatService.sendMessage(currentUserMessage.content, historyForLlm, {
      model: 'gpt-3.5-turbo',
    });

    let finalReportedStage = currentStageForResponse;
    if (
      systemInstructionForLlm === STAGE_SYSTEM_PROMPTS.REQUEST_CONCLUDE &&
      isConclusion(aiResponse.message.content)
    ) {
      finalReportedStage = STAGE_KEYS.CONCLUDED;
      // Update collectedInfo if the AI successfully concludes as instructed
      // This part might need refinement based on how `collectedInfoForResponse` should reflect the *final* state after AI's concluding message.
      // For now, `collectedInfoForResponse` reflects the state *before* this final conclusion.
    }

    res.json({
      aiMessage: aiResponse.message,
      currentStage: finalReportedStage,
      collectedInformation: collectedInfoForResponse,
      // Optionally, include AI analysis for debugging if needed by frontend:
      // aiAnalysisDebug: aiAnalyzedState
    });
  } catch (error) {
    console.error('User response error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

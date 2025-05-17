const chatService = require('../../services/chatService');

const ROLE_ASSISTANT = 'You are a reflective coach';

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
    // console.log('AI Analysis Input (priorChatHistory String):', historyString); // Keep for debugging if needed

    const analysisResponse = await chatService.sendMessage(
      historyString,
      [{ role: 'system', content: STATE_ANALYSIS_SYSTEM_PROMPT }],
      { model: 'gpt-3.5-turbo' }, // Ensure this model is optimal for structured JSON output
    );

    // console.log('Raw AI Analysis Response object:', JSON.stringify(analysisResponse)); // Debugging

    let stringToParse = null;
    if (analysisResponse && analysisResponse.message) {
      if (typeof analysisResponse.message === 'string') {
        stringToParse = analysisResponse.message;
        // console.log('Attempting to parse from analysisResponse.message (direct string):', stringToParse);
      } else if (typeof analysisResponse.message.content === 'string') {
        stringToParse = analysisResponse.message.content;
        // console.log('Attempting to parse from analysisResponse.message.content:', stringToParse);
      }
    }

    if (stringToParse) {
      let jsonString = stringToParse.trim();
      let parsedState;

      try {
        parsedState = JSON.parse(jsonString);
      } catch (e) {
        // console.warn('Direct JSON.parse failed, attempting regex extraction:', e, 'Original string:', jsonString); // Debugging
        const jsonMatch = jsonString.match(/\{.*\}/s);
        if (jsonMatch && jsonMatch[0]) {
          try {
            parsedState = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            console.error(
              'Failed to parse extracted JSON from AI analysis (after regex):',
              e2,
              'Original content after regex attempt:',
              jsonMatch[0],
              'Original string fed to regex:',
              jsonString,
            );
            // parsedState remains undefined
          }
        } else {
          console.error(
            'Direct JSON parsing failed and no JSON object found via regex. Original string:',
            jsonString,
          );
          // parsedState remains undefined
        }
      }

      // Validate the parsed state
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
        return parsedState; // Successful parse and validation
      } else if (parsedState) {
        // Parsed something, but it didn't match the schema
        console.error(
          'Parsed JSON from AI analysis did not match expected schema:',
          parsedState,
          'Original string:',
          jsonString,
        );
      } else {
        // This case is hit if all parsing attempts failed (parsedState is undefined)
        // Specific errors logged above.
      }
    } else {
      // stringToParse was null
      console.error(
        'No extractable string content found in AI analysis response for JSON parsing. Full response:',
        JSON.stringify(analysisResponse),
      );
    }
  } catch (error) {
    // Catch errors from chatService.sendMessage or other unexpected issues
    console.error('Error in getAIAnalyzedState function (outer try-catch):', error);
  }

  // Fallback to a default/error state
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
    error: aiAnalysisFailed, // Renamed for clarity within this function
  } = aiState;

  const collectedInfo = { outcomeProvided, whyProvided, nextGoalProvided };

  if (aiAnalysisFailed) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.GENERAL_GUIDANCE,
      currentStage: STAGE_KEYS.ERROR_STATE,
      collectedInfo, // Reflects potentially incomplete info due to error
      lastSignificantAssistantPromptType,
    };
  }

  if (conversationConcluded) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.POST_CONCLUSION_DEFAULT,
      currentStage: STAGE_KEYS.CONCLUDED,
      collectedInfo, // Reflects info gathered before conclusion
      lastSignificantAssistantPromptType,
    };
  }

  // If outcome is not provided, the AI should have asked for it, and now we ask for 'why'
  // This implies the initial question about the outcome was the last significant prompt.
  if (!outcomeProvided) {
    // This state implies that the initial question was asked, user responded,
    // and now we need to ask 'why'.
    // However, the prompt should be to ask for 'why', not to re-ask initial.
    // The logic here might need to align with how `lastSignificantAssistantPromptType` influences prompts.
    // For now, assuming outcome is the first thing needed if not present.
    // A more robust logic might be: if lastSignificantAssistantPromptType was ASKED_INITIAL and outcome still not provided, there's a mismatch.
    // But given the AI analysis should tell us outcomeProvided, this path should ideally transition to asking WHY.
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_WHY,
      currentStage: STAGE_KEYS.AWAITING_WHY, // Correctly moves to AWAITING_WHY
      collectedInfo,
      lastSignificantAssistantPromptType, // This would be ASKED_INITIAL from AI analysis
    };
  }

  // If outcome is provided, but 'why' is not.
  if (!whyProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_WHY,
      currentStage: STAGE_KEYS.AWAITING_WHY,
      collectedInfo,
      lastSignificantAssistantPromptType, // Could be ASKED_INITIAL or ASKED_WHY if re-prompting
    };
  }

  // If outcome and 'why' are provided, but 'next goal' is not.
  if (!nextGoalProvided) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_NEXT_GOAL,
      currentStage: STAGE_KEYS.AWAITING_NEXT_GOAL,
      collectedInfo,
      lastSignificantAssistantPromptType, // Could be ASKED_WHY or ASKED_NEXT_GOAL
    };
  }

  // All information collected, request conclusion.
  return {
    systemInstructionText: STAGE_SYSTEM_PROMPTS.REQUEST_CONCLUDE,
    currentStage: STAGE_KEYS.AWAITING_CONCLUSION,
    collectedInfo,
    lastSignificantAssistantPromptType, // Could be ASKED_NEXT_GOAL
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
    // Use the collectedInfo as determined by the AI analysis (or its error fallback)
    let collectedInfoForResponse = {
      outcomeProvided: aiAnalyzedState.outcomeProvided,
      whyProvided: aiAnalyzedState.whyProvided,
      nextGoalProvided: aiAnalyzedState.nextGoalProvided,
    };

    if (aiAnalyzedState.error) {
      let baseRecoveryMessage = `${ROLE_ASSISTANT}. I'm having a bit of trouble keeping track of our conversation. `;
      if (currentUserMessage && currentUserMessage.content) {
        baseRecoveryMessage += `You mentioned, "${currentUserMessage.content}". `;
      }
      baseRecoveryMessage += 'To help us get back on course: ';

      let guidingQuestion = '';
      let lastMatchedStage = null;

      if (priorMessages && priorMessages.length > 0) {
        const reversedPriorMessages = [...priorMessages].reverse();
        for (const msg of reversedPriorMessages) {
          if (msg.role === 'assistant') {
            if (msg.content.includes('goal for tomorrow?')) {
              lastMatchedStage = STAGE_KEYS.AWAITING_NEXT_GOAL;
              break;
            }
            if (msg.content.includes('Why were you able') || msg.content.includes('why not?')) {
              lastMatchedStage = STAGE_KEYS.AWAITING_WHY;
              break;
            }
            if (msg.content.includes('were you able to do it?')) {
              lastMatchedStage = STAGE_KEYS.AWAITING_INITIAL_RESPONSE;
              break;
            }
          }
        }
      }

      if (lastMatchedStage === STAGE_KEYS.AWAITING_WHY) {
        guidingQuestion = 'Could you tell me why you were able to achieve your goal, or why not?';
      } else if (lastMatchedStage === STAGE_KEYS.AWAITING_NEXT_GOAL) {
        guidingQuestion = "What's your goal for tomorrow?";
      } else {
        // Includes AWAITING_INITIAL_RESPONSE or null/undefined if no specific match
        guidingQuestion = 'Could you please share if you were able to accomplish your recent goal?';
      }
      systemInstructionForLlm = baseRecoveryMessage + guidingQuestion;
      // currentStageForResponse is already STAGE_KEYS.ERROR_STATE from determineNextStepFromAIState
      // collectedInfoForResponse is already the error state (all false) from aiAnalyzedState
    }

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

    // Determine final reported stage
    let finalReportedStage = currentStageForResponse;
    if (
      systemInstructionForLlm === STAGE_SYSTEM_PROMPTS.REQUEST_CONCLUDE &&
      aiResponse.message &&
      aiResponse.message.content &&
      aiResponse.message.content.includes('Good luck.') // Check if AI did conclude
    ) {
      finalReportedStage = STAGE_KEYS.CONCLUDED;
      // collectedInfoForResponse reflects the state *before* this final conclusion message from AI.
      // If we needed to update collectedInfo to reflect that conclusion *happened*,
      // we might set something like `allGoalsMet: true` here, but current structure is fine.
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

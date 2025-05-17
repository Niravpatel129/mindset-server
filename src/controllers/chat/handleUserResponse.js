const chatService = require('../../services/chatService');

const ROLE_ASSISTANT = 'You are a reflective coach';

const STAGE_SYSTEM_PROMPTS = {
  REQUEST_WHY: `${ROLE_ASSISTANT}. User shared their outcome. Ask: 'Why were you able to accomplish this, or why not?' Be direct.`,
  REQUEST_NEXT_GOAL: `${ROLE_ASSISTANT}. User shared their reasons or indicated uncertainty. Briefly acknowledge, then ask: 'What\'s your next goal, and when do you plan to achieve it?' Be direct.`,
  REQUEST_CONCLUDE: `${ROLE_ASSISTANT}. User shared their next goal and timing. Briefly acknowledge their reflection on why they did/didn't meet their previous goal (drawing from conversation history), then offer a short, supportive, and positive closing statement wishing them well with their *new* goal.`,
  POST_CONCLUSION_DEFAULT: `${ROLE_ASSISTANT}. Reflection ended. How else can I help?`,
  GENERAL_GUIDANCE: `${ROLE_ASSISTANT}. Let\'s continue your reflection.`,
  CLARIFY_OUTCOME: `${ROLE_ASSISTANT}. I'd like to make sure I understand. Were you able to accomplish your previous goal? A 'yes' or 'no', or a bit more detail, would be helpful.`,
  CLARIFY_WHY: `${ROLE_ASSISTANT}. Just to follow up on your reasons – could you elaborate a bit on why you were (or weren't) able to accomplish your goal? If you're unsure, that's fine too.`,
  CLARIFY_NEXT_GOAL_AND_TIMING: `${ROLE_ASSISTANT}. To ensure I've got it, what's your next goal, and when are you aiming to achieve it?`,
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

const STATE_ANALYSIS_SYSTEM_PROMPT = `You are a precise conversation state analyzer. Your sole task is to analyze the provided chat history (a JSON string) and determine the state of a reflective coaching conversation. The conversation aims to collect key pieces of information from the user:
1.  **Outcome**: Did the user achieve their previous goal? (e.g., respond to "were you able to do it?")
2.  **Why**: The reasons for the outcome. (e.g., respond to "Why were you able/unable...?")
3.  **Next Goal Text**: The user's description of their goal for the next period.
4.  **Next Goal Timing**: When the user plans to achieve their next goal. (e.g., "tomorrow", "next week", "by Friday")

Based on the history, identify and output ONLY a single, raw, valid JSON object with the following fields:
- \`outcomeProvided\`: boolean (true if user stated outcome after an initial question)
- \`whyProvided\`: boolean (true if user provided reasons or explicit uncertainty like "I don't know" after a "why" question)
- \`nextGoalProvided\`: boolean (true if user stated the *text* of their next goal. The assistant's question for the 'next goal' now also prompts for timing, so this field can be true even if timing is also provided in the same user response.)
- \`nextGoalTimingProvided\`: boolean (true if user specified a timeframe for their next goal. This may be provided in the same utterance as the goal text, especially after the assistant asks for both goal and timing.)
- \`nextGoalTiming\`: string (e.g., "tomorrow", "in two days", "next Monday", "sometime next week", "end of the week"). Extract the timing if the user states it. If not provided or not applicable yet, use "not specified".
- \`conversationConcluded\`: boolean (true if assistant has delivered a concluding statement after user provided their next goal and timing, and ended the reflection)
- \`lastSignificantAssistantPromptType\`: string, one of ["${Object.values(
  ASSISTANT_PROMPT_TYPES,
).join(
  '", "',
)}"]. This must reflect the last *key information-seeking question* from the assistant or if it concluded. Soft follow-ups do not count.

Your entire response must be ONLY the JSON object, starting with { and ending with }. Do not include any other text, explanations, or markdown. Adhere strictly to JSON format.
Example of desired output format (user has just provided their next goal and timing after being asked for both):
{
  "outcomeProvided": true,
  "whyProvided": true,
  "nextGoalProvided": true,
  "nextGoalTimingProvided": true,
  "nextGoalTiming": "tomorrow morning",
  "conversationConcluded": false,
  "lastSignificantAssistantPromptType": "${ASSISTANT_PROMPT_TYPES.ASKED_NEXT_GOAL}"
}`;

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
        typeof parsedState.nextGoalTimingProvided === 'boolean' &&
        typeof parsedState.nextGoalTiming === 'string' &&
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
    nextGoalTimingProvided: false,
    nextGoalTiming: 'not specified',
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
    nextGoalTimingProvided,
    nextGoalTiming,
    conversationConcluded,
    lastSignificantAssistantPromptType,
    error: aiAnalysisFailed,
  } = aiState;

  const collectedInfo = {
    outcomeProvided,
    whyProvided,
    nextGoalProvided,
    nextGoalTimingProvided,
    nextGoalTiming,
  };

  if (aiAnalysisFailed) {
    return {
      systemInstructionText: STAGE_SYSTEM_PROMPTS.GENERAL_GUIDANCE,
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

  // New logic for determining next step with clarifications
  if (!outcomeProvided) {
    // If outcome is missing, we need to ask for it or clarify it.
    // The very first prompt is usually external. If the AI analysis says ASKED_INITIAL was the last significant prompt,
    // it means the user's response to that initial outcome question was not clear.
    const instruction =
      lastSignificantAssistantPromptType === ASSISTANT_PROMPT_TYPES.ASKED_INITIAL ||
      lastSignificantAssistantPromptType === ASSISTANT_PROMPT_TYPES.NONE
        ? STAGE_SYSTEM_PROMPTS.CLARIFY_OUTCOME
        : STAGE_SYSTEM_PROMPTS.CLARIFY_OUTCOME; // Fallback to clarify if state is unusual, safer than asking for 'why'
    return {
      systemInstructionText: instruction,
      currentStage: STAGE_KEYS.AWAITING_INITIAL_RESPONSE,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  if (!whyProvided) {
    // Outcome is provided, but why is missing.
    const instruction =
      lastSignificantAssistantPromptType === ASSISTANT_PROMPT_TYPES.ASKED_WHY
        ? STAGE_SYSTEM_PROMPTS.CLARIFY_WHY
        : STAGE_SYSTEM_PROMPTS.REQUEST_WHY; // Standard request if why hasn't been specifically prompted and failed yet
    return {
      systemInstructionText: instruction,
      currentStage: STAGE_KEYS.AWAITING_WHY,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  if (!nextGoalProvided || !nextGoalTimingProvided) {
    // Outcome and why are provided, but next goal or its timing is missing.
    const instruction =
      lastSignificantAssistantPromptType === ASSISTANT_PROMPT_TYPES.ASKED_NEXT_GOAL
        ? STAGE_SYSTEM_PROMPTS.CLARIFY_NEXT_GOAL_AND_TIMING
        : STAGE_SYSTEM_PROMPTS.REQUEST_NEXT_GOAL; // Standard request
    return {
      systemInstructionText: instruction,
      currentStage: STAGE_KEYS.AWAITING_NEXT_GOAL,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  }

  // All information collected (outcome, why, next goal text, and next goal timing), request conclusion.
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
    // Use the collectedInfo as determined by the AI analysis (or its error fallback)
    let collectedInfoForResponse = {
      outcomeProvided: aiAnalyzedState.outcomeProvided,
      whyProvided: aiAnalyzedState.whyProvided,
      nextGoalProvided: aiAnalyzedState.nextGoalProvided,
      nextGoalTimingProvided: aiAnalyzedState.nextGoalTimingProvided,
      nextGoalTiming: aiAnalyzedState.nextGoalTiming,
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
      currentStageForResponse === STAGE_KEYS.AWAITING_CONCLUSION && // Check if we were awaiting conclusion
      aiResponse.message && // And AI responded
      aiResponse.message.content // And response has content
      // We no longer check for "Good luck." specifically as the message is dynamic
    ) {
      finalReportedStage = STAGE_KEYS.CONCLUDED;
      // collectedInfoForResponse already includes nextGoalTiming etc.
      // If the AI *failed* to provide a concluding message and instead asked another question,
      // this logic would still mark it as CONCLUDED if the instruction was REQUEST_CONCLUDE.
      // This might need refinement if the AI can deviate significantly from REQUEST_CONCLUDE instruction.
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

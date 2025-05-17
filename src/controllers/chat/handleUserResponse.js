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
3.  **Next Goal Text**: The user's description of their goal for the next period. Extract the actual text of the goal. If the user's stated goal is short or referential (e.g., 'do it again', 'the same thing', 'go again'), try to resolve it into a more specific goal description by looking at the most recent prior goal discussed or implied in the chat history. For example, if the prior goal was 'go to the gym' and the user says 'go again', nextGoalText should be 'go to the gym again'. If resolution is not possible, use the literal phrase.
4.  **Next Goal Timing**: When the user plans to achieve their next goal. (e.g., "tomorrow", "next week", "by Friday")

Based on the history, identify and output ONLY a single, raw, valid JSON object with the following fields:
- \`outcomeProvided\`: boolean (true if user stated outcome after an initial question)
- \`whyProvided\`: boolean (true if user provided reasons or explicit uncertainty like "I don't know" after a "why" question)
- \`nextGoalProvided\`: boolean (true if user stated the *text* of their next goal. This is true if nextGoalText is not empty, not "not specified", and not just a vague unresolved reference that couldn't be clarified from context.)
- \`nextGoalText\`: string (The actual text of the user's next goal, e.g., "go to the gym", "finish reading my book". Resolve referential phrases if possible. If not provided, not clear, or unresolvable, use "not specified".)
- \`nextGoalTimingProvided\`: boolean (true if user specified a timeframe for their next goal. This may be provided in the same utterance as the goal text.)
- \`nextGoalTiming\`: string (e.g., "tomorrow", "in two days", "next Monday", "sometime next week", "end of the week"). Extract the timing if the user states it. If not provided or not applicable yet, use "not specified".
- \`conversationConcluded\`: boolean (true if assistant has delivered a concluding statement after user provided their next goal and timing, and ended the reflection)
- \`lastSignificantAssistantPromptType\`: string, one of ["${Object.values(
  ASSISTANT_PROMPT_TYPES,
).join(
  '", "',
)}"]. This must reflect the last *key information-seeking question* from the assistant or if it concluded. Soft follow-ups do not count.

Your entire response must be ONLY the JSON object, starting with { and ending with }. Do not include any other text, explanations, or markdown. Adhere strictly to JSON format.
Example of desired output format (user has just provided their next goal and timing after being asked for both, and goal was referential):
{
  "outcomeProvided": true,
  "whyProvided": true,
  "nextGoalProvided": true,
  "nextGoalText": "go to the gym again", // Assuming previous goal was 'go to the gym' and user said 'go again'
  "nextGoalTimingProvided": true,
  "nextGoalTiming": "tomorrow morning",
  "conversationConcluded": false,
  "lastSignificantAssistantPromptType": "${ASSISTANT_PROMPT_TYPES.ASKED_NEXT_GOAL}"
}`;

const GOAL_DISPLAY_SYSTEM_PROMPT = `You are an assistant that rephrases and standardizes goal descriptions and timings for database storage and user display. Given a JSON input string with "goalText" and "timingText", produce a JSON output string with two fields: "goal" and "timing".

Instructions for "goal" field:
- Make goalText concise. Identify the core activity.
- If goalText implies repetition of an activity (e.g., contains 'again', 'another', 'one more time'), output the core activity without the repetition indicator. For instance, if goalText is 'go to the gym again', the goal should be 'Go to the gym'.
- Otherwise, ensure it's a clear, capitalized statement of the goal.

Instructions for "timing" field:
- Convert timingText into a more structured or relative string.
- 'tomorrow' becomes 'In 1 day'.
- 'next week' (if stated generally) becomes 'In 7 days'.
- A specific day like 'next Monday' or 'on Friday' should be preserved as 'Next Monday' or 'On Friday'.
- If a specific time is mentioned with a relative day (e.g., 'tomorrow at 3pm'), format it like 'In 1 day at 3pm'.
- If timingText is already specific and structured (e.g., 'December 5th'), use it as is but ensure proper capitalization.
- Capitalize the beginning of the timing string (e.g., 'in 1 day' becomes 'In 1 day').

Output ONLY the JSON object.
Example input: {"goalText": "go to the gym again", "timingText": "tomorrow at midnight"}
Example output: {"goal": "Go to the gym", "timing": "In 1 day at midnight"}
Example input: {"goalText": "finish chapter 3 of my book", "timingText": "sometime next week"}
Example output: {"goal": "Finish chapter 3 of my book", "timing": "Sometime next week"} // 'sometime' is less specific, so less transformation
Example input: {"goalText": "run 5k", "timingText": "tomorrow"}
Example output: {"goal": "Run 5k", "timing": "In 1 day"}
Example input: {"goalText": "submit the report", "timingText": "next friday"}
Example output: {"goal": "Submit the report", "timing": "Next Friday"}`;

const REMINDER_SPEC_SYSTEM_PROMPT = `You are an assistant that determines an appropriate check-in time and converts it to an ISO 8601 UTC datetime.
Input is a JSON object with "goal", "timing" (this timing is already somewhat standardized), and "currentIsoDateTime" (current UTC date and time).
Output a JSON object with two fields: "isoCheckInDateTime" (an ISO 8601 UTC string like YYYY-MM-DDTHH:mm:ssZ) and "descriptiveCheckIn" (a human-readable string).

Rules for "isoCheckInDateTime" based on "currentIsoDateTime" and "timing":
- Target Time: For calculations where user does not specify a time, use 23:00:00Z for the time component of the isoCheckInDateTime.
- "In 1 day" (from user saying "tomorrow"): currentIsoDateTime + 1 day. Set time to user-specified time if present in "timing", else 23:00:00Z.
- "In X days": currentIsoDateTime + X days. Set time to user-specified time if present in "timing", else 23:00:00Z.
- "Next [Weekday]": Calculate date of the *next* occurrence of that weekday from currentIsoDateTime. Set time to user-specified time if present in "timing", else 23:00:00Z.
- "Sometime next week" or "In 7 days": Date of the upcoming Sunday from currentIsoDateTime. Set time to 23:00:00Z.
- If "timing" includes a specific time (e.g., "In 1 day at 3pm"): Use that specific day and time (assumed UTC). isoCheckInDateTime should be, e.g., 2023-01-02T15:00:00Z if current is 2023-01-01TXX:XX:XXZ and timing is "In 1 day at 3pm".
- Ensure the output is a valid ISO 8601 UTC string: YYYY-MM-DDTHH:mm:ssZ.

Rules for "descriptiveCheckIn":
- If timing is "In 1 day", descriptiveCheckIn is "End of day, in 1 day".
- If timing is "Next [Weekday]", descriptiveCheckIn is "End of day, on Next [Weekday]".
- If timing is broadly "Sometime next week", descriptiveCheckIn is "End of upcoming week".
- If a specific time was part of the user's goal timing, include it, e.g., "At 3pm, in 1 day".

Output ONLY the JSON object. Do not add explanations.

Example Input: {"goal": "Go to the gym", "timing": "In 1 day at midnight", "currentIsoDateTime": "2023-10-26T10:00:00Z"}
Example Output: {"isoCheckInDateTime": "2023-10-27T00:00:00Z", "descriptiveCheckIn": "At midnight, in 1 day"}

Example Input: {"goal": "Submit the report", "timing": "Next Friday", "currentIsoDateTime": "2023-10-26T10:00:00Z"} (Thursday)
Example Output: {"isoCheckInDateTime": "2023-11-03T23:00:00Z", "descriptiveCheckIn": "End of day, on Next Friday"}

Example Input: {"goal": "Plan vacation", "timing": "Sometime next week", "currentIsoDateTime": "2023-10-26T10:00:00Z"}
Example Output: {"isoCheckInDateTime": "2023-11-05T23:00:00Z", "descriptiveCheckIn": "End of upcoming week"} // Assuming Sunday is target for "end of week"

Example Input: {"goal": "Read for 30 minutes", "timing": "In 2 days at 9am", "currentIsoDateTime": "2023-10-26T18:00:00Z"}
Example Output: {"isoCheckInDateTime": "2023-10-28T09:00:00Z", "descriptiveCheckIn": "At 9am, in 2 days"}`;

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
        typeof parsedState.nextGoalText === 'string' &&
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
    nextGoalText: 'not specified',
    nextGoalTimingProvided: false,
    nextGoalTiming: 'not specified',
    conversationConcluded: false,
    lastSignificantAssistantPromptType: ASSISTANT_PROMPT_TYPES.NONE,
    error: true, // Indicate that this is a fallback
  };
}

// New helper function to get display-friendly goal and timing
async function getGoalDisplayData(goalText, goalTiming) {
  if (!goalText || goalText === 'not specified' || !goalTiming || goalTiming === 'not specified') {
    return { goal: '', timing: '' }; // Return empty if no valid goal/timing
  }

  try {
    const inputForDisplayAI = JSON.stringify({ goalText, timingText: goalTiming });
    const displayResponse = await chatService.sendMessage(
      inputForDisplayAI, // User message content is the stringified JSON
      [{ role: 'system', content: GOAL_DISPLAY_SYSTEM_PROMPT }],
      { model: 'gpt-3.5-turbo' }, // Or a cheaper/faster model if suitable
    );

    if (
      displayResponse &&
      displayResponse.message &&
      typeof displayResponse.message.content === 'string'
    ) {
      let jsonString = displayResponse.message.content.trim();
      // Attempt to extract JSON from potentially larger string (e.g. if model isn't in JSON mode)
      const jsonMatch = jsonString.match(/\{.*\}/s);
      if (jsonMatch && jsonMatch[0]) {
        jsonString = jsonMatch[0];
      }

      try {
        const parsedData = JSON.parse(jsonString);
        if (
          parsedData &&
          typeof parsedData.goal === 'string' &&
          typeof parsedData.timing === 'string'
        ) {
          return { goal: parsedData.goal, timing: parsedData.timing };
        }
      } catch (e) {
        console.error(
          'Failed to parse JSON from getGoalDisplayData AI response:',
          e,
          'Content:',
          jsonString,
        );
      }
    }
  } catch (error) {
    console.error('Error in getGoalDisplayData:', error);
  }
  // Fallback: return original text if parsing fails, but perhaps slightly formatted
  const formattedTiming = goalTiming.charAt(0).toUpperCase() + goalTiming.slice(1);
  return { goal: goalText, timing: formattedTiming };
}

// New helper function to get check-in instruction
async function getCheckInDetails(goalDisplayData) {
  if (!goalDisplayData || !goalDisplayData.goal || !goalDisplayData.timing) {
    return { isoCheckInDateTime: '', descriptiveCheckIn: '' };
  }

  try {
    const currentIsoDateTime = new Date().toISOString();
    const inputForReminderAI = JSON.stringify({
      ...goalDisplayData,
      currentIsoDateTime,
    });

    console.log('Sending to getCheckInDetails AI:', inputForReminderAI); // For debugging input

    const reminderResponse = await chatService.sendMessage(
      inputForReminderAI,
      [{ role: 'system', content: REMINDER_SPEC_SYSTEM_PROMPT }],
      { model: 'gpt-3.5-turbo' },
    );

    console.log('Raw response from getCheckInDetails AI:', JSON.stringify(reminderResponse)); // For debugging raw response

    let stringToParse = null;
    if (reminderResponse && reminderResponse.message) {
      if (typeof reminderResponse.message === 'string') {
        stringToParse = reminderResponse.message;
      } else if (typeof reminderResponse.message.content === 'string') {
        stringToParse = reminderResponse.message.content;
      }
    }

    if (stringToParse) {
      // Check if we successfully extracted a string to parse
      let jsonString = stringToParse.trim();

      // Remove potential markdown triple backticks around JSON
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.substring(7);
        if (jsonString.endsWith('```')) {
          jsonString = jsonString.substring(0, jsonString.length - 3);
        }
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.substring(3);
        if (jsonString.endsWith('```')) {
          jsonString = jsonString.substring(0, jsonString.length - 3);
        }
      }
      jsonString = jsonString.trim(); // Trim again after stripping backticks

      // The model is instructed to ONLY output JSON, so direct parse is preferred.
      try {
        const parsedData = JSON.parse(jsonString);
        if (
          parsedData &&
          typeof parsedData.isoCheckInDateTime === 'string' &&
          typeof parsedData.descriptiveCheckIn === 'string'
        ) {
          // Further validation for isoCheckInDateTime format (basic check)
          if (
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(parsedData.isoCheckInDateTime)
          ) {
            console.log('getCheckInDetails successful. Returning:', JSON.stringify(parsedData)); // Added success log
            return {
              isoCheckInDateTime: parsedData.isoCheckInDateTime,
              descriptiveCheckIn: parsedData.descriptiveCheckIn,
            };
          } else {
            console.error(
              'getCheckInDetails: isoCheckInDateTime format invalid:',
              parsedData.isoCheckInDateTime,
              'Original JSON string:',
              jsonString,
            );
          }
        } else {
          console.error(
            'getCheckInDetails: Parsed JSON missing required fields. Parsed data:',
            JSON.stringify(parsedData),
            'Original JSON string:',
            jsonString,
          );
        }
      } catch (e) {
        console.error(
          'Failed to parse JSON from getCheckInDetails AI response:',
          e,
          'Processed Content for parsing:',
          jsonString,
          'Original raw content:',
          stringToParse,
        );
      }
    } else {
      console.error(
        'getCheckInDetails: No string content found in AI response. Full response:',
        JSON.stringify(reminderResponse),
      );
    }
  } catch (error) {
    console.error('Error in getCheckInDetails function itself:', error);
  }

  return {
    isoCheckInDateTime: '',
    descriptiveCheckIn: 'Default check-in: Follow up as appropriate',
  };
}

function determineNextStepFromAIState(aiState) {
  const {
    outcomeProvided,
    whyProvided,
    nextGoalProvided,
    nextGoalText,
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
    nextGoalText,
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

  // Outcome and why are provided. Now check for next goal and its timing.
  if (!nextGoalProvided) {
    // User hasn't stated a clear goal text yet (or it was unresolvable to something specific).
    const instruction =
      lastSignificantAssistantPromptType === ASSISTANT_PROMPT_TYPES.ASKED_NEXT_GOAL
        ? STAGE_SYSTEM_PROMPTS.CLARIFY_NEXT_GOAL_AND_TIMING // Asks for both goal and timing
        : STAGE_SYSTEM_PROMPTS.REQUEST_NEXT_GOAL; // Asks for both goal and timing
    return {
      systemInstructionText: instruction,
      currentStage: STAGE_KEYS.AWAITING_NEXT_GOAL,
      collectedInfo,
      lastSignificantAssistantPromptType,
    };
  } else if (!nextGoalTimingProvided) {
    // Goal text IS provided (nextGoalProvided is true, so aiState.nextGoalText should be meaningful), but timing is NOT.
    let instruction;
    // We check aiState.nextGoalText is not 'not specified' as an extra safeguard, though nextGoalProvided should cover this.
    if (
      lastSignificantAssistantPromptType === ASSISTANT_PROMPT_TYPES.ASKED_NEXT_GOAL &&
      aiState.nextGoalText &&
      aiState.nextGoalText !== 'not specified'
    ) {
      instruction = `${ROLE_ASSISTANT}. Understood, the goal is "${aiState.nextGoalText}". And when do you plan to achieve this?`;
    } else {
      // Fallback: If the last prompt wasn't specifically ASKED_NEXT_GOAL, or if nextGoalText is somehow still not specific,
      // revert to asking for both clearly.
      instruction = STAGE_SYSTEM_PROMPTS.CLARIFY_NEXT_GOAL_AND_TIMING;
    }
    return {
      systemInstructionText: instruction,
      currentStage: STAGE_KEYS.AWAITING_NEXT_GOAL, // Still awaiting full goal info (timing part)
      collectedInfo,
      lastSignificantAssistantPromptType, // Remains ASKED_NEXT_GOAL or similar
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
      nextGoalText: aiAnalyzedState.nextGoalText,
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
        guidingQuestion = "What's your next goal, and when do you plan to achieve it?";
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

    // Step 4: Get goal display data if applicable
    let nextGoalDisplayData = { goal: '', timing: '' };
    if (
      collectedInfoForResponse.nextGoalProvided &&
      collectedInfoForResponse.nextGoalTimingProvided
    ) {
      nextGoalDisplayData = await getGoalDisplayData(
        collectedInfoForResponse.nextGoalText,
        collectedInfoForResponse.nextGoalTiming,
      );
    }

    // Step 5: Get check-in details if goal display data is available
    let checkInDetailsData = { isoCheckInDateTime: '', descriptiveCheckIn: '' };
    if (nextGoalDisplayData.goal && nextGoalDisplayData.timing) {
      // Check if we have a goal and timing to process
      checkInDetailsData = await getCheckInDetails(nextGoalDisplayData);
    }

    res.json({
      aiMessage: aiResponse.message,
      currentStage: finalReportedStage,
      collectedInformation: collectedInfoForResponse,
      nextGoalDisplay: nextGoalDisplayData,
      checkInDetails: checkInDetailsData, // Added new object for check-in details
      // Optionally, include AI analysis for debugging if needed by frontend:
      // aiAnalysisDebug: aiAnalyzedState
    });
  } catch (error) {
    console.error('User response error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

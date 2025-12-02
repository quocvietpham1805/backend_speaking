import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_API_URL = process.env.GEMINI_API_URL

// Validate env early and provide actionable errors to operator
if (!GEMINI_API_KEY || !GEMINI_API_URL) {
  throw new Error(
    'GEMINI_API_KEY or GEMINI_API_URL not set. Please copy .env.example to server/.env and set GEMINI_API_KEY and GEMINI_API_URL. Restart the server.'
  )
}

// If URL contains query parameters, warn but continue — we'll handle Google API key placement automatically below.
if (GEMINI_API_URL.includes('?')) {
  console.warn(
    'GEMINI_API_URL contains query parameters. Ensure you did not embed a secret API key in the URL.'
  )
}

// Build request URL and headers depending on provider
function buildRequestConfig() {
  let requestUrl = GEMINI_API_URL
  const headers = { 'Content-Type': 'application/json' }

  // If using Google Generative Language API, authentication is typically done via ?key=API_KEY
  if (GEMINI_API_URL.includes('generativelanguage.googleapis.com')) {
    if (!GEMINI_API_KEY) {
      throw new Error(
        'GEMINI_API_KEY is required for Google Generative API usage. Set it in server/.env'
      )
    }
    // Append key as query parameter (do not modify env variable). If URL already has params, append with &
    requestUrl =
      GEMINI_API_URL +
      (GEMINI_API_URL.includes('?') ? '&' : '?') +
      `key=${encodeURIComponent(GEMINI_API_KEY)}`
    // Do NOT set Authorization header for API key usage
  } else {
    // For other providers assume Bearer token usage
    if (!GEMINI_API_KEY) {
      throw new Error(
        'GEMINI_API_KEY is required for this provider. Set it in server/.env'
      )
    }
    headers.Authorization = `Bearer ${GEMINI_API_KEY}`
  }

  return { requestUrl, headers }
}

/**
 * FIXED: Build payload for Gemini :generateContent endpoint
 * Old format: { prompt: { text: ... } } (Legacy/PaLM)
 * New format: { contents: [{ parts: [{ text: ... }] }] } (Gemini 1.0/1.5/2.0)
 */
function buildPayload(promptText) {
  return {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ]
  }
}

/**
 * Helper to safely extract text from Gemini response structure
 */
function extractTextFromResponse(data) {
  // 1. Standard Gemini Structure: candidates[0].content.parts[0].text
  if (data.candidates && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      return candidate.content.parts[0].text;
    }
  }

  // 2. Fallback for legacy PaLM/Vertex formats (output_text, result)
  if (typeof data === 'string') return data;
  if (data.output_text) return data.output_text;
  if (data.result) {
    return typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
  }

  // 3. Fallback: stringify entire object
  return JSON.stringify(data);
}

/**
 * Build a robust prompt for Gemini to evaluate the transcript.
 * The system prompt instructs Gemini to return ONLY the exact JSON structure.
 */
function buildPrompt(transcript, promptId, metadata = {}) {
  const rubric = `Band descriptors (short):
- 9.0: Expert user (fully operational command, rare inaccuracies)
- 8.0: Very good user (occasional inaccuracies)
- 7.0: Good user (overall effective command)
- 6.0: Competent user (some errors, breakdowns in complex language)
- 5.0: Modest user (partial command, frequent issues)
- 4.0: Limited user (conveys only basic meaning)
- 3.0: Extremely limited
- 2.0: Intermittent
- 1.0: Non-user
- 0.0: No attempt

Round band scores to the nearest 0.5.
`

  // Logic mới: Kiểm tra xem có context/topic được truyền vào không
  const topicContext = metadata.topicContext || metadata.questionText || null;
  const topicInstruction = topicContext 
    ? `- IMPORTANT: The user is answering the question/topic: "${topicContext}". Assess if the response is relevant to this topic.` 
    : '- No specific question context provided. Assess general speaking ability.';

  return `SYSTEM: You are an experienced IELTS speaking examiner. Use the official IELTS band descriptors. Return ONLY a JSON object EXACTLY matching the schema provided.

SCHEMA:
${JSON.stringify(
  {
    bandScore: 0,
    criteria: {
      fluency_coherence: 0,
      lexical_resource: 0,
      grammatical_range_accuracy: 0,
      pronunciation: 0,
    },
    strengths: [''],
    weaknesses: [''],
    corrections: [{ original: '', suggestion: '', explanation: '' }],
    // Added conversationalResponse for the "Speak Back" feature
    conversationalResponse: '',
    feedback: '',
    followUpQuestions: ['', '', ''],
    practicePlan: '',
    rawModelOutput: '',
  },
  null,
  2
)}

INSTRUCTIONS:
- Evaluate the transcript below for the given promptId: ${promptId}
${topicInstruction}
- Use the rubric and mapping. Provide numerical floats for criteria and bandScore and round the bandScore to nearest 0.5.
- corrections: include up to 6 short corrections (each original <=25 words), with suggestion and brief explanation.
- conversationalResponse: A short, natural, encouraging spoken-style reply to the user's content (as if you are the examiner chatting back), 1-2 sentences. Do NOT mention the score here.
- feedback: 30-80 words, 3 actionable next steps.
- followUpQuestions: provide exactly 3 follow-up questions.
- practicePlan: provide a short 7-day micro plan as a single string with bullets separated by semicolons.
- rawModelOutput: echo any extra commentary in one string for debugging.
- DO NOT return any additional text outside the JSON.

RUBRIC:
${rubric}

TRANSCRIPT:\n${transcript}

METADATA: ${JSON.stringify(metadata)}

Respond now with the JSON only.`
}

/**
 * Chat tutor: ask Gemini to behave as a daily English tutor and reply conversationally.
 * Returns { reply, rawModelOutput }
 */
export async function chatTutor(message, sessionId = null, metadata = {}) {
  if (!message) throw new Error('message required')

  // Updated system prompt to ensure consistent persona
  const system = `You are an empathetic English learning assistant and daily tutor. Greet the user conversationally, correct small errors when asked, provide short practice tasks (1-3 bullets), and keep replies concise. When asked for a daily plan, produce a 7-day micro plan. Reply in the user's locale if provided in metadata.userLocale.`

  const prompt = `${system}\n\nUSER_MESSAGE:\n${message}\n\nMETADATA:${JSON.stringify(
    metadata
  )}\n\nRespond as a natural conversational reply. Return the reply text only.`

  try {
    const { requestUrl, headers } = buildRequestConfig()
    const payload = buildPayload(prompt)
    
    // Increased timeout slightly for chat
    const res = await axios.post(requestUrl, payload, {
      headers,
      timeout: 20000,
    })

    const text = extractTextFromResponse(res.data)

    // Provide the whole text as reply (trim)
    return { reply: text.trim(), rawModelOutput: JSON.stringify(res.data) }
  } catch (err) {
    // Debug helper: Log detail if available
    if (err.response && err.response.data) {
       console.error('Gemini Chat Error Detail:', JSON.stringify(err.response.data, null, 2));
    }
    throw new Error(`Gemini chat request failed: ${err.message}`)
  }
}

export async function assessTranscript(
  transcript,
  promptId = 'unknown',
  metadata = {}
) {
  if (!transcript) throw new Error('Transcript required')

  const prompt = buildPrompt(transcript, promptId, metadata)

  try {
    const { requestUrl, headers } = buildRequestConfig()
    const payload = buildPayload(prompt)
    const res = await axios.post(requestUrl, payload, {
      headers,
      timeout: 30000, // Increased timeout for assessment
    })

    // Attempt to parse model response using helper
    const text = extractTextFromResponse(res.data)

    // Try to extract JSON from text
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      // If we cannot find JSON, throw to be handled by caller
      throw new Error('Model did not return JSON. Raw output: ' + text)
    }

    const jsonText = text.slice(jsonStart, jsonEnd + 1)
    const parsed = JSON.parse(jsonText)

    // Ensure required fields exist
    return { ...parsed, rawModelOutput: text }
  } catch (err) {
    // Try to include response details when available for debugging (but never include secrets)
    const resp = err.response
    if (resp && resp.data) {
      const body =
        typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
      throw new Error(
        `Gemini request failed: ${err.message} - response: ${body}`
      )
    }
    throw new Error(`Gemini request failed: ${err.message}`)
  }
}

// For unit tests you can import and mock axios to simulate responses.
export default { assessTranscript }
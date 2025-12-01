import express from 'express'
import { assessTranscript } from '../services/geminiClient.js'

const router = express.Router()

// POST /api/assess
router.post('/assess', async (req, res) => {
  try {
    const { transcript, audioUrl, durationSec, promptId, userLocale } =
      req.body || {}

    // Validate: require transcript if no STT
    if (!transcript || transcript.trim().split(/\s+/).length < 20) {
      return res.status(400).json({
        message:
          'Please speak at least 30 seconds or 20 words to be assessable.',
      })
    }

    // Build metadata
    const metadata = {
      audioUrl: audioUrl || null,
      durationSec: durationSec || null,
      userLocale: userLocale || null,
    }

    // Call gemini client
    const result = await assessTranscript(
      transcript,
      promptId || 'unknown',
      metadata
    )

    // Validate returned shape minimally
    if (!result || typeof result.bandScore === 'undefined') {
      return res
        .status(502)
        .json({ message: 'Model returned unexpected output' })
    }

    // Return exactly the JSON shape required; we trust model but ensure rawModelOutput exists
    return res.json({
      bandScore: result.bandScore,
      criteria: result.criteria,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      corrections: result.corrections,
      feedback: result.feedback,
      followUpQuestions: result.followUpQuestions,
      practicePlan: result.practicePlan,
      rawModelOutput: result.rawModelOutput || '',
    })
  } catch (err) {
    console.error('Assess error:', err)
    // Return the error message to the client for easier debugging (no secrets)
    const msg = err.message || 'Failed to assess. Please try again later.'
    return res.status(502).json({ message: msg })
  }
})

export default router

import express from 'express'
import { chatTutor } from '../services/geminiClient.js'

const router = express.Router()

// POST /api/chat
router.post('/', async (req, res) => {
  try {
    const { message, sessionId, userLocale } = req.body || {}
    if (!message || message.trim().length === 0)
      return res.status(400).json({ message: 'Message is required' })

    const metadata = { userLocale: userLocale || null }
    const out = await chatTutor(message, sessionId || null, metadata)
    return res.json({ reply: out.reply, rawModelOutput: out.rawModelOutput })
  } catch (err) {
    console.error('Chat error:', err.message)
    return res
      .status(502)
      .json({ message: 'Assistant failed. Please try again later.' })
  }
})

export default router

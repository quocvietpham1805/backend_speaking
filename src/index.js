import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import rateLimit from './middleware/rateLimiter.js'
import assessRouter from './routes/assess.js'
import chatRouter from './routes/chat.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(rateLimit)

// Temp uploads folder for audio files
const upload = multer({ dest: path.join(__dirname, '..', 'uploads/') })

// Routes
app.use('/api', assessRouter)
app.use('/api/chat', chatRouter)

// Optional upload endpoint
app.post('/api/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' })
  // Return server path for audio; in production serve via CDN or proper static hosting
  const audioUrl = `/uploads/${req.file.filename}`
  res.json({ audioUrl })
})

// Serve uploaded files statically (temporary)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

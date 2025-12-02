import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import rateLimit from './middleware/rateLimiter.js'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

// --- 1. BẮT LỖI CHUNG ĐỂ LOG NGUYÊN NHÂN CRASH SỚM HƠN ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

process.on('uncaughtException', err => {
    console.error('FATAL: Uncaught Exception thrown:', err);
    process.exit(1); 
});
// ----------------------------------------------------------

dotenv.config()

// Import Router SAU KHI dotenv và bắt lỗi chung
try {
  // Lỗi thường xảy ra ở đây nếu geminiClient.js bị lỗi config
  const assessRouter = (await import('./routes/assess.js')).default
  const chatRouter = (await import('./routes/chat.js')).default
  
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  
  const app = express()
  const PORT = process.env.PORT || 4000
  
  // --- BƯỚC KHẮC PHỤC LỖI RATE LIMIT ---
  app.set('trust proxy', 1) 
  
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
    const audioUrl = `/uploads/${req.file.filename}`
    res.json({ audioUrl })
  })
  
  // Serve uploaded files statically (temporary)
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`) 
  })
} catch (error) {
    // Bắt lỗi trong quá trình import hoặc khởi tạo
    console.error('CRITICAL STARTUP ERROR:', error.message);
    process.exit(1);
}
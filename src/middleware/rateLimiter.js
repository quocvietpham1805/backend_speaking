import rateLimit from 'express-rate-limit'

// 60 requests per hour per IP
export default rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  message: { message: 'Too many requests, please try again later.' },
})

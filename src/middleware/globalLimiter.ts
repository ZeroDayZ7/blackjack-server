import rateLimit from 'express-rate-limit';

// Limiter globalny dla całego API
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 60,             // maksymalnie 60 żądań na IP na minutę
  standardHeaders: true, // zwraca limit info w headerach `RateLimit-*`
  legacyHeaders: false,  // wyłącza X-RateLimit-*
  message: {
    status: 'error',
    message: 'Za dużo żądań. Spróbuj ponownie później.'
  }
});

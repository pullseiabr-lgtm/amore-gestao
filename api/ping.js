// Temporary debug endpoint — remove after fixing env vars
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  return res.status(200).json({
    has_gemini: !!(process.env.GEMINI_API_KEY),
    has_brave: !!(process.env.VITE_BRAVE_API_KEY),
    gemini_len: (process.env.GEMINI_API_KEY || '').length,
    env_keys: Object.keys(process.env).filter(k => !k.startsWith('VERCEL') && !k.startsWith('NX') && !k.startsWith('TURBO') && !k.includes('TOKEN')),
  })
}

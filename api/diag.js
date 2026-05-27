// Temporary diagnostic — delete after investigation
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const envKeys = Object.keys(process.env)
  return res.status(200).json({
    has_vite_gemini: !!(process.env.VITE_GEMINI_API_KEY),
    vite_gemini_len: (process.env.VITE_GEMINI_API_KEY || '').length,
    has_vite_brave: !!(process.env.VITE_BRAVE_API_KEY),
    env_count: envKeys.length,
    env_keys: envKeys.filter(k =>
      !k.startsWith('AWS') && !k.startsWith('NX') && !k.startsWith('TURBO') &&
      !k.includes('TOKEN') && !k.includes('SECRET') && k !== 'PATH' && k !== 'PWD'
    ),
  })
}

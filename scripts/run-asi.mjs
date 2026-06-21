import { readFileSync } from 'fs'
// carrega .env
const env = Object.fromEntries(readFileSync('./.env','utf8').split(/\r?\n/).filter(l=>l && !l.startsWith('#') && l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()]}))
const TOKEN = env.NEXT_SUPABASE_ACCESS_TOKEN
const REF = 'xdwnsqkzgopymufsuccr'
const sql = readFileSync('./supabase/migrations/20260622_asi_fase1.sql','utf8')
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})})
const body = await res.text()
console.log(res.ok ? 'OK Migration ASI Fase 1 aplicada' : ('ERRO '+res.status+': '+body.slice(0,300)))

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalisasiNomor } from './validasi'

let envSudahDimuat = false

function muatFileEnv(jalur: string): void {
  if (!existsSync(jalur)) return
  const isi = readFileSync(jalur, 'utf8')
  for (const barisMentah of isi.split(/\r?\n/)) {
    const baris = barisMentah.trim()
    if (!baris || baris.startsWith('#')) continue
    const posisi = baris.indexOf('=')
    if (posisi <= 0) continue
    const kunci = baris.slice(0, posisi).trim()
    let nilai = baris.slice(posisi + 1).trim()
    if (
      (nilai.startsWith('"') && nilai.endsWith('"')) ||
      (nilai.startsWith("'") && nilai.endsWith("'"))
    ) {
      nilai = nilai.slice(1, -1)
    }
    if (!process.env[kunci]) {
      process.env[kunci] = nilai
    }
  }
}

export function muatEnvSekali(): void {
  if (envSudahDimuat) return
  envSudahDimuat = true
  muatFileEnv(resolve(import.meta.dir, '../../.env'))
  muatFileEnv(resolve(import.meta.dir, '../.env'))
}

export function envWajib(nama: string): string {
  muatEnvSekali()
  const nilai = process.env[nama]?.trim()
  if (!nilai) {
    throw new Error(`Variabel lingkungan ${nama} wajib diisi di .env`)
  }
  return nilai
}

export type AppConfig = {
  port: number
  databaseUrl: string
  nvidiaApiKey: string
  aiModel: string
  aiFallbackModel: string
  formBaseUrl: string
  formSecret: string
  adminNumbers: Set<string>
  grupJid: string | null
  jedaKirimDetik: number
  maxJapriHarian: number
  webOnly: boolean
}

export function getConfig(): AppConfig {
  muatEnvSekali()
  const databaseUrl = envWajib('DATABASE_URL')
  const nvidiaApiKey = envWajib('NVIDIA_API_KEY')
  const rawAdmins = process.env.ADMIN_NUMBERS ?? ''
  const adminNumbers = new Set<string>()
  for (const item of rawAdmins.split(',')) {
    const norm = normalisasiNomor(item)
    if (norm) adminNumbers.add(norm)
  }

  const secret =
    process.env.FORM_SECRET?.trim() ||
    createHash('sha256').update(`point-ai:${databaseUrl}`).digest('hex')

  const jedaRaw = Number(process.env.JEDA_KIRIM_DETIK ?? 180)
  const maxJapriRaw = Number(process.env.MAX_JAPRI_HARIAN ?? 15)
  const portRaw = Number(process.env.PORT ?? 3000)

  return {
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 3000,
    databaseUrl,
    nvidiaApiKey,
    aiModel: process.env.AI_MODEL?.trim() || 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    aiFallbackModel:
      process.env.AI_FALLBACK_MODEL?.trim() || 'nvidia/nemotron-3.5-lightning-30b-a3b',
    formBaseUrl: (process.env.FORM_BASE_URL?.trim() || 'https://point-karawang.netlify.app').replace(/\/+$/, ''),
    formSecret: secret,
    adminNumbers,
    grupJid: process.env.GRUP_JID?.trim() || null,
    jedaKirimDetik: Number.isFinite(jedaRaw) && jedaRaw >= 0 ? jedaRaw : 180,
    maxJapriHarian: Number.isFinite(maxJapriRaw) && maxJapriRaw > 0 ? maxJapriRaw : 15,
    webOnly: process.argv.includes('--web-only') || process.env.DISABLE_WA === '1',
  }
}

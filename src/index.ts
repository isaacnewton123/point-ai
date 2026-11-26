import { getConfig } from './config'
import { buatPool } from './db'
import { buatServer } from './server'
import { mulaiWhatsApp, type WaController } from './wa/client'

const config = getConfig()
const pool = buatPool(config.databaseUrl)
let wa: WaController | null = null

const app = buatServer({
  pool,
  formBaseUrl: config.formBaseUrl,
  formSecret: config.formSecret,
  getWaStatus: () => wa?.status() ?? (config.webOnly ? 'web_only' : 'starting'),
  simulasiJapri: (nomor) =>
    wa ? wa.simulasiJapri(nomor) : Promise.resolve({ ok: false, pesan: 'WhatsApp belum aktif.' }),
})

app.listen(config.port)
console.log(`[Server] Health API berjalan di http://localhost:${config.port}/health (Formulir: ${config.formBaseUrl}/formulir)`)

if (!config.webOnly) {
  wa = await mulaiWhatsApp({ config, pool })
} else {
  console.log('[WA] Mode --web-only aktif, koneksi WhatsApp dilewati.')
}

async function shutdown(sinyal: string) {
  console.log(`\n[App] Menerima ${sinyal}, menutup koneksi...`)
  wa?.tutup()
  try {
    await app.stop()
  } catch {
    // Abaikan
  }
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

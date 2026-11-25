import { Boom } from '@hapi/boom'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type ConnectionState,
  type WASocket,
} from '@whiskeysockets/baileys'
import { resolve } from 'node:path'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import type { AiDeps } from '../ai/agent'
import type { AppConfig } from '../config'
import type { PoolDb } from '../db'
import { jalankanJapriKurang } from './antrean'
import { tanganiPerubahanPeserta, tanganiPesanUpsert, type HandlerDeps } from './handlers'
import { AntreanChat } from './human'
import { jidKeNomorLangsung, type WaState } from './jid'

export type WaController = {
  status: () => string
  tutup: () => void
}

function buatAiDeps(aktif: WASocket, opsi: { config: AppConfig; pool: PoolDb; aiDepsBase: AiDeps; antreanChat: AntreanChat }): AiDeps {
  const botNomor = jidKeNomorLangsung(aktif.user?.id)
  return {
    ...opsi.aiDepsBase,
    mulaiJapri: (limit?: number) =>
      jalankanJapriKurang({
        sock: aktif,
        pool: opsi.pool,
        aiDeps: opsi.aiDepsBase,
        antreanChat: opsi.antreanChat,
        formBaseUrl: opsi.config.formBaseUrl,
        formSecret: opsi.config.formSecret,
        jedaDetik: opsi.config.jedaKirimDetik,
        maxHarian: opsi.config.maxJapriHarian,
        limit,
        kecualiNomor: botNomor,
      }),
  }
}

function tanganiKoneksi(
  update: Partial<ConnectionState>,
  aktif: WASocket,
  kontrol: { setStatus: (s: string) => void; isDitutup: () => boolean; sambungUlang: () => void },
): void {
  if (update.qr) {
    kontrol.setStatus('waiting_qr')
    console.log('\n[WA] Scan QR Code berikut lewat WhatsApp -> Perangkat Tertaut:')
    qrcode.generate(update.qr, { small: true })
  }
  if (update.connection === 'open') {
    kontrol.setStatus('connected')
    console.log(`[WA] Terhubung sebagai ${aktif.user?.id ?? 'unknown'}`)
  } else if (update.connection === 'close') {
    const code = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode
    const loggedOut = code === DisconnectReason.loggedOut
    kontrol.setStatus(loggedOut ? 'logged_out' : 'disconnected')
    console.warn(`[WA] Koneksi terputus (kode=${code ?? 'unknown'})`)
    if (!loggedOut && !kontrol.isDitutup()) {
      setTimeout(kontrol.sambungUlang, 3500)
    }
  }
}

export async function mulaiWhatsApp(opsi: { config: AppConfig; pool: PoolDb }): Promise<WaController> {
  const authDir = resolve(import.meta.dir, '../../auth')
  const antreanChat = new AntreanChat()
  const state: WaState = { lidKeNomor: new Map(), grupCache: new Map() }
  const aiDepsBase: AiDeps = {
    pool: opsi.pool,
    apiKey: opsi.config.nvidiaApiKey,
    model: opsi.config.aiModel,
    fallbackModel: opsi.config.aiFallbackModel,
    formBaseUrl: opsi.config.formBaseUrl,
    formSecret: opsi.config.formSecret,
  }

  let sock: WASocket | null = null
  let statusSaatIni = 'connecting'
  let ditutup = false

  async function sambung(): Promise<void> {
    if (ditutup) return
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()
    const aktif = makeWASocket({
      version, auth: authState, logger: pino({ level: 'silent' }),
      markOnlineOnConnect: false, syncFullHistory: false,
    })
    sock = aktif
    const handlerDeps: HandlerDeps = {
      aktif, state, config: opsi.config, pool: opsi.pool,
      aiDepsBase, aiDepsAktif: buatAiDeps(aktif, { ...opsi, aiDepsBase, antreanChat }), antreanChat,
    }
    aktif.ev.on('creds.update', saveCreds)
    aktif.ev.on('connection.update', (u) =>
      tanganiKoneksi(u, aktif, {
        setStatus: (s) => { statusSaatIni = s },
        isDitutup: () => ditutup,
        sambungUlang: () => void sambung(),
      }),
    )
    aktif.ev.on('group-participants.update', (ev) => void tanganiPerubahanPeserta(handlerDeps, ev))
    aktif.ev.on('messages.upsert', (u) => void tanganiPesanUpsert(handlerDeps, u))
  }

  await sambung()
  return {
    status: () => statusSaatIni,
    tutup: () => {
      ditutup = true
      try { sock?.end(undefined) } catch { /* ignore */ }
    },
  }
}

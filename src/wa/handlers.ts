import { randomUUID } from 'node:crypto'
import type { GroupParticipant, ParticipantAction, WAMessage, WASocket } from '@whiskeysockets/baileys'
import { buatPengumumanKeluar, buatSambutanMasuk, jawabPesan, type AiDeps } from '../ai/agent'
import type { AppConfig } from '../config'
import { catatPesan, tandaiKeluarGrup, tandaiMasukGrup, type PoolDb } from '../db'
import type { KolomWajib } from '../validasi'
import { AntreanChat, kirimSepertiManusia } from './human'
import {
  bersihkanJidUser,
  cekAdminGrup,
  ekstrakIsiPesan,
  muatMetadataGrup,
  selesaikanNomorPeserta,
  type IsiPesan,
  type WaState,
} from './jid'

export type HandlerDeps = {
  aktif: WASocket
  state: WaState
  config: AppConfig
  pool: PoolDb
  aiDepsBase: AiDeps
  aiDepsAktif: AiDeps
  antreanChat: AntreanChat
}

const SEMUA_WAJIB: KolomWajib[] = ['nama_lengkap', 'tanggal_lahir', 'alamat', 'plat', 'tipe_warna_unit']

async function prosesPesertaKeluar(
  deps: HandlerDeps,
  grupJid: string,
  bersihJid: string,
  nomor: string | null,
): Promise<void> {
  const { anggota } = nomor ? await tandaiKeluarGrup(deps.pool, nomor, bersihJid) : { anggota: null }
  const identitas = nomor ?? bersihJid
  const nama = anggota?.nama_lengkap ?? anggota?.nama_kontak ?? null
  const teks = await buatPengumumanKeluar({ nomor: identitas, nama }, deps.aiDepsBase)
  const msgId = await kirimSepertiManusia(deps.aktif, { jid: grupJid, teks, mentions: [bersihJid] })
  await catatPesan(deps.pool, {
    chatKey: grupJid,
    arah: 'keluar',
    jenis: 'teks',
    isi: teks,
    waMessageId: msgId ?? `keluar-${randomUUID()}`,
  })
}

function apakahJidBot(jid: string, aktif: WASocket): boolean {
  const target = bersihkanJidUser(jid)
  if (!target) return false
  return target === bersihkanJidUser(aktif.user?.id) || target === bersihkanJidUser(aktif.user?.lid)
}

async function prosesPesertaMasuk(
  deps: HandlerDeps,
  grupJid: string,
  bersihJid: string,
  nomor: string | null,
): Promise<void> {
  let kekurangan: KolomWajib[] = [...SEMUA_WAJIB]
  let namaKontak: string | null = null
  let dariPendaftar = false
  if (nomor) {
    const res = await tandaiMasukGrup(deps.pool, nomor, null, bersihJid)
    kekurangan = res.anggota.kekurangan
    namaKontak = res.anggota.nama_lengkap ?? res.anggota.nama_kontak
    dariPendaftar = res.dariPendaftar
  }
  console.log(`[WA] Peserta masuk grup ${grupJid}: ${nomor ?? bersihJid} (dariPendaftar=${dariPendaftar})`)
  const linkFormulir = `${deps.config.formBaseUrl}/formulir`
  const teks = await buatSambutanMasuk(
    {
      nomor: nomor ?? bersihJid,
      namaKontak,
      mentionTag: `@${bersihJid.split('@')[0]}`,
      linkFormulir,
      kekurangan,
      dariPendaftar,
    },
    deps.aiDepsBase,
  )
  const msgId = await kirimSepertiManusia(deps.aktif, { jid: grupJid, teks, mentions: [bersihJid] })
  await catatPesan(deps.pool, {
    chatKey: grupJid,
    arah: 'keluar',
    jenis: 'teks',
    isi: teks,
    waMessageId: msgId ?? `masuk-${randomUUID()}`,
  })
}

export async function tanganiPerubahanPeserta(
  deps: HandlerDeps,
  ev: { id: string; participants: (string | GroupParticipant)[]; action: ParticipantAction },
): Promise<void> {
  if (deps.config.grupJid && ev.id !== deps.config.grupJid) return
  if (ev.action !== 'add' && ev.action !== 'remove') return

  await deps.antreanChat.jalankan(ev.id, async () => {
    await muatMetadataGrup(deps.aktif, deps.state, ev.id, true)
    for (const peserta of ev.participants) {
      const rawId = typeof peserta === 'string' ? peserta : peserta.id
      const altJid = typeof peserta === 'string' ? null : (peserta.phoneNumber ?? null)
      const bersihJid = bersihkanJidUser(rawId) ?? rawId
      if (apakahJidBot(bersihJid, deps.aktif)) continue
      const nomor = await selesaikanNomorPeserta(deps.aktif, deps.state, bersihJid, altJid, ev.id)
      if (ev.action === 'remove') await prosesPesertaKeluar(deps, ev.id, bersihJid, nomor)
      else await prosesPesertaMasuk(deps, ev.id, bersihJid, nomor)
    }
  })
}

function apakahBotDipanggil(isi: IsiPesan, aktif: WASocket): { dipanggil: boolean; hapusTag: (t: string) => string } {
  const botJid = bersihkanJidUser(aktif.user?.id)
  const botLid = bersihkanJidUser(aktif.user?.lid)
  const botUser = botJid?.split('@')[0] ?? ''
  const botLidUser = botLid?.split('@')[0] ?? ''

  const diMeta = isi.mentionedJid.some((m) => {
    const c = bersihkanJidUser(m)
    return c === botJid || c === botLid
  })
  const balasKeBot = Boolean(
    isi.quotedParticipant &&
      (bersihkanJidUser(isi.quotedParticipant) === botJid ||
        bersihkanJidUser(isi.quotedParticipant) === botLid),
  )
  const diTeks = Boolean(
    isi.teks && ((botUser && isi.teks.includes(`@${botUser}`)) || (botLidUser && isi.teks.includes(`@${botLidUser}`))),
  )
  const hapusTag = (teks: string) => {
    let hasil = teks.trim()
    if (botUser) hasil = hasil.replaceAll(`@${botUser}`, '').trim()
    if (botLidUser) hasil = hasil.replaceAll(`@${botLidUser}`, '').trim()
    return hasil
  }
  return { dipanggil: diMeta || balasKeBot || diTeks, hapusTag }
}

async function siapkanBalasan(
  deps: HandlerDeps,
  opsi: {
    isi: IsiPesan
    teksBersih: string
    chatKey: string
    senderNomor: string | null
    senderNama: string | null
    isAdmin: boolean
    isGroup: boolean
    grupNama: string | null
  },
): Promise<string> {
  if (!opsi.teksBersih) {
    const link = `${deps.config.formBaseUrl}/formulir`
    return opsi.isi.jenis === 'teks'
      ? 'Halo! Ada yang bisa saya bantu soal data anggota POINT?'
      : `Maaf, saya baru bisa baca pesan teks nih. Kalau mau kirim data, langsung ketik aja di sini atau isi lewat formulir: ${link}`
  }
  return jawabPesan(
    {
      chatKey: opsi.chatKey,
      teks: opsi.teksBersih,
      senderNomor: opsi.senderNomor,
      senderNama: opsi.senderNama,
      isAdmin: opsi.isAdmin,
      isGroup: opsi.isGroup,
      grupNama: opsi.grupNama,
    },
    deps.aiDepsAktif,
  )
}

async function prosesPesanMasuk(
  deps: HandlerDeps,
  msg: WAMessage,
  isi: IsiPesan,
  hapusTag: (t: string) => string,
): Promise<void> {
  const jid = msg.key.remoteJid!
  const isGroup = jid.endsWith('@g.us')
  const key = msg.key as typeof msg.key & { participantAlt?: string; remoteJidAlt?: string }
  const pengirimJid = isGroup ? (key.participant ?? jid) : jid
  const senderNomor = await selesaikanNomorPeserta(
    deps.aktif,
    deps.state,
    pengirimJid,
    isGroup ? key.participantAlt : key.remoteJidAlt,
    isGroup ? jid : null,
  )

  const meta = isGroup ? await muatMetadataGrup(deps.aktif, deps.state, jid) : null
  const isAdmin =
    Boolean(senderNomor && deps.config.adminNumbers.has(senderNomor)) ||
    (isGroup && cekAdminGrup(meta, pengirimJid, senderNomor))

  const chatKey = isGroup ? jid : (senderNomor ?? jid)
  const baruMasuk = await catatPesan(deps.pool, {
    chatKey, arah: 'masuk', jenis: isi.jenis, isi: isi.teks, waMessageId: msg.key.id ?? `in-${randomUUID()}`,
  })
  if (!baruMasuk) return
  console.log(`[WA] Pesan masuk (${isGroup ? 'grup' : 'DM'}) dari ${senderNomor ?? pengirimJid}: "${(isi.teks ?? isi.jenis).slice(0, 60)}"`)

  const balasan = await siapkanBalasan(deps, {
    isi, teksBersih: hapusTag(isi.teks ?? ''), chatKey, senderNomor,
    senderNama: msg.pushName?.trim() || null, isAdmin, isGroup, grupNama: meta?.subject ?? null,
  })
  const outId = await kirimSepertiManusia(deps.aktif, {
    jid, teks: balasan, mentions: isGroup && pengirimJid ? [pengirimJid] : undefined,
    quoted: isGroup ? msg : undefined, readKey: msg.key,
  })
  console.log(`[WA] Balasan terkirim ke ${chatKey} (${balasan.length} karakter)`)
  await catatPesan(deps.pool, {
    chatKey, arah: 'keluar', jenis: 'teks', isi: balasan, waMessageId: outId ?? `out-${randomUUID()}`,
  })
}

export async function tanganiPesanUpsert(
  deps: HandlerDeps,
  upsert: { messages: WAMessage[]; type: string },
): Promise<void> {
  if (upsert.type !== 'notify') return
  for (const msg of upsert.messages) {
    const jid = msg.key?.remoteJid
    if (!jid || msg.key.fromMe) continue
    if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) continue

    const isGroup = jid.endsWith('@g.us')
    if (isGroup && deps.config.grupJid && jid !== deps.config.grupJid) continue

    const isi = ekstrakIsiPesan(msg)
    const { dipanggil, hapusTag } = apakahBotDipanggil(isi, deps.aktif)
    if (isGroup && !dipanggil) continue

    await deps.antreanChat.jalankan(jid, () => prosesPesanMasuk(deps, msg, isi, hapusTag))
  }
}

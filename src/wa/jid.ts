import type { GroupMetadata, WAMessage, WASocket } from '@whiskeysockets/baileys'
import { normalisasiNomor } from '../validasi'

export type WaState = {
  lidKeNomor: Map<string, string>
  grupCache: Map<string, GroupMetadata>
}

export type IsiPesan = {
  jenis: 'teks' | 'gambar' | 'suara'
  teks: string | null
  mentionedJid: string[]
  quotedParticipant: string | null
}

export function bersihkanJidUser(jid: string | null | undefined): string | null {
  if (!jid) return null
  const [bagianKiri, domain] = jid.split('@')
  if (!bagianKiri || !domain) return null
  return `${bagianKiri.split(':')[0]}@${domain}`
}

export function jidKeNomorLangsung(jid: string | null | undefined): string | null {
  const bersih = bersihkanJidUser(jid)
  if (!bersih) return null
  if (bersih.endsWith('@s.whatsapp.net') || bersih.endsWith('@c.us')) {
    return normalisasiNomor(bersih.split('@')[0] ?? '')
  }
  return null
}

export function ekstrakIsiPesan(msg: WAMessage): IsiPesan {
  let content = msg.message
  if (content?.ephemeralMessage?.message) content = content.ephemeralMessage.message
  if (content?.viewOnceMessage?.message) content = content.viewOnceMessage.message
  if (content?.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message
  if (content?.documentWithCaptionMessage?.message) content = content.documentWithCaptionMessage.message
  if (!content) return { jenis: 'teks', teks: null, mentionedJid: [], quotedParticipant: null }

  if (content.imageMessage) {
    return {
      jenis: 'gambar',
      teks: content.imageMessage.caption?.trim() || null,
      mentionedJid: content.imageMessage.contextInfo?.mentionedJid ?? [],
      quotedParticipant: content.imageMessage.contextInfo?.participant ?? null,
    }
  }
  if (content.audioMessage) {
    return { jenis: 'suara', teks: null, mentionedJid: [], quotedParticipant: null }
  }
  const ext = content.extendedTextMessage
  return {
    jenis: 'teks',
    teks: content.conversation?.trim() || ext?.text?.trim() || null,
    mentionedJid: ext?.contextInfo?.mentionedJid ?? [],
    quotedParticipant: ext?.contextInfo?.participant ?? null,
  }
}

export async function muatMetadataGrup(
  aktif: WASocket,
  state: WaState,
  grupJid: string,
  paksa = false,
): Promise<GroupMetadata | null> {
  if (!paksa && state.grupCache.has(grupJid)) return state.grupCache.get(grupJid)!
  try {
    const meta = await aktif.groupMetadata(grupJid)
    state.grupCache.set(grupJid, meta)
    for (const p of meta.participants) {
      const item = p as typeof p & { phoneNumber?: string }
      const lid = bersihkanJidUser(item.lid ?? (item.id.endsWith('@lid') ? item.id : null))
      const nomor = jidKeNomorLangsung(item.phoneNumber) ?? jidKeNomorLangsung(item.id)
      if (lid && nomor) state.lidKeNomor.set(lid, nomor)
    }
    return meta
  } catch {
    return state.grupCache.get(grupJid) ?? null
  }
}

export async function selesaikanNomorPeserta(
  aktif: WASocket,
  state: WaState,
  jid: string,
  altJid?: string | null,
  grupJid?: string | null,
): Promise<string | null> {
  const langsung = jidKeNomorLangsung(altJid) ?? jidKeNomorLangsung(jid)
  const lid = bersihkanJidUser(jid)
  if (langsung) {
    if (lid && lid.endsWith('@lid')) state.lidKeNomor.set(lid, langsung)
    return langsung
  }
  if (lid && state.lidKeNomor.has(lid)) return state.lidKeNomor.get(lid)!
  if (grupJid) {
    await muatMetadataGrup(aktif, state, grupJid, true)
    if (lid && state.lidKeNomor.has(lid)) return state.lidKeNomor.get(lid)!
  }
  return null
}

export function cekAdminGrup(
  meta: GroupMetadata | null,
  pengirimJid: string,
  senderNomor: string | null,
): boolean {
  if (!meta) return false
  const pBersih = bersihkanJidUser(pengirimJid)
  const peserta = meta.participants.find((p) => {
    const item = p as typeof p & { phoneNumber?: string }
    return (
      bersihkanJidUser(item.id) === pBersih ||
      bersihkanJidUser(item.lid) === pBersih ||
      (senderNomor && jidKeNomorLangsung(item.phoneNumber ?? item.id) === senderNomor)
    )
  })
  return peserta?.admin === 'admin' || peserta?.admin === 'superadmin'
}

import { randomUUID } from 'node:crypto'
import type { GroupMetadata, WASocket } from '@whiskeysockets/baileys'
import { catatPesan, daftarBelumLengkap, type AnggotaRow, type PoolDb } from '../db'
import { LABEL_KOLOM } from '../validasi'
import { AntreanChat, kirimSepertiManusia } from './human'
import { bersihkanJidUser, jidKeNomorLangsung, muatMetadataGrup, type WaState } from './jid'

export type FilterPengingat = 'semua' | 'sebagian' | 'kosong_total'

export type PengingatOpsi = {
  sock: WASocket
  state: WaState
  pool: PoolDb
  antreanChat: AntreanChat
  formBaseUrl: string
  grupJid: string | null
  filter?: FilterPengingat
  limit?: number
  kecualiNomor?: string | null
}

function petakanNomorKeJid(meta: GroupMetadata | null, state: WaState): Map<string, string> {
  const peta = new Map<string, string>()
  for (const [lid, nomor] of state.lidKeNomor.entries()) {
    if (!peta.has(nomor)) peta.set(nomor, lid)
  }
  if (!meta) return peta
  for (const p of meta.participants) {
    const item = p as typeof p & { phoneNumber?: string }
    const nomor = jidKeNomorLangsung(item.phoneNumber) ?? jidKeNomorLangsung(item.id)
    const jid = bersihkanJidUser(item.id) ?? bersihkanJidUser(item.lid)
    if (nomor && jid) peta.set(nomor, jid)
  }
  return peta
}

function formatBarisAnggota(idx: number, a: AnggotaRow, jid: string | undefined): string {
  const nama = a.nama_lengkap || a.nama_kontak || a.nomor
  const kurang = a.kekurangan.map((k) => LABEL_KOLOM[k].toLowerCase()).join(', ')
  const tag = jid ? `@${jid.split('@')[0]}` : a.nomor
  return `${idx + 1}. ${tag} (${nama}) — kurang ${kurang}`
}

function susunTeksPengingat(
  kandidat: AnggotaRow[],
  nomorKeJid: Map<string, string>,
  linkFormulir: string,
): { teks: string; mentions: string[] } {
  const mentions: string[] = []
  const baris = kandidat.map((a, idx) => {
    const jid = nomorKeJid.get(a.nomor) ?? bersihkanJidUser(a.wa_id) ?? undefined
    if (jid && !mentions.includes(jid)) mentions.push(jid)
    return formatBarisAnggota(idx, a, jid)
  })
  const teks = [
    '*Pengingat Kelengkapan Data Anggota POINT*',
    '',
    'Halo rekan-rekan, mohon bantu lengkapi data anggota yang masih kurang berikut ini:',
    ...baris,
    '',
    'Cara melengkapinya pilih salah satu yang paling gampang:',
    `1. Isi formulir resmi di: ${linkFormulir} (pakai nomor WA aktif di grup, otomatis langsung aktif)`,
    '2. Atau kirim/chat data kekurangannya langsung ke DM nomor bot ini.',
  ].join('\n')
  return { teks, mentions }
}

export async function kirimPengingatGrup(opsi: PengingatOpsi): Promise<{ ok: boolean; pesan: string }> {
  const grupJid = opsi.grupJid?.trim() ?? ''
  if (!grupJid.endsWith('@g.us')) {
    return {
      ok: false,
      pesan: 'Jalankan perintah ini dari dalam grup POINT (atau atur GRUP_JID di .env).',
    }
  }

  const batas = Math.min(Math.max(Math.floor(opsi.limit ?? 10), 1), 30)
  const semua = await daftarBelumLengkap(opsi.pool, opsi.filter ?? 'semua')
  const kandidat = semua
    .filter((a) => !opsi.kecualiNomor || a.nomor !== opsi.kecualiNomor)
    .slice(0, batas)

  if (kandidat.length === 0) {
    return { ok: true, pesan: 'Semua anggota aktif sudah lengkap datanya!' }
  }

  const meta = await muatMetadataGrup(opsi.sock, opsi.state, grupJid, true)
  const nomorKeJid = petakanNomorKeJid(meta, opsi.state)
  const linkFormulir = `${opsi.formBaseUrl}/formulir`
  const { teks, mentions } = susunTeksPengingat(kandidat, nomorKeJid, linkFormulir)

  const msgId = await opsi.antreanChat.jalankan(grupJid, () =>
    kirimSepertiManusia(opsi.sock, { jid: grupJid, teks, mentions }),
  )
  await catatPesan(opsi.pool, {
    chatKey: grupJid,
    arah: 'keluar',
    jenis: 'teks',
    isi: teks,
    waMessageId: msgId ?? `ingat-${randomUUID()}`,
  })
  console.log(`[Pengingat] Terkirim ke grup ${grupJid} (${kandidat.length} anggota, ${mentions.length} mention)`)
  return {
    ok: true,
    pesan: `Pengingat sudah dikirim di grup untuk ${kandidat.length} anggota (${mentions.length} di-tag).`,
  }
}

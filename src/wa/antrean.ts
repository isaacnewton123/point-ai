import { randomUUID } from 'node:crypto'
import type { WASocket } from '@whiskeysockets/baileys'
import { jawabPesan, type AiDeps } from '../ai/agent'
import {
  ambilKandidatJapri,
  catatPesan,
  catatTerkirimJapri,
  hitungTerkirimHariIni,
  type AnggotaRow,
  type PoolDb,
} from '../db'
import { LABEL_KOLOM } from '../validasi'
import { acakMs, AntreanChat, kirimSepertiManusia, tidur } from './human'

let japriSedangJalan = false

export function sedangJapri(): boolean {
  return japriSedangJalan
}

export type JapriOpsi = {
  sock: WASocket
  pool: PoolDb
  aiDeps: AiDeps
  antreanChat: AntreanChat
  formBaseUrl: string
  formSecret: string
  jedaDetik: number
  maxHarian: number
  limit?: number
  kecualiNomor?: string | null
}

async function kirimSatuJapri(anggota: AnggotaRow, opsi: JapriOpsi): Promise<void> {
  const jid = `${anggota.nomor.replace(/\D/g, '')}@s.whatsapp.net`
  const namaTampil = anggota.nama_lengkap || anggota.nama_kontak || 'kak'
  const daftarKurang = anggota.kekurangan.map((k) => LABEL_KOLOM[k].toLowerCase()).join(', ')

  const teks = await jawabPesan(
    {
      chatKey: anggota.nomor,
      teks: `[INSTRUKSI INTERNAL] Sapa ${namaTampil} (${anggota.nomor}) lewat chat pribadi WhatsApp secara hangat, santai, dan natural seperti manusia untuk melengkapi data grup POINT yang masih kurang (${daftarKurang}). Minta dia membalas langsung di chat WhatsApp ini saja tanpa mengirim link formulir dan tanpa format formulir kaku.`,
      senderNomor: anggota.nomor,
      senderNama: namaTampil,
      isAdmin: false,
      isGroup: false,
    },
    opsi.aiDeps,
  )

  try {
    const id = await opsi.antreanChat.jalankan(jid, () =>
      kirimSepertiManusia(opsi.sock, { jid, teks }),
    )
    await catatTerkirimJapri(opsi.pool, anggota.nomor, anggota.kekurangan)
    await catatPesan(opsi.pool, {
      chatKey: anggota.nomor,
      arah: 'keluar',
      jenis: 'teks',
      isi: teks,
      waMessageId: id ?? `japri-${randomUUID()}`,
    })
    console.log(`[Japri] Terkirim ke ${anggota.nomor}`)
  } catch (err) {
    console.error(`[Japri] Gagal ke ${anggota.nomor}:`, err instanceof Error ? err.message : err)
  }
}

async function jalankanLoopJapri(kandidat: AnggotaRow[], opsi: JapriOpsi): Promise<void> {
  try {
    for (let i = 0; i < kandidat.length; i += 1) {
      if (i > 0 && opsi.jedaDetik > 0) {
        const dasarMs = opsi.jedaDetik * 1000
        const jedaAcak = acakMs(Math.round(dasarMs * 0.65), Math.round(dasarMs * 1.35))
        console.log(`[Japri] Menunggu ${Math.round(jedaAcak / 1000)} detik sebelum anggota berikutnya...`)
        await tidur(jedaAcak)
      }
      await kirimSatuJapri(kandidat[i], opsi)
    }
  } finally {
    japriSedangJalan = false
  }
}

export async function jalankanJapriKurang(opsi: JapriOpsi): Promise<{ ok: boolean; pesan: string }> {
  if (japriSedangJalan) {
    return { ok: false, pesan: 'Proses japri bertahap masih berjalan.' }
  }

  const sudahHariIni = await hitungTerkirimHariIni(opsi.pool)
  const sisaKuota = Math.max(0, opsi.maxHarian - sudahHariIni)
  if (sisaKuota <= 0) {
    return {
      ok: false,
      pesan: `Batas aman japri harian (${opsi.maxHarian} orang/hari) sudah tercapai hari ini. Pakai link formulir di grup saja ya.`,
    }
  }

  const targetJumlah = Math.min(opsi.limit ?? 5, sisaKuota)
  const semuaKandidat = await ambilKandidatJapri(opsi.pool, targetJumlah + 2)
  const kandidat = semuaKandidat
    .filter((a) => !opsi.kecualiNomor || a.nomor !== opsi.kecualiNomor)
    .slice(0, targetJumlah)

  if (kandidat.length === 0) {
    return {
      ok: true,
      pesan: 'Tidak ada anggota yang siap di-japri saat ini (semua sudah lengkap atau baru diingatkan).',
    }
  }

  japriSedangJalan = true
  void jalankanLoopJapri(kandidat, opsi)
  return {
    ok: true,
    pesan: `Siap, saya mulai japri ${kandidat.length} anggota secara bertahap dengan jeda aman lewat chat WA langsung.`,
  }
}

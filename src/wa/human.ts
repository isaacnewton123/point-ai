import type { WAMessage, WAMessageKey, WASocket } from '@whiskeysockets/baileys'

export function acakMs(min: number, max: number): number {
  const bawah = Math.min(min, max)
  const atas = Math.max(min, max)
  return Math.floor(bawah + Math.random() * (atas - bawah + 1))
}

export function tidur(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AntreanChat {
  private readonly antrean = new Map<string, Promise<void>>()

  jalankan<T>(kunci: string, tugas: () => Promise<T>): Promise<T> {
    const sebelum = this.antrean.get(kunci) ?? Promise.resolve()
    const berikut = sebelum.then(tugas, tugas)
    const penjaga = berikut.then(
      () => undefined,
      () => undefined,
    )
    this.antrean.set(kunci, penjaga)
    void penjaga.finally(() => {
      if (this.antrean.get(kunci) === penjaga) {
        this.antrean.delete(kunci)
      }
    })
    return berikut
  }
}

export function durasiMengetikMs(panjangTeks: number): number {
  const dasar = Math.min(Math.max(panjangTeks * 36, 1400), 6500)
  return dasar + acakMs(150, 850)
}

export async function kirimSepertiManusia(
  sock: WASocket,
  opsi: {
    jid: string
    teks: string
    mentions?: string[]
    quoted?: WAMessage
    readKey?: WAMessageKey
  },
): Promise<string | null> {
  if (opsi.readKey) {
    await tidur(acakMs(1200, 2900))
    try {
      await sock.readMessages([opsi.readKey])
    } catch {
      // Abaikan bila gagal mengirim read receipt
    }
    await tidur(acakMs(650, 1400))
  } else {
    await tidur(acakMs(600, 1300))
  }

  try {
    await sock.sendPresenceUpdate('composing', opsi.jid)
  } catch {
    // Abaikan bila status mengetik gagal
  }

  await tidur(durasiMengetikMs(opsi.teks.length))

  const terkirim = await sock.sendMessage(
    opsi.jid,
    {
      text: opsi.teks,
      ...(opsi.mentions && opsi.mentions.length > 0 ? { mentions: opsi.mentions } : {}),
    },
    opsi.quoted ? { quoted: opsi.quoted } : undefined,
  )

  try {
    await sock.sendPresenceUpdate('paused', opsi.jid)
  } catch {
    // Abaikan
  }

  return terkirim?.key?.id ?? null
}

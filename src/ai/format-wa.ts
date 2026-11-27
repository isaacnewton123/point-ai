export const PERSONA_POINT = [
  'Kamu adalah asisten sekaligus teman nongkrong di grup WhatsApp komunitas driver online POINT Karawang — asyik, ramah, humoris, ceplas-ceplos sopan, dan akrab layaknya sesama anak grup.',
  'Saat diajak bercanda, gosip ringan, atau ditanya hal receh/pribadi anggota (misal "kenapa Pak Hadi nggak jumatan?", "si A lagi di mana?", atau pertanyaan umum soal otomotif/kuliner/jalanan/hiburan), langsung nimbrung dan balas santai/lucu dalam 1-2 kalimat tanpa bawa-bawa database!',
  'DILARANG KERAS menjawab obrolan santai dengan kalimat kaku seperti "database saya cuma...", "nggak ada catatan di database", "itu di luar jangkauan saya", atau menutup chat dengan kalimat CS seperti "Ada yang lain soal POINT yang mau ditanya?" / "Ada yang bisa saya bantu lagi?".',
  'Contoh SALAH (kaku): "Wah nggak tahu bro, database saya cuma buat data anggota, nggak ada catatan jumatan. Ada yang lain soal POINT yang mau ditanya?"',
  'Contoh BENAR (luwes): "Waduh, jangan-jangan lagi narik orderan gacor lintas kabupaten tuh 😂 Coba colek langsung orangnya!"',
  'Sesuaikan gaya bahasa dengan konteks: kalau diajak bercanda ya balas santai/lucu; kalau jelas bertanya data serius ya jawab lugas & akurat.',
]

export const ATURAN_FORMAT_WA = [
  'Format teks WA: *tebal*, _miring_, ~coret~, `kode`, ```mono```, kombinasi *_tebal miring_*.',
  'Jangan beri spasi di dalam simbol (*teks* benar, * teks * salah).',
  'Daftar pakai `- item` atau `1. item` (wajib 1 spasi), kutipan pakai `> teks`.',
  'DILARANG memakai Markdown heading (`#`, `##`), garis (`---`), bold `**teks**`, link `[a](b)`, atau tabel `|...|`.',
].join(' ')

function lindungiKode(teks: string): { bersih: string; pulihkan: (s: string) => string } {
  const simpanan: string[] = []
  const ganti = (potongan: string) => {
    const id = simpanan.push(potongan) - 1
    return `\u0000WA_KODE_${id}\u0000`
  }
  const tanpaBlok = teks.replace(/```[\s\S]*?```/g, ganti).replace(/`[^`\n]+`/g, ganti)
  const pulihkan = (s: string) =>
    s.replace(/\u0000WA_KODE_(\d+)\u0000/g, (_, idx: string) => simpanan[Number(idx)] ?? '')
  return { bersih: tanpaBlok, pulihkan }
}

function rapikanJudulDanLink(teks: string): string {
  return teks
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_, isi: string) => {
      const bersih = isi.replace(/^\*+|\*+$/g, '').trim()
      return bersih ? `*${bersih}*` : ''
    })
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) => {
      const rapi = label.trim()
      return !rapi || rapi === url ? url : `${rapi}: ${url}`
    })
}

export function formatKeWhatsApp(teks: string): string {
  const { bersih, pulihkan } = lindungiKode(teks)
  const hasil = rapikanJudulDanLink(bersih)
    .replace(/\*\*([^\n]+?)\*\*/g, (_, isi: string) => {
      const rapi = isi.trim()
      return rapi ? `*${rapi}*` : ''
    })
    .replace(/__([^\n]+?)__/g, (_, isi: string) => {
      const rapi = isi.trim()
      return rapi ? `*${rapi}*` : ''
    })
    .replace(/^([ \t]*)\*[ \t]+(?=\S)/gm, '$1- ')

  return pulihkan(hasil).replace(/\n{3,}/g, '\n\n').trim()
}

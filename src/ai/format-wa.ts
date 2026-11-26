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

import {
  ambilStrukturOrganisasi,
  cariAnggota,
  cariNomorDariWaId,
  daftarBelumLengkap,
  daftarPendaftar,
  detailAnggota,
  detailAnggotaByWaId,
  ringkasanAnggota,
  riwayatPeristiwa,
  setujuiPendaftar,
  simpanDataAnggota,
  tolakPendaftar,
  type AnggotaRow,
  type PendaftarRow,
  type PengurusRow,
  type PeristiwaRow,
  type PoolDb,
  type RingkasanDb,
  type StatusPendaftar,
} from '../db'
import {
  KOLOM_WAJIB,
  LABEL_KOLOM,
  normalisasiNomor,
  validasiKolom,
  type KolomWajib,
} from '../validasi'
import { TOOL_DEFINITIONS } from './tool-schemas'

export { TOOL_DEFINITIONS }

export type DbRepo = {
  ringkasanAnggota: (pool: PoolDb) => Promise<RingkasanDb>
  daftarBelumLengkap: (pool: PoolDb, filter?: 'semua' | 'sebagian' | 'kosong_total') => Promise<AnggotaRow[]>
  cariAnggota: (pool: PoolDb, kataKunci: string, limit?: number) => Promise<AnggotaRow[]>
  detailAnggota: (pool: PoolDb, nomor: string) => Promise<AnggotaRow | null>
  detailAnggotaByWaId: (pool: PoolDb, waId: string) => Promise<AnggotaRow | null>
  cariNomorDariWaId: (pool: PoolDb, waId: string) => Promise<string | null>
  simpanDataAnggota: (
    pool: PoolDb,
    nomor: string,
    isian: Partial<Record<KolomWajib, string>>,
    opsi?: { timpa?: boolean; namaKontak?: string | null },
  ) => Promise<AnggotaRow>
  riwayatPeristiwa: (pool: PoolDb, limit?: number) => Promise<PeristiwaRow[]>
  daftarPendaftar: (pool: PoolDb, status?: StatusPendaftar, limit?: number) => Promise<PendaftarRow[]>
  setujuiPendaftar: (pool: PoolDb, nomor: string) => Promise<{ ok: boolean; anggota?: AnggotaRow; alasan?: string }>
  tolakPendaftar: (pool: PoolDb, nomor: string) => Promise<boolean>
  ambilStrukturOrganisasi: (pool: PoolDb) => Promise<PengurusRow[]>
}

export const defaultDbRepo: DbRepo = {
  ringkasanAnggota, daftarBelumLengkap, cariAnggota, detailAnggota, detailAnggotaByWaId, cariNomorDariWaId,
  simpanDataAnggota, riwayatPeristiwa, daftarPendaftar, setujuiPendaftar, tolakPendaftar, ambilStrukturOrganisasi,
}

export type IngatkanGrupInput = {
  grupJid: string | null
  limit?: number
  filter?: 'semua' | 'sebagian' | 'kosong_total'
}

export type ToolContext = {
  pool: PoolDb
  chatKey?: string
  senderNomor: string | null
  senderNama: string | null
  isAdmin: boolean
  isGroup: boolean
  formBaseUrl: string
  formSecret: string
  ingatkanDiGrup?: (opsi: IngatkanGrupInput) => Promise<{ ok: boolean; pesan: string }>
  db?: DbRepo
}

function ringkasBaris(row: AnggotaRow) {
  return {
    nomor: row.nomor, nama_lengkap: row.nama_lengkap, nama_kontak: row.nama_kontak,
    tanggal_lahir: row.tanggal_lahir, alamat: row.alamat, plat: row.plat,
    tipe_warna_unit: row.tipe_warna_unit, status: row.status,
    aktif_di_grup: row.aktif_di_grup, kekurangan: row.kekurangan,
  }
}

function kandidatWaId(raw: string): string | null {
  const bersih = raw.trim().replace(/^@/, '')
  if (!bersih) return null
  if (bersih.endsWith('@lid')) return bersih
  return /^\d{8,20}$/.test(bersih) ? `${bersih}@lid` : null
}

function bersihkanKataCari(raw: string): string {
  const t = raw.trim()
  return /^@\d{8,20}(?:@lid)?$/.test(t) ? t.slice(1).replace(/@lid$/, '') : t
}

async function handleCariAnggota(args: Record<string, unknown>, ctx: ToolContext, db: DbRepo) {
  const mentah = typeof args.kata_kunci === 'string' ? args.kata_kunci : ''
  const kataKunci = bersihkanKataCari(mentah)
  if (!kataKunci) return JSON.stringify({ ok: false, alasan: 'Kata kunci pencarian kosong.' })
  const rows = await db.cariAnggota(ctx.pool, kataKunci, 15)
  return JSON.stringify({ jumlah: rows.length, hasil: rows.map(ringkasBaris) })
}

async function handleDetailAnggota(args: Record<string, unknown>, ctx: ToolContext, db: DbRepo) {
  const target = typeof args.nomor_atau_nama === 'string' ? args.nomor_atau_nama.trim() : ''
  if (!target) return JSON.stringify({ ok: false, alasan: 'Nomor atau nama anggota wajib diisi.' })
  const lid = kandidatWaId(target)
  if (lid && (target.startsWith('@') || target.endsWith('@lid'))) {
    const byLid = await db.detailAnggotaByWaId(ctx.pool, lid)
    if (byLid) return JSON.stringify({ ditemukan: true, anggota: ringkasBaris(byLid) })
  }
  const nomorNorm = normalisasiNomor(target)
  if (nomorNorm) {
    const exact = await db.detailAnggota(ctx.pool, nomorNorm)
    if (exact) return JSON.stringify({ ditemukan: true, anggota: ringkasBaris(exact) })
  }
  if (lid) {
    const byLid = await db.detailAnggotaByWaId(ctx.pool, lid)
    if (byLid) return JSON.stringify({ ditemukan: true, anggota: ringkasBaris(byLid) })
  }
  const matches = await db.cariAnggota(ctx.pool, bersihkanKataCari(target), 5)
  if (matches.length === 0) {
    return JSON.stringify({ ditemukan: false, alasan: `Tidak ditemukan anggota untuk "${target}".` })
  }
  return JSON.stringify({
    ditemukan: true,
    catatan: matches.length > 1 ? 'Ditemukan lebih dari satu kecocokan.' : undefined,
    hasil: matches.map(ringkasBaris),
  })
}

async function selesaikanTargetNomor(args: Record<string, unknown>, ctx: ToolContext, db: DbRepo) {
  if (!ctx.isAdmin || typeof args.nomor_target !== 'string' || !args.nomor_target.trim()) {
    return ctx.senderNomor
  }
  const norm = normalisasiNomor(args.nomor_target)
  if (norm) return norm
  const lid = kandidatWaId(args.nomor_target)
  return lid ? db.cariNomorDariWaId(ctx.pool, lid) : null
}

async function handleSimpanDataDiri(args: Record<string, unknown>, ctx: ToolContext, db: DbRepo) {
  const targetNomor = await selesaikanTargetNomor(args, ctx, db)
  if (!targetNomor) {
    return JSON.stringify({
      ok: false,
      alasan: ctx.senderNomor ? 'Format nomor_target tidak valid.' : 'Nomor WhatsApp pengirim tidak terbaca.',
    })
  }
  const isian: Partial<Record<KolomWajib, string>> = {}
  const ditolak: Record<string, string> = {}
  for (const kolom of KOLOM_WAJIB) {
    const mentah = args[kolom]
    if (typeof mentah !== 'string' || !mentah.trim()) continue
    const bersih = validasiKolom(kolom, mentah)
    if (bersih) isian[kolom] = bersih
    else ditolak[kolom] = `${LABEL_KOLOM[kolom]} "${mentah}" belum memenuhi format yang valid.`
  }
  if (Object.keys(isian).length === 0) {
    return JSON.stringify({ ok: false, ditolak, alasan: Object.keys(ditolak).length > 0 ? 'Semua isian belum valid.' : 'Tidak ada data dikirimkan.' })
  }
  const sesudah = await db.simpanDataAnggota(ctx.pool, targetNomor, isian, {
    timpa: false, namaKontak: targetNomor === ctx.senderNomor ? ctx.senderNama : undefined,
  })
  return JSON.stringify({ ok: true, tersimpan: Object.keys(isian), ditolak, anggota: ringkasBaris(sesudah) })
}

async function handlePendaftarAksi(
  aksi: 'setujui' | 'tolak',
  args: Record<string, unknown>,
  ctx: ToolContext,
  db: DbRepo,
) {
  if (!ctx.isAdmin) {
    return JSON.stringify({ ok: false, alasan: 'Hanya pengurus/admin grup yang boleh menyetujui atau menolak pendaftar.' })
  }
  const norm = typeof args.nomor === 'string' ? normalisasiNomor(args.nomor) : null
  if (!norm) return JSON.stringify({ ok: false, alasan: 'Nomor WA pendaftar tidak valid.' })
  if (aksi === 'setujui') return JSON.stringify(await db.setujuiPendaftar(ctx.pool, norm))
  const ok = await db.tolakPendaftar(ctx.pool, norm)
  return JSON.stringify({ ok, alasan: ok ? undefined : `Pendaftar ${norm} berstatus menunggu tidak ditemukan.` })
}

async function handleIngatkanDiGrup(args: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.isAdmin) {
    return JSON.stringify({ ok: false, alasan: 'Hanya pengurus/admin grup yang dapat mengirim pengingat ke grup.' })
  }
  if (!ctx.ingatkanDiGrup) return JSON.stringify({ ok: false, alasan: 'Fitur pengingat grup tidak aktif pada mode saat ini (web-only).' })
  const limit = typeof args.limit === 'number' ? Math.max(1, Math.min(Math.floor(args.limit), 30)) : 10
  const filter = args.filter === 'sebagian' || args.filter === 'kosong_total' ? args.filter : 'semua'
  return JSON.stringify(await ctx.ingatkanDiGrup({ grupJid: ctx.isGroup ? (ctx.chatKey ?? null) : null, limit, filter }))
}

export async function jalankanTool(nama: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const db = ctx.db ?? defaultDbRepo
  if (nama === 'ringkasan_anggota') return JSON.stringify(await db.ringkasanAnggota(ctx.pool))
  if (nama === 'daftar_belum_lengkap') {
    const filter = args.filter === 'sebagian' || args.filter === 'kosong_total' ? args.filter : 'semua'
    const rows = await db.daftarBelumLengkap(ctx.pool, filter)
    return JSON.stringify({
      jumlah: rows.length, filter,
      anggota: rows.map((r) => ({ nomor: r.nomor, nama_lengkap: r.nama_lengkap, nama_kontak: r.nama_kontak, kekurangan: r.kekurangan })),
    })
  }
  if (nama === 'cari_anggota') return handleCariAnggota(args, ctx, db)
  if (nama === 'detail_anggota') return handleDetailAnggota(args, ctx, db)
  if (nama === 'riwayat_keluar_masuk') {
    const raw = typeof args.limit === 'number' ? args.limit : 15
    const rows = await db.riwayatPeristiwa(ctx.pool, Math.min(Math.max(Math.floor(raw), 1), 50))
    return JSON.stringify({ jumlah: rows.length, peristiwa: rows })
  }
  if (nama === 'simpan_data_diri') return handleSimpanDataDiri(args, ctx, db)
  if (nama === 'buat_link_formulir') return JSON.stringify({ ok: true, url: `${ctx.formBaseUrl}/formulir`, personal: false })
  if (nama === 'daftar_pendaftar') {
    const st: StatusPendaftar = args.status === 'disetujui' || args.status === 'ditolak' ? args.status : 'menunggu'
    const rows = await db.daftarPendaftar(ctx.pool, st, 25)
    return JSON.stringify({ jumlah: rows.length, status: st, pendaftar: rows })
  }
  if (nama === 'setujui_pendaftar') return handlePendaftarAksi('setujui', args, ctx, db)
  if (nama === 'tolak_pendaftar') return handlePendaftarAksi('tolak', args, ctx, db)
  if (nama === 'struktur_organisasi') {
    const rows = await db.ambilStrukturOrganisasi(ctx.pool)
    return JSON.stringify({ jumlah: rows.length, pengurus: rows })
  }
  if (nama === 'ingatkan_di_grup') return handleIngatkanDiGrup(args, ctx)
  return JSON.stringify({ ok: false, alasan: `Tool "${nama}" tidak dikenal.` })
}

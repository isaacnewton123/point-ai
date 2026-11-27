import type pg from 'pg'
import { hitungKekurangan, KOLOM_WAJIB, type KolomWajib } from '../validasi'
import { SELECT_ANGGOTA, type AnggotaRow, type PoolDb, type RingkasanDb } from './pool'

const KURANG_KOSONG: Record<KolomWajib, number> = {
  nama_lengkap: 0,
  tanggal_lahir: 0,
  alamat: 0,
  plat: 0,
  tipe_warna_unit: 0,
}

export async function ringkasanAnggota(pool: PoolDb): Promise<RingkasanDb> {
  const totalRes = await pool.query<{ total: number; aktif: number }>(
    `select count(*)::int as total, count(*) filter (where aktif_di_grup = true)::int as aktif from anggota`,
  )
  const statusRes = await pool.query<{ status: string; jumlah: number }>(
    `select status, count(*)::int as jumlah from anggota group by status order by status`,
  )
  const kolomRes = await pool.query<Record<KolomWajib, number>>(`
    select
      count(*) filter (where 'nama_lengkap' = any(kekurangan))::int as nama_lengkap,
      count(*) filter (where 'tanggal_lahir' = any(kekurangan))::int as tanggal_lahir,
      count(*) filter (where 'alamat' = any(kekurangan))::int as alamat,
      count(*) filter (where 'plat' = any(kekurangan))::int as plat,
      count(*) filter (where 'tipe_warna_unit' = any(kekurangan))::int as tipe_warna_unit
    from anggota
    where aktif_di_grup = true and status = 'DATA_KURANG'
  `)
  return {
    total: totalRes.rows[0]?.total ?? 0,
    aktif_di_grup: totalRes.rows[0]?.aktif ?? 0,
    per_status: statusRes.rows,
    kurang_per_kolom: kolomRes.rows[0] ?? { ...KURANG_KOSONG },
  }
}

export async function daftarBelumLengkap(
  pool: PoolDb,
  filter: 'semua' | 'sebagian' | 'kosong_total' = 'semua',
): Promise<AnggotaRow[]> {
  let kondisiTambahan = ''
  if (filter === 'sebagian') kondisiTambahan = 'and cardinality(kekurangan) between 1 and 4'
  else if (filter === 'kosong_total') kondisiTambahan = 'and cardinality(kekurangan) >= 5'

  const res = await pool.query<AnggotaRow>(`
    ${SELECT_ANGGOTA}
    where aktif_di_grup = true
      and (status = 'DATA_KURANG' or cardinality(kekurangan) > 0)
      ${kondisiTambahan}
    order by cardinality(kekurangan) asc, coalesce(nama_lengkap, nama_kontak, nomor) asc
  `)
  return res.rows
}

export async function cariAnggota(pool: PoolDb, kataKunci: string, limit = 15): Promise<AnggotaRow[]> {
  const bersih = kataKunci.trim()
  if (!bersih) return []
  const pola = `%${bersih}%`
  const polaDigit = `%${bersih.replace(/\D/g, '')}%`
  const polaPlat = `%${bersih.toUpperCase().replace(/[^A-Z0-9]/g, '')}%`
  const adaDigit = bersih.replace(/\D/g, '').length >= 4
  const adaPlat = /[A-Z0-9]{2,}/i.test(bersih)

  const res = await pool.query<AnggotaRow>(
    `
    ${SELECT_ANGGOTA}
    where coalesce(nama_lengkap, '') ilike $1
      or coalesce(nama_kontak, '') ilike $1
      or nomor ilike $1
      or coalesce(wa_id, '') ilike $1
      or coalesce(alamat, '') ilike $1
      or coalesce(tipe_warna_unit, '') ilike $1
      or ($2::boolean and (regexp_replace(nomor, '\\D', '', 'g') like $3 or coalesce(wa_id, '') like $3))
      or ($4::boolean and replace(upper(coalesce(plat, '')), ' ', '') like $5)
    order by aktif_di_grup desc, coalesce(nama_lengkap, nama_kontak, nomor) asc
    limit $6
    `,
    [pola, adaDigit, polaDigit, adaPlat, polaPlat, limit],
  )
  return res.rows
}

export async function detailAnggota(pool: PoolDb, nomor: string): Promise<AnggotaRow | null> {
  const res = await pool.query<AnggotaRow>(`${SELECT_ANGGOTA} where nomor = $1`, [nomor])
  return res.rows[0] ?? null
}

export async function detailAnggotaByWaId(pool: PoolDb, waId: string): Promise<AnggotaRow | null> {
  const res = await pool.query<AnggotaRow>(`${SELECT_ANGGOTA} where wa_id = $1 limit 1`, [waId])
  return res.rows[0] ?? null
}

export async function cariNomorDariWaId(pool: PoolDb, waId: string): Promise<string | null> {
  const res = await pool.query<{ nomor: string }>(`select nomor from anggota where wa_id = $1 limit 1`, [waId])
  return res.rows[0]?.nomor ?? null
}

export async function simpanWaIdAnggota(pool: PoolDb, nomor: string, waId: string): Promise<void> {
  try {
    await pool.query(
      `update anggota set wa_id = $2, diperbarui_pada = now() where nomor = $1 and (wa_id is null or wa_id <> $2)`,
      [nomor, waId],
    )
  } catch {
    // Abaikan bentrok unique index jika wa_id sudah terpasang
  }
}

async function pastikanBarisAnggota(
  klien: pg.PoolClient,
  nomor: string,
  namaKontak?: string | null,
): Promise<void> {
  await klien.query(
    `
    insert into anggota (nomor, nama_kontak, status, aktif_di_grup, kekurangan)
    values ($1, $2, 'DATA_KURANG', true, $3)
    on conflict (nomor) do update set
      nama_kontak = coalesce(anggota.nama_kontak, excluded.nama_kontak)
    `,
    [nomor, namaKontak ?? null, [...KOLOM_WAJIB]],
  )
}

async function perbaruiKolomAnggota(
  klien: pg.PoolClient,
  nomor: string,
  isian: Partial<Record<KolomWajib, string>>,
  timpa: boolean,
): Promise<void> {
  for (const kolom of KOLOM_WAJIB) {
    const nilai = isian[kolom]
    if (!nilai) continue
    const kondisi = timpa ? '' : ` and ${kolom} is null`
    await klien.query(
      `update anggota set ${kolom} = $2, diperbarui_pada = now() where nomor = $1${kondisi}`,
      [nomor, nilai],
    )
  }
}

async function hitungStatusAkhir(klien: pg.PoolClient, nomor: string): Promise<AnggotaRow> {
  const res = await klien.query<AnggotaRow>(`${SELECT_ANGGOTA} where nomor = $1`, [nomor])
  const sekarang = res.rows[0]
  if (!sekarang) throw new Error(`Data anggota ${nomor} gagal dimuat setelah disimpan`)

  const kekurangan = hitungKekurangan({
    nama_lengkap: sekarang.nama_lengkap,
    tanggal_lahir: sekarang.tanggal_lahir,
    alamat: sekarang.alamat,
    plat: sekarang.plat,
    tipe_warna_unit: sekarang.tipe_warna_unit,
  })
  const statusBaru = kekurangan.length === 0 ? 'LENGKAP' : 'DATA_KURANG'
  const finalRes = await klien.query<AnggotaRow>(
    `
    update anggota set kekurangan = $2, status = $3, diperbarui_pada = now()
    where nomor = $1
    returning nomor, wa_id, nama_kontak, nama_lengkap, to_char(tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
      alamat, plat, tipe_warna_unit, status, aktif_di_grup, kekurangan, diperbarui_pada::text as diperbarui_pada
    `,
    [nomor, kekurangan, statusBaru],
  )
  if (statusBaru === 'LENGKAP') {
    await klien.query(`update antrean set status = 'selesai' where nomor = $1 and status <> 'selesai'`, [nomor])
  }
  return finalRes.rows[0]
}

export async function simpanDataAnggota(
  pool: PoolDb,
  nomor: string,
  isian: Partial<Record<KolomWajib, string>>,
  opsi?: { timpa?: boolean; namaKontak?: string | null },
): Promise<AnggotaRow> {
  const klien = await pool.connect()
  try {
    await klien.query('begin')
    await pastikanBarisAnggota(klien, nomor, opsi?.namaKontak)
    await perbaruiKolomAnggota(klien, nomor, isian, Boolean(opsi?.timpa))
    const hasil = await hitungStatusAkhir(klien, nomor)
    await klien.query('commit')
    return hasil
  } catch (err) {
    await klien.query('rollback')
    throw err
  } finally {
    klien.release()
  }
}

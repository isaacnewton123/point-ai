import type pg from 'pg'
import type { AnggotaRow, PoolDb } from './pool'

export type StatusPendaftar = 'menunggu' | 'disetujui' | 'ditolak'

export type PendaftarRow = {
  nomor: string
  nama_lengkap: string
  tanggal_lahir: string
  alamat: string
  plat: string
  tipe_warna_unit: string
  status: StatusPendaftar
  dibuat_pada: string
  diperbarui_pada: string
}

const RETURNING_ANGGOTA = `
  nomor, nama_kontak, nama_lengkap,
  to_char(tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
  alamat, plat, tipe_warna_unit, status, aktif_di_grup, kekurangan,
  diperbarui_pada::text as diperbarui_pada
`

export async function daftarPendaftar(
  pool: PoolDb,
  status: StatusPendaftar = 'menunggu',
  limit = 20,
): Promise<PendaftarRow[]> {
  const res = await pool.query<PendaftarRow>(
    `
    select nomor, nama_lengkap, to_char(tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
      alamat, plat, tipe_warna_unit, status,
      dibuat_pada::text as dibuat_pada, diperbarui_pada::text as diperbarui_pada
    from pendaftar
    where status = $1
    order by dibuat_pada desc
    limit $2
    `,
    [status, limit],
  )
  return res.rows
}

async function promosikanBarisPendaftar(
  klien: pg.PoolClient,
  pendaftar: PendaftarRow,
): Promise<AnggotaRow> {
  const upd = await klien.query<AnggotaRow>(
    `
    insert into anggota (
      nomor, nama_lengkap, tanggal_lahir, alamat, plat, tipe_warna_unit,
      status, aktif_di_grup, kekurangan
    )
    values ($1, $2, $3::date, $4, $5, $6, 'LENGKAP', true, '{}')
    on conflict (nomor) do update set
      nama_lengkap = excluded.nama_lengkap,
      tanggal_lahir = excluded.tanggal_lahir,
      alamat = excluded.alamat,
      plat = excluded.plat,
      tipe_warna_unit = excluded.tipe_warna_unit,
      status = 'LENGKAP',
      aktif_di_grup = true,
      kekurangan = '{}',
      diperbarui_pada = now()
    returning ${RETURNING_ANGGOTA}
    `,
    [
      pendaftar.nomor,
      pendaftar.nama_lengkap,
      pendaftar.tanggal_lahir,
      pendaftar.alamat,
      pendaftar.plat,
      pendaftar.tipe_warna_unit,
    ],
  )
  await klien.query(
    `update pendaftar set status = 'disetujui', diperbarui_pada = now() where nomor = $1`,
    [pendaftar.nomor],
  )
  await klien.query(
    `update antrean set status = 'selesai' where nomor = $1 and status <> 'selesai'`,
    [pendaftar.nomor],
  )
  return upd.rows[0]
}

export async function setujuiPendaftar(
  pool: PoolDb,
  nomor: string,
): Promise<{ ok: boolean; anggota?: AnggotaRow; alasan?: string }> {
  const klien = await pool.connect()
  try {
    await klien.query('begin')
    const cek = await klien.query<PendaftarRow>(
      `
      select nomor, nama_lengkap, to_char(tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
        alamat, plat, tipe_warna_unit, status,
        dibuat_pada::text as dibuat_pada, diperbarui_pada::text as diperbarui_pada
      from pendaftar
      where nomor = $1
      limit 1
      `,
      [nomor],
    )
    const row = cek.rows[0]
    if (!row) {
      await klien.query('rollback')
      return { ok: false, alasan: `Nomor ${nomor} tidak ditemukan di daftar pendaftar.` }
    }
    const anggota = await promosikanBarisPendaftar(klien, row)
    await klien.query('commit')
    return { ok: true, anggota }
  } catch (err) {
    await klien.query('rollback')
    throw err
  } finally {
    klien.release()
  }
}

export async function tolakPendaftar(pool: PoolDb, nomor: string): Promise<boolean> {
  const res = await pool.query(
    `update pendaftar set status = 'ditolak', diperbarui_pada = now() where nomor = $1 and status = 'menunggu'`,
    [nomor],
  )
  return (res.rowCount ?? 0) > 0
}

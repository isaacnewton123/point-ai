import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { hitungKekurangan, KOLOM_WAJIB } from '../validasi'
import type { PendaftarRow } from './pendaftar'
import { SELECT_ANGGOTA, type AnggotaRow, type PeristiwaRow, type PoolDb } from './pool'

const RETURNING_ANGGOTA = `
  nomor, nama_kontak, nama_lengkap,
  to_char(tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
  alamat, plat, tipe_warna_unit, status, aktif_di_grup, kekurangan,
  diperbarui_pada::text as diperbarui_pada
`

async function sisipAnggotaBaru(
  klien: pg.PoolClient,
  nomor: string,
  namaKontak?: string | null,
): Promise<AnggotaRow> {
  const res = await klien.query<AnggotaRow>(
    `
    insert into anggota (nomor, nama_kontak, status, aktif_di_grup, kekurangan)
    values ($1, $2, 'DATA_KURANG', true, $3)
    returning ${RETURNING_ANGGOTA}
    `,
    [nomor, namaKontak ?? null, [...KOLOM_WAJIB]],
  )
  return res.rows[0]
}

async function aktifkanAnggotaLama(
  klien: pg.PoolClient,
  lama: AnggotaRow,
  namaKontak?: string | null,
): Promise<AnggotaRow> {
  const kekurangan = hitungKekurangan({
    nama_lengkap: lama.nama_lengkap,
    tanggal_lahir: lama.tanggal_lahir,
    alamat: lama.alamat,
    plat: lama.plat,
    tipe_warna_unit: lama.tipe_warna_unit,
  })
  const statusBaru = kekurangan.length === 0 ? 'LENGKAP' : 'DATA_KURANG'
  const res = await klien.query<AnggotaRow>(
    `
    update anggota
    set aktif_di_grup = true, nama_kontak = coalesce(nama_kontak, $2),
        kekurangan = $3, status = $4, diperbarui_pada = now()
    where nomor = $1
    returning ${RETURNING_ANGGOTA}
    `,
    [lama.nomor, namaKontak ?? null, kekurangan, statusBaru],
  )
  return res.rows[0]
}

async function promosikanDariPendaftar(
  klien: pg.PoolClient,
  pending: PendaftarRow,
  namaKontak?: string | null,
): Promise<AnggotaRow> {
  const res = await klien.query<AnggotaRow>(
    `
    insert into anggota (
      nomor, nama_kontak, nama_lengkap, tanggal_lahir, alamat, plat, tipe_warna_unit,
      status, aktif_di_grup, kekurangan
    )
    values ($1, $2, $3, $4::date, $5, $6, $7, 'LENGKAP', true, '{}')
    on conflict (nomor) do update set
      nama_kontak = coalesce(anggota.nama_kontak, excluded.nama_kontak),
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
      pending.nomor,
      namaKontak ?? null,
      pending.nama_lengkap,
      pending.tanggal_lahir,
      pending.alamat,
      pending.plat,
      pending.tipe_warna_unit,
    ],
  )
  await klien.query(`update pendaftar set status = 'disetujui', diperbarui_pada = now() where nomor = $1`, [pending.nomor])
  await klien.query(`update antrean set status = 'selesai' where nomor = $1 and status <> 'selesai'`, [pending.nomor])
  return res.rows[0]
}

export async function tandaiMasukGrup(
  pool: PoolDb,
  nomor: string,
  namaKontak?: string | null,
  waId?: string | null,
): Promise<{ anggota: AnggotaRow; baru: boolean; dariPendaftar: boolean }> {
  const klien = await pool.connect()
  try {
    await klien.query('begin')
    const ada = await klien.query<AnggotaRow>(`${SELECT_ANGGOTA} where nomor = $1`, [nomor])
    const baru = ada.rows.length === 0

    const pendingRes = await klien.query<PendaftarRow>(
      `select nomor, nama_lengkap, to_char(tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
        alamat, plat, tipe_warna_unit, status,
        dibuat_pada::text as dibuat_pada, diperbarui_pada::text as diperbarui_pada
       from pendaftar where nomor = $1 and status = 'menunggu' limit 1`,
      [nomor],
    )
    const pending = pendingRes.rows[0]
    const anggota = pending
      ? await promosikanDariPendaftar(klien, pending, namaKontak)
      : baru
        ? await sisipAnggotaBaru(klien, nomor, namaKontak)
        : await aktifkanAnggotaLama(klien, ada.rows[0], namaKontak)

    await klien.query(
      `insert into peristiwa_keanggotaan (terjadi_pada, nomor, wa_id, jenis, impor_id)
       values (now(), $1, $2, 'masuk', $3)`,
      [nomor, waId ?? null, randomUUID()],
    )
    await klien.query('commit')
    return { anggota, baru, dariPendaftar: Boolean(pending) }
  } catch (err) {
    await klien.query('rollback')
    throw err
  } finally {
    klien.release()
  }
}

export async function tandaiKeluarGrup(
  pool: PoolDb,
  nomor: string,
  waId?: string | null,
): Promise<{ anggota: AnggotaRow | null }> {
  const klien = await pool.connect()
  try {
    await klien.query('begin')
    const upd = await klien.query<AnggotaRow>(
      `
      update anggota
      set aktif_di_grup = false, status = 'NON_AKTIF', diperbarui_pada = now()
      where nomor = $1
      returning ${RETURNING_ANGGOTA}
      `,
      [nomor],
    )
    await klien.query(
      `insert into peristiwa_keanggotaan (terjadi_pada, nomor, wa_id, jenis, impor_id)
       values (now(), $1, $2, 'keluar', $3)`,
      [nomor, waId ?? null, randomUUID()],
    )
    await klien.query(
      `update antrean set status = 'ditunda' where nomor = $1 and status in ('menunggu', 'terkirim')`,
      [nomor],
    )
    await klien.query('commit')
    return { anggota: upd.rows[0] ?? null }
  } catch (err) {
    await klien.query('rollback')
    throw err
  } finally {
    klien.release()
  }
}

export async function riwayatPeristiwa(pool: PoolDb, limit = 20): Promise<PeristiwaRow[]> {
  const res = await pool.query<PeristiwaRow>(
    `
    select p.id::text, p.terjadi_pada::text, p.nomor, p.wa_id, p.jenis, a.nama_lengkap, a.nama_kontak
    from peristiwa_keanggotaan p
    left join anggota a on a.nomor = p.nomor
    order by p.terjadi_pada desc
    limit $1
    `,
    [limit],
  )
  return res.rows
}

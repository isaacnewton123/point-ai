import type { PoolDb } from './pool'

export type PengurusRow = {
  urutan: number
  jabatan: string
  nomor: string | null
  nama_panggilan: string | null
  nama_lengkap: string | null
  wa_id: string | null
  tugas: string | null
}

export async function ambilStrukturOrganisasi(pool: PoolDb): Promise<PengurusRow[]> {
  const res = await pool.query<PengurusRow>(`
    select
      s.urutan,
      s.jabatan,
      s.nomor,
      s.nama_panggilan,
      coalesce(a.nama_lengkap, a.nama_kontak) as nama_lengkap,
      a.wa_id,
      s.tugas
    from struktur_organisasi s
    left join anggota a on a.nomor = s.nomor
    order by s.urutan asc
  `)
  return res.rows
}

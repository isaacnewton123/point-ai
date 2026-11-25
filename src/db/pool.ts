import pg from 'pg'
import type { KolomWajib } from '../validasi'

const { Pool } = pg
export type PoolDb = pg.Pool

export type AnggotaRow = {
  nomor: string
  nama_kontak: string | null
  nama_lengkap: string | null
  tanggal_lahir: string | null
  alamat: string | null
  plat: string | null
  tipe_warna_unit: string | null
  status: string
  aktif_di_grup: boolean
  kekurangan: KolomWajib[]
  diperbarui_pada: string
}

export type RingkasanDb = {
  total: number
  aktif_di_grup: number
  per_status: { status: string; jumlah: number }[]
  kurang_per_kolom: Record<KolomWajib, number>
}

export type PeristiwaRow = {
  id: string
  terjadi_pada: string
  nomor: string | null
  wa_id: string | null
  jenis: 'masuk' | 'keluar'
  nama_lengkap: string | null
  nama_kontak: string | null
}

export type PesanChatRow = {
  arah: 'masuk' | 'keluar'
  isi: string
  terjadi_pada: string
}

export const SELECT_ANGGOTA = `
  select
    nomor,
    nama_kontak,
    nama_lengkap,
    to_char(tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
    alamat,
    plat,
    tipe_warna_unit,
    status,
    aktif_di_grup,
    kekurangan,
    diperbarui_pada::text as diperbarui_pada
  from anggota
`

export function buatPool(databaseUrl: string): PoolDb {
  const connectionString = databaseUrl
    .replace(/([?&])channel_binding=[^&]*&?/g, '$1')
    .replace(/([?&])sslmode=[^&]*&?/g, '$1')
    .replace(/[?&]$/, '')
  return new Pool({ connectionString, ssl: { rejectUnauthorized: false } })
}

export async function cekKesehatanDb(pool: PoolDb): Promise<boolean> {
  try {
    await pool.query('select 1')
    return true
  } catch {
    return false
  }
}

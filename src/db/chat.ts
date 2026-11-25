import type { KolomWajib } from '../validasi'
import type { AnggotaRow, PesanChatRow, PoolDb } from './pool'

export async function catatPesan(
  pool: PoolDb,
  pesan: {
    chatKey: string
    arah: 'masuk' | 'keluar'
    jenis: 'teks' | 'gambar' | 'suara'
    isi: string | null
    waMessageId: string
  },
): Promise<boolean> {
  const res = await pool.query(
    `
    insert into pesan_chat (terjadi_pada, arah, nomor, jenis, isi, wa_message_id)
    values (now(), $1, $2, $3, $4, $5)
    on conflict (wa_message_id) do nothing
    returning id
    `,
    [pesan.arah, pesan.chatKey, pesan.jenis, pesan.isi, pesan.waMessageId],
  )
  return res.rowCount === 1
}

export async function ambilRiwayatChat(
  pool: PoolDb,
  chatKey: string,
  limit = 12,
): Promise<PesanChatRow[]> {
  const res = await pool.query<PesanChatRow>(
    `
    select arah, isi, terjadi_pada::text
    from (
      select arah, isi, terjadi_pada
      from pesan_chat
      where nomor = $1 and isi is not null and isi <> ''
      order by terjadi_pada desc
      limit $2
    ) sub
    order by terjadi_pada asc
    `,
    [chatKey, limit],
  )
  return res.rows
}

export async function hitungTerkirimHariIni(pool: PoolDb): Promise<number> {
  const res = await pool.query<{ jumlah: number }>(`
    select count(*)::int as jumlah
    from antrean
    where dikirim_pada >= date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta'
  `)
  return res.rows[0]?.jumlah ?? 0
}

export async function ambilKandidatJapri(pool: PoolDb, limit = 10): Promise<AnggotaRow[]> {
  const res = await pool.query<AnggotaRow>(
    `
    select
      a.nomor, a.nama_kontak, a.nama_lengkap,
      to_char(a.tanggal_lahir, 'YYYY-MM-DD') as tanggal_lahir,
      a.alamat, a.plat, a.tipe_warna_unit, a.status, a.aktif_di_grup, a.kekurangan,
      a.diperbarui_pada::text as diperbarui_pada
    from anggota a
    left join antrean q on q.nomor = a.nomor and q.status in ('menunggu', 'terkirim', 'ditunda')
    where a.aktif_di_grup = true
      and a.status = 'DATA_KURANG'
      and cardinality(a.kekurangan) > 0
      and (
        q.id is null
        or q.status = 'menunggu'
        or (q.status = 'terkirim' and q.jumlah_kirim < 3 and q.dikirim_pada <= now() - interval '3 days')
      )
    order by coalesce(q.jumlah_kirim, 0) asc, a.diperbarui_pada asc
    limit $1
    `,
    [limit],
  )
  return res.rows
}

export async function catatTerkirimJapri(
  pool: PoolDb,
  nomor: string,
  kekurangan: KolomWajib[],
): Promise<void> {
  const upd = await pool.query(
    `
    update antrean
    set status = 'terkirim', dikirim_pada = now(), jumlah_kirim = jumlah_kirim + 1, yang_ditanya = $2
    where nomor = $1 and status in ('menunggu', 'terkirim')
    `,
    [nomor, kekurangan],
  )
  if ((upd.rowCount ?? 0) === 0) {
    await pool.query(
      `
      insert into antrean (nomor, alasan, yang_ditanya, status, dikirim_pada, jumlah_kirim)
      values ($1, 'data_kurang', $2, 'terkirim', now(), 1)
      `,
      [nomor, kekurangan],
    )
  }
}

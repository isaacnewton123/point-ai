import { expect, test } from 'bun:test'
import { bersihkanJawaban, buatSambutanMasuk, jawabPesan } from '../src/ai/agent'
import { jalankanTool, type DbRepo, type ToolContext } from '../src/ai/tools'
import type { AnggotaRow, PendaftarRow, PoolDb } from '../src/db'

function buatSampleRow(): AnggotaRow {
  return {
    nomor: '+628111111111', nama_kontak: 'Tester', nama_lengkap: 'Tester Satu',
    tanggal_lahir: '1990-01-01', alamat: 'Perum Mawar No 1 Karawang',
    plat: 'T1234AA', tipe_warna_unit: 'Brio Putih', status: 'LENGKAP',
    aktif_di_grup: true, kekurangan: [], diperbarui_pada: new Date().toISOString(),
  }
}

function buatSamplePendaftar(): PendaftarRow {
  return {
    nomor: '+6281299998888', nama_lengkap: 'Calon Anggota', tanggal_lahir: '1992-04-10',
    alamat: 'Perum Karawang Baru', plat: 'T8888BB', tipe_warna_unit: 'Avanza Hitam',
    status: 'menunggu', dibuat_pada: new Date().toISOString(), diperbarui_pada: new Date().toISOString(),
  }
}

function buatMockRepo(): { repo: DbRepo; lastSavedNomor: () => string | null } {
  let savedNomor: string | null = null
  const sampleRow = buatSampleRow()
  const samplePendaftar = buatSamplePendaftar()
  return {
    lastSavedNomor: () => savedNomor,
    repo: {
      ringkasanAnggota: async () => ({
        total: 109, aktif_di_grup: 109,
        per_status: [{ status: 'DATA_KURANG', jumlah: 26 }, { status: 'LENGKAP', jumlah: 83 }],
        kurang_per_kolom: { nama_lengkap: 18, tanggal_lahir: 21, alamat: 23, plat: 18, tipe_warna_unit: 23 },
      }),
      daftarBelumLengkap: async () => [],
      cariAnggota: async () => [sampleRow],
      detailAnggota: async () => sampleRow,
      riwayatPeristiwa: async () => [],
      simpanDataAnggota: async (_pool, nomor) => { savedNomor = nomor; return { ...sampleRow, nomor } },
      daftarPendaftar: async () => [samplePendaftar],
      setujuiPendaftar: async (_pool, nomor) => ({ ok: true, anggota: { ...sampleRow, nomor } }),
      tolakPendaftar: async () => true,
    },
  }
}

function buatCtx(isAdmin: boolean, repo: DbRepo): ToolContext {
  return {
    pool: {} as PoolDb, chatKey: '120363000@g.us', senderNomor: '+628111111111', senderNama: isAdmin ? 'Admin' : 'Budi',
    isAdmin, isGroup: true, formBaseUrl: 'https://point-karawang.netlify.app', formSecret: 'secret',
    ingatkanDiGrup: async ({ limit }) => ({ ok: true, pesan: `Pengingat ${limit ?? 10}` }), db: repo,
  }
}

function buatMockFetch() {
  let callCount = 0
  const fn = (async () => {
    callCount += 1
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'ringkasan_anggota', arguments: '{}' } }] } }],
        }),
        { status: 200 },
      )
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '<think>cek</think>Dari database, total ada 109 anggota: 83 sudah lengkap dan 26 masih kurang.' } }] }),
      { status: 200 },
    )
  }) as unknown as typeof fetch
  return { fn, getCount: () => callCount }
}

test('bersihkanJawaban membuang blok <think> dan merapikan format WhatsApp', () => {
  const mentah = '<think>berpikir panjang</think>\n\nHalo kak, datanya sudah lengkap ya.\n\n\nSilakan dicek.'
  expect(bersihkanJawaban(mentah)).toBe('Halo kak, datanya sudah lengkap ya.\n\nSilakan dicek.')
})

test('bersihkanJawaban mengubah Markdown ke format resmi WhatsApp tanpa merusak format WA asli', () => {
  const markdown = [
    '### Daftar Member',
    '---',
    '**Total: 26 orang** dengan _catatan khusus_ dan ~lama~ *_kombinasi_*',
    '* Cek [Formulir](https://point-karawang.netlify.app/formulir)',
    '1. Simpan plat `T 1590 BE` atau ```KODE123```',
    '> Kutipan resmi',
  ].join('\n')
  const hasil = bersihkanJawaban(markdown)
  expect(hasil).toContain('*Daftar Member*')
  expect(hasil).toContain('*Total: 26 orang*')
  expect(hasil).toContain('_catatan khusus_')
  expect(hasil).toContain('~lama~')
  expect(hasil).toContain('*_kombinasi_*')
  expect(hasil).toContain('- Cek Formulir: https://point-karawang.netlify.app/formulir')
  expect(hasil).toContain('1. Simpan plat `T 1590 BE` atau ```KODE123```')
  expect(hasil).toContain('> Kutipan resmi')
  expect(hasil).not.toContain('###')
  expect(hasil).not.toContain('---')
  expect(hasil).not.toContain('**')
})

test('non-admin ditolak untuk ingatkan_di_grup, setujui/tolak pendaftar, dan tidak bisa mengubah data orang lain', async () => {
  const { repo, lastSavedNomor } = buatMockRepo()
  const ctx = buatCtx(false, repo)
  expect((JSON.parse(await jalankanTool('ingatkan_di_grup', { limit: 3 }, ctx)) as { ok: boolean }).ok).toBe(false)
  expect((JSON.parse(await jalankanTool('setujui_pendaftar', { nomor: '081299998888' }, ctx)) as { ok: boolean }).ok).toBe(false)
  expect((JSON.parse(await jalankanTool('tolak_pendaftar', { nomor: '081299998888' }, ctx)) as { ok: boolean }).ok).toBe(false)
  await jalankanTool('simpan_data_diri', { nomor_target: '+628999999999', plat: 'T 9999 ZZ' }, ctx)
  expect(lastSavedNomor()).toBe('+628111111111')
})

test('admin dapat menjalankan ingatkan_di_grup dan setujui/tolak pendaftar', async () => {
  const { repo } = buatMockRepo()
  const ctx = buatCtx(true, repo)
  const ingat = JSON.parse(await jalankanTool('ingatkan_di_grup', { limit: 4 }, ctx)) as { ok: boolean; pesan: string }
  expect(ingat).toEqual({ ok: true, pesan: 'Pengingat 4' })
  const acc = JSON.parse(await jalankanTool('setujui_pendaftar', { nomor: '081299998888' }, ctx)) as { ok: boolean; anggota: { nomor: string } }
  expect(acc.ok).toBe(true)
  expect(acc.anggota.nomor).toBe('+6281299998888')
})

test('jawabPesan menjalankan loop tool-calling dan membalas berdasarkan hasil tool', async () => {
  const { repo } = buatMockRepo()
  const { fn, getCount } = buatMockFetch()
  const fakePool = { query: async () => ({ rows: [] }) } as unknown as PoolDb
  const jawaban = await jawabPesan(
    { chatKey: '120363000@g.us', teks: 'berapa yang kurang?', senderNomor: '+628111111111', senderNama: 'Isaac', isAdmin: true, isGroup: true },
    { pool: fakePool, apiKey: 'dummy', model: 'm1', fallbackModel: 'm2', formBaseUrl: 'https://point-karawang.netlify.app', formSecret: 'secret', fetchFn: fn, db: repo },
  )
  expect(getCount()).toBe(2)
  expect(jawaban).toContain('83 sudah lengkap dan 26 masih kurang')
  expect(jawaban).not.toContain('<think>')
})

test('buatSambutanMasuk menyertakan tag mention dan link formulir saat data belum lengkap', async () => {
  const linkFormulir = 'https://point-karawang.netlify.app/formulir'
  const mockTanpaTag = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'Selamat datang ya!' } }] }), { status: 200 })) as unknown as typeof fetch
  const teks = await buatSambutanMasuk(
    {
      nomor: '+6281234567890', namaKontak: 'Budi', mentionTag: '@6281234567890',
      linkFormulir, kekurangan: ['nama_lengkap', 'plat'], dariPendaftar: false,
    },
    { apiKey: 'dummy', model: 'm1', fallbackModel: 'm2', fetchFn: mockTanpaTag },
  )
  expect(teks).toContain('@6281234567890')
  expect(teks).toContain(linkFormulir)
})

test('buatSambutanMasuk mengabarkan aktif otomatis tanpa memaksa link jika dariPendaftar true', async () => {
  const linkFormulir = 'https://point-karawang.netlify.app/formulir'
  const mockSambutan = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: 'Halo @6281234567890, selamat datang! Datamu sudah aktif otomatis.' } }] }),
      { status: 200 },
    )) as unknown as typeof fetch
  const teks = await buatSambutanMasuk(
    {
      nomor: '+6281234567890', namaKontak: 'Budi', mentionTag: '@6281234567890',
      linkFormulir, kekurangan: [], dariPendaftar: true,
    },
    { apiKey: 'dummy', model: 'm1', fallbackModel: 'm2', fetchFn: mockSambutan },
  )
  expect(teks).toContain('@6281234567890')
  expect(teks).not.toContain(linkFormulir)
})

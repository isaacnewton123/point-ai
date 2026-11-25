import { expect, test } from 'bun:test'
import type { PoolDb } from '../src/db'
import { buatServer, type ServerDbRepo } from '../src/server'

const mockDb: ServerDbRepo = {
  cekKesehatanDb: async () => true,
  ringkasanAnggota: async () => ({
    total: 109,
    aktif_di_grup: 109,
    per_status: [{ status: 'DATA_KURANG', jumlah: 26 }, { status: 'LENGKAP', jumlah: 83 }],
    kurang_per_kolom: { nama_lengkap: 18, tanggal_lahir: 21, alamat: 23, plat: 18, tipe_warna_unit: 23 },
  }),
}

test('GET /health dan GET /api/ringkasan berjalan dengan baik', async () => {
  const app = buatServer({
    pool: {} as PoolDb,
    formBaseUrl: 'https://point-karawang.netlify.app',
    getWaStatus: () => 'connected',
    db: mockDb,
  })

  const resHealth = await app.handle(new Request('http://localhost/health'))
  expect(resHealth.status).toBe(200)
  expect(await resHealth.json()).toEqual({ ok: true, db: true, wa: 'connected' })

  const resRingkas = await app.handle(new Request('http://localhost/api/ringkasan'))
  expect(resRingkas.status).toBe(200)
  const json = (await resRingkas.json()) as { total: number }
  expect(json.total).toBe(109)
})

test('GET /formulir meneruskan ke URL formulir Netlify sambil menjaga token', async () => {
  const app = buatServer({
    pool: {} as PoolDb,
    formBaseUrl: 'https://point-karawang.netlify.app',
    db: mockDb,
  })

  const res = await app.handle(new Request('http://localhost/formulir?t=abc123'))
  expect(res.status).toBe(302)
  expect(res.headers.get('location')).toBe('https://point-karawang.netlify.app/formulir?t=abc123')
})

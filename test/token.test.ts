import { describe, expect, test } from 'bun:test'
import { buatLinkFormulir, buatTokenFormulir, verifikasiTokenFormulir } from '../src/token'

describe('token formulir', () => {
  const secret = 'rahasia-uji-point'

  test('membuat dan memverifikasi token yang sah', () => {
    const now = 1_700_000_000_000
    const token = buatTokenFormulir('+6287877499993', secret, 3600, now)
    const hasil = verifikasiTokenFormulir(token, secret, now + 1000)
    expect(hasil).toEqual({ nomor: '+6287877499993' })
  })

  test('menolak token yang diubah atau secret berbeda', () => {
    const token = buatTokenFormulir('+6287877499993', secret)
    const rusak = `${token.slice(0, -1)}X`
    expect(verifikasiTokenFormulir(rusak, secret)).toBeNull()
    expect(verifikasiTokenFormulir(token, 'secret-lain')).toBeNull()
  })

  test('menolak token yang sudah kedaluwarsa', () => {
    const now = 1_700_000_000_000
    const token = buatTokenFormulir('+6287877499993', secret, 60, now)
    expect(verifikasiTokenFormulir(token, secret, now + 120_000)).toBeNull()
  })

  test('membuat link umum dan personal', () => {
    expect(buatLinkFormulir('https://point.netlify.app/', secret)).toBe(
      'https://point.netlify.app/formulir',
    )
    const link = buatLinkFormulir('https://point.netlify.app/', secret, '+6287877499993')
    expect(link.startsWith('https://point.netlify.app/formulir?t=')).toBe(true)
  })
})

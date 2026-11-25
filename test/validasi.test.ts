import { describe, expect, test } from 'bun:test'
import {
  hitungKekurangan,
  normalisasiNomor,
  normalisasiPlat,
  parseTanggalLahir,
  validasiKolom,
} from '../src/validasi'

const HARI = new Date(2026, 10, 25)

describe('validasi', () => {
  test('normalisasiNomor menangani 08, 62, +62, typo O, dan menolak yang tidak valid', () => {
    expect(normalisasiNomor('0812-3456-7890')).toBe('+6281234567890')
    expect(normalisasiNomor('62 878 7749 9993')).toBe('+6287877499993')
    expect(normalisasiNomor('+62 856-1157-669')).toBe('+628561157669')
    expect(normalisasiNomor('08O8-1234-5678')).toBe('+6280812345678')
    expect(normalisasiNomor('123')).toBeNull()
    expect(normalisasiNomor('')).toBeNull()
  })

  test('normalisasiPlat menyeragamkan huruf besar tanpa spasi', () => {
    expect(normalisasiPlat('t 1590 be')).toBe('T1590BE')
    expect(normalisasiPlat('D 1715 VBX')).toBe('D1715VBX')
    expect(normalisasiPlat('5')).toBeNull()
    expect(normalisasiPlat('ABC')).toBeNull()
  })

  test('parseTanggalLahir mendukung format ISO, angka, dan bulan Indonesia', () => {
    expect(parseTanggalLahir('1988-10-27', HARI)).toBe('1988-10-27')
    expect(parseTanggalLahir('27/10/1988', HARI)).toBe('1988-10-27')
    expect(parseTanggalLahir('12 Maret 1985', HARI)).toBe('1985-03-12')
    expect(parseTanggalLahir('2015-01-01', HARI)).toBeNull()
    expect(parseTanggalLahir('1930-01-01', HARI)).toBeNull()
    expect(parseTanggalLahir('2000-02-30', HARI)).toBeNull()
  })

  test('validasiKolom memeriksa nama, alamat, dan kendaraan', () => {
    expect(validasiKolom('nama_lengkap', 'Dedi Rusdiyanto', HARI)).toBe('Dedi Rusdiyanto')
    expect(validasiKolom('nama_lengkap', '@point', HARI)).toBeNull()
    expect(validasiKolom('alamat', 'Karawang', HARI)).toBeNull()
    expect(validasiKolom('alamat', 'Perum CKM Blok FL 07 Karawang', HARI)).toBe(
      'Perum CKM Blok FL 07 Karawang',
    )
    expect(validasiKolom('tipe_warna_unit', 'Putih', HARI)).toBeNull()
    expect(validasiKolom('tipe_warna_unit', 'Honda Brio Putih', HARI)).toBe('Honda Brio Putih')
  })

  test('hitungKekurangan mengembalikan kolom kosong sesuai urutan wajib', () => {
    expect(
      hitungKekurangan({
        nama_lengkap: 'Budi',
        tanggal_lahir: null,
        alamat: ' ',
        plat: 'T1590BE',
        tipe_warna_unit: 'Brio Putih',
      }),
    ).toEqual(['tanggal_lahir', 'alamat'])
  })
})

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'ringkasan_anggota',
      description:
        'Mengambil ringkasan jumlah anggota di database: total anggota, yang aktif di grup, status LENGKAP vs DATA_KURANG vs NON_AKTIF, serta jumlah kekurangan per kolom.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'daftar_belum_lengkap',
      description:
        'Mengambil daftar anggota aktif di grup yang datanya masih kurang beserta kolom apa saja yang kurang.',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            enum: ['semua', 'sebagian', 'kosong_total'],
            description:
              'semua = seluruh anggota yang belum lengkap; sebagian = baru terisi sebagian (kurang 1-4 kolom); kosong_total = belum ada data sama sekali (kurang 5 kolom).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cari_anggota',
      description:
        'Mencari anggota berdasarkan nama lengkap, nama kontak, nomor WA, plat nomor, alamat, atau tipe/warna kendaraan.',
      parameters: {
        type: 'object',
        properties: {
          kata_kunci: {
            type: 'string',
            description: 'Kata kunci pencarian (nama, nomor HP, plat, alamat, atau nama mobil/motor).',
          },
        },
        required: ['kata_kunci'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'detail_anggota',
      description: 'Melihat detail profil lengkap satu anggota berdasarkan nomor HP atau nama.',
      parameters: {
        type: 'object',
        properties: {
          nomor_atau_nama: {
            type: 'string',
            description: 'Nomor telepon/WA atau nama anggota.',
          },
        },
        required: ['nomor_atau_nama'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'riwayat_keluar_masuk',
      description: 'Melihat catatan riwayat anggota yang baru masuk atau keluar grup.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maksimal jumlah peristiwa yang diambil (default 15, maksimal 50).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'simpan_data_diri',
      description:
        'Menyimpan atau melengkapi data anggota ke database (hanya mengisi kolom yang masih kosong, atau memperbarui jika diizinkan). Validasi dilakukan otomatis per kolom.',
      parameters: {
        type: 'object',
        properties: {
          nama_lengkap: { type: 'string', description: 'Nama lengkap anggota.' },
          tanggal_lahir: {
            type: 'string',
            description: 'Tanggal lahir, misalnya 1990-05-12 atau 12 Mei 1990.',
          },
          alamat: { type: 'string', description: 'Alamat lengkap tempat tinggal.' },
          plat: { type: 'string', description: 'Nomor plat kendaraan, misalnya T 1590 BE.' },
          tipe_warna_unit: {
            type: 'string',
            description: 'Tipe/merk dan warna kendaraan, misalnya Honda Brio Putih.',
          },
          nomor_target: {
            type: 'string',
            description:
              'Opsional, khusus pengurus/admin untuk mengisikan data anggota lain. Untuk anggota biasa otomatis memakai nomor pengirim sendiri.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'buat_link_formulir',
      description:
        'Mengambil tautan formulir pendaftaran anggota baru POINT di website resmi.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'daftar_pendaftar',
      description:
        'Melihat daftar calon anggota yang sudah mengisi formulir pendaftaran di website (tabel antrean pendaftar).',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['menunggu', 'disetujui', 'ditolak'],
            description: 'Status pendaftar (default: menunggu).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'setujui_pendaftar',
      description:
        'KHUSUS PENGURUS/ADMIN: menyetujui pendaftar dari formulir website dan memindahkan datanya ke tabel resmi anggota.',
      parameters: {
        type: 'object',
        properties: {
          nomor: { type: 'string', description: 'Nomor WhatsApp pendaftar yang disetujui.' },
        },
        required: ['nomor'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'tolak_pendaftar',
      description:
        'KHUSUS PENGURUS/ADMIN: menandai pendaftar dari formulir website sebagai ditolak.',
      parameters: {
        type: 'object',
        properties: {
          nomor: { type: 'string', description: 'Nomor WhatsApp pendaftar yang ditolak.' },
        },
        required: ['nomor'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'mulai_japri_kurang',
      description:
        'KHUSUS PENGURUS/ADMIN: memulai japri santai bertahap lewat chat WA langsung (tanpa link formulir) ke anggota yang datanya belum lengkap agar balasannya diekstrak AI ke database.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maksimal jumlah anggota yang dihubungi pada sesi ini (default 5).',
          },
        },
        required: [],
      },
    },
  },
]

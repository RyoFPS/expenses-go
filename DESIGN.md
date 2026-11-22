# Dompet — Design Guide

Dokumen ini mencatat bahasa visual dan pola interaksi web Dompet yang saat ini diterapkan. Gunakan sebagai acuan saat menambah atau mengubah UI; jangan menganggapnya sebagai spesifikasi fitur baru.

## Produk dan prinsip

Dompet adalah dashboard pencatatan keuangan pribadi berbahasa Indonesia. UI harus membantu pengguna memahami saldo dan aktivitas terbaru dengan cepat, lalu mencatat transaksi tanpa banyak langkah.

- Utamakan angka yang mudah dipindai dan label yang jelas.
- Jaga tampilan tetap ringan, rapi, dan mobile-first.
- Tampilkan status transaksi yang perlu diperiksa secara jelas.
- Gunakan warna yang sama untuk makna uang di seluruh halaman.
- Pertahankan konteks lokal: Rupiah dan waktu Asia/Jakarta.

## Struktur halaman

| Rute | Tujuan |
| --- | --- |
| `/` | Ringkasan saldo, akun, bulan berjalan, arus kas, kategori, dan transaksi terbaru. |
| `/transaksi` | Cari, filter, tinjau, dan telusuri transaksi. |
| `/transaksi/[id]` | Lihat atau ubah detail transaksi, termasuk sumber notifikasinya. |
| `/review` | Tinjau transaksi yang perlu dicek dan notifikasi yang gagal diproses. |
| `/akun` | Kelola akun dan saldo. |
| `/kategori` | Kelola kategori dan aturan kategorisasi otomatis. |
| `/laporan` | Bandingkan arus kas, tren, dan pengeluaran per kategori. |

## Navigasi dan tata letak

- Nama aplikasi: **Dompet**, dengan ikon dompet dan aksen hijau.
- Desktop menggunakan sidebar yang dapat diciutkan. Navigasi memuat Beranda, Transaksi, Review, Akun, Kategori, dan Laporan; tombol **Catat tunai**, badge review, serta toggle tema tersedia di shell.
- Mobile menggunakan header ringkas yang sticky dan navigasi bawah dengan tombol tambah transaksi di tengah. Tautan Akun, Kategori, dan Laporan berada di menu **Lainnya**.
- Hormati safe area perangkat. Jangan menutupi konten dengan navigasi bawah atau drawer.
- Area konten memakai lebar maksimum `max-w-5xl`, padding `px-4` di mobile, dan `md:px-8` di desktop.
- Susun ringkasan dan grafik dalam kartu; gunakan jarak konsisten (`gap-4`) dan biarkan konten bertambah tinggi di layar sempit.

## Warna dan tema

Gunakan token semantik dari [`web/app/globals.css`](web/app/globals.css), bukan warna hard-coded di tiap halaman.

| Token | Makna |
| --- | --- |
| `background`, `foreground` | Latar dan teks utama. |
| `card`, `muted`, `border` | Permukaan, area sekunder, dan pembatas. |
| `primary` | Aksi utama dan identitas hijau Dompet. |
| `income` | Pemasukan. |
| `expense` | Pengeluaran dan status yang perlu perhatian. |
| `transfer` | Transfer antar akun. |

Tema terang memakai latar putih dan permukaan netral bernuansa olive. Tema gelap memakai latar olive gelap. Token `income`, `expense`, dan `transfer` disesuaikan untuk kedua tema; selalu sertakan label atau ikon agar makna tidak bergantung pada warna saja.

Tema awal mengikuti preferensi sistem dan dapat diubah pengguna melalui toggle tema. Pastikan komponen, grafik, popover, drawer, dan dialog tetap terbaca pada kedua tema.

## Tipografi dan angka

- Font antarmuka: **Inter**. Gunakan hierarki sederhana: judul halaman besar, judul kartu sedang, label dan keterangan lebih tenang.
- `Geist Mono` disediakan untuk pola atau nilai yang perlu tampak seperti kode, bukan untuk teks umum.
- Angka uang memakai angka tabular (`.money`) agar digit sejajar saat dibandingkan.
- Format mata uang: `Rp 1.500.000`. Nilai negatif menggunakan tanda minus Unicode, misalnya `−Rp 25.000`.
- Tanggal dan waktu ditampilkan dalam zona `Asia/Jakarta`.

## Komponen

- Komponen dasar berada di [`web/components/ui`](web/components/ui) dan mengikuti konfigurasi shadcn/ui `base-rhea` di [`web/components.json`](web/components.json). Primitive interaktifnya memakai Base UI; ikon memakai Phosphor.
- Gunakan komponen dasar yang sudah ada—seperti Button, Card, Field, Input, Select, Dialog, Drawer, Tabs, Table, Badge, Skeleton, dan AlertDialog—sebelum membuat pola baru.
- Komponen khusus domain berada di `web/components` dan dapat menyusun komponen dasar. Perilaku khusus transaksi atau keuangan tetap berada di komponen domain, bukan di primitive umum.
- Gunakan dialog konfirmasi untuk tindakan yang menghapus data. Tampilkan error dekat konteksnya dan gunakan empty state yang menjelaskan langkah berikutnya.
- Gunakan skeleton yang menyerupai ukuran konten saat data sedang dimuat; hindari layout yang meloncat ketika data muncul.

## Grafik

Semua grafik menggunakan pola chart shadcn/ui dari `web/components/ui/chart`, dengan Recharts sebagai mesin grafik. Gunakan `ChartContainer`, konfigurasi label/warna, tooltip, dan legenda dari komponen lokal tersebut.

- Arus kas memakai seri pemasukan dan pengeluaran.
- Pengeluaran kumulatif membandingkan bulan berjalan dengan bulan sebelumnya.
- Grafik kategori membandingkan kategori atau periode dengan sumbu dan label yang mudah dibaca.
- Gunakan token `income` dan `expense` untuk seri uang. Jangan menyampaikan perbedaan hanya lewat warna; sediakan nama seri, tooltip, atau label.
- Pertahankan label aksesibel dan `accessibilityLayer` pada grafik interaktif.
- Grafik dimuat saat mendekati viewport melalui `web/components/charts/lazy.tsx`; pertahankan lazy loading agar Recharts tidak membebani render awal.

## Pola interaksi

- Tombol **+ / Catat tunai** membuka alur input cepat melalui drawer. Nominal menjadi fokus awal dan memakai keyboard numerik di perangkat mobile.
- Default transaksi memudahkan input: pengeluaran, akun terakhir atau akun tunai, dan waktu saat ini; kategori serta catatan dapat diisi bila perlu.
- Filter dan pencarian transaksi harus tetap mudah digunakan pada lebar mobile. Daftar transaksi tampil sebagai kartu di mobile dan dapat menggunakan tabel di desktop.
- Konfirmasi penghapusan harus menyebut objek yang akan dihapus serta menyediakan pilihan Batal yang jelas.
- Pertahankan skeleton, error state, dan empty state pada setiap layar yang memuat data.

## Aksesibilitas

- Gunakan landmark semantik, judul halaman berurutan, label navigasi, dan `aria-current="page"` untuk rute aktif.
- Setiap kontrol ikon saja harus memiliki accessible name. Pertahankan focus ring yang terlihat dan dukungan keyboard dari komponen UI.
- Beri label pada input/filter; jangan mengandalkan placeholder sebagai satu-satunya instruksi.
- Status review, pemasukan, pengeluaran, dan transfer harus tetap bisa dibedakan tanpa persepsi warna.
- Pastikan tabel, grafik, dialog, drawer, dan navigasi tetap bisa digunakan dengan keyboard serta pembaca layar.

## Panduan perubahan

1. Periksa komponen dan token yang sudah ada sebelum menambahkan pola baru.
2. Pertahankan bahasa UI Indonesia, format Rupiah, dan zona waktu Asia/Jakarta.
3. Uji layout pada lebar mobile dan desktop serta tema terang dan gelap.
4. Jika sistem desain berubah, perbarui token dan komponen lokal terlebih dahulu, lalu sesuaikan dokumen ini.

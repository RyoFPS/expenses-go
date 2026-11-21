# Menambah parser bank / e-wallet

Aturan utama (PRD §10, §17.4): **pola regex hanya boleh ditulis dari notifikasi asli.** Jangan menebak format.

Contoh lengkap yang sudah ada: `backend/app/parsers/bca.py` + `backend/tests/fixtures/bca/` + `backend/tests/test_parser_bca.py`.

## 1. Kumpulkan notifikasi asli

Pasang app Android dan centang app bank/e-wallet tersebut. Notifikasinya tersimpan mentah di server walaupun belum ada
parser (status `ignored`). Ambil contohnya:

```bash
# via API (dari server, AUTH_DISABLED hanya di dev; di produksi lewat browser yang sudah login Access)
curl -s "http://127.0.0.1:8000/api/v1/raw-notifications?parse_status=ignored&package_name=<package>&page_size=200"
```

atau langsung dari database:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "select title, text from raw_notifications where package_name = '"'"'<package>'"'"' order by posted_at desc limit 50"'
```

Target: 20–30 contoh mencakup pemasukan, pengeluaran, transfer (jika ada), dan notifikasi non-transaksi (promo/OTP/info).
**Samarkan** nomor rekening/telepon/nama lengkap sebelum masuk repo (ganti digit dengan `x` / `*`), tetapi jangan ubah
struktur kalimat, spasi, atau format nominal.

## 2. Buat fixture

`backend/tests/fixtures/<sumber>/<nama>.json`:

```json
{
  "source": "Nama App",
  "package_name": "id.contoh.app",
  "provenance": "Notifikasi asli dari HP pengguna, diambil dari raw_notifications pada YYYY-MM-DD; data pribadi disamarkan.",
  "cases": [
    {
      "id": "contoh_expense_1",
      "title": "<judul persis>",
      "text": "<teks persis>",
      "expected": {"type": "expense", "amount": 25000, "merchant": "…", "category_hint": null}
    },
    {
      "id": "contoh_promo_1",
      "title": "<judul promo>",
      "text": "<teks promo>",
      "expected": null
    }
  ]
}
```

`expected: null` = harus diabaikan (bukan transaksi).

## 3. Tulis parser

`backend/app/parsers/<sumber>.py`, implementasi `Parser` (`app/parsers/base.py`):

```python
class ContohParser:
    package_names = {"id.contoh.app"}

    def parse(self, title: str, text: str) -> ParsedTransaction | None:
        ...
```

Pedoman:
- Kembalikan `None` untuk notifikasi non-transaksi → raw `ignored`.
- Raise `ParseError` jika notifikasi **tampak** transaksi (judul/kata kunci dikenal) tetapi isinya tidak cocok pola
  → raw `failed` dan muncul di halaman Review, sehingga format baru tidak hilang diam-diam.
- Nominal selalu lewat `parse_amount()` (`app/parsers/amount.py`): menangani `Rp 1.500.000`, `Rp1.500.000,00`,
  `IDR 25,000`, `IDR 52,760.00`. Jangan pernah `float`.
- `confidence < 0.8` → transaksi dibuat dengan `needs_review = true` (mis. nominal bersen, pola longgar).
- Isi `occurred_at` hanya jika teks memuat waktu (timezone-aware, WIB → UTC); jika tidak, `posted_at` dipakai.
- Isi `balance_after` jika notifikasi memuat saldo → dipakai rekonsiliasi.
- `merchant`, `counterpart_hint` (nama akun tujuan transfer milik sendiri), `category_hint` (kategori dari app) opsional.
- Toleran terhadap spasi/baris baru (`\s+`), tetapi jangan melonggarkan pola sampai menebak format yang belum pernah terlihat.

Daftarkan di `backend/app/parsers/registry.py`:

```python
for _p in (BcaParser(), ContohParser()):
    register(_p)
```

## 4. Test

`backend/tests/test_parser_<sumber>.py`, minimal (PRD §10): 1 pemasukan, 1 pengeluaran, 1 transfer (jika ada),
1 non-transaksi, 1 format nominal berbeda — semuanya dari fixture. Pola dasarnya bisa disalin dari `test_parser_bca.py`
(parametrize semua `cases`, plus test `ParseError` untuk judul dikenal dengan isi tak dikenal).

```bash
make test
```

## 5. Aktifkan

1. Deploy (`git pull && make up-prod`).
2. Pastikan ada **tepat satu akun aktif** dengan `package_name` app tersebut (halaman Akun → Package Android).
3. Proses ulang notifikasi lama: halaman **Review → Gagal dibaca → Parse ulang semua**, dan untuk yang sebelumnya
   `ignored`:
   ```bash
   curl -X POST "http://127.0.0.1:8000/api/v1/raw-notifications/reparse-all?parse_status=ignored"
   ```
   Reparse idempoten: raw yang sudah punya transaksi tidak digandakan.

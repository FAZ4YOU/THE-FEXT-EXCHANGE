# THE FECT EXCHANGE

Crypto exchange UI + savings app + paper trading + portfolio + financial tools.
Gaya visual: **Neo-Brutalism** — White `#FFFFFF`, Black `#000000`, Bright Yellow `#FFD400`.

> ⚠️ **PAPER TRADING = SIMULASI.** Tidak ada uang asli, tidak terhubung ke broker/exchange/bank/payment gateway manapun.

## Menjalankan

Situs ini murni statis (HTML/CSS/JS, tanpa build step) sehingga bisa langsung dibuka atau di-deploy ke **GitHub Pages**.

1. Buka `index.html` langsung di browser, **atau**
2. Push folder ini ke repo GitHub lalu aktifkan GitHub Pages (Settings → Pages → Deploy from branch).

## Struktur Proyek

```
/index.html   → struktur halaman & semua screen
/style.css    → design system neo-brutalism
/app.js       → seluruh logic (state, storage, rendering, trading engine)
/README.md
/assets/
```

## Login — Telegram

Login menggunakan **Telegram username** + **Telegram ID** (bukan password/PIN/seed phrase).
Versi ini adalah **demo front-end saja**: sesi disimpan di `localStorage` perangkat, belum terhubung ke Telegram Login Widget resmi.

Untuk versi production:
- Gunakan [Telegram Login Widget](https://core.telegram.org/widgets/login) resmi di frontend.
- Verifikasi `hash` authentication data di **backend** (bukan di browser).
- Buat session/token di backend setelah verifikasi berhasil.
- Jangan pernah menaruh bot token atau secret apapun di frontend/GitHub.

## Fitur

- **Savings System** — catat income/expense/saving, edit/hapus, cari & filter, saldo otomatis.
- **Savings Target** — target dengan progress %, deadline, estimasi, target utama, auto-detect selesai.
- **Budget Tracker** — budget mingguan & bulanan dengan status Aman / Hampir Habis / Melebihi Budget.
- **Market** — 7 pair (BTC, ETH, SOL, XRP, DOGE, BNB, ADA) dengan harga simulasi yang bergerak real-time (bukan data pasar asli).
- **Paper Trading** — saldo simulasi awal Rp 100.000.000, order MARKET/LIMIT, posisi, order terbuka, histori, realized/unrealized P/L.
- **Trading Chart** — candlestick ringan berbasis `<canvas>`, timeframe 1M/5M/15M/1H/4H/1D.
- **Order Book** — simulasi bid/ask di sekitar harga pasar saat ini.
- **Portfolio** — total portfolio, alokasi aset (chart), P/L keseluruhan.
- **Tools** — 7 kalkulator finansial, statistik (mingguan/bulanan/tahunan), achievement, catatan, export/import/backup/restore/reset (JSON).
- **Notifikasi in-app** — target hampir tercapai, budget hampir habis, target tercapai, streak naik, trade berhasil.
- **Data** — 100% tersimpan di `localStorage` browser, bertahan setelah refresh/tutup browser.

## Catatan Keamanan

Aplikasi ini **tidak pernah** meminta password bank, PIN bank, password/PIN Telegram, private key, seed phrase, atau API key exchange apapun.

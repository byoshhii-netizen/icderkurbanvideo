# İÇDER Kurban Videoları Sitesi

Kurban kesim videolarını bağışçıların isimle arayıp izleyebildiği web sitesi.

## Başlatma

```bash
npm install
npm start
```

Site: http://localhost:3700  
Admin: http://localhost:3700/admin  
Admin şifresi: `icder2025`

## Özellikler

### Site
- İsimle video arama (fuzzy search — yanlış yazım, büyük/küçük harf fark etmez)
- Cloudinary üzerinden video oynatma
- Mobil uyumlu

### Admin Paneli
- Organizasyon yönetimi (aktif org seçimi)
- Bağışçı yönetimi (yeşil = video var, kırmızı = video yok)
- Video ekleme (Cloudinary'ye yükleme + DB kaydı)
- İzleme logları (kim ne aradı, hangi IP'den)
- Logo değiştirme (site + admin panel)
- Numaralı şifre sistemi aktif/pasif
- İÇDER Kurban programından bağışçı aktarma

## Cloudinary

Mevcut `icderrr-clone` projesinin Cloudinary hesabı kullanılıyor.  
Değiştirmek için `src/cloudinary.js` içindeki config'i güncelleyin  
veya environment variable olarak verin:

```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

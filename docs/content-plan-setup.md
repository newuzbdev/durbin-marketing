# Kontent Plan: media saqlash (Cloudflare R2)

Instagram postni **ochiq URL'dan yuklab olib** chiqaradi, shuning uchun media fayllar internetdan
ko'rinadigan joyda saqlanishi kerak (`localhost` ishlamaydi). Biz Cloudflare R2 ishlatamiz: 10 GB bepul,
S3-mos API, lokal development'da ham ishlaydi.

## 1. Bucket

1. https://dash.cloudflare.com → **R2 Object Storage** → **Create bucket** → nom: `durbin-media`.
2. Bucket → **Settings** → **Public Development URL** (`r2.dev`) → **Allow**. `https://pub-xxxx.r2.dev` beriladi.
   Production'da o'rniga o'z domeningizni ulang (Custom Domains).
3. Shu yerda → **CORS Policy**:
   ```json
   [{"AllowedOrigins":["http://localhost:3000"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]
   ```
   Production web domenini ham `AllowedOrigins` ga qo'shing.

## 2. API token

R2 bosh sahifasi → **Manage API tokens** → **Create API token** → ruxsat: **Object Read & Write**,
faqat `durbin-media` bucket. Access Key ID, Secret Access Key va S3 endpoint'ni oling.

## 3. `apps/api/.env`

```
S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_BUCKET="durbin-media"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_PUBLIC_URL="https://pub-xxxx.r2.dev"
```

API'ni qayta ishga tushiring. `S3_*` bo'sh bo'lsa, fayl yuklash 503 qaytaradi, lekin media'siz postlar ishlayveradi.

## Qanday ishlaydi

- Brauzer `POST /api/content/uploads` dan presigned URL oladi va faylni to'g'ridan-to'g'ri R2'ga `PUT` qiladi.
  PNG/WebP brauzerda JPEG'ga o'tkaziladi (Instagram API faqat JPEG qabul qiladi).
- `ContentPublisherService` har daqiqada vaqti kelgan postlarni chiqaradi: container → (video bo'lsa) tayyor
  bo'lishini kutish → `media_publish`. Redis kerak emas.
- Holatlar: `SCHEDULED` → `PUBLISHING` → `PUBLISHED` / `FAILED`. Qo'lda chiqariladigan post 1 soat ichida
  belgilanmasa, avtomatik post esa 6 soatdan ko'p kechiksa (server ishlamagan) — `MISSED`.
- Instagram limiti: sutkasiga 100 ta post (API orqali). Story'da caption, stiker va havola qo'yib bo'lmaydi.

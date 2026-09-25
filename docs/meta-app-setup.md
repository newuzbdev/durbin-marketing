# Meta App sozlash (Instagram + Facebook Ads)

Durbin bitta **Facebook Login for Business** orqali ulanadi: bitta ruxsat oynasi bilan Instagram,
Facebook sahifa, reklama akkaunti va Lead Ads ruxsatlari olinadi.

Kod `META_MODE=mock` da Meta'siz ishlaydi. Quyidagilar bajarilgach `META_MODE=live` ga o'tiladi.

## 0. Oldindan kerak

- Instagram akkaunt **Professional → Business** turida bo'lishi kerak
  (Instagram → Sozlamalar → Akkaunt turi).
- Bu Instagram akkaunt maktabning **Facebook sahifasiga bog'langan** bo'lishi kerak
  (Facebook sahifa → Sozlamalar → Bog'langan akkauntlar → Instagram).
- Sahifa va reklama akkaunti bitta **Business Portfolio** (business.facebook.com) ichida bo'lsa qulay.

## 1. App yaratish

1. https://developers.facebook.com/apps → **Create app**.
2. Use case: **Other** → App type: **Business**.
3. Nom: `Durbin Marketing`, Business Portfolio'ni tanlang.

## 2. Mahsulotlarni qo'shish

App Dashboard → **Add product**:

| Mahsulot | Nima uchun |
|---|---|
| Facebook Login for Business | Ulash tugmasi (OAuth) |
| Instagram (Instagram API with Facebook Login) | Statistika, postlar, kontent chiqarish |
| Messenger → Instagram settings | Direct xabarlar |
| Marketing API | Facebook Ads kampaniyalari |
| Webhooks | Yangi DM va Lead Ads real vaqtda |

## 3. Facebook Login sozlamalari

Facebook Login for Business → **Settings**:

- **Valid OAuth Redirect URIs:** `http://localhost:4000/api/meta/oauth/callback`
  (production'da: `https://<api-domen>/api/meta/oauth/callback`)
- Ixtiyoriy: **Configurations** → yangi konfiguratsiya yarating va quyidagi ruxsatlarni belgilang.
  Hosil bo'lgan ID'ni `META_LOGIN_CONFIG_ID` ga yozing. Bo'sh qolsa, kod ruxsatlarni `scope` orqali so'raydi.

Kod so'raydigan ruxsatlar (`apps/api/src/meta/graph-meta-client.ts` dagi `META_SCOPES`):

```
instagram_basic, instagram_manage_insights, instagram_manage_messages, instagram_content_publish,
pages_show_list, pages_read_engagement, pages_manage_metadata, pages_manage_ads, business_management,
ads_read, ads_management, leads_retrieval
```

## 4. Test foydalanuvchilar (App Review'siz ishlash)

App **Development** rejimida faqat app rolidagi odamlar ulay oladi:
App Dashboard → **App roles → Roles** → o'zingizni **Admin**, sinovchilarni **Tester** qilib qo'shing.
Ular taklifni qabul qilishi kerak (developers.facebook.com → Requests).

## 5. `.env` ga yozish

App Dashboard → **App settings → Basic** dan App ID va App Secret'ni oling.
Keyin `apps/api/.env` ga yozing:

```
META_MODE="live"
META_APP_ID="..."
META_APP_SECRET="..."
META_GRAPH_VERSION="v24.0"   # App Dashboard'da ko'rsatilgan joriy versiyaga moslang
META_REDIRECT_URI="http://localhost:4000/api/meta/oauth/callback"
META_WEBHOOK_VERIFY_TOKEN="<o'zingiz o'ylab topgan tasodifiy satr>"
```

API'ni qayta ishga tushiring. Keyin Durbin → Instagram → **Instagram ulash**.

> Mock rejimdan live'ga o'tganda, mock orqali ulangan akkauntni **Uzish** qilib, qaytadan ulang.

## 6. Instagram Direct xabarlari (Instagram Login app)

Facebook Login yo'li (`/{page-id}/conversations`) Advanced Access'siz **bo'sh** qaytaradi — Live rejimda ham.
Xabarlar alohida **Instagram Login** app orqali keladi:

1. developers.facebook.com → **Create app** → use case: **Manage messaging & content on Instagram** →
   Business Portfolio'siz yaratish.
2. **Use cases → Customize → API setup with Instagram login**.
3. **App roles → Roles → Add People → Instagram Tester**: maktab akkaunti (va sinov uchun yozadigan akkaunt).
   Taklifni brauzerda qabul qiling: instagram.com/accounts/manage_access → **Tester Invites** → Accept.
4. **Generate access tokens → Add account** → maktab akkaunti bilan kiring → **Generate token** →
   `apps/api/.env`: `IG_LOGIN_TOKEN="..."`. Shu sahifadagi **Instagram app secret** → `IG_APP_SECRET="..."`.
5. **Configure webhooks**: Callback URL `https://<api-domen>/api/meta/webhook`, Verify token —
   `META_WEBHOOK_VERIFY_TOKEN` qiymati → **messages** field'iga obuna; akkaunt yonidagi **Webhook Subscription** → On.
   Lokal'da: `cloudflared tunnel --url http://localhost:4000` (manzil har ishga tushganda o'zgaradi).
6. **App settings → Basic**: Privacy Policy URL `https://<web-domen>/privacy`, data deletion `/data-deletion`,
   kategoriya, ikonka → **Publish** (Live rejim). **Development rejimida suhbatlar ham, webhook ham kelmaydi.**
7. API'ni qayta ishga tushiring → Instagram → **Yangilash**. Suhbatlar, xabarlar va javob yuborish shu token orqali ishlaydi.

> Hozircha `IG_LOGIN_TOKEN` bitta akkaunt uchun (sinov yo'li). Production'da har bir maktab
> "Instagram Direct ulash" (Instagram Login OAuth) orqali o'z tokenini saqlashi kerak.

## 7. App Review (hamma maktablar uchun ochish)

Development rejimida faqat Admin/Tester'lar ulay oladi. Boshqa maktablar ham ulay olishi uchun:

- **Business Verification** (Business Portfolio → Security Center)
- Har bir ruxsat uchun **screencast** (funksiya ishlayotgan video) va tavsif
- **Privacy Policy URL** va **Data Deletion** yo'riqnomasi (8-bosqichda sahifasi qo'shiladi)
- App'ni **Live** rejimga o'tkazish

Review bir necha kundan bir necha haftagacha davom etadi. Shuning uchun Meta funksiyalari birinchi quriladi.

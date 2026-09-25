import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Maxfiylik siyosati — Durbin', description: 'Durbin Marketing maxfiylik siyosati' };

const UPDATED = '2026-09-25';
const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function PrivacyPage() {
  return (
    <>
      <h1>Maxfiylik siyosati</h1>
      <p className="text-muted-foreground">Oxirgi yangilanish: {UPDATED}</p>

      <p>
        Durbin Marketing (&quot;Durbin&quot;) — maktablar uchun marketing boshqaruv xizmati. Maktab o‘zining Instagram
        Business akkaunti, Facebook sahifasi va reklama akkauntini ulaydi; Durbin shu ma’lumotlarni faqat o‘sha maktab
        xodimlariga ko‘rsatish va maktab buyrug‘i bilan amallar bajarish uchun ishlatadi.
      </p>

      <h2>Qanday ma’lumotlarni olamiz</h2>
      <ul>
        <li>Hisob ma’lumotlari: ism, email, parol (shifrlangan xesh ko‘rinishida).</li>
        <li>Meta orqali: Instagram akkaunt statistikasi (reach, ko‘rishlar, followerlar), postlar va ularning statistikasi, Direct xabarlar, Facebook sahifa va reklama kampaniyalari ma’lumotlari, Lead Ads formalari orqali kelgan lidlar.</li>
        <li>Maktab kiritgan ma’lumotlar: kontent reja, media fayllar, maqsadlar, lidlar (ism va telefon — ixtiyoriy).</li>
        <li>Maktabning Telegram boti orqali: botga yozgan foydalanuvchining ismi, Telegram username’i va o‘zi yuborgan telefon raqami.</li>
      </ul>

      <h2>Ma’lumotlardan qanday foydalanamiz</h2>
      <ul>
        <li>Statistika, postlar va xabarlarni maktab xodimlariga ko‘rsatish.</li>
        <li>Maktab rejalashtirgan postlarni Instagramga chiqarish va maktab nomidan Direct xabarlarga javob yuborish.</li>
        <li>Marketing maqsadlari bo‘yicha progressni hisoblash va AI yordamchi orqali tahlil tayyorlash.</li>
      </ul>
      <p>Ma’lumotlar sotilmaydi, reklama uchun uchinchi shaxslarga berilmaydi va boshqa maktablarga ko‘rsatilmaydi.</p>

      <h2>Saqlash va himoya</h2>
      <ul>
        <li>Meta va Telegram kirish tokenlari AES-256-GCM bilan shifrlangan holda saqlanadi.</li>
        <li>Har bir maktabning ma’lumotlari alohida; faqat shu maktab a’zolari ko‘ra oladi.</li>
        <li>Media fayllar maktab tomonidan Instagramga chiqarish uchun yuklanadi va post o‘chirilganda o‘chiriladi.</li>
      </ul>

      <h2>Ma’lumotlarni o‘chirish</h2>
      <p>
        Instagram yoki Facebook ulanishini istalgan vaqtda uzish va ma’lumotlarni o‘chirish mumkin — batafsil:{' '}
        <Link href="/data-deletion" className="underline">
          ma’lumotlarni o‘chirish yo‘riqnomasi
        </Link>
        .
      </p>

      <h2>Aloqa</h2>
      <p>
        Savollar bo‘yicha{' '}
        {contact ? (
          <a href={`mailto:${contact}`} className="underline">
            {contact}
          </a>
        ) : (
          'Durbin administratsiyasiga'
        )}{' '}
        murojaat qiling.
      </p>

      <hr className="my-6" />

      <h2 lang="en">Privacy Policy (English summary)</h2>
      <div lang="en" className="grid gap-3">
        <p>
          Durbin Marketing is a marketing management service for schools. A school connects its own Instagram
          Business account, Facebook Page and ad account. We use Meta data (account insights, media and media insights,
          Instagram Direct messages, Page and ad campaign data, Lead Ads leads) only to display it to that school’s staff
          and to perform actions the school requests: publishing scheduled posts, replying to messages, and tracking
          marketing goals.
        </p>
        <p>
          We do not sell data or share it with third parties for advertising. Access tokens are stored encrypted
          (AES-256-GCM), and each school’s data is isolated. Users can disconnect Meta accounts and request deletion at
          any time — see the{' '}
          <Link href="/data-deletion" className="underline">
            data deletion instructions
          </Link>
          .
        </p>
      </div>
    </>
  );
}

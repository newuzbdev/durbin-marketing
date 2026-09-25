import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Ma’lumotlarni o‘chirish — Durbin',
  description: 'Durbin Marketing: foydalanuvchi ma’lumotlarini o‘chirish yo‘riqnomasi',
};

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function DataDeletionPage() {
  return (
    <>
      <h1>Ma’lumotlarni o‘chirish yo‘riqnomasi</h1>

      <h2>1. Durbin ichida</h2>
      <ul>
        <li>Instagram bo‘limi → «Uzish» tugmasi: ulanish, kirish tokeni va yig‘ilgan Instagram statistikasi, postlar va Direct xabarlar darhol o‘chiriladi.</li>
        <li>Maqsadlar bo‘limi → Telegram bot → «Uzish»: bot tokeni o‘chiriladi.</li>
        <li>Kontent Plan’dagi post o‘chirilsa, unga biriktirilgan media fayl ham saqlashdan o‘chiriladi.</li>
      </ul>

      <h2>2. Facebook orqali</h2>
      <ul>
        <li>Facebook → Sozlamalar va maxfiylik → Sozlamalar → Ilovalar va veb-saytlar.</li>
        <li>«Durbin Marketing» ni tanlang va «O‘chirish» (Remove) tugmasini bosing.</li>
        <li>Shundan so‘ng Durbin sizning Meta ma’lumotlaringizga kira olmaydi.</li>
      </ul>

      <h2>3. Hisobni to‘liq o‘chirish</h2>
      <p>
        Maktab hisobi va unga tegishli barcha ma’lumotlarni (maqsadlar, lidlar, kontent reja, media) to‘liq o‘chirish
        uchun{' '}
        {contact ? (
          <a href={`mailto:${contact}`} className="underline">
            {contact}
          </a>
        ) : (
          'Durbin administratsiyasiga'
        )}{' '}
        maktab nomi va hisob emailini yozing. So‘rov 30 kun ichida bajariladi.
      </p>

      <hr className="my-6" />

      <h2 lang="en">Data deletion instructions (English)</h2>
      <div lang="en" className="grid gap-3">
        <p>
          In Durbin, open Instagram → “Uzish” (Disconnect) to immediately delete the connection, the stored access
          token and all synced Instagram data (insights, media, Direct messages).
        </p>
        <p>
          You can also remove the app from Facebook: Settings &amp; privacy → Settings → Apps and websites → Durbin
          Marketing → Remove.
        </p>
        <p>
          To delete a school account and all related data entirely, contact{' '}
          {contact ? (
            <a href={`mailto:${contact}`} className="underline">
              {contact}
            </a>
          ) : (
            'Durbin support'
          )}{' '}
          with the school name and account email; requests are completed within 30 days. See also our{' '}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </>
  );
}

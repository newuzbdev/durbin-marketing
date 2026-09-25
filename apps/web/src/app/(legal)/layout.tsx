import Link from 'next/link';
import { uz } from '@/messages/uz';

// Ochiq huquqiy sahifalar (Meta App Review talabi) — login talab qilinmaydi, serverda to'liq render qilinadi
export default function LegalLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <Link href="/" className="text-muted-foreground hover:text-foreground mb-8 inline-block text-sm">
        {uz.app.name} · {uz.app.section}
      </Link>
      <article className="grid gap-4 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1">
        {children}
      </article>
    </main>
  );
}

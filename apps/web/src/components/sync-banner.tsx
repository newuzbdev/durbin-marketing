import { LoaderIcon } from 'lucide-react';

/** Meta'dan ma'lumot olinayotganini bildiradi — bo'sh nollar "ma'lumot yo'q" deb o'qilmasligi uchun */
export function SyncBanner({ text }: { text: string }) {
  return (
    <p role="status" className="bg-muted/50 mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <LoaderIcon className="size-4 shrink-0 animate-spin" aria-hidden />
      {text}
    </p>
  );
}

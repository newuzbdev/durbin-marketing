import { ComingSoon, PageHeader } from '@/components/page-header';
import { uz } from '@/messages/uz';

export default function ContentPage() {
  return (
    <>
      <PageHeader title='Kontent Plan' description='Postlarni kalendar bo‘yicha rejalashtiring' />
      <ComingSoon text={uz.common.comingSoon} />
    </>
  );
}

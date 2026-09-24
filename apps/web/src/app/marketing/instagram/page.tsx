import { ComingSoon, PageHeader } from '@/components/page-header';
import { uz } from '@/messages/uz';

export default function InstagramPage() {
  return (
    <>
      <PageHeader title='Instagram' description='Akkaunt statistikasi, postlar va Direct xabarlar' />
      <ComingSoon text={uz.common.comingSoon} />
    </>
  );
}

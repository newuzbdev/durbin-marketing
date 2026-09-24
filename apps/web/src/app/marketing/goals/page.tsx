import { ComingSoon, PageHeader } from '@/components/page-header';
import { uz } from '@/messages/uz';

export default function GoalsPage() {
  return (
    <>
      <PageHeader title='Maqsadlar' description='Lid, follower, reach va reklama klik maqsadlari' />
      <ComingSoon text={uz.common.comingSoon} />
    </>
  );
}

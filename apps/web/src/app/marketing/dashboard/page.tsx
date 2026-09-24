import { ComingSoon, PageHeader } from '@/components/page-header';
import { uz } from '@/messages/uz';

export default function DashboardPage() {
  return (
    <>
      <PageHeader title='Dashboard' description='Reach, followerlar, reklama va lidlar — hammasi bir joyda' />
      <ComingSoon text={uz.common.comingSoon} />
    </>
  );
}

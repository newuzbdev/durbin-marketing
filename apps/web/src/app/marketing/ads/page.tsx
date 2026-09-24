import { ComingSoon, PageHeader } from '@/components/page-header';
import { uz } from '@/messages/uz';

export default function AdsPage() {
  return (
    <>
      <PageHeader title='Facebook Ads' description='Reklama kampaniyalari, byudjet va natijalar' />
      <ComingSoon text={uz.common.comingSoon} />
    </>
  );
}

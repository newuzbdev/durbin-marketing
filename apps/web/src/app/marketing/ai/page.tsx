import { ComingSoon, PageHeader } from '@/components/page-header';
import { uz } from '@/messages/uz';

export default function AiPage() {
  return (
    <>
      <PageHeader title='AI Yordamchi' description='Tahlil, kontent taklifi, ssenariy va maslahat' />
      <ComingSoon text={uz.common.comingSoon} />
    </>
  );
}

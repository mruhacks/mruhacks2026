import { BentoCardSkeleton } from '@/app/dashboard/admin/events/[eventId]/_components/bento-card';

export default function DescriptionLoading() {
  return <BentoCardSkeleton rows={5} />;
}

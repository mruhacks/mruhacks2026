import { BentoCardSkeleton } from '@/app/dashboard/admin/events/[eventId]/_components/bento-card';

export default function WikiLoading() {
  return <BentoCardSkeleton rows={4} />;
}

import * as Campaigns from '@/lib/campaigns';
import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<Campaigns.Status, 'outline' | 'info' | 'warning' | 'success' | 'destructive'> = {
  draft: 'outline',
  pending_approval: 'warning',
  scheduled: 'info',
  sending: 'warning',
  sent: 'success',
  cancelled: 'destructive',
};

/** A campaign's status, coloured the same way in the list and on its own page. */
export function CampaignStatusBadge({ status }: { status: Campaigns.Status }) {
  return <Badge variant={VARIANTS[status]}>{Campaigns.STATUS_LABELS[status]}</Badge>;
}

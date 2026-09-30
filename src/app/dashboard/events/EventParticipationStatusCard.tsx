import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Props = {
  /** e.g. "RSVP", "Application" — read together with the badge as a sentence. */
  title: string;
  badgeLabel: string;
  badgeVariant: React.ComponentProps<typeof Badge>['variant'];
  description: string;
  /**
   * Fully-formed "<label> <value>" rows (e.g. a timeline date, a terms
   * acceptance line) — rendered with the same muted, text-sm styling.
   */
  infoRows?: { key: string; content: React.ReactNode }[];
  footer?: React.ReactNode;
};

/**
 * Shared card template for every status card in the event page's
 * participation sidebar (RSVP, application, and any future status of that
 * kind) — title + badge header read as a sentence, a description, a list of
 * info rows, and an optional action footer.
 */
export function EventParticipationStatusCard({
  title,
  badgeLabel,
  badgeVariant,
  description,
  infoRows = [],
  footer,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center gap-2'>
          {title}
          <Badge variant={badgeVariant}>{badgeLabel}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {infoRows.length > 0 && (
        <CardContent className='flex flex-col gap-4'>
          {infoRows.map((row) => (
            <p key={row.key} className='text-muted-foreground text-sm'>
              {row.content}
            </p>
          ))}
        </CardContent>
      )}
      {footer && <CardFooter className='flex flex-row gap-2'>{footer}</CardFooter>}
    </Card>
  );
}

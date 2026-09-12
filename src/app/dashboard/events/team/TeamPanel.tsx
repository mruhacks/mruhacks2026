import { getUser } from '@/utils/auth';
import { getMyTeam } from '@/app/dashboard/events/team-actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TeamCodeDisplay } from './TeamCodeDisplay';
import { TeamRoster } from './TeamRoster';
import { ShareInviteButton } from './ShareInviteButton';
import { JoinTeamDialog } from './JoinTeamDialog';
import { LeaveTeamButton } from './LeaveTeamButton';

type Props = { eventId: string; joinCode?: string };

export async function TeamPanel({ eventId, joinCode }: Props) {
  const currentUser = await getUser();
  if (!currentUser) return null;

  const result = await getMyTeam(eventId);
  if (!result.success || !result.data) return null;

  const { code, organizerId, maxTeamSize, members } = result.data;
  const isOrganizer = organizerId === currentUser.id;
  const memberCount = members.length;
  const memberCountLabel =
    maxTeamSize != null
      ? `${memberCount}/${maxTeamSize} members`
      : `${memberCount} member${memberCount === 1 ? '' : 's'}`;

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base'>Your Team</CardTitle>
          <Badge variant='outline'>{memberCountLabel}</Badge>
        </div>
        <CardDescription>
          Group up with the people you&apos;re attending with.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <TeamCodeDisplay code={code} />
        <TeamRoster
          eventId={eventId}
          members={members}
          currentUserId={currentUser.id}
          isOrganizer={isOrganizer}
        />
        <div className='flex flex-wrap gap-2'>
          <ShareInviteButton eventId={eventId} code={code} />
          <JoinTeamDialog
            eventId={eventId}
            defaultCode={joinCode && joinCode !== code ? joinCode : undefined}
          />
          {memberCount > 1 && <LeaveTeamButton eventId={eventId} />}
        </div>
      </CardContent>
    </Card>
  );
}

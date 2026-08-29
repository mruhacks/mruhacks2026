'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RemoveMemberButton } from './RemoveMemberButton';
import { getInitials } from '@/lib/initials';
import type { TeamMemberView } from '@/app/dashboard/events/team-actions';

type Props = {
  eventId: string;
  members: TeamMemberView[];
  currentUserId: string;
  isOrganizer: boolean;
};

export function TeamRoster({
  eventId,
  members,
  currentUserId,
  isOrganizer,
}: Props) {
  return (
    <ul className='space-y-2'>
      {members.map((member) => (
        <li
          key={member.userId}
          className='flex items-center justify-between gap-2 rounded-md border p-2'
        >
          <div className='flex min-w-0 items-center gap-2'>
            <Avatar className='size-8'>
              {member.image && (
                <AvatarImage src={member.image} alt={member.name} />
              )}
              <AvatarFallback className='text-xs'>
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium'>
                {member.name}
                {member.userId === currentUserId && ' (you)'}
              </p>
              <p className='text-muted-foreground truncate text-xs'>
                {member.email}
              </p>
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            {member.isOrganizer && <Badge variant='outline'>Organizer</Badge>}
            {isOrganizer && member.userId !== currentUserId && (
              <RemoveMemberButton
                eventId={eventId}
                targetUserId={member.userId}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

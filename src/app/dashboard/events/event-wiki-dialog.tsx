'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';

type Article = { slug: string; title: string };

type Props = {
  eventId: string;
  articles: Article[];
};

export function EventWikiDialog({ eventId, articles }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size='sm' variant='ghost'>
          View all
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Event wiki</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col overflow-hidden rounded-lg border'>
          {articles.map((article, index) => (
            <div key={article.slug}>
              {index > 0 && <Separator />}
              <Link
                href={`/dashboard/events/${eventId}/wiki/${article.slug}`}
                className='hover:bg-accent flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors'
              >
                <span>{article.title}</span>
                <ArrowRight className='text-muted-foreground size-4 shrink-0' />
              </Link>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

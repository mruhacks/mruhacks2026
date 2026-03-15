import Link from 'next/link';
import { Button } from '@/components/ui/button';
/*
Standard call to action for main page

Connects user to the discord and registration page
*/

export function CTA() {
  return (
    <section className='h-100'>
      <div>
        <h1 className='text-center text-2xl font-semibold'>
          Ready to participate in
        </h1>
        <h1 className='text-center text-2xl font-semibold'>MRUHacks?</h1>

        <h1 className='text-center text-2xl font-semibold text-gray-400'>
          Let's do it together?
        </h1>
      </div>
      <div className='flex flex-row flex-wrap justify-center gap-3'>
        {/* register button */}
        <Link href='/signup' passHref>
          <Button variant='gradient' size='lg'>
            Register Now
          </Button>
        </Link>

        {/* sponsor button */}
        <Link href='https://discord.com/invite/e7Fg6jsnrm' passHref>
          <Button variant='lavender' size='lg'>
            Discord
          </Button>
        </Link>
      </div>
    </section>
  );
}

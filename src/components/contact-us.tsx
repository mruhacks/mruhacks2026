import Link from 'next/link';

/**
 * ContactUs
 *
 * A full-width contact section with a clickable email link.
 *
 * This component is intended to be used on the homepage.
 */
export function ContactUs() {
  return (
    <section className='w-full bg-black px-4 py-5 sm:px-6 lg:px-16'>
      <div className='max-w-2xl'>
        {/* title */}
        <h2 className='mb-4 text-left text-2xl font-semibold tracking-tight text-white'>
          Reach Out to Us
        </h2>

        {/* email */}
        <Link
          href='mailto:hello@mruhacks.ca'
          className='text-white underline transition-colors hover:text-gray-300'
        >
          hello@mruhacks.ca
        </Link>
      </div>
    </section>
  );
}

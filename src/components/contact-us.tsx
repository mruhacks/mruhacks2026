/**
 * ContactUs
 *
 * A full-width contact section with a clickable email link.
 *
 * This component is intended to be used on the homepage.
 */
export function ContactUs() {
  return (
    <section className='w-full bg-black px-4 py-[20px] sm:px-6 lg:px-16'>
      <div className='max-w-2xl'>
        {/* title */}
        <h2 className='mb-4 text-left text-[24px] font-semibold tracking-tight text-white'>
          Reach Out to Us
        </h2>

        {/* email */}
        <p className='mb-6 text-left text-[16px] text-white'>
          {' '}
          <a
            href='mailto:mruhacks@gmail.com'
            className='underline transition-colors hover:text-gray-300'
          >
            mruhacks@gmail.com
          </a>
        </p>
      </div>
    </section>
  );
}

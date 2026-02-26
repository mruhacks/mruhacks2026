import { ChevronDownIcon } from 'lucide-react';
import { FAQs } from '../content';

/**
 *FAQ
 *
 * An FAQ section for MRUHacks 2026 with a pre-title, main title,
 * and a list of FAQs, each with a question and answer.
 *  - questions are always displayed
 *  - answers are hidden to start but always present in the DOM
 *
 * This component is intended to be used only once on the homepage.
 *
 * @returns section for FAQ
 */
export function FAQ() {
  return (
    <section className='flex w-full justify-start px-6 py-12 sm:px-8 sm:py-16 lg:px-16'>
      <div className='w-full max-w-2xl'>
        {/* pre-title */}
        <p className='text-pre-title-orange mb-2 text-sm font-semibold sm:text-base'>
          FAQ
        </p>

        {/* main title */}
        <h1 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>
          Frequently Asked Questions
        </h1>

        {/* faqs */}
        {FAQs.map((f, i) => {
          return (
            <details key={i} className='group'>
              <summary
                className='mb-2 flex w-full cursor-pointer list-none items-center justify-between text-sm font-semibold sm:text-base'
                style={{
                  height: '2.31em',
                  margin: '0.3125em 0',
                }}
              >
                {f.question}
                <ChevronDownIcon className='size-4 transition-transform duration-200 group-open:rotate-180' />
              </summary>
              <p
                className='text-description mb-6 text-base sm:mb-10 sm:text-lg'
                style={{
                  margin: '0.3125em 0',
                }}
              >
                {f.answer}
              </p>
            </details>
          );
        })}
      </div>
    </section>
  );
}

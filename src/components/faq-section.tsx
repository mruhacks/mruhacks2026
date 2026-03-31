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
    <div className='w-full max-w-2xl'>
      {/* pre-title */}
      <p className='text-pre-title-orange mb-2 text-sm font-semibold sm:text-base'>
        FAQ
      </p>

      {/* main title */}
      <h2 className='mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl'>
        Frequently Asked Questions
      </h2>

      {/* faqs */}
      <div className='flex flex-col'>
        {FAQs.map((f) => {
          return (
            <details key={f.question} className='group border-b border-border py-3 sm:py-4'>
              <summary className='flex w-full cursor-pointer list-none items-center justify-between text-sm font-semibold sm:text-base'>
                {f.question}
                <ChevronDownIcon className='size-4 shrink-0 transition-transform duration-200 group-open:rotate-180' />
              </summary>
              <p className='text-description mt-2 text-sm sm:mt-3 sm:text-base'>
                {f.answer}
              </p>
            </details>
          );
        })}
      </div>
    </div>
  );
}

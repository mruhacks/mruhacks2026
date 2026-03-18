'use client';

/*
Footer

Footer to connect user to standard links for MRUHacks accounts

Footer component is designed for mainpage but should work for everypage it's present within
*/

import {
  LinkedinLogoIcon,
  DiscordLogoIcon,
  InstagramLogoIcon,
} from '@phosphor-icons/react';

export function Footer() {
  return (
    <section className='h-60 bg-black'>
      <footer>
        <div className='flex flex-col justify-start sm:flex-row sm:justify-center sm:space-x-10'>
          <div className='flex items-center pb-4 pl-8 text-2xl font-semibold text-white'>
            <InstagramLogoIcon />
            <a href='https://www.instagram.com/mruhacks/' className='ml-0.5'>
              Instagram
            </a>
          </div>
          <div className='flex items-center pb-4 pl-8 text-2xl font-semibold text-white'>
            <DiscordLogoIcon />
            <a href='https://discord.com/invite/e7Fg6jsnrm' className='ml-0.5'>
              Discord
            </a>
          </div>

          <div className='flex items-center pb-4 pl-8 text-2xl font-semibold text-white'>
            <LinkedinLogoIcon />
            <a
              className='ml-0.5'
              href='https://www.linkedin.com/uas/login?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Fmruhacks%2Fposts%2F%3FfeedView%3Dall'
            >
              Linkedin
            </a>
          </div>
        </div>
      </footer>
    </section>
  );
}

/*

*/

/*
Footer

Footer to connect user to standard links for MRUHacks accounts

Footer component is designed for mainpage but should work for everypage it's present within
*/

export function Footer() {
  return (
    <section className='h-60 bg-black'>
      <footer>
        <h1 className='text-2xl font-semibold text-white'>
          Join Our Community
        </h1>
        <ol>
          <li className='text-l font-semibold text-white'>
            <a href='https://www.instagram.com/mruhacks/'>Instagram</a>
          </li>
          <li className='text-l font-semibold text-white'>
            {' '}
            <a href='https://discord.com/invite/e7Fg6jsnrm'>Discord</a>
          </li>
          <li className='text-l font-semibold text-white'>
            {' '}
            <a href='https://www.linkedin.com/uas/login?session_redirect=https%3A%2F%2Fwww.linkedin.com%2Fcompany%2Fmruhacks%2Fposts%2F%3FfeedView%3Dall'>
              linkedin
            </a>
          </li>
        </ol>
      </footer>
    </section>
  );
}

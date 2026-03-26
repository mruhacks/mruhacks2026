export const EVENT_START_DATE = new Date('2026-10-23T00:00:00-06:00'); // October 23, 2026 (MDT — DST ends Nov 1, 2026)
export const EVENT_DATE_DISPLAY = 'October 23-25, 2026';
export const EVENT_LOCATION_DISPLAY = 'In-Person Event @ Riddell Library';

export const INTRO_BLURB: string = `
MRUHacks is Mount Royal University’s largest hackathon, bringing
students together for an immersive three-day experience focused on
hands-on building, collaboration, and innovation. Hosted at the
Riddell Library and Learning Centre, the event welcomes designers,
developers, and tech enthusiasts of all skill levels.
`;

/**
 * Temporary content (questions/answers) for faq-section
 */
export type FAQItem = { question: string; answer: string };
export const FAQs: FAQItem[] = [
  {
    question: 'What is a Hackathon?',
    answer:
      'You can think of a hackathon as a software science fair. Anyone with an interest in technology attends a hackathon to learn, build & share their creations over the course of a weekend, in a relaxed and welcoming atmosphere. You will bring your ideas to life through technology over the course of 24 hours before showcasing them to a team of judges.',
  },
  {
    question: 'When is MRUHacks?',
    answer:
      'MRUHacks will be held from October 23rd - 25th 2026 in the Riddell Library and Learning Centre.',
  },
  {
    question: 'Who can participate?',
    answer:
      "MRUHacks is open to any and all post-secondary students! Graduated recently? No worries, you're invited too!",
  },
  {
    question: 'How many people can be on a team?',
    answer:
      'Hackers can form teams of up to five people. Team up with anyone regardless of degree, school, or experience level. Looking for a team? Come find one on our Discord.',
  },
  {
    question: 'How much does it cost to participate?',
    answer:
      'Absolutely nothing! We will provide food for the duration of the event as well as swag items for hackers along the way.',
  },
  {
    question: "What if I've never done a hackathon before?",
    answer:
      "MRUHacks is open to everyone no matter their skill level. This is the place for you, whether you're new to coding or a seasoned veteran. Still worried? Stay tuned for a series of workshops to help you brush up on your skills.",
  },
  {
    question: 'Why should I participate?',
    answer:
      'Attending MRUHacks gives you a platform to collaborate with like-minded individuals, learn new skills, and build a sweet project. It is a great opportunity to solve real-world problems, join a community of hackers, and win prizes.',
  },
];

export type StatItem = {
  stats: string;
  info: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  left?: string;
  right?: string;
  rotation?: number;
};
export const StatsText: StatItem[] = [
  {
    stats: '285%',
    info: 'Increase in registrations for MRUHacks 2025, maxing out venue capacity at Riddell Library!',
    image: '/stats-card-image1.png',
    imageWidth: 956,
    imageHeight: 719,
  },
  {
    stats: '40%',
    info: 'More projects finished across 130+ participants, all done during the duration of the hackathon!',
    image: '/stats-card-image2.jpg',
    imageWidth: 1066,
    imageHeight: 800,
  },
  {
    stats: '150+',
    info: 'Total registrations across our workshops, with every workshop having full attendance.',
    image: '/stats-card-image3.jpg',
    imageWidth: 867,
    imageHeight: 797,
  },
  {
    stats: '20+',
    info: 'Volunteer Judges from MRU, Arcurve, Suncor, Enbridge and more!',
    image: '/stats-card-image4.jpg',
    imageWidth: 1000,
    imageHeight: 800,
  },
];

export const StatsDescription: string = `
MRUHacks 2025 was our biggest event yet, with an overwhelming registration 
amount that ended up maxing out our event capacity at Riddell Library.
`;

export const SPONSOR_CTA: string = `
MRUHacks would be impossible to run without our fantastic sponsors.
`;

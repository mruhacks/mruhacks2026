import { StaticImageData } from 'next/image';

// DEV
import Seila from './development/seila.png';
import Sunny from './development/sunny.png';
import Thomas from './development/thomas.png';
import Noah from './development/noah.png';

// MKT
import Soul from './marketing/soul.png';
import Nathan from './marketing/nathan.png';
import Meagan from './marketing/meagan.png';
import Jashan from './marketing/jashan.png';

// EXP
import Justin from './experience/justin.png';
import RamiM from './experience/rami_m.png';
import Manroop from './experience/manroop.png';
import Robel from './experience/robel.png';

import RamiR from './outreach/rami_r.png';
import Ransher from './outreach/ransher.png';

import Kiera from './kiera.png';

export type TeamMember = { name: string; image: StaticImageData };

export const dev: TeamMember[] = [
  { name: 'Noah', image: Noah },
  { name: 'Seila', image: Seila },
  { name: 'Sunny', image: Sunny },
  { name: 'Thomas', image: Thomas },
];

export const mkt: TeamMember[] = [
  { name: 'Jashan', image: Jashan },
  { name: 'Meagan', image: Meagan },
  { name: 'Nathan', image: Nathan },
  { name: 'Soul', image: Soul },
];

export const exp: TeamMember[] = [
  { name: 'Justin', image: Justin },
  { name: 'Manroop', image: Manroop },
  { name: 'Rami M.', image: RamiM },
  { name: 'Robel', image: Robel },
];

export const out: TeamMember[] = [
  { name: 'Rami R.', image: RamiR },
  { name: 'Ransher', image: Ransher },
];

export const dir: TeamMember[] = [{ name: 'Kiera', image: Kiera }];

export const allMembers: TeamMember[] = [
  ...dir,
  ...dev,
  ...exp,
  ...mkt,
  ...out,
];

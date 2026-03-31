import { StaticImageData } from 'next/image';

// DEV
import Seila from './development/Seila.png';
import Sunny from './development/Sunny.png';
import Thomas from './development/Thomas.png';
import Noah from './development/Noah.png';

// MKT
import Soul from './marketing/Soul.png';
import Nathan from './marketing/Nathan.png';
import Meagan from './marketing/Meagan.png';
import Jashan from './marketing/Jashan.png';

// EXP
import Justin from './experience/Justin.png';
import RamiM from './experience/Rami_M.png';
import Manroop from './experience/Manroop.png';
import Robel from './experience/Robel.png';

import RamiR from './outreach/Rami_R.png';
import Ransher from './outreach/Ransher.png';

import Kiera from './Kiera.png';

export type TeamMember = { name: string; image: StaticImageData };

export const dev: TeamMember[] = [
  { name: 'Seila', image: Seila },
  { name: 'Sunny', image: Sunny },
  { name: 'Thomas', image: Thomas },
  { name: 'Noah', image: Noah },
];

export const mkt: TeamMember[] = [
  { name: 'Soul', image: Soul },
  { name: 'Nathan', image: Nathan },
  { name: 'Meagan', image: Meagan },
  { name: 'Jashan', image: Jashan },
];

export const exp: TeamMember[] = [
  { name: 'Justin', image: Justin },
  { name: 'Rami M.', image: RamiM },
  { name: 'Manroop', image: Manroop },
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
  ...mkt,
  ...exp,
  ...out,
];

import { StaticImageData } from 'next/image';

// DEV
import Seila from './development/seila.png';
import Sunny from './development/sunny.png';
import Thomas from './development/thomas.png';
import Noah from './development/luqman.png';

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

const dev: TeamMember[] = [
  { name: 'Thomas', image: Thomas },
  { name: 'Sunny', image: Sunny },
  { name: 'Seila', image: Seila },
  { name: 'Noah', image: Noah },
];

const mkt: TeamMember[] = [
  { name: 'Jashan', image: Jashan },
  { name: 'Nathan', image: Nathan },
  { name: 'Meagan', image: Meagan },
  { name: 'Soul', image: Soul },
];

const exp: TeamMember[] = [
  { name: 'Manroop', image: Manroop },
  { name: 'Rami M.', image: RamiM },
  { name: 'Robel', image: Robel },
  { name: 'Justin', image: Justin },
];

const out: TeamMember[] = [
  { name: 'Ransher', image: Ransher },
  { name: 'Rami R.', image: RamiR },
];

const dir: TeamMember[] = [{ name: 'Kiera', image: Kiera }];

export const allMembers: TeamMember[] = [
  ...dir,
  ...dev,
  ...exp,
  ...mkt,
  ...out,
];

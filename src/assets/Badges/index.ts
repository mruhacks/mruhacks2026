import { StaticImageData } from 'next/image';

// DEV
import Seila from './dev/Seila.png';
import Sunny from './dev/Sunny.png';
import Thomas from './dev/Thomas.png';
import Noah from './dev/Noah.png';

// MKT
import Soul from './mkt/Soul.png';
import Nathan from './mkt/Nathan.png';
import Meagan from './mkt/Meagan.png';
import Jashan from './mkt/Jashan.png';

// EXP
import Justin from './exp/Justin.png';
import RamiM from './exp/Rami_M.png';
import Manroop from './exp/Manroop.png';
import Robel from './exp/Robel.png';

import RamiR from './out/Rami_R.png';
import Ransher from './out/Ransher.png';

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
  ...dev,
  ...mkt,
  ...exp,
  ...out,
  ...dir,
];

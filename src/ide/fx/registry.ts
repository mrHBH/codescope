import type { Fx } from './types';
import { cloth } from './cloth';
import { matrix } from './matrix';
import { heartbeat } from './heartbeat';
import { glitch } from './glitch';
import { aurora } from './aurora';
import { blackhole } from './blackhole';
import { earthquake } from './earthquake';
import { fireworks } from './fireworks';
import { supernova } from './supernova';
import { dissolve } from './dissolve';
import { logo } from './logo';
import { ocean } from './ocean';
import { dome } from './dome';
import { fan } from './fan';
import { tornado } from './tornado';
import { standup } from './standup';
import { curl } from './curl';
import { shatter } from './shatter';
import { ripple } from './ripple';
import { helix } from './helix';
import { physics } from './physics';
import { physics2 } from './physics2';

export const FX_NAMES = [
  'off',
  'cloth', 'matrix', 'heartbeat', 'glitch', 'aurora', 'blackhole', 'earthquake',
  'fireworks', 'supernova', 'dissolve', 'logo',
  'ocean', 'dome', 'fan', 'tornado', 'standup', 'curl', 'shatter', 'ripple', 'helix',
  'physics', 'physics2',
] as const;
export type FxMode = typeof FX_NAMES[number];

export const REG: Record<string, Fx | null> = {
  off: null,
  cloth, matrix, heartbeat, glitch, aurora, blackhole, earthquake,
  fireworks, supernova, dissolve, logo,
  ocean, dome, fan, tornado, standup, curl, shatter, ripple, helix,
  physics, physics2,
};

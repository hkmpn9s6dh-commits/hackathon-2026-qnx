import minimal from './minimal-x86_64.build?raw'
import consoleDark from './console-dark.build?raw'
import trimmed from './trimmed-image.build?raw'
import sCore from './s-core-init.build?raw'

export interface Sample {
  id: string
  label: string
  note: string
  text: string
}

export const SAMPLES: Sample[] = [
  {
    id: 'console-dark',
    label: 'console-dark.build',
    note: 'Boots to a dead console — three errors',
    text: consoleDark,
  },
  {
    id: 'minimal',
    label: 'minimal-x86_64.build',
    note: 'The documented minimal image — clean',
    text: minimal,
  },
  {
    id: 'trimmed',
    label: 'trimmed-image.build',
    note: 'Lost two lines in a refactor',
    text: trimmed,
  },
  {
    id: 's-core',
    label: 's-core-init.build',
    note: 'Real buildfile from the Eclipse s-core project',
    text: sCore,
  },
]

/**
 * What a QNX component provides once it is running.
 *
 * This table is deliberately conservative: it only lists paths that QNX
 * documents for a component, so a finding built on top of it is defensible.
 * Anything not listed is treated as "unknown", never as "missing".
 */
export interface Provider {
  /** Prefix match against the executable name (without path). */
  match: RegExp
  /** Paths the component publishes once it has started. `*` is a wildcard. */
  provides: string[]
  /** Human label used in the UI. */
  kind: 'driver' | 'service' | 'kernel' | 'application' | 'filesystem' | 'network'
  /** Short note shown in the inspector. */
  note?: string
}

export const PROVIDERS: Provider[] = [
  {
    match: /^procnto/,
    provides: ['/dev/shmem', '/dev/null', '/dev/zero'],
    kind: 'kernel',
    note: 'Microkernel + process manager. Everything else is a process next to it.',
  },
  {
    match: /^startup-/,
    provides: [],
    kind: 'kernel',
    note: 'BSP startup: sets up memory, timers and the debug channel, then hands over to procnto.',
  },
  {
    match: /^devc-ser/,
    provides: ['/dev/ser*'],
    kind: 'driver',
    note: 'Serial port driver — creates /dev/serN as it claims each UART.',
  },
  {
    match: /^devc-con/,
    provides: ['/dev/con*', '/dev/text'],
    kind: 'driver',
    note: 'Console driver — creates /dev/conN (the text console).',
  },
  {
    match: /^devc-pty/,
    provides: ['/dev/pty*', '/dev/tty*'],
    kind: 'driver',
  },
  {
    match: /^devb-/,
    provides: ['/dev/hd*', '/dev/cd*'],
    kind: 'driver',
    note: 'Block device driver (devb-*) — block devices only, mountable filesystems come later.',
  },
  {
    match: /^(io-pkt|io-sock)/,
    provides: ['/dev/socket', '/dev/io-net'],
    kind: 'network',
    note: 'Network stack. Interfaces appear only after the driver inside it attaches.',
  },
  {
    match: /^fs-/,
    provides: ['/dev/fs*'],
    kind: 'filesystem',
    note: 'Filesystem manager — exposes a mount point, it does not create the block device.',
  },
  {
    match: /^pipe$/,
    provides: ['/dev/pipe'],
    kind: 'service',
  },
  {
    match: /^mqueue$/,
    provides: ['/dev/mqueue'],
    kind: 'service',
  },
  {
    match: /^(random|slogger2|tracelogger)$/,
    provides: ['/dev/random', '/dev/slog', '/dev/trace'],
    kind: 'service',
  },
  {
    match: /^screen$/,
    provides: ['/dev/screen'],
    kind: 'service',
    note: 'QNX Screen — graphics compositor. Nothing draws before it is up.',
  },
  {
    match: /^pci-server/,
    provides: ['/dev/pci'],
    kind: 'service',
    note: 'PCI server — must be up before any driver that enumerates PCI devices.',
  },
]

export function lookupProvider(name: string): Provider | undefined {
  const base = name.split('/').pop() ?? name
  return PROVIDERS.find((p) => p.match.test(base))
}

/** Does a concrete path match one of a provider's wildcard patterns? */
export function pathMatches(pattern: string, path: string): boolean {
  if (pattern === path) return true
  const star = pattern.indexOf('*')
  if (star === -1) return false
  const head = pattern.slice(0, star)
  return path.startsWith(head)
}

/** True when `arg` looks like a device path a driver has to create first. */
export function isDevicePath(arg: string): boolean {
  return /^\/dev\/[A-Za-z0-9._*-]+$/.test(arg)
}

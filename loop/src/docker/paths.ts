/**
 * Windows → Docker path translation (task 154; бандл A0 §Алгоритм Windows-to-Docker трансляции).
 *
 * Docker Desktop's engine runs in WSL2 and mounts the Windows filesystem under `/c`, `/d`, … A bind
 * mount therefore cannot be given the path Windows uses; it has to be given the path the Linux VM
 * uses for the same directory. That translation is one of the few places in the loop where getting
 * it subtly wrong is silent: a mount with a malformed source does not fail loudly, it produces an
 * **empty directory inside the container**, and the executor then reports that the workspace has no
 * files in it — a symptom that looks like a bad task, not a bad path.
 *
 * So it is a pure function with golden cases, not a `replace` at a call site.
 */

const DRIVE = /^([a-zA-Z]):(?=[\\/]|$)/;

/**
 * The path Docker should be given for a Windows path.
 *
 * Already-POSIX paths pass through untouched: on Linux and on CI the host path *is* the Docker
 * path, and a translation that mangled `/var/run` would break the very platform the integration
 * test runs on.
 */
export function translateWindowsPathToDocker(windowsPath: string): string {
  const forward = windowsPath.replaceAll('\\', '/');
  const drive = DRIVE.exec(forward);

  const translated =
    drive === null ? forward : `/${(drive[1] ?? '').toLowerCase()}${forward.slice(2)}`;

  return collapseSlashes(translated);
}

/**
 * `C://Users` and `C:\\Users` are the same directory, and a doubled separator inside a bind mount
 * source is one of the ways Docker quietly mounts nothing. UNC prefixes are not preserved because a
 * UNC path has no drive letter to translate and cannot be bind-mounted this way at all.
 */
function collapseSlashes(value: string): string {
  return value.replace(/\/{2,}/g, '/');
}

/**
 * A bind mount, rendered as the Engine API's `HostConfig.Binds` entry wants it.
 *
 * The container side is used verbatim: it is a Linux path chosen by us, never a host path, so
 * translating it would be translating something that was never Windows.
 */
export function bindMount(
  hostPath: string,
  containerPath: string,
  mode: 'rw' | 'ro' = 'rw',
): string {
  return `${translateWindowsPathToDocker(hostPath)}:${containerPath}:${mode}`;
}

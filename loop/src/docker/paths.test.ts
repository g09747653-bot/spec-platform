import { describe, expect, it } from 'vitest';

import { bindMount, translateWindowsPathToDocker } from './paths.ts';

/**
 * The golden cases of the path translation (task 154).
 *
 * Golden rather than illustrative: a mount whose source path is malformed does not fail — it mounts
 * an empty directory, and the executor then reports an empty workspace. Every case below is a shape
 * the customer's machine actually produces.
 */
describe('translateWindowsPathToDocker (task 154)', () => {
  const cases: [name: string, windows: string, docker: string][] = [
    [
      'the A0 example',
      'C:\\Users\\Owner\\workspace\\project1',
      '/c/Users/Owner/workspace/project1',
    ],
    ['a drive letter is lower-cased', 'D:\\Projects', '/d/Projects'],
    ['a lower-case drive stays lower-case', 'e:\\build', '/e/build'],
    ['deep nesting', 'C:\\a\\b\\c\\d\\e\\f\\g', '/c/a/b/c/d/e/f/g'],
    ['spaces survive', 'C:\\Program Files\\My App', '/c/Program Files/My App'],
    [
      'Cyrillic survives',
      'C:\\Users\\Владелец\\Рабочий стол\\проект',
      '/c/Users/Владелец/Рабочий стол/проект',
    ],
    ['a bare drive root', 'C:\\', '/c/'],
    ['a drive with no trailing separator', 'C:', '/c'],
    ['mixed separators', 'C:/Users\\Owner/workspace', '/c/Users/Owner/workspace'],
    ['doubled separators collapse', 'C:\\\\Users\\\\Owner', '/c/Users/Owner'],
    ['a path that is already POSIX passes through', '/var/run/docker.sock', '/var/run/docker.sock'],
    ['a relative path is left alone', 'workspace\\project', 'workspace/project'],
  ];

  it.each(cases)('%s', (_name, windows, docker) => {
    expect(translateWindowsPathToDocker(windows)).toBe(docker);
  });

  it('is idempotent — translating a translated path changes nothing', () => {
    for (const [, windows] of cases) {
      const once = translateWindowsPathToDocker(windows);
      expect(translateWindowsPathToDocker(once)).toBe(once);
    }
  });

  it('never leaves a backslash or a colon-drive behind', () => {
    for (const [, windows] of cases) {
      const translated = translateWindowsPathToDocker(windows);
      expect(translated).not.toContain('\\');
      expect(translated).not.toMatch(/^[a-zA-Z]:/);
    }
  });

  it('does not mistake a colon inside a name for a drive letter', () => {
    // Only a single letter followed by `:` and a separator is a drive. `CD:` is a directory name.
    expect(translateWindowsPathToDocker('C:\\notes\\CD:archive')).toBe('/c/notes/CD:archive');
  });
});

describe('bindMount (task 154)', () => {
  it('translates the host side and leaves the container side alone', () => {
    expect(bindMount('C:\\Users\\Owner\\workspace\\p1', '/workspace')).toBe(
      '/c/Users/Owner/workspace/p1:/workspace:rw',
    );
  });

  it('carries the mode it is given', () => {
    expect(bindMount('/srv/data', '/data', 'ro')).toBe('/srv/data:/data:ro');
  });
});

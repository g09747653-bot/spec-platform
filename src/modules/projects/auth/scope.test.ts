import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from 'next-auth';

import type * as EnvModule from '@/config/env';
import { testEnv } from '@/config/testing/test-env';
import { OwnerScope } from '@/db/owner-scope';

import type * as LocalOwnerModule from './local-owner';

/*
 * Three seams, mocked: the Auth.js session (whose behaviour is the independent variable here), the
 * configuration flag, and the local owner resolution (exercised for real in `local-owner.test.ts`;
 * here it only has to be recognisably itself).
 */
vi.mock('./index', () => ({ auth: vi.fn(), SIGN_IN_PATH: '/signin' }));

let envSource: Record<string, string> = testEnv();

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();

  return { ...actual, getEnv: () => actual.parseEnv(envSource) };
});

vi.mock('./local-owner', async (importOriginal) => {
  const actual = await importOriginal<typeof LocalOwnerModule>();

  return { ...actual, localOwnerScope: vi.fn() };
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
}));

import { auth } from './index';
import { localOwnerScope } from './local-owner';
import { currentOwnerScope, currentSessionUser } from './scope';

const session = vi.mocked(auth);
const owner = vi.mocked(localOwnerScope);

const configured = (localSingleUser: boolean) => {
  envSource = testEnv(localSingleUser ? { LOCAL_SINGLE_USER: '1' } : {});
};

const signedInAs = (id: string) => {
  const live: Session = {
    user: { id, email: `${id}@example.test` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };

  session.mockResolvedValue(live as never);
};

const LOCAL_OWNER_ID = '99999999-9999-4999-8999-999999999999';

describe('currentOwnerScope (tasks 14, 148)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured(false);
  });

  describe('with the flag off — every hosted deployment', () => {
    it('derives the scope from the authenticated session', async () => {
      signedInAs('a-user-id');

      const scope = await currentOwnerScope();

      expect(scope).toBeInstanceOf(OwnerScope);
      expect(scope?.userId).toBe('a-user-id');
    });

    it('answers null for an anonymous request', async () => {
      session.mockResolvedValue(null as never);

      expect(await currentOwnerScope()).toBeNull();
    });

    it('does not swallow an Auth.js failure — a hosted misconfiguration must fail loudly', async () => {
      session.mockRejectedValue(new Error('MissingSecret'));

      await expect(currentOwnerScope()).rejects.toThrow('MissingSecret');
    });
  });

  describe('with the flag on — the local single-user deployment (task 148)', () => {
    beforeEach(() => {
      configured(true);
      owner.mockResolvedValue(OwnerScope.forAuthenticatedUser(LOCAL_OWNER_ID));
    });

    it('resolves an anonymous request to the fixed local owner', async () => {
      session.mockResolvedValue(null as never);

      const scope = await currentOwnerScope();

      expect(scope?.userId).toBe(LOCAL_OWNER_ID);
    });

    it('still authenticates a live session — the suite’s planted users stay themselves', async () => {
      signedInAs('a-planted-user');

      const scope = await currentOwnerScope();

      expect(scope?.userId).toBe('a-planted-user');
    });

    it('treats an unconfigured Auth.js as "nobody is signed in" and serves the owner', async () => {
      session.mockRejectedValue(new Error('MissingSecret'));

      const scope = await currentOwnerScope();

      expect(scope?.userId).toBe(LOCAL_OWNER_ID);
    });
  });
});

describe('currentSessionUser (task 148)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured(false);
  });

  it('hands the layout the session user when there is one', async () => {
    signedInAs('someone');

    expect((await currentSessionUser())?.id).toBe('someone');
  });

  it('answers null for an anonymous request, in either kind of deployment', async () => {
    session.mockResolvedValue(null as never);

    expect(await currentSessionUser()).toBeNull();

    configured(true);
    expect(await currentSessionUser()).toBeNull();
  });
});

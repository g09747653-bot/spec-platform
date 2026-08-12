import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { isPublicPath, proxy } from './proxy';

/**
 * Task 14 — what the proxy turns away and what it lets through.
 *
 * Pure: a `NextRequest` is constructed by hand, so no server, no database and no session are needed
 * to assert the redirect and the 401 (NFR-012 AC-2).
 */
const request = (path: string, cookie?: string) => {
  const built = new NextRequest(new URL(`http://localhost:3000${path}`));
  if (cookie !== undefined) built.cookies.set(cookie, 'a-session-token');
  return built;
};

describe('proxy (task 14)', () => {
  describe('an unauthenticated request', () => {
    it('is redirected to sign-in when it targets a project route (FR-001 AC-5)', () => {
      const response = proxy(request('/projects'));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost:3000/signin');
    });

    it('is redirected without disclosing whether the requested project exists', () => {
      const real = proxy(request('/projects/11111111-2222-3333-4444-555555555555'));
      const imaginary = proxy(request('/projects/99999999-8888-7777-6666-555555555555'));

      expect(real.status).toBe(imaginary.status);
      expect(real.headers.get('location')).toBe(imaginary.headers.get('location'));
      // The location carries no trace of what was asked for.
      expect(real.headers.get('location')).not.toContain('1111');
    });

    it('receives UNAUTHENTICATED with status 401 on an API route', async () => {
      const response = proxy(request('/api/projects'));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
      });
    });
  });

  describe('a request carrying a session cookie', () => {
    it('is passed through for the handler to verify against the database', () => {
      for (const name of ['authjs.session-token', '__Secure-authjs.session-token']) {
        const response = proxy(request('/projects', name));

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      }
    });

    it('is not treated as authorised — ownership is still the query’s decision', () => {
      // The proxy cannot know whose project this is; it only proves the request is worth handling.
      const response = proxy(request('/api/projects/someone-elses', 'authjs.session-token'));

      expect(response.status).toBe(200);
    });
  });

  describe('public paths', () => {
    it('lets the sign-in screen and the OAuth endpoints through unauthenticated', () => {
      for (const path of [
        '/',
        '/signin',
        '/api/auth/signin',
        '/api/auth/callback/google',
        '/api/auth/csrf',
      ]) {
        expect(isPublicPath(path)).toBe(true);
        expect(proxy(request(path)).status).toBe(200);
      }
    });

    it('does not treat a lookalike path as public', () => {
      for (const path of ['/projects', '/api/projects', '/signin-please', '/api/authorise']) {
        expect(isPublicPath(path)).toBe(false);
      }
    });
  });
});

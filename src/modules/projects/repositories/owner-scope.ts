/**
 * Authorization as a type, not a habit (NFR-005; AR-2; solution.md D-13).
 *
 * Every repository method that reads or writes project-scoped data takes an `OwnerScope` as its
 * **first** parameter and injects `owner_id = scope.userId` into the query. There is no unscoped
 * read path, so a handler cannot forget the check — the call does not compile without a scope.
 *
 * `OwnerScope` is a class with a private field and a private constructor, which is what makes that
 * guarantee real rather than decorative: a structurally similar object literal is **not** assignable
 * to it, so a scope cannot be assembled from a request body. `forAuthenticatedUser` is the only way
 * to obtain one, and its call sites are therefore a complete audit of where authorization
 * originates — the authenticated session, never a client-supplied identifier (NFR-005 AC-3).
 */
export class OwnerScope {
  /** Nominality marker. Its presence is what an object literal cannot satisfy. */
  private readonly nominal = 'owner-scope';

  private constructor(readonly userId: string) {}

  /** Derives the scope from an authenticated identity. Pass the user id from `auth()`, nothing else. */
  static forAuthenticatedUser(userId: string): OwnerScope {
    if (userId.trim() === '') {
      throw new Error('OwnerScope requires an authenticated user id');
    }

    return new OwnerScope(userId);
  }

  /** Keeps the private field from reading as unused to a linter, and makes the brand printable. */
  toString(): string {
    return `${this.nominal}(${this.userId})`;
  }
}

/** Raised when a scoped read finds nothing: missing and not-owned are the same answer (AR-2). */
export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

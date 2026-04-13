/** Platform-agnostic representation of a signed-in user. */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Authentication contract.
 * Current implementation: Firebase Auth (lib/firebase/FirebaseAuthProvider.ts)
 * Future: Azure AD B2C or any other provider.
 */
export interface IAuthProvider {
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** Subscribe to auth state changes. Returns an unsubscribe function. */
  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void;
  /** Sends a password reset email to the given address if an account exists. */
  sendPasswordReset(email: string): Promise<void>;
}

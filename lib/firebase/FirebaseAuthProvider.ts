import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import app from "@/lib/firebase";
import { IAuthProvider, AuthUser } from "@/lib/repositories/IAuthProvider";

export class FirebaseAuthProvider implements IAuthProvider {
  private auth = getAuth(app);

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { user } = await signInWithEmailAndPassword(this.auth, email, password);
    return { uid: user.uid, email: user.email, displayName: user.displayName };
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
  }

  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
    return firebaseOnAuthStateChanged(this.auth, (firebaseUser) => {
      callback(
        firebaseUser
          ? { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName }
          : null,
      );
    });
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }
}

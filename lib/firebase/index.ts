/**
 * Platform wiring — the only file that needs to change when migrating to a
 * different backend (e.g. Azure Cosmos DB + Azure AD B2C).
 *
 * Every service file imports its dependency from here, never directly from a
 * Firebase-specific module.
 */
import { IAuthProvider } from "@/lib/repositories/IAuthProvider";
import { IDriverRepository } from "@/lib/repositories/IDriverRepository";
import { IHosRepository } from "@/lib/repositories/IHosRepository";
import { INotificationRepository } from "@/lib/repositories/INotificationRepository";

import { FirebaseAuthProvider } from "./FirebaseAuthProvider";
import { FirebaseDriverRepository } from "./FirebaseDriverRepository";
import { FirebaseHosRepository } from "./FirebaseHosRepository";
import { FirebaseNotificationRepository } from "./FirebaseNotificationRepository";

export const authProvider: IAuthProvider = new FirebaseAuthProvider();
export const driverRepository: IDriverRepository = new FirebaseDriverRepository();
export const hosRepository: IHosRepository = new FirebaseHosRepository();
export const notificationRepository: INotificationRepository =
  new FirebaseNotificationRepository();

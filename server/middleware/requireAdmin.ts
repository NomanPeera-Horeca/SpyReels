import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";

/**
 * Enforces single-owner admin panel access via `ADMIN_EMAIL`.
 * Uses NOT_FOUND so non-admins cannot probe whether the route exists.
 */
export function assertAdminEmailUser(user: User | null | undefined): asserts user is User {
  if (!user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
  const expected = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const got = user.email?.trim().toLowerCase() ?? "";
  if (!expected || got !== expected) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
}

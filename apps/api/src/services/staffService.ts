import type { StaffCreateInput, StaffUpdateInput, User } from "@quickmenu/shared";
import { ApiError } from "../errors";
import { hashPassword } from "../lib/password";
import * as users from "../repositories/users";

/** FR-05: owners see the kitchen accounts of their own restaurant. */
export async function list(restaurantId: string): Promise<User[]> {
  const all = await users.listByRestaurant(restaurantId);
  return all.filter((u) => u.role === "kitchen");
}

/** FR-05: only owners can create kitchen accounts (role is forced). */
export async function create(
  restaurantId: string,
  input: StaffCreateInput
): Promise<User> {
  if (await users.getByEmail(input.email)) {
    throw new ApiError(409, "CONFLICT", "An account with that email already exists.");
  }
  const passwordHash = await hashPassword(input.password);
  return users.create(restaurantId, {
    email: input.email,
    name: input.name,
    passwordHash,
    role: "kitchen",
  });
}

async function getKitchenUser(restaurantId: string, id: string): Promise<User> {
  const user = await users.getById(restaurantId, id);
  if (!user) throw new ApiError(404, "NOT_FOUND", "Staff member not found.");
  if (user.role !== "kitchen") {
    throw new ApiError(403, "FORBIDDEN", "Only kitchen accounts can be managed here.");
  }
  return user;
}

/** FR-05: update name, active flag, or reset the password. */
export async function update(
  restaurantId: string,
  id: string,
  patch: StaffUpdateInput
): Promise<User> {
  const target = await getKitchenUser(restaurantId, id);

  if (patch.password) {
    await users.updatePassword(target.id, await hashPassword(patch.password));
  }
  const updated = await users.update(restaurantId, id, {
    name: patch.name,
    isActive: patch.isActive,
  });
  return updated!;
}

/** FR-05: remove a kitchen account; owners cannot delete themselves. */
export async function remove(
  restaurantId: string,
  id: string,
  actorUserId: string
): Promise<void> {
  const target = await users.getById(restaurantId, id);
  if (!target) throw new ApiError(404, "NOT_FOUND", "Staff member not found.");
  if (target.id === actorUserId) {
    throw new ApiError(400, "VALIDATION_ERROR", "You cannot delete your own account.");
  }
  if (target.role !== "kitchen") {
    throw new ApiError(403, "FORBIDDEN", "Only kitchen accounts can be removed.");
  }
  await users.deleteUser(restaurantId, id);
}

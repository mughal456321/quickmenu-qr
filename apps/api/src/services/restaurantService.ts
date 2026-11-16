import type { Restaurant, RestaurantUpdateInput } from "@quickmenu/shared";
import { ApiError } from "../errors";
import * as restaurants from "../repositories/restaurants";

/** FR-01: any member can read their restaurant profile. */
export async function get(restaurantId: string): Promise<Restaurant> {
  const restaurant = await restaurants.getById(restaurantId);
  if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
  return restaurant;
}

/** FR-01: owners edit name, default language, and currency. */
export async function update(
  restaurantId: string,
  patch: RestaurantUpdateInput
): Promise<Restaurant> {
  const restaurant = await restaurants.update(restaurantId, patch);
  if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant not found.");
  return restaurant;
}

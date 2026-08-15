/**
 * Mission picker. Missions are always achievable: the price ramps gently and is
 * capped, diamonds respawn, and there is no timer and no way to lose.
 */
import { MISSION_COST, MISSION_COST_MAX } from './config.js';
import { pick } from './rng.js';

export function createMissions(mall) {
  let index = 0;
  let current = null;
  const recent = [];

  return {
    get current() {
      return current;
    },
    get completed() {
      return index;
    },

    /** Picks a shop that has not come up in the last few missions. */
    next() {
      const candidates = mall.shops.filter((s) => !recent.includes(s.id));
      const shop = pick(candidates.length ? candidates : mall.shops, mall.rng);

      recent.push(shop.id);
      if (recent.length > Math.min(6, mall.shops.length - 1)) recent.shift();

      const cost = Math.min(
        MISSION_COST_MAX,
        MISSION_COST[Math.min(index, MISSION_COST.length - 1)],
      );

      current = { shop, item: pick(shop.items, mall.rng), cost };
      index++;
      return current;
    },

    clear() {
      current = null;
    },
  };
}

import { FLAG_AT_POD, FLAG_DROPPED } from './protocol.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Objective utility deliberately dwarfs combat utility, as in the Rust bots. */
export function chooseObjective(state) {
  const own = state.flags[state.team];
  const enemy = state.flags[1 - state.team];
  const me = state.players.get(state.id);
  const carrying = enemy.state === state.id;

  if (carrying) {
    if (own.state === FLAG_AT_POD) return { kind: 'capture', utility: 1000, goal: own.position };
    if (own.state === FLAG_DROPPED) return { kind: 'carrier-recover', utility: 980, goal: own.position };
    const carrier = state.players.get(own.state);
    return { kind: 'carrier-intercept', utility: 960, goal: carrier?.position ?? own.position };
  }
  if (own.state === FLAG_DROPPED) return { kind: 'recover', utility: 900, goal: own.position };
  if (own.state >= 0) {
    const carrier = state.players.get(own.state);
    return { kind: 'intercept', utility: 850, goal: carrier?.position ?? own.position };
  }
  if (enemy.state >= 0) {
    const carrier = state.players.get(enemy.state);
    if (carrier?.team === state.team) return { kind: 'escort', utility: 700, goal: carrier.position };
  }
  return { kind: enemy.state === FLAG_DROPPED ? 'steal-dropped' : 'attack-flag', utility: 600, goal: enemy.position };
}

export function chooseTarget(state, maxRange = 13) {
  const me = state.players.get(state.id);
  if (!me?.position) return null;
  return [...state.players.values()]
    .filter((player) => player.id !== state.id && player.team !== state.team && player.team >= 0 && player.status === 0 && player.position)
    .map((player) => ({ player, range: distance(me.position, player.position), threat: state.flags[state.team].state === player.id ? 100 : 0 }))
    .filter(({ range }) => range <= maxRange)
    .sort((a, b) => (b.threat - a.threat) || (a.range - b.range))[0]?.player ?? null;
}

export function combatPermission(state, objective, target) {
  if (!target) return false;
  const me = state.players.get(state.id);
  const range = distance(me.position, target.position);
  if (objective.kind === 'capture' && range > 5) return false;
  if (me.life < 0.28 && range > 4) return false;
  return true;
}

export { distance };

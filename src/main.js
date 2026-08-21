import {
  NET, FLAG_AT_POD, botHandshake, coordFrame, drainFrames, parseCoord, parseFlagDrop,
  parseFlagEnum, parsePlayer, parseSpawn, pong, shoot, spawnRequest, teamRequest, signed,
} from './protocol.js';
import { chooseObjective, chooseTarget, combatPermission, distance } from './strategy.js';
import { appendFileSync } from 'node:fs';

const logFile = process.env.BV2_LOG_FILE;
function log(event) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  console.log(line);
  if (logFile) appendFileSync(logFile, `${line}\n`);
}

const config = {
  server: process.env.BV2_SERVER ?? 'wss://nc-ctf.baboviolent.net/bot/ws',
  team: Number(process.env.BV2_TEAM ?? 0),
  identity: {
    name: 'Flagship', version: '0.1.0', author: 'BaboViolent',
    playerName: process.env.BV2_PLAYER_NAME ?? '^4Flag^1ship',
  },
};

class FlagshipBot {
  constructor() {
    this.ws = null;
    this.buffer = new Uint8Array();
    this.id = null;
    this.team = config.team === 1 ? 1 : 0;
    this.players = new Map();
    this.flags = [{ state: FLAG_AT_POD, position: [0, 0, 0] }, { state: FLAG_AT_POD, position: [0, 0, 0] }];
    this.frame = 0;
    this.gamePlaying = true;
    this.lastTick = performance.now();
    this.lastShoot = 0;
    this.lastSpawn = 0;
    this.lastProgress = performance.now();
    this.bestGoalDistance = Infinity;
    this.avoidUntil = 0;
    this.avoidDirection = 1;
    this.reconnectDelay = 1000;
    this.requestedTeam = this.team;
    this.map = null;
    this.lastObjective = null;
    this.spawnCount = 0;
  }

  connect() {
    log({ event: 'connecting', server: config.server, identity: config.identity });
    this.ws = new WebSocket(config.server);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => { this.reconnectDelay = 1000; };
    this.ws.onmessage = ({ data }) => {
      const incoming = new Uint8Array(data);
      const joined = new Uint8Array(this.buffer.length + incoming.length);
      joined.set(this.buffer); joined.set(incoming, this.buffer.length);
      this.buffer = drainFrames(joined, (type, payload) => this.handle(type, payload));
    };
    this.ws.onclose = () => {
      clearInterval(this.loop);
      log({ event: 'disconnected', retryMs: this.reconnectDelay });
      setTimeout(() => this.resetAndConnect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    };
    this.ws.onerror = () => this.ws.close();
    this.loop = setInterval(() => this.tick(), 33);
  }

  resetAndConnect() {
    this.buffer = new Uint8Array(); this.id = null; this.players.clear(); this.frame = 0;
    this.connect();
  }

  send(bytes) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(bytes); }

  handle(type, payload) {
    if (type === NET.NEWPLAYER) this.id = payload[0];
    else if (type === NET.GAMEVERSION && this.id !== null) {
      this.send(botHandshake(this.id, config.identity));
      setTimeout(() => {
        this.requestedTeam = this.team;
        this.send(teamRequest(this.id, this.requestedTeam));
      }, 100);
      log({ event: 'authenticated', playerId: this.id, team: this.team });
    } else if (type === NET.PING && this.id !== null) this.send(pong(this.id));
    else if (type === NET.PLAYER_ENUM_STATE && payload.length >= 92) {
      const update = parsePlayer(payload), old = this.players.get(update.id) ?? {};
      this.players.set(update.id, { ...old, ...update });
    } else if (type === NET.TEAM_REQUEST && payload.length >= 2) {
      const id = payload[0], team = signed(payload[1]), old = this.players.get(id) ?? { id };
      this.players.set(id, { ...old, team });
      if (id === this.id) {
        if (team < 0) {
          this.requestedTeam = 1 - this.requestedTeam;
          setTimeout(() => this.send(teamRequest(this.id, this.requestedTeam)), 250);
        } else {
          this.team = team;
          log({ event: 'team-joined', team });
        }
      }
    } else if (type === NET.PLAYER_SPAWN) {
      const update = parseSpawn(payload), old = this.players.get(update.id) ?? { id: update.id };
      this.players.set(update.id, { ...old, ...update, status: 0, life: 1 });
      if (update.id === this.id) {
        this.spawnCount += 1;
        log({ event: 'spawn', map: this.map, spawnCount: this.spawnCount, position: update.position });
      }
    } else if (type === NET.COORD_FRAME) {
      const update = parseCoord(payload), old = this.players.get(update.id) ?? { id: update.id };
      this.players.set(update.id, { ...old, position: update.position });
    } else if (type === NET.FLAG_ENUM && payload.length >= 26) this.flags = parseFlagEnum(payload);
    else if (type === NET.DROP_FLAG && payload.length >= 13) {
      const update = parseFlagDrop(payload); this.flags[update.id] = { state: -1, position: update.position };
    } else if (type === NET.CHANGE_FLAG_STATE && payload.length >= 3 && payload[0] < 2) {
      this.flags[payload[0]].state = signed(payload[1]);
      if (this.flags[payload[0]].state === FLAG_AT_POD) this.bestGoalDistance = Infinity;
      log({ event: 'flag-state', map: this.map, flag: payload[0], state: this.flags[payload[0]].state, actor: payload[2], action: payload[3] ?? 0 });
    } else if (type === NET.GAME_STATE) {
      this.gamePlaying = signed(payload[0]) === -1;
      log({ event: 'game-state', map: this.map, state: signed(payload[0]), reset: payload[1] === 1, stats: this.stats() });
    } else if (type === NET.MAP_CHANGE) {
      const nextMap = new TextDecoder().decode(payload.slice(0, 16)).replace(/\0.*$/s, '');
      if (this.map && this.map !== nextMap) log({ event: 'match-summary', map: this.map, nextMap, stats: this.stats(), spawnCount: this.spawnCount });
      this.map = nextMap;
      this.spawnCount = 0;
      this.flags.forEach((flag) => { flag.state = FLAG_AT_POD; });
      this.players.clear();
      log({ event: 'map-change', map: nextMap });
    }
  }

  stats() {
    const me = this.players.get(this.id) ?? {};
    const deaths = me.deaths ?? 0;
    return { kills: me.kills ?? 0, deaths, kd: deaths ? (me.kills ?? 0) / deaths : (me.kills ?? 0), captures: me.captures ?? 0, returns: me.returns ?? 0, attempts: me.attempts ?? 0, life: me.life ?? 0 };
  }

  requestSpawn() {
    if (this.id === null) return;
    this.lastSpawn = performance.now();
    this.send(spawnRequest(this.id, 0, 10));
  }

  tick() {
    if (this.id === null || !this.gamePlaying) return;
    const me = this.players.get(this.id);
    if (!me || me.team < 0) return;
    if (me.status !== 0) {
      if (performance.now() - this.lastSpawn > 1000) this.requestSpawn();
      return;
    }
    if (!me.position) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1); this.lastTick = now;
    const state = this, objective = chooseObjective(state), target = chooseTarget(state);
    if (objective.kind !== this.lastObjective) {
      this.lastObjective = objective.kind;
      log({ event: 'objective', map: this.map, objective: objective.kind, utility: objective.utility, stats: this.stats() });
    }
    const goal = objective.goal ?? me.position;
    const goalDistance = distance(me.position, goal);
    if (goalDistance + 0.08 < this.bestGoalDistance) { this.bestGoalDistance = goalDistance; this.lastProgress = now; }
    if (now - this.lastProgress > 550) {
      this.avoidDirection *= -1; this.avoidUntil = now + 850; this.lastProgress = now; this.bestGoalDistance = goalDistance;
    }
    let angle = Math.atan2(goal[1] - me.position[1], goal[0] - me.position[0]);
    if (now < this.avoidUntil) angle += this.avoidDirection * Math.PI * 0.58;
    const speed = objective.kind === 'capture' ? 3.0 : 2.8;
    const velocity = [Math.cos(angle) * speed, Math.sin(angle) * speed, 0];
    const next = [me.position[0] + velocity[0] * dt, me.position[1] + velocity[1] * dt, me.position[2] ?? 0.25];
    const aim = target?.position ?? goal;
    this.frame += 1;
    this.send(coordFrame(this.id, this.frame, next, velocity, aim));
    me.position = next;
    if (combatPermission(state, objective, target) && now - this.lastShoot > 125) {
      this.send(shoot(this.id, 0, me.position, target.position)); this.lastShoot = now;
    }
    if (this.frame % 300 === 0) log({ event: 'snapshot', map: this.map, objective: objective.kind, distance: Number(goalDistance.toFixed(2)), stats: this.stats() });
  }
}

new FlagshipBot().connect();

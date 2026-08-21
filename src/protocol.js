export const NET = Object.freeze({
  PONG: 1, SPAWN_REQUEST: 2, PLAYER_SHOOT: 3, GAMEVERSION_ACCEPTED: 4,
  NEWPLAYER: 101, SERVER_INFO: 102, PLAYER_ENUM_STATE: 105, PING: 106, PLAYER_SPAWN: 108,
  GAMEVERSION: 116, CHANGE_FLAG_STATE: 118, DROP_FLAG: 119, FLAG_ENUM: 120,
  GAME_STATE: 121, MAP_CHANGE: 123, TEAM_REQUEST: 203, COORD_FRAME: 204,
});

export const FLAG_AT_POD = -2;
export const FLAG_DROPPED = -1;

const encoder = new TextEncoder();

export function frame(type, payload = new Uint8Array()) {
  const out = new Uint8Array(payload.length + 4);
  const view = new DataView(out.buffer);
  view.setUint16(0, payload.length, true);
  view.setUint16(2, type, true);
  out.set(payload, 4);
  return out;
}

export function drainFrames(buffer, visit) {
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset);
    const size = view.getUint16(0, true);
    if (offset + size + 4 > buffer.length) break;
    visit(view.getUint16(2, true), buffer.slice(offset + 4, offset + 4 + size));
    offset += size + 4;
  }
  return buffer.slice(offset);
}

export function botHandshake(playerId, identity) {
  const fields = [identity.name, identity.version, identity.author, identity.playerName]
    .map((value) => encoder.encode(value));
  const payload = new Uint8Array(21 + fields.reduce((total, value) => total + value.length + 1, 0));
  payload[0] = playerId;
  payload.set(encoder.encode('BOT1'), 17);
  let cursor = 21;
  for (const value of fields) {
    if (value.length > 255) throw new Error('BOT1 field exceeds 255 bytes');
    payload[cursor++] = value.length;
    payload.set(value, cursor);
    cursor += value.length;
  }
  return frame(NET.GAMEVERSION_ACCEPTED, payload);
}

export function teamRequest(playerId, team) {
  return frame(NET.TEAM_REQUEST, new Uint8Array([playerId, team]));
}

export function spawnRequest(playerId, weapon = 0, melee = 10) {
  const payload = new Uint8Array(19);
  payload.set([playerId, weapon, melee]);
  payload.set(encoder.encode('skin08'), 3);
  payload.set([80, 180, 255, 255, 190, 50, 255, 70, 70], 10);
  return frame(NET.SPAWN_REQUEST, payload);
}

export function pong(playerId) {
  return frame(NET.PONG, new Uint8Array([playerId]));
}

export function coordFrame(playerId, frameId, position, velocity, aim) {
  const payload = new Uint8Array(28);
  const view = new DataView(payload.buffer);
  payload[0] = playerId;
  view.setInt32(4, frameId, true);
  for (let i = 0; i < 3; i++) view.setInt16(8 + i * 2, Math.round(position[i] * 100), true);
  for (let i = 0; i < 3; i++) payload[14 + i] = Math.round(velocity[i] * 10) & 0xff;
  for (let i = 0; i < 3; i++) view.setInt16(18 + i * 2, Math.round(aim[i] * 100), true);
  view.setInt32(24, frameId, true);
  return frame(NET.COORD_FRAME, payload);
}

export function shoot(playerId, weapon, from, to) {
  const payload = new Uint8Array(16);
  const view = new DataView(payload.buffer);
  payload.set([playerId, weapon, 0]);
  for (let i = 0; i < 3; i++) view.setInt16(4 + i * 2, Math.round(from[i] * 100), true);
  for (let i = 0; i < 3; i++) view.setInt16(10 + i * 2, Math.round(to[i] * 100), true);
  return frame(NET.PLAYER_SHOOT, payload);
}

export function parsePlayer(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    id: payload[0], team: signed(payload[33]), status: signed(payload[34]),
    kills: view.getInt16(35, true), deaths: view.getInt16(37, true),
    captures: view.getInt16(39, true), returns: view.getInt16(41, true),
    attempts: view.getInt16(43, true), life: view.getFloat32(47, true), weapon: payload[55],
  };
}

export function parseSpawn(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { id: payload[0], position: [view.getInt16(4, true) / 10, view.getInt16(6, true) / 10, view.getInt16(8, true) / 10] };
}

export function parseCoord(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { id: payload[0], position: [view.getInt16(8, true) / 100, view.getInt16(10, true) / 100, view.getInt16(12, true) / 100] };
}

export function parseFlagEnum(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return [0, 1].map((id) => {
    const offset = id === 0 ? 2 : 14;
    return { state: signed(payload[id]), position: [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)] };
  });
}

export function parseFlagDrop(payload) {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return { id: payload[0], position: [view.getFloat32(1, true), view.getFloat32(5, true), view.getFloat32(9, true)] };
}

export const signed = (value) => value >= 128 ? value - 256 : value;

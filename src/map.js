const PLAYER_CLEARANCE = 0.30;

export class NavigationGrid {
  constructor(width, height, cells) {
    this.width = width; this.height = height; this.cells = cells;
  }

  static async load(name) {
    const file = name.toLowerCase().endsWith('.bvm') ? name : `${name}.bvm`;
    const response = await fetch(`https://play.baboviolent.net/content/main/maps/${encodeURIComponent(file)}`);
    if (!response.ok) throw new Error(`map ${file}: HTTP ${response.status}`);
    return NavigationGrid.parse(await response.arrayBuffer());
  }

  static parse(buffer) {
    const view = new DataView(buffer); let offset = 0;
    const u32 = () => { const value = view.getUint32(offset, true); offset += 4; return value; };
    const i16 = () => { const value = view.getInt16(offset, true); offset += 2; return value; };
    const version = u32();
    if (version === 20202) offset += 25;
    if (version >= 20201) offset += 4;
    const width = i16(), height = i16();
    if (width <= 0 || height <= 0 || width * height > 16_777_216) throw new Error(`invalid map size ${width}x${height}`);
    const cells = new Uint8Array(width * height);
    for (let i = 0; i < cells.length; i++) { cells[i] = view.getUint8(offset); offset += 2; }
    return new NavigationGrid(width, height, cells);
  }

  passable(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && (this.cells[y * this.width + x] & 0x80) !== 0;
  }

  clear(point) {
    if (!this.passable(Math.floor(point[0]), Math.floor(point[1]))) return false;
    const probes = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    return probes.every(([sx, sy]) => this.passable(Math.floor(point[0] + sx * PLAYER_CLEARANCE), Math.floor(point[1] + sy * PLAYER_CLEARANCE)));
  }

  resolve(goal) {
    if (this.clear(goal)) return goal;
    const gx = Math.floor(goal[0]), gy = Math.floor(goal[1]);
    for (let radius = 0; radius <= Math.max(this.width, this.height); radius++) {
      let best = null;
      for (let y = gy - radius; y <= gy + radius; y++) for (let x = gx - radius; x <= gx + radius; x++) {
        if (radius && x !== gx - radius && x !== gx + radius && y !== gy - radius && y !== gy + radius) continue;
        const point = [x + 0.5, y + 0.5];
        if (!this.clear(point)) continue;
        const score = (point[0] - goal[0]) ** 2 + (point[1] - goal[1]) ** 2;
        if (!best || score < best.score) best = { point, score };
      }
      if (best) return best.point;
    }
    return goal;
  }

  lineClear(from, to) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(length / 0.15));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.clear([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])) return false;
    }
    return true;
  }

  sightLineClear(from, to) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(length / 0.1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.passable(Math.floor(from[0] + (to[0] - from[0]) * t), Math.floor(from[1] + (to[1] - from[1]) * t))) return false;
    }
    return true;
  }

  navigate(from, requestedGoal) {
    const goal = this.resolve(requestedGoal);
    if (this.lineClear(from, goal)) return goal;
    const start = [Math.floor(from[0]), Math.floor(from[1])], end = [Math.floor(goal[0]), Math.floor(goal[1])];
    const key = ([x, y]) => y * this.width + x;
    const parents = new Int32Array(this.width * this.height).fill(-1);
    const queue = new Int32Array(this.width * this.height); let head = 0, tail = 0;
    const startKey = key(start), endKey = key(end); parents[startKey] = startKey; queue[tail++] = startKey;
    while (head < tail && parents[endKey] < 0) {
      const current = queue[head++], x = current % this.width, y = Math.floor(current / this.width);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, next = ny * this.width + nx;
        if (!this.passable(nx, ny) || parents[next] >= 0) continue;
        parents[next] = current; queue[tail++] = next;
      }
    }
    if (parents[endKey] < 0) return from;
    let next = endKey;
    while (parents[next] !== startKey && next !== startKey) next = parents[next];
    return next === startKey ? goal : [next % this.width + 0.5, Math.floor(next / this.width) + 0.5];
  }
}

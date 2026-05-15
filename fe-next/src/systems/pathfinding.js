// FEN-02: Pure BFS pathfinding on the occupancy grid.
// findPath(grid, sx, sy, gx, gy) -> waypoints array or null.
// 4-directional movement on a rectangular grid.
// No state mutation — pure function.
// Exposed as window.FE_NEXT_PATHFINDING.

(function () {
  'use strict';

  /**
   * Find a path from (sx, sy) to (gx, gy) using BFS.
   * Returns an array of {x, y} waypoints (including start, excluding current position),
   * or null if no path exists.
   *
   * 4-directional: up, down, left, right.
   * The occupancy grid uses: grid[y][x] = true means BLOCKED.
   *
   * @param {boolean[][]} grid - Occupancy grid
   * @param {number} sx - Start X
   * @param {number} sy - Start Y
   * @param {number} gx - Goal X
   * @param {number} gy - Goal Y
   * @returns {Array<{x: number, y: number}>|null}
   */
  function findPath(grid, sx, sy, gx, gy) {
    if (!grid || grid.length === 0) return null;

    var h = grid.length;
    var w = grid[0].length;

    // Bounds check
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return null;

    // Start or goal is blocked
    if (grid[sy][sx] || grid[gy][gx]) return null;

    // Already at goal
    if (sx === gx && sy === gy) return [{ x: gx, y: gy }];

    // BFS
    var visited = [];
    for (var vy = 0; vy < h; vy++) {
      visited.push(new Array(w).fill(false));
    }
    visited[sy][sx] = true;

    // Parent tracking for path reconstruction
    var parentX = [];
    var parentY = [];
    for (var py = 0; py < h; py++) {
      parentX.push(new Array(w).fill(-1));
      parentY.push(new Array(w).fill(-1));
    }

    // Queue as flat arrays (faster than object allocation)
    var queueX = [sx];
    var queueY = [sy];
    var head = 0;

    // 4-directional neighbors
    var DX = [0, 0, -1, 1];
    var DY = [-1, 1, 0, 0];

    while (head < queueX.length) {
      var cx = queueX[head];
      var cy = queueY[head];
      head++;

      for (var d = 0; d < 4; d++) {
        var nx = cx + DX[d];
        var ny = cy + DY[d];

        // Bounds
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        // Already visited
        if (visited[ny][nx]) continue;
        // Blocked
        if (grid[ny][nx]) continue;

        visited[ny][nx] = true;
        parentX[ny][nx] = cx;
        parentY[ny][nx] = cy;

        // Found goal
        if (nx === gx && ny === gy) {
          return reconstructPath(parentX, parentY, sx, sy, gx, gy);
        }

        queueX.push(nx);
        queueY.push(ny);
      }
    }

    // No path found
    return null;
  }

  /**
   * Reconstruct path from BFS parent arrays.
   * @param {number[][]} parentX
   * @param {number[][]} parentY
   * @param {number} sx
   * @param {number} sy
   * @param {number} gx
   * @param {number} gy
   * @returns {Array<{x: number, y: number}>}
   */
  function reconstructPath(parentX, parentY, sx, sy, gx, gy) {
    var path = [];
    var cx = gx;
    var cy = gy;

    // Walk backwards from goal to start
    while (cx !== sx || cy !== sy) {
      path.push({ x: cx, y: cy });
      var px = parentX[cy][cx];
      var py = parentY[cy][cx];
      cx = px;
      cy = py;
    }

    // Add start position
    path.push({ x: sx, y: sy });

    // Reverse to get start-to-goal order
    path.reverse();
    return path;
  }

  window.FE_NEXT_PATHFINDING = {
    findPath: findPath
  };
})();

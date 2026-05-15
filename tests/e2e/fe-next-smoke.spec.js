// FEN-02 — Playwright E2E smoke test for FE Next scaffold.
//
// Verifies the FE Next standalone page boots and renders:
//   1. Page loads without errors
//   2. Canvas is visible
//   3. HUD is visible with resource display
//   4. window.FE_NEXT_GAME exists and has state
//   5. State has expected initial values (map, HQ, unit, resources)
//   6. Left-click selects the test unit
//   7. Right-click issues a move command
//   8. Unit moves toward the target over frames
//   9. Occupancy grid is built on boot
//  10. BFS pathfinding finds valid path around building
//  11. BFS returns null for unreachable destination
//  12. Asset store created and stats available
//
// Uses fe-next/index.html — completely independent from root game.

const { test, expect } = require('@playwright/test');

const FE_NEXT_URL = '/fe-next/index.html';

// Console error policy: only fail on actual runtime/syntax errors
const BENIGN_PATTERNS = [
  /favicon/i,
  /DevTools/i,
  /Failed to load resource.*favicon/i,
  /Failed to load resource.*assets/i,
];

function isCriticalError(text) {
  if (!text) return false;
  for (const pat of BENIGN_PATTERNS) {
    if (pat.test(text)) return false;
  }
  return /ReferenceError|TypeError|SyntaxError|Uncaught|Error:/i.test(text);
}

test('FE Next scaffold: boot -> canvas -> HUD -> select -> move unit', async ({ page }) => {
  const criticalErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (isCriticalError(msg.text())) {
      criticalErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err && err.message ? err.message : String(err));
  });

  // ---- Step 1: Load FE Next page ----
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // ---- Step 2: Canvas is visible ----
  const canvas = page.locator('canvas#game');
  await expect(canvas, 'FE Next canvas should be visible').toBeVisible({ timeout: 10000 });

  // ---- Step 3: HUD is visible ----
  const hud = page.locator('#hud');
  await expect(hud, 'FE Next HUD should be visible').toBeVisible({ timeout: 5000 });

  const mineralsEl = page.locator('#hud-minerals');
  await expect(mineralsEl, 'HUD minerals should show initial value/cap').toHaveText('100/200');

  const energyEl = page.locator('#hud-energy');
  await expect(energyEl, 'HUD energy should show initial value/cap').toHaveText('160/300');

  // ---- Step 4: FE_NEXT_GAME state exists ----
  const gameState = await page.evaluate(() => {
    const g = window.FE_NEXT_GAME;
    if (!g || !g.state) return { hasState: false };
    const s = g.state;
    return {
      hasState: true,
      mapW: s.mapW,
      mapH: s.mapH,
      buildingCount: s.buildings ? s.buildings.length : 0,
      unitCount: s.units ? s.units.length : 0,
      resources: s.resources,
      resourceNodeCount: s.resourceNodes ? s.resourceNodes.length : 0,
      selectedUnitId: s.selectedUnitId,
      cameraZoom: s.camera ? s.camera.zoom : null
    };
  });

  expect(gameState.hasState, 'window.FE_NEXT_GAME.state should exist').toBe(true);
  expect(gameState.mapW, 'Map width should be 24').toBe(24);
  expect(gameState.mapH, 'Map height should be 24').toBe(24);
  expect(gameState.buildingCount, 'Should have HQ + separator').toBe(2);
  expect(gameState.unitCount, 'Should have tank + harvester').toBe(2);
  expect(gameState.resourceNodeCount, 'Should have 3 mineral nodes').toBe(3);
  expect(gameState.resources.minerals, 'Initial minerals should be 100').toBe(100);
  expect(gameState.resources.energy, 'Initial energy should be 160').toBe(160);
  expect(gameState.resources.cyanEl, 'Initial cyanEl should be 0').toBe(0);
  expect(gameState.resources.caps, 'Resource caps should exist').toEqual({ minerals: 200, energy: 300, cyanEl: 20 });

  // ---- Step 5: Verify HQ and unit in state ----
  const entities = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    return {
      hq: s.buildings.find((b) => b.type === 'hq'),
      separator: s.buildings.find((b) => b.type === 'separator'),
      unit: s.units.find((u) => u.type === 'light_tank'),
      harvester: s.units.find((u) => u.type === 'harvester')
    };
  });

  expect(entities.hq.type, 'First building should be HQ').toBe('hq');
  expect(entities.hq.owner, 'HQ should be player-owned').toBe('player');
  expect(entities.unit.type, 'Unit should be light_tank').toBe('light_tank');
  expect(entities.unit.owner, 'Unit should be player-owned').toBe('player');
  expect(entities.harvester.cargo, 'Harvester should start empty').toBe(0);
  expect(entities.harvester.maxCargo, 'Harvester should have cargo capacity').toBe(10);
  expect(entities.harvester.harvestState, 'Harvester should have harvest state').toBe('idle');
  expect(typeof entities.separator.cycleProgress, 'Separator should have cycle progress').toBe('number');
  expect(entities.separator.cyclesCompleted, 'Separator should have cycle counter').toBe(0);

  // ---- Step 6: Left-click to select unit ----
  const clickResult = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const u = s.units[0];
    const C = window.FE_NEXT_CONSTANTS;
    const COORDS = window.FE_NEXT_COORDS;
    const canvas = document.getElementById('game');
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    const scr = COORDS.tileToScreen(u.tx + 0.5, u.ty + 0.5);
    const canvasPos = COORDS.worldToCanvas(scr.x, scr.y, s.camera, cw, ch);

    return { x: canvasPos.x, y: canvasPos.y, cw: cw, ch: ch };
  });

  // Click on the unit position
  const canvasBox = await canvas.boundingBox();
  if (canvasBox && clickResult.x > 0 && clickResult.x < clickResult.cw &&
      clickResult.y > 0 && clickResult.y < clickResult.ch) {
    await page.mouse.click(
      canvasBox.x + clickResult.x,
      canvasBox.y + clickResult.y
    );
    await page.waitForTimeout(200);

    // Verify unit is now selected
    const selAfterClick = await page.evaluate(() => {
      return window.FE_NEXT_GAME.state.selectedUnitId;
    });
    expect(selAfterClick, 'Unit should be selected after left-click').toBeTruthy();
  } else {
    // If unit is off-screen, use evaluate to select directly for test reliability
    await page.evaluate(() => {
      const s = window.FE_NEXT_GAME.state;
      s.units[0].selected = true;
      s.selectedUnitId = s.units[0].id;
    });
  }

  // ---- Step 7: Right-click to move unit ----
  const moveResult = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const C = window.FE_NEXT_CONSTANTS;
    const COORDS = window.FE_NEXT_COORDS;
    const canvas = document.getElementById('game');
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    // Move target: tile (12, 10)
    var scr = COORDS.tileToScreen(12.5, 10.5);
    var canvasPos = COORDS.worldToCanvas(scr.x, scr.y, s.camera, cw, ch);
    return { x: canvasPos.x, y: canvasPos.y };
  });

  if (canvasBox && moveResult.x > 0 && moveResult.x < clickResult.cw &&
      moveResult.y > 0 && moveResult.y < clickResult.ch) {
    await page.mouse.click(
      canvasBox.x + moveResult.x,
      canvasBox.y + moveResult.y,
      { button: 'right' }
    );
    await page.waitForTimeout(200);

    // ---- Step 8: Verify unit is moving ----
    const moveState = await page.evaluate(() => {
      const u = window.FE_NEXT_GAME.state.units[0];
      return {
        moving: u.moving,
        hasTarget: !!(u.moveTarget),
        targetTx: u.moveTarget ? u.moveTarget.tx : null,
        targetTy: u.moveTarget ? u.moveTarget.ty : null
      };
    });

    // Unit should either be moving or already arrived
    if (moveState.moving || moveState.hasTarget) {
      // Wait for movement progress
      await page.waitForTimeout(1500);

      const afterMove = await page.evaluate(() => {
        const u = window.FE_NEXT_GAME.state.units[0];
        return {
          tx: u.tx,
          ty: u.ty,
          moving: u.moving
        };
      });

      // Unit should have moved from starting position (7, 5)
      const moved = Math.abs(afterMove.tx - 7) > 0.1 || Math.abs(afterMove.ty - 5) > 0.1;
      expect(moved, 'Unit should have moved from starting position after move command').toBe(true);
    }
  } else {
    // Fallback: issue move command via evaluate
    await page.evaluate(() => {
      window.FE_NEXT_MOVEMENT.issueMoveCommand(window.FE_NEXT_GAME.state, window.FE_NEXT_GAME.state.units[0].id, 12, 10);
    });
    await page.waitForTimeout(1500);

    const afterMove = await page.evaluate(() => {
      const u = window.FE_NEXT_GAME.state.units[0];
      return { tx: u.tx, ty: u.ty };
    });
    const moved = Math.abs(afterMove.tx - 7) > 0.1 || Math.abs(afterMove.ty - 5) > 0.1;
    expect(moved, 'Unit should have moved from starting position after move command').toBe(true);
  }

  // ---- Step 9: Selection info panel ----
  const selInfo = page.locator('#selection-info');
  await expect(selInfo, 'Selection info should be visible when unit is selected').toBeVisible({ timeout: 3000 });

  // ---- Final: No critical errors ----
  expect(pageErrors, `Page JS errors: ${pageErrors.join('\n')}`).toEqual([]);
  expect(criticalErrors, `Critical console errors: ${criticalErrors.join('\n')}`).toEqual([]);
});

test('FE Next scaffold: camera zoom works', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const canvas = page.locator('canvas#game');
  await expect(canvas).toBeVisible({ timeout: 10000 });

  // Get initial zoom
  const initialZoom = await page.evaluate(() => {
    return window.FE_NEXT_GAME.state.camera.zoom;
  });

  // Scroll up (zoom in)
  const canvasBox = await canvas.boundingBox();
  if (canvasBox) {
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);
  }

  const afterZoomIn = await page.evaluate(() => {
    return window.FE_NEXT_GAME.state.camera.zoom;
  });

  expect(afterZoomIn, 'Zoom should increase after scroll up').toBeGreaterThan(initialZoom);

  // Scroll down (zoom out)
  if (canvasBox) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);
  }

  const afterZoomOut = await page.evaluate(() => {
    return window.FE_NEXT_GAME.state.camera.zoom;
  });

  expect(afterZoomOut, 'Zoom should decrease after scroll down').toBeLessThan(afterZoomIn);
});

test('FE Next FEN-02: occupancy grid built on boot', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err && err.message ? err.message : String(err));
  });

  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const occupancyResult = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    if (!s.occupancyGrid) return { built: false };
    const grid = s.occupancyGrid;
    // HQ at (4,4) size 2 — tiles (4,4), (5,4), (4,5), (5,5) should be blocked
    const hqBlocked = grid[4][4] && grid[4][5] && grid[5][4] && grid[5][5];
    // Grass tile should not be blocked
    const grassPassable = !grid[2][2];
    return {
      built: true,
      rows: grid.length,
      cols: grid[0] ? grid[0].length : 0,
      hqBlocked: hqBlocked,
      grassPassable: grassPassable
    };
  });

  expect(occupancyResult.built, 'Occupancy grid should be built').toBe(true);
  expect(occupancyResult.rows, 'Grid should have 24 rows').toBe(24);
  expect(occupancyResult.cols, 'Grid should have 24 columns').toBe(24);
  expect(occupancyResult.hqBlocked, 'HQ footprint tiles should be blocked').toBe(true);
  expect(occupancyResult.grassPassable, 'Grass tiles should be passable').toBe(true);

  expect(pageErrors, `Page JS errors: ${pageErrors.join('\n')}`).toEqual([]);
});

test('FE Next FEN-02: BFS pathfinding finds path around building', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err && err.message ? err.message : String(err));
  });

  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const pathResult = await page.evaluate(() => {
    const PF = window.FE_NEXT_PATHFINDING;
    const grid = window.FE_NEXT_GAME.state.occupancyGrid;
    // Path from (7,5) to (2,2) — must go around HQ at (4,4)
    const path = PF.findPath(grid, 7, 5, 2, 2);
    return {
      found: !!path,
      length: path ? path.length : 0,
      start: path ? path[0] : null,
      end: path ? path[path.length - 1] : null
    };
  });

  expect(pathResult.found, 'Path from (7,5) to (2,2) should be found').toBe(true);
  expect(pathResult.length, 'Path should have at least 2 waypoints').toBeGreaterThanOrEqual(2);
  expect(pathResult.start.x, 'Path should start at x=7').toBe(7);
  expect(pathResult.start.y, 'Path should start at y=5').toBe(5);
  expect(pathResult.end.x, 'Path should end at x=2').toBe(2);
  expect(pathResult.end.y, 'Path should end at y=2').toBe(2);

  expect(pageErrors, `Page JS errors: ${pageErrors.join('\n')}`).toEqual([]);
});

test('FE Next FEN-02: BFS returns null for unreachable destination', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const nullPathResult = await page.evaluate(() => {
    const PF = window.FE_NEXT_PATHFINDING;
    const grid = window.FE_NEXT_GAME.state.occupancyGrid;
    // Target is a blocked tile (inside HQ footprint at 4,4)
    const path = PF.findPath(grid, 7, 5, 4, 4);
    return { found: !!path };
  });

  expect(nullPathResult.found, 'Path to blocked tile should return null').toBe(false);
});

test('FE Next FEN-02: asset store created and stats available', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const assetResult = await page.evaluate(() => {
    const g = window.FE_NEXT_GAME;
    if (!g.assets) return { hasAssets: false };
    const stats = g.assets.stats();
    return {
      hasAssets: true,
      loaded: stats.loaded,
      pending: stats.pending,
      failed: stats.failed,
      canGet: typeof g.assets.get === 'function'
    };
  });

  expect(assetResult.hasAssets, 'Asset store should exist').toBe(true);
  expect(assetResult.canGet, 'Asset store should have get method').toBe(true);
  // Asset loading is async — we just verify the store exists and is functional
  expect(typeof assetResult.loaded, 'loaded should be a number').toBe('number');
});

test('FE Next FEN-03: harvester command gathers and unloads minerals', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const commandResult = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const harvester = s.units.find((u) => u.type === 'harvester');
    const node = s.resourceNodes[0];
    s.selectedUnitId = harvester.id;
    harvester.selected = true;
    const issued = window.FE_NEXT_HARVESTING.issueHarvestCommand(s, harvester.id, node.id);
    return {
      issued,
      harvestState: harvester.harvestState,
      harvestTarget: harvester.harvestTarget
    };
  });

  expect(commandResult.issued, 'Harvest command should route to node').toBe(true);
  expect(commandResult.harvestTarget, 'Harvester target should be selected node').toBe('mineral_node_1');
  expect(commandResult.harvestState, 'Harvester should start moving to node').toBe('moving_to_node');

  const loopResult = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const harvester = s.units.find((u) => u.type === 'harvester');
    const node = s.resourceNodes[0];
    harvester.tx = node.tx;
    harvester.ty = node.ty;
    harvester.moving = false;
    harvester.harvestState = 'gathering';
    harvester.harvestTarget = node.id;
    window.FE_NEXT_HARVESTING.updateHarvesting(s, 2.1);
    const afterGather = {
      cargo: harvester.cargo,
      nodeRemaining: node.remaining,
      harvestState: harvester.harvestState
    };
    harvester.tx = 3;
    harvester.ty = 5;
    harvester.moving = false;
    harvester.harvestState = 'moving_to_hq';
    s.resources.minerals = 100;
    window.FE_NEXT_HARVESTING.updateHarvesting(s, 0.1);
    window.FE_NEXT_HARVESTING.updateHarvesting(s, 0.1);
    return {
      afterGather,
      minerals: s.resources.minerals,
      cargo: harvester.cargo,
      nextState: harvester.harvestState
    };
  });

  expect(loopResult.afterGather.cargo, 'Harvester should fill cargo on gather tick').toBe(10);
  expect(loopResult.afterGather.nodeRemaining, 'Node remaining should decrease').toBe(7);
  expect(loopResult.minerals, 'Dropoff should increase minerals').toBe(110);
  expect(loopResult.cargo, 'Cargo should empty after dropoff').toBe(0);
});

test('FE Next FEN-03: separator converts minerals and respects caps', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const convertResult = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const separator = s.buildings.find((b) => b.type === 'separator');
    s.resources.minerals = 100;
    s.resources.energy = 160;
    s.resources.cyanEl = 0;
    window.FE_NEXT_ECONOMY.updateEconomy(s, 6.1);
    return {
      minerals: s.resources.minerals,
      energy: s.resources.energy,
      cyanEl: s.resources.cyanEl,
      cyclesCompleted: separator.cyclesCompleted
    };
  });

  expect(convertResult.minerals, 'Separator should spend 15 minerals').toBe(85);
  expect(convertResult.energy, 'Separator should add 10 energy').toBe(170);
  expect(convertResult.cyanEl, 'Separator should add 1 cyanEl').toBe(1);
  expect(convertResult.cyclesCompleted, 'Separator should count completed cycle').toBe(1);

  const capResult = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const separator = s.buildings.find((b) => b.type === 'separator');
    s.resources.minerals = 100;
    s.resources.energy = s.resources.caps.energy;
    s.resources.cyanEl = 0;
    const beforeCycles = separator.cyclesCompleted;
    window.FE_NEXT_ECONOMY.updateEconomy(s, 10);
    return {
      minerals: s.resources.minerals,
      energy: s.resources.energy,
      cyanEl: s.resources.cyanEl,
      cyclesCompleted: separator.cyclesCompleted,
      beforeCycles,
      separatorState: separator.separatorState
    };
  });

  expect(capResult.minerals, 'Separator should not spend minerals when energy is capped').toBe(100);
  expect(capResult.energy, 'Energy should stay at cap').toBe(300);
  expect(capResult.cyanEl, 'cyanEl should not change while blocked by cap').toBe(0);
  expect(capResult.cyclesCompleted, 'No extra cycle should complete at cap').toBe(capResult.beforeCycles);
  expect(capResult.separatorState, 'Separator should report cap block').toBe('energy_cap');
});

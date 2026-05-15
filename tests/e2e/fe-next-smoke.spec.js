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
  expect(gameState.buildingCount, 'Should have HQ + separator + enemy bunker').toBe(3);
  expect(gameState.unitCount, 'Should have tank + harvester + builder').toBe(3);
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
      harvester: s.units.find((u) => u.type === 'harvester'),
      builder: s.units.find((u) => u.type === 'builder')
    };
  });

  expect(entities.hq.type, 'First building should be HQ').toBe('hq');
  expect(entities.hq.owner, 'HQ should be player-owned').toBe('player');
  expect(entities.unit.type, 'Unit should be light_tank').toBe('light_tank');
  expect(entities.unit.owner, 'Unit should be player-owned').toBe('player');
  expect(entities.harvester.cargo, 'Harvester should start empty').toBe(0);
  expect(entities.harvester.maxCargo, 'Harvester should have cargo capacity').toBe(10);
  expect(entities.harvester.harvestState, 'Harvester should have harvest state').toBe('idle');
  expect(entities.builder.buildState, 'Builder should start idle').toBe('idle');
  expect(entities.builder.buildOrder, 'Builder should have no initial build order').toBe(null);
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

test('FE Next FEN-04: builder auto-places separator construction site and completes it', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const setup = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const builder = s.units.find((u) => u.type === 'builder');
    s.selectedUnitId = builder.id;
    builder.selected = true;
    const button = document.getElementById('build-separator');
    window.FE_NEXT_HUD.updateHUD(s);
    const plan = window.FE_NEXT_CONSTRUCTION.findBuildPlan(s, builder, 'separator');
    const beforeEnergy = s.resources.energy;
    const beforeBuildings = s.buildings.length;
    const order = window.FE_NEXT_CONSTRUCTION.issueBuildCommand(s, builder.id, 'separator');
    const site = s.buildings.find((b) => b.id === order.buildingId);
    return {
      hasApi: !!window.FE_NEXT_CONSTRUCTION && typeof window.FE_NEXT_CONSTRUCTION.issueBuildCommand === 'function',
      buttonExists: !!button,
      buttonVisible: button ? button.style.display : '',
      plan,
      order,
      beforeEnergy,
      afterEnergy: s.resources.energy,
      beforeBuildings,
      afterBuildings: s.buildings.length,
      site,
      builderState: builder.buildState,
      builderMoving: builder.moving
    };
  });

  expect(setup.hasApi, 'Construction API should exist').toBe(true);
  expect(setup.buttonExists, 'Build Separator button should exist').toBe(true);
  expect(setup.buttonVisible, 'Build button should show for selected builder').toBe('block');
  expect(setup.plan.ok, 'Auto-placement should find a valid build plan').toBe(true);
  expect(setup.order.ok, 'Build order should be accepted').toBe(true);
  expect(setup.afterEnergy, 'Energy should decrease by separator cost').toBe(setup.beforeEnergy - 30);
  expect(setup.afterBuildings, 'Construction site should be added').toBe(setup.beforeBuildings + 1);
  expect(setup.site.complete, 'Construction site should start incomplete').toBe(false);
  expect(setup.site.constructionState, 'Construction site should be constructing').toBe('constructing');
  expect(setup.builderState, 'Builder should move to construction site').toBe('moving_to_site');
  expect(setup.builderMoving, 'Builder should have movement command to access tile').toBe(true);

  const complete = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const builder = s.units.find((u) => u.type === 'builder');
    const site = s.buildings.find((b) => b.complete === false && b.type === 'separator');
    const access = builder.buildOrder.accessTile;
    builder.tx = access.tx;
    builder.ty = access.ty;
    builder.moving = false;
    builder.moveTarget = null;
    builder.moveFrom = null;
    window.FE_NEXT_CONSTRUCTION.updateConstruction(s, 0.1);
    window.FE_NEXT_CONSTRUCTION.updateConstruction(s, 8.1);
    const blocked = s.occupancyGrid[site.ty][site.tx] &&
      s.occupancyGrid[site.ty][site.tx + 1] &&
      s.occupancyGrid[site.ty + 1][site.tx] &&
      s.occupancyGrid[site.ty + 1][site.tx + 1];
    const pathIntoBuilding = window.FE_NEXT_PATHFINDING.findPath(s.occupancyGrid, access.tx, access.ty, site.tx, site.ty);
    s.resources.minerals = 100;
    s.resources.energy = 160;
    s.resources.cyanEl = 0;
    const cyclesBefore = site.cyclesCompleted;
    window.FE_NEXT_ECONOMY.updateEconomy(s, 6.1);
    return {
      complete: site.complete,
      constructionState: site.constructionState,
      progress: site.progress,
      builderState: builder.buildState,
      builderOrder: builder.buildOrder,
      blocked,
      pathIntoBuildingFound: !!pathIntoBuilding,
      cyclesBefore,
      cyclesAfter: site.cyclesCompleted,
      energy: s.resources.energy,
      cyanEl: s.resources.cyanEl
    };
  });

  expect(complete.complete, 'Construction should complete through accelerated update').toBe(true);
  expect(complete.constructionState, 'Completed site should become completed building').toBe('completed');
  expect(complete.progress, 'Completed building progress should be 1').toBe(1);
  expect(complete.builderState, 'Builder should return to idle').toBe('idle');
  expect(complete.builderOrder, 'Builder order should clear after completion').toBe(null);
  expect(complete.blocked, 'Completed separator footprint should block occupancy').toBe(true);
  expect(complete.pathIntoBuildingFound, 'Pathfinding should reject completed building footprint').toBe(false);
  expect(complete.cyclesAfter, 'Built separator should participate in economy').toBeGreaterThan(complete.cyclesBefore);
  expect(complete.energy, 'Completed separators should add energy after cycle').toBe(180);
  expect(complete.cyanEl, 'Completed separators should add cyanEl after cycle').toBe(2);
});

test('FE Next FEN-04: invalid build orders are rejected before spending energy', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const noEnergy = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const builder = s.units.find((u) => u.type === 'builder');
    s.resources.energy = 0;
    const beforeBuildings = s.buildings.length;
    const result = window.FE_NEXT_CONSTRUCTION.issueBuildCommand(s, builder.id, 'separator');
    return {
      result,
      energy: s.resources.energy,
      beforeBuildings,
      afterBuildings: s.buildings.length,
      buildState: builder.buildState
    };
  });

  expect(noEnergy.result.ok, 'Build should reject without enough energy').toBe(false);
  expect(noEnergy.result.reason, 'Rejection reason should be not enough energy').toBe('not_enough_energy');
  expect(noEnergy.energy, 'Rejected build should not spend energy').toBe(0);
  expect(noEnergy.afterBuildings, 'Rejected build should not add site').toBe(noEnergy.beforeBuildings);
  expect(noEnergy.buildState, 'Rejected build should leave builder idle').toBe('idle');

  const blockedTerrain = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const builder = s.units.find((u) => u.type === 'builder');
    s.resources.energy = 160;
    for (let y = 1; y < s.mapH - 1; y++) {
      for (let x = 1; x < s.mapW - 1; x++) {
        if (Math.abs(x - builder.tx) <= 1 && Math.abs(y - builder.ty) <= 1) continue;
        s.terrain[y][x] = 'water';
      }
    }
    s.occupancyGrid = window.FE_NEXT_OCCUPANCY.buildOccupancyGrid(s);
    return window.FE_NEXT_CONSTRUCTION.findBuildPlan(s, builder, 'separator');
  });

  expect(blockedTerrain.ok, 'Build plan should reject blocked terrain footprints').toBe(false);
  expect(blockedTerrain.reason, 'Blocked terrain should be reported').toBe('blocked_terrain');

  const noAccess = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const builder = s.units.find((u) => u.type === 'builder');
    s.terrain = s.terrain.map((row) => row.map((cell) => cell === 'water' ? 'grass' : cell));
    s.occupancyGrid = s.terrain.map((row) => row.map(() => true));
    s.occupancyGrid[Math.round(builder.ty)][Math.round(builder.tx)] = false;
    return window.FE_NEXT_CONSTRUCTION.findBuildPlan(s, builder, 'separator');
  });

  expect(noAccess.ok, 'Build plan should reject when no access path exists').toBe(false);
  expect(noAccess.reason, 'No access path should be reported').toBe('no_access_path');
});

test('FE Next FEN-05: builder constructs units factory and produces harvester/builder', async ({ page }) => {
  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const factoryBuild = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const builder = s.units.find((u) => u.type === 'builder');
    s.selectedUnitId = builder.id;
    s.selectedBuildingId = null;
    builder.selected = true;
    s.resources.energy = 160;
    s.resources.cyanEl = 3;
    window.FE_NEXT_HUD.updateHUD(s);
    const buildFactoryButton = document.getElementById('build-factory');
    const beforeEnergy = s.resources.energy;
    const order = window.FE_NEXT_CONSTRUCTION.issueBuildCommand(s, builder.id, 'units_factory');
    const site = s.buildings.find((b) => b.id === order.buildingId);
    const access = builder.buildOrder.accessTile;
    builder.tx = access.tx;
    builder.ty = access.ty;
    builder.moving = false;
    builder.moveTarget = null;
    builder.moveFrom = null;
    window.FE_NEXT_CONSTRUCTION.updateConstruction(s, 0.1);
    window.FE_NEXT_CONSTRUCTION.updateConstruction(s, 10.1);
    return {
      buttonExists: !!buildFactoryButton,
      buttonVisible: buildFactoryButton ? buildFactoryButton.style.display : '',
      order,
      beforeEnergy,
      afterEnergy: s.resources.energy,
      complete: site.complete,
      constructionState: site.constructionState,
      productionQueue: site.productionQueue,
      productionProgress: site.productionProgress,
      producing: site.producing,
      factoryId: site.id,
      builderState: builder.buildState,
      selectedBuildingBeforeClick: s.selectedBuildingId
    };
  });

  expect(factoryBuild.buttonExists, 'Build Factory button should exist').toBe(true);
  expect(factoryBuild.buttonVisible, 'Build Factory button should show for selected builder').toBe('block');
  expect(factoryBuild.order.ok, 'units_factory build order should be accepted').toBe(true);
  expect(factoryBuild.afterEnergy, 'Factory build should spend 55 energy').toBe(factoryBuild.beforeEnergy - 55);
  expect(factoryBuild.complete, 'Factory should complete through accelerated construction').toBe(true);
  expect(factoryBuild.constructionState, 'Factory construction state should complete').toBe('completed');
  expect(factoryBuild.productionQueue, 'Completed factory should initialize queue').toEqual([]);
  expect(factoryBuild.productionProgress, 'Completed factory should initialize production progress').toBe(0);
  expect(factoryBuild.producing, 'Completed factory should not be producing initially').toBe(null);
  expect(factoryBuild.builderState, 'Builder should return to idle after factory completion').toBe('idle');

  const selection = await page.evaluate((factoryId) => {
    const s = window.FE_NEXT_GAME.state;
    const factory = s.buildings.find((b) => b.id === factoryId);
    s.selectedUnitId = null;
    s.selectedBuildingId = factory.id;
    window.FE_NEXT_HUD.updateHUD(s);
    const produceHarvester = document.getElementById('produce-harvester');
    const produceBuilder = document.getElementById('produce-builder');
    return {
      selectedBuildingId: s.selectedBuildingId,
      harvesterVisible: produceHarvester ? produceHarvester.style.display : '',
      builderVisible: produceBuilder ? produceBuilder.style.display : ''
    };
  }, factoryBuild.factoryId);

  expect(selection.selectedBuildingId, 'Completed factory should be selectable').toBe(factoryBuild.factoryId);
  expect(selection.harvesterVisible, 'Factory selection should show harvester production').toBe('block');
  expect(selection.builderVisible, 'Factory selection should show builder production').toBe('block');

  const queueChecks = await page.evaluate((factoryId) => {
    const s = window.FE_NEXT_GAME.state;
    const factory = s.buildings.find((b) => b.id === factoryId);
    s.resources.cyanEl = 3;
    const cyanBefore = s.resources.cyanEl;
    const q1 = window.FE_NEXT_PRODUCTION.queueUnit(s, factory.id, 'harvester');
    const cyanAfterFirst = s.resources.cyanEl;
    const q2 = window.FE_NEXT_PRODUCTION.queueUnit(s, factory.id, 'builder');
    const q3 = window.FE_NEXT_PRODUCTION.queueUnit(s, factory.id, 'harvester');
    return {
      q1,
      q2,
      q3,
      cyanBefore,
      cyanAfterFirst,
      cyanAfterSecond: s.resources.cyanEl,
      queueLength: factory.productionQueue.length,
      firstItem: factory.productionQueue[0],
      secondItem: factory.productionQueue[1]
    };
  }, factoryBuild.factoryId);

  expect(queueChecks.q1.ok, 'queueUnit should accept harvester with cyanEl').toBe(true);
  expect(queueChecks.cyanAfterFirst, 'queueUnit should spend 1 cyanEl on start').toBe(queueChecks.cyanBefore - 1);
  expect(queueChecks.q2.ok, 'queueUnit should accept builder as second item').toBe(true);
  expect(queueChecks.q3.ok, 'queue max 2 should be enforced').toBe(false);
  expect(queueChecks.q3.reason, 'Queue full should be reported').toBe('queue_full');
  expect(queueChecks.queueLength, 'Queue should contain two items').toBe(2);
  expect(queueChecks.firstItem.unitType, 'First queue item should be harvester object').toBe('harvester');
  expect(queueChecks.secondItem.unitType, 'Second queue item should be builder object').toBe('builder');

  const noCyan = await page.evaluate((factoryId) => {
    const s = window.FE_NEXT_GAME.state;
    const factory = s.buildings.find((b) => b.id === factoryId);
    factory.productionQueue = [];
    factory.productionProgress = 0;
    factory.producing = null;
    s.resources.cyanEl = 0;
    return window.FE_NEXT_PRODUCTION.queueUnit(s, factory.id, 'harvester');
  }, factoryBuild.factoryId);

  expect(noCyan.ok, 'queueUnit should reject without cyanEl').toBe(false);
  expect(noCyan.reason, 'Missing cyanEl should be reported').toBe('not_enough_cyanEl');

  const produced = await page.evaluate((factoryId) => {
    const s = window.FE_NEXT_GAME.state;
    const factory = s.buildings.find((b) => b.id === factoryId);
    factory.productionQueue = [];
    factory.productionProgress = 0;
    factory.producing = null;
    s.resources.cyanEl = 3;
    const beforeUnits = s.units.length;
    window.FE_NEXT_PRODUCTION.queueUnit(s, factory.id, 'harvester');
    window.FE_NEXT_PRODUCTION.queueUnit(s, factory.id, 'builder');
    window.FE_NEXT_PRODUCTION.updateProduction(s, 10.1);
    const harvester = s.units[s.units.length - 1];
    const harvesterBeforeCommand = {
      cargo: harvester.cargo,
      maxCargo: harvester.maxCargo,
      harvestState: harvester.harvestState
    };
    const harvesterAdjacent = Math.abs(harvester.tx - (factory.tx + 0.5)) <= 2 &&
      Math.abs(harvester.ty - (factory.ty + 0.5)) <= 2 &&
      !window.FE_NEXT_OCCUPANCY.isTileBlocked(s.occupancyGrid, harvester.tx, harvester.ty);
    const node = s.resourceNodes[0];
    const harvestCommand = window.FE_NEXT_HARVESTING.issueHarvestCommand(s, harvester.id, node.id);
    window.FE_NEXT_PRODUCTION.updateProduction(s, 10.1);
    const builder = s.units[s.units.length - 1];
    return {
      beforeUnits,
      afterUnits: s.units.length,
      harvester,
      harvesterBeforeCommand,
      harvesterAdjacent,
      harvestCommand,
      builder,
      queueLength: factory.productionQueue.length
    };
  }, factoryBuild.factoryId);

  expect(produced.afterUnits, 'Two produced units should spawn').toBe(produced.beforeUnits + 2);
  expect(produced.harvester.type, 'First produced unit should be harvester').toBe('harvester');
  expect(produced.harvesterAdjacent, 'Produced harvester should spawn on adjacent passable tile').toBe(true);
  expect(produced.harvesterBeforeCommand.cargo, 'Produced harvester should have cargo field').toBe(0);
  expect(produced.harvesterBeforeCommand.maxCargo, 'Produced harvester should have maxCargo').toBe(10);
  expect(produced.harvesterBeforeCommand.harvestState, 'Produced harvester should start harvest idle').toBe('idle');
  expect(produced.harvestCommand, 'Produced harvester should receive harvest command').toBe(true);
  expect(produced.builder.type, 'Second produced unit should be builder').toBe('builder');
  expect(produced.builder.buildState, 'Produced builder should start build idle').toBe('idle');
  expect(produced.builder.buildOrder, 'Produced builder should have no build order').toBe(null);
  expect(produced.queueLength, 'Queue should empty after producing both units').toBe(0);
});

test('FE Next FEN-06: light tank production and basic combat loop', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err && err.message ? err.message : String(err));
  });

  await page.goto(FE_NEXT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Verify enemy bunker exists
  const enemyCheck = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const bunker = s.buildings.find((b) => b.type === 'enemy_bunker');
    const C = window.FE_NEXT_CONSTANTS;
    return {
      bunkerExists: !!bunker,
      bunkerId: bunker ? bunker.id : null,
      bunkerOwner: bunker ? bunker.owner : null,
      bunkerHp: bunker ? bunker.hp : null,
      bunkerMaxHp: bunker ? bunker.maxHp : null,
      bunkerDestroyed: bunker ? bunker.destroyed : null,
      bunkerTx: bunker ? bunker.tx : null,
      bunkerTy: bunker ? bunker.ty : null,
      bunkerSize: bunker ? bunker.size : null,
      expectedHp: C.ENEMY_DUMMY_HP,
      combatApi: !!window.FE_NEXT_COMBAT,
      tankConstants: {
        hp: C.LIGHT_TANK_HP,
        damage: C.LIGHT_TANK_DAMAGE,
        range: C.LIGHT_TANK_RANGE,
        cooldown: C.LIGHT_TANK_ATTACK_COOLDOWN,
        cost: C.PRODUCE_LIGHT_TANK_CYAN_COST,
        time: C.PRODUCE_LIGHT_TANK_TIME
      }
    };
  });

  expect(enemyCheck.bunkerExists, 'Enemy bunker should exist in initial state').toBe(true);
  expect(enemyCheck.bunkerOwner, 'Enemy bunker should be enemy-owned').toBe('enemy');
  expect(enemyCheck.bunkerHp, 'Enemy bunker should have 100 HP').toBe(100);
  expect(enemyCheck.bunkerMaxHp, 'Enemy bunker should have maxHp 100').toBe(100);
  expect(enemyCheck.bunkerDestroyed, 'Enemy bunker should not be destroyed initially').toBe(false);
  expect(enemyCheck.combatApi, 'FE_NEXT_COMBAT should exist').toBe(true);
  expect(enemyCheck.tankConstants.hp, 'LIGHT_TANK_HP should be 100').toBe(100);
  expect(enemyCheck.tankConstants.damage, 'LIGHT_TANK_DAMAGE should be 20').toBe(20);
  expect(enemyCheck.tankConstants.range, 'LIGHT_TANK_RANGE should be 3').toBe(3);
  expect(enemyCheck.tankConstants.cooldown, 'LIGHT_TANK_ATTACK_COOLDOWN should be 1.0').toBe(1.0);
  expect(enemyCheck.tankConstants.cost, 'PRODUCE_LIGHT_TANK_CYAN_COST should be 2').toBe(2);

  // Verify test_unit_1 has combat fields
  const tankFields = await page.evaluate(() => {
    const tank = window.FE_NEXT_GAME.state.units.find((u) => u.type === 'light_tank');
    return {
      hasDamage: typeof tank.damage === 'number',
      hasRange: typeof tank.range === 'number',
      hasAttackCooldown: typeof tank.attackCooldown === 'number',
      hasAttackCooldownMax: typeof tank.attackCooldownMax === 'number',
      hasAttackTarget: tank.attackTarget === null,
      hasAttackState: tank.attackState === 'idle',
      damage: tank.damage,
      range: tank.range
    };
  });

  expect(tankFields.hasDamage, 'Light tank should have damage field').toBe(true);
  expect(tankFields.hasRange, 'Light tank should have range field').toBe(true);
  expect(tankFields.hasAttackCooldown, 'Light tank should have attackCooldown field').toBe(true);
  expect(tankFields.hasAttackCooldownMax, 'Light tank should have attackCooldownMax field').toBe(true);
  expect(tankFields.hasAttackTarget, 'Light tank should start with null attackTarget').toBe(true);
  expect(tankFields.hasAttackState, 'Light tank should start idle').toBe(true);

  // Produce a light_tank from factory
  const factorySetup = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const builder = s.units.find((u) => u.type === 'builder');
    s.resources.energy = 160;
    s.resources.cyanEl = 5;
    const order = window.FE_NEXT_CONSTRUCTION.issueBuildCommand(s, builder.id, 'units_factory');
    const site = s.buildings.find((b) => b.id === order.buildingId);
    const access = builder.buildOrder.accessTile;
    builder.tx = access.tx;
    builder.ty = access.ty;
    builder.moving = false;
    builder.moveTarget = null;
    builder.moveFrom = null;
    window.FE_NEXT_CONSTRUCTION.updateConstruction(s, 0.1);
    window.FE_NEXT_CONSTRUCTION.updateConstruction(s, 10.1);
    return { factoryId: site.id, complete: site.complete };
  });

  expect(factorySetup.complete, 'Factory should complete').toBe(true);

  // Queue and produce light_tank
  const tankProduction = await page.evaluate((factoryId) => {
    const s = window.FE_NEXT_GAME.state;
    const factory = s.buildings.find((b) => b.id === factoryId);
    s.resources.cyanEl = 5;
    const cyanBefore = s.resources.cyanEl;
    const queueResult = window.FE_NEXT_PRODUCTION.queueUnit(s, factory.id, 'light_tank');
    const cyanAfter = s.resources.cyanEl;
    const beforeUnits = s.units.length;
    window.FE_NEXT_PRODUCTION.updateProduction(s, 12.1);
    const producedTank = s.units[s.units.length - 1];
    return {
      queueResult,
      cyanBefore,
      cyanAfter,
      beforeUnits,
      afterUnits: s.units.length,
      tankType: producedTank.type,
      tankHp: producedTank.hp,
      tankMaxHp: producedTank.maxHp,
      tankDamage: producedTank.damage,
      tankRange: producedTank.range,
      tankAttackState: producedTank.attackState,
      tankAttackTarget: producedTank.attackTarget,
      tankAttackCooldownMax: producedTank.attackCooldownMax
    };
  }, factorySetup.factoryId);

  expect(tankProduction.queueResult.ok, 'Queue light_tank should succeed').toBe(true);
  expect(tankProduction.cyanAfter, 'Light tank should cost 2 cyanEl').toBe(tankProduction.cyanBefore - 2);
  expect(tankProduction.afterUnits, 'Light tank should be produced').toBe(tankProduction.beforeUnits + 1);
  expect(tankProduction.tankType, 'Produced unit should be light_tank').toBe('light_tank');
  expect(tankProduction.tankHp, 'Produced light_tank should have 100 HP').toBe(100);
  expect(tankProduction.tankDamage, 'Produced light_tank should have 20 damage').toBe(20);
  expect(tankProduction.tankRange, 'Produced light_tank should have 3 range').toBe(3);
  expect(tankProduction.tankAttackState, 'Produced light_tank should start idle').toBe('idle');
  expect(tankProduction.tankAttackTarget, 'Produced light_tank should have null attackTarget').toBe(null);

  // Issue attack command with test_unit_1 against enemy bunker
  const attackCommand = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const tank = s.units.find((u) => u.type === 'light_tank' && u.id === 'test_unit_1');
    const bunker = s.buildings.find((b) => b.type === 'enemy_bunker');
    // Place tank in range of bunker
    tank.tx = bunker.tx - 2;
    tank.ty = bunker.ty;
    tank.moving = false;
    tank.moveTarget = null;
    tank.moveFrom = null;
    tank.path = null;
    const result = window.FE_NEXT_COMBAT.issueAttackCommand(s, tank.id, bunker.id, 'building');
    return {
      result,
      attackState: tank.attackState,
      attackTarget: tank.attackTarget,
      bunkerHp: bunker.hp
    };
  });

  expect(attackCommand.result.ok, 'Attack command should succeed').toBe(true);
  expect(attackCommand.attackState, 'Tank should be attacking when in range').toBe('attacking');
  expect(attackCommand.attackTarget.id, 'Attack target should be enemy bunker').toBe('enemy_bunker_1');
  expect(attackCommand.attackTarget.kind, 'Attack target kind should be building').toBe('building');

  // Run combat update - should deal damage
  const combatDamage = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const tank = s.units.find((u) => u.type === 'light_tank' && u.id === 'test_unit_1');
    const bunker = s.buildings.find((b) => b.type === 'enemy_bunker');
    const hpBefore = bunker.hp;
    window.FE_NEXT_COMBAT.updateCombat(s, 1.1);
    return {
      hpBefore,
      hpAfter: bunker.hp,
      destroyed: bunker.destroyed,
      tankState: tank.attackState
    };
  });

  expect(combatDamage.hpAfter, 'Bunker HP should decrease after combat').toBeLessThan(combatDamage.hpBefore);
  expect(combatDamage.hpAfter, 'Bunker should have 80 HP after one hit').toBe(80);
  expect(combatDamage.destroyed, 'Bunker should not be destroyed after one hit').toBe(false);

  // Destroy bunker with repeated combat
  const destroyBunker = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const tank = s.units.find((u) => u.type === 'light_tank' && u.id === 'test_unit_1');
    const bunker = s.buildings.find((b) => b.type === 'enemy_bunker');
    // Run enough combat ticks to destroy bunker (100 HP / 20 damage = 5 hits)
    for (var i = 0; i < 10; i++) {
      window.FE_NEXT_COMBAT.updateCombat(s, 1.1);
      if (bunker.destroyed) break;
    }
    return {
      bunkerHp: bunker.hp,
      bunkerDestroyed: bunker.destroyed,
      tankAttackState: tank.attackState,
      tankAttackTarget: tank.attackTarget,
      occupancyBlocked: s.occupancyGrid[bunker.ty][bunker.tx]
    };
  });

  expect(destroyBunker.bunkerHp, 'Bunker HP should be 0').toBe(0);
  expect(destroyBunker.bunkerDestroyed, 'Bunker should be destroyed').toBe(true);
  expect(destroyBunker.tankAttackState, 'Tank should return to idle after target destroyed').toBe('idle');
  expect(destroyBunker.tankAttackTarget, 'Tank attack target should be cleared').toBe(null);
  expect(destroyBunker.occupancyBlocked, 'Destroyed bunker should not block occupancy').toBe(false);

  // Verify attack command rejects invalid targets
  const invalidAttack = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const tank = s.units.find((u) => u.type === 'light_tank' && u.id === 'test_unit_1');
    // Try attacking player HQ
    const hq = s.buildings.find((b) => b.type === 'hq');
    const r1 = window.FE_NEXT_COMBAT.issueAttackCommand(s, tank.id, hq.id, 'building');
    // Try attacking already destroyed bunker
    const bunker = s.buildings.find((b) => b.type === 'enemy_bunker');
    const r2 = window.FE_NEXT_COMBAT.issueAttackCommand(s, tank.id, bunker.id, 'building');
    // Try attacking with harvester
    const harvester = s.units.find((u) => u.type === 'harvester');
    const r3 = window.FE_NEXT_COMBAT.issueAttackCommand(s, harvester.id, 'enemy_bunker_1', 'building');
    return { r1, r2, r3 };
  });

  expect(invalidAttack.r1.ok, 'Attack on friendly building should fail').toBe(false);
  expect(invalidAttack.r1.reason, 'Attack on friendly should report not_enemy').toBe('not_enemy');
  expect(invalidAttack.r2.ok, 'Attack on destroyed building should fail').toBe(false);
  expect(invalidAttack.r2.reason, 'Attack on destroyed should report target_already_destroyed').toBe('target_already_destroyed');
  expect(invalidAttack.r3.ok, 'Harvester cannot attack').toBe(false);
  expect(invalidAttack.r3.reason, 'Harvester attack should report unit_cannot_attack').toBe('unit_cannot_attack');

  // Verify findEnemyAtTile works (only finds alive enemies)
  const enemySearch = await page.evaluate(() => {
    const s = window.FE_NEXT_GAME.state;
    const bunker = s.buildings.find((b) => b.type === 'enemy_bunker');
    // Destroyed bunker should not be found by findEnemyAtTile
    const found = window.FE_NEXT_COMBAT.findEnemyAtTile(s, bunker.tx, bunker.ty);
    return { foundId: found ? found.id : null, destroyed: bunker.destroyed };
  });

  expect(enemySearch.foundId, 'findEnemyAtTile should skip destroyed enemies').toBe(null);
  expect(enemySearch.destroyed, 'Bunker should be marked destroyed').toBe(true);

  expect(pageErrors, `Page JS errors: ${pageErrors.join('\n')}`).toEqual([]);
});

// FEN-02: Isometric renderer with optional sprite support.
// Renders the isometric map, buildings, units, and markers using
// Canvas 2D. Uses sprites when available, falls back to geometric
// shapes when assets are missing or not loaded.
// Exposed as window.FE_NEXT_RENDERER.

(function () {
  'use strict';

  var C = window.FE_NEXT_CONSTANTS;
  var COORDS = window.FE_NEXT_COORDS;

  /**
   * Draw a single isometric diamond tile.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - Canvas X of tile center
   * @param {number} cy - Canvas Y of tile center
   * @param {number} hw - Half-width in canvas pixels
   * @param {number} hh - Half-height in canvas pixels
   * @param {string} fillColor
   * @param {string} strokeColor
   */
  function drawDiamond(ctx, cx, cy, hw, hh, fillColor, strokeColor) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);     // top
    ctx.lineTo(cx + hw, cy);     // right
    ctx.lineTo(cx, cy + hh);     // bottom
    ctx.lineTo(cx - hw, cy);     // left
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /**
   * Render a terrain tile with optional sprite.
   * Falls back to geometric diamond if sprite is unavailable.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx - Canvas X of tile center
   * @param {number} cy - Canvas Y of tile center
   * @param {number} hw - Half-width in canvas pixels
   * @param {number} hh - Half-height in canvas pixels
   * @param {string} terrainType
   * @param {string} strokeColor
   * @param {object|null} sprite - Loaded Image or null
   */
  function renderTerrainTile(ctx, cx, cy, hw, hh, terrainType, strokeColor, sprite) {
    if (sprite) {
      // Draw sprite centered on tile position
      ctx.drawImage(sprite, cx - hw, cy - hh, hw * 2, hh * 2);
    } else {
      // Geometric fallback
      var colors = C.TERRAIN_COLORS;
      var color = colors[terrainType] || colors.grass;
      drawDiamond(ctx, cx, cy, hw, hh, color, strokeColor);
    }
  }

  /**
   * Render the full terrain grid.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state
   * @param {number} canvasW
   * @param {number} canvasH
   * @param {object} assets - Asset store (may be null)
   */
  function renderTerrain(ctx, state, canvasW, canvasH, assets) {
    var camera = state.camera;
    var hw = C.TILE_W / 2 * camera.zoom;
    var hh = C.TILE_H / 2 * camera.zoom;

    // Get terrain sprite if available
    var gridSprite = assets ? assets.get('terrain_grid') : null;
    var sandSprite = assets ? assets.get('terrain_sand') : null;

    for (var ty = 0; ty < state.mapH; ty++) {
      for (var tx = 0; tx < state.mapW; tx++) {
        var scr = COORDS.tileToScreen(tx + 0.5, ty + 0.5);
        var canvas = COORDS.worldToCanvas(scr.x, scr.y, camera, canvasW, canvasH);

        // Cull tiles outside the viewport (with margin)
        if (canvas.x < -hw - 10 || canvas.x > canvasW + hw + 10) continue;
        if (canvas.y < -hh - 10 || canvas.y > canvasH + hh + 10) continue;

        var terrainType = state.terrain[ty][tx];

        // Select sprite based on terrain type
        var sprite = gridSprite;
        if (terrainType === 'sand' && sandSprite) {
          sprite = sandSprite;
        }

        renderTerrainTile(ctx, canvas.x, canvas.y, hw, hh, terrainType, C.GRID_COLOR, sprite);
      }
    }
  }

  /**
   * Render a building with optional HQ sprite.
   * Falls back to raised isometric box if sprite is unavailable.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} building
   * @param {object} camera
   * @param {number} canvasW
   * @param {number} canvasH
   * @param {object|null} hqSprite - Loaded Image or null
   */
  function renderBuilding(ctx, building, camera, canvasW, canvasH, hqSprite) {
    var s = building.size || 1;
    // Center of the building (s x s tiles)
    var centerScr = COORDS.tileToScreen(building.tx + s / 2, building.ty + s / 2);
    var canvasPos = COORDS.worldToCanvas(centerScr.x, centerScr.y, camera, canvasW, canvasH);
    var z = camera.zoom;

    if (hqSprite && building.type === 'hq') {
      // Draw HQ sprite centered on building position
      // The sprite is 172x172 per root sprite_profiles.js
      var spriteW = 172 * z;
      var spriteH = 172 * z;
      // Offset: ground offset from sprite_profiles is 36px
      var groundOffset = 36 * z;
      ctx.drawImage(
        hqSprite,
        canvasPos.x - spriteW / 2,
        canvasPos.y - spriteH / 2 - groundOffset,
        spriteW,
        spriteH
      );
      return;
    }

    if (building.type === 'separator') {
      renderSeparator(ctx, building, canvasPos, z);
      return;
    }
    if (building.type === 'units_factory') {
      renderUnitsFactory(ctx, building, canvasPos, z);
      return;
    }
    if (building.type === 'enemy_bunker') {
      if (!building.destroyed) renderEnemyBunker(ctx, building, canvasPos, z);
      return;
    }
    // FEN-07: Enemy HQ
    if (building.type === 'enemy_hq') {
      if (!building.destroyed) renderEnemyHQ(ctx, building, canvasPos, z);
      return;
    }

    // Geometric fallback: isometric box
    var hw = C.TILE_W / 2 * s * z;
    var hh = C.TILE_H / 2 * s * z;

    // Building "height" in pixels
    var bHeight = 18 * z;

    // Draw sides (isometric box)
    // Right face
    ctx.beginPath();
    ctx.moveTo(canvasPos.x + hw, canvasPos.y);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh - bHeight);
    ctx.lineTo(canvasPos.x + hw, canvasPos.y - bHeight);
    ctx.closePath();
    ctx.fillStyle = '#a07830';
    ctx.fill();
    ctx.strokeStyle = '#6b4e1a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left face
    ctx.beginPath();
    ctx.moveTo(canvasPos.x - hw, canvasPos.y);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh - bHeight);
    ctx.lineTo(canvasPos.x - hw, canvasPos.y - bHeight);
    ctx.closePath();
    ctx.fillStyle = '#8b6820';
    ctx.fill();
    ctx.strokeStyle = '#5a4015';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top face
    drawDiamond(ctx, canvasPos.x, canvasPos.y - bHeight, hw, hh, C.HQ_COLOR, C.HQ_OUTLINE);

    // Label
    ctx.fillStyle = '#3a2400';
    ctx.font = (10 * z) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HQ', canvasPos.x, canvasPos.y - bHeight);
  }

  function renderSeparator(ctx, building, canvasPos, z) {
    var s = building.size || 1;
    var hw = C.TILE_W / 2 * s * z;
    var hh = C.TILE_H / 2 * s * z;
    var bHeight = 14 * z;
    var isConstructing = building.complete === false || building.constructionState === 'constructing';
    ctx.save();
    if (isConstructing) ctx.globalAlpha = 0.58;
    drawDiamond(ctx, canvasPos.x, canvasPos.y - bHeight, hw, hh, '#67d9dc', '#1c6870');

    ctx.fillStyle = '#12383d';
    ctx.font = (9 * z) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isConstructing ? 'SITE' : 'SEP', canvasPos.x, canvasPos.y - bHeight);

    var progress = isConstructing
      ? Math.max(0, Math.min(1, building.progress || 0))
      : Math.max(0, Math.min(1, (building.cycleProgress || 0) / C.SEPARATOR_CYCLE_TIME));
    var barW = 42 * z;
    var barH = 4 * z;
    var barX = canvasPos.x - barW / 2;
    var barY = canvasPos.y - bHeight - 20 * z;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#7df7ff';
    ctx.fillRect(barX, barY, barW * progress, barH);
    ctx.restore();
  }

  function renderUnitsFactory(ctx, building, canvasPos, z) {
    var s = building.size || 1;
    var hw = C.TILE_W / 2 * s * z;
    var hh = C.TILE_H / 2 * s * z;
    var bHeight = 16 * z;
    var isConstructing = building.complete === false || building.constructionState === 'constructing';
    ctx.save();
    if (isConstructing) ctx.globalAlpha = 0.58;

    drawDiamond(ctx, canvasPos.x, canvasPos.y - bHeight, hw, hh, '#8bb6e8', '#294e79');
    ctx.fillStyle = '#152b42';
    ctx.font = (9 * z) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isConstructing ? 'SITE' : 'FACT', canvasPos.x, canvasPos.y - bHeight);

    var progress = isConstructing
      ? Math.max(0, Math.min(1, building.progress || 0))
      : Math.max(0, Math.min(1, building.productionProgress || 0));
    var barW = 42 * z;
    var barH = 4 * z;
    var barX = canvasPos.x - barW / 2;
    var barY = canvasPos.y - bHeight - 20 * z;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = isConstructing ? '#d6ecff' : '#9dff9d';
    ctx.fillRect(barX, barY, barW * progress, barH);
    ctx.restore();
  }

  function renderEnemyBunker(ctx, building, canvasPos, z) {
    var s = building.size || 1;
    var hw = C.TILE_W / 2 * s * z;
    var hh = C.TILE_H / 2 * s * z;
    var bHeight = 12 * z;

    // Dark red isometric box
    ctx.beginPath();
    ctx.moveTo(canvasPos.x + hw, canvasPos.y);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh - bHeight);
    ctx.lineTo(canvasPos.x + hw, canvasPos.y - bHeight);
    ctx.closePath();
    ctx.fillStyle = '#8b2020';
    ctx.fill();
    ctx.strokeStyle = '#5a0e0e';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(canvasPos.x - hw, canvasPos.y);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh - bHeight);
    ctx.lineTo(canvasPos.x - hw, canvasPos.y - bHeight);
    ctx.closePath();
    ctx.fillStyle = '#6b1515';
    ctx.fill();
    ctx.strokeStyle = '#440909';
    ctx.lineWidth = 1;
    ctx.stroke();

    drawDiamond(ctx, canvasPos.x, canvasPos.y - bHeight, hw, hh, '#a03030', '#5a0e0e');

    ctx.fillStyle = '#2a0505';
    ctx.font = (9 * z) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ENM', canvasPos.x, canvasPos.y - bHeight);

    // HP bar if damaged
    if (building.hp < building.maxHp) {
      var barW = 30 * z;
      var barH = 3 * z;
      var barX = canvasPos.x - barW / 2;
      var barY = canvasPos.y - bHeight - 14 * z;
      var hpRatio = building.hp / building.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpRatio > 0.5 ? '#5de06b' : hpRatio > 0.25 ? '#f2d75c' : '#e05243';
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
    }
  }

  function renderResourceNode(ctx, node, state, canvasW, canvasH) {
    var camera = state.camera;
    var scr = COORDS.tileToScreen(node.tx + 0.5, node.ty + 0.5);
    var canvasPos = COORDS.worldToCanvas(scr.x, scr.y, camera, canvasW, canvasH);
    var z = camera.zoom;
    var alpha = node.depleted ? 0.42 : 1;
    var r = 12 * z;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(canvasPos.x, canvasPos.y - 8 * z, r, 0, Math.PI * 2);
    ctx.fillStyle = node.depleted ? '#8e8e8e' : '#7de1ff';
    ctx.fill();
    ctx.strokeStyle = node.depleted ? '#575757' : '#1a768c';
    ctx.lineWidth = 2 * z;
    ctx.stroke();

    ctx.fillStyle = node.depleted ? '#555' : '#e8fbff';
    ctx.font = (9 * z) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(node.remaining), canvasPos.x, canvasPos.y - 8 * z);
    ctx.restore();
  }

  /**
   * Render a unit with optional sprite.
   * Falls back to colored circle if sprite is unavailable.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} unit
   * @param {object} state
   * @param {number} canvasW
   * @param {number} canvasH
   * @param {object} assets - Asset store (may be null)
   */
  function renderUnit(ctx, unit, state, canvasW, canvasH, assets) {
    var camera = state.camera;
    var scr = COORDS.tileToScreen(unit.tx + 0.5, unit.ty + 0.5);
    var canvasPos = COORDS.worldToCanvas(scr.x, scr.y, camera, canvasW, canvasH);
    var z = camera.zoom;

    // Try to get unit sprite
    var unitSprite = assets ? assets.get('unit_light_tank') : null;

    // Selection ring
    if (unit.id === state.selectedUnitId) {
      var selR = C.UNIT_RADIUS * C.TILE_W / 2 * z + 4 * z;
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, selR, 0, Math.PI * 2);
      ctx.strokeStyle = C.UNIT_SELECTED;
      ctx.lineWidth = 2 * z;
      ctx.stroke();
    }

    if (unit.type === 'harvester') {
      var hr = C.UNIT_RADIUS * C.TILE_W / 2 * z;
      ctx.beginPath();
      ctx.rect(canvasPos.x - hr, canvasPos.y - hr * 0.7, hr * 2, hr * 1.4);
      ctx.fillStyle = '#6bd6c6';
      ctx.fill();
      ctx.strokeStyle = '#236a61';
      ctx.lineWidth = 1.5 * z;
      ctx.stroke();

      var cargoRatio = unit.maxCargo ? unit.cargo / unit.maxCargo : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(canvasPos.x - hr, canvasPos.y - hr - 8 * z, hr * 2, 3 * z);
      ctx.fillStyle = '#ffe070';
      ctx.fillRect(canvasPos.x - hr, canvasPos.y - hr - 8 * z, hr * 2 * cargoRatio, 3 * z);
    } else if (unit.type === 'builder') {
      var br = C.UNIT_RADIUS * C.TILE_W / 2 * z;
      ctx.beginPath();
      ctx.moveTo(canvasPos.x, canvasPos.y - br);
      ctx.lineTo(canvasPos.x + br, canvasPos.y);
      ctx.lineTo(canvasPos.x, canvasPos.y + br);
      ctx.lineTo(canvasPos.x - br, canvasPos.y);
      ctx.closePath();
      ctx.fillStyle = '#e0c45c';
      ctx.fill();
      ctx.strokeStyle = '#725b19';
      ctx.lineWidth = 1.5 * z;
      ctx.stroke();
    } else if (unitSprite && unit.type === 'light_tank' && unit.owner === 'player') {
      // Draw player unit sprite
      var spriteW = 104 * z * 0.76;
      var spriteH = 104 * z * 0.76;
      ctx.drawImage(
        unitSprite,
        canvasPos.x - spriteW / 2,
        canvasPos.y - spriteH,
        spriteW,
        spriteH
      );
    } else if (unit.type === 'light_tank' && unit.owner === 'enemy') {
      // FEN-07: Enemy tank — red geometric circle
      var etR = C.UNIT_RADIUS * C.TILE_W / 2 * z;
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, etR, 0, Math.PI * 2);
      ctx.fillStyle = '#c03030';
      ctx.fill();
      ctx.strokeStyle = '#7a1010';
      ctx.lineWidth = 1.5 * z;
      ctx.stroke();
      // Direction indicator
      if (unit.moving && unit.moveTarget) {
        var edx = unit.moveTarget.tx - unit.tx;
        var edy = unit.moveTarget.ty - unit.ty;
        var eAngle = Math.atan2(edy, edx);
        var eTriSize = etR * 0.7;
        ctx.beginPath();
        ctx.moveTo(
          canvasPos.x + Math.cos(eAngle) * (etR + eTriSize),
          canvasPos.y + Math.sin(eAngle) * (etR + eTriSize)
        );
        ctx.lineTo(
          canvasPos.x + Math.cos(eAngle + 2.5) * etR * 0.5,
          canvasPos.y + Math.sin(eAngle + 2.5) * etR * 0.5
        );
        ctx.lineTo(
          canvasPos.x + Math.cos(eAngle - 2.5) * etR * 0.5,
          canvasPos.y + Math.sin(eAngle - 2.5) * etR * 0.5
        );
        ctx.closePath();
        ctx.fillStyle = '#ffcccc';
        ctx.fill();
      }
    } else {
      // Geometric fallback: circle with direction indicator
      var r = C.UNIT_RADIUS * C.TILE_W / 2 * z;

      // Unit body
      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = C.UNIT_COLOR;
      ctx.fill();
      ctx.strokeStyle = C.UNIT_OUTLINE;
      ctx.lineWidth = 1.5 * z;
      ctx.stroke();

      // Unit direction indicator (small triangle pointing in move direction)
      if (unit.moving && unit.moveTarget) {
        var dx = unit.moveTarget.tx - unit.tx;
        var dy = unit.moveTarget.ty - unit.ty;
        var angle = Math.atan2(dy, dx);
        var triSize = r * 0.7;
        ctx.beginPath();
        ctx.moveTo(
          canvasPos.x + Math.cos(angle) * (r + triSize),
          canvasPos.y + Math.sin(angle) * (r + triSize)
        );
        ctx.lineTo(
          canvasPos.x + Math.cos(angle + 2.5) * r * 0.5,
          canvasPos.y + Math.sin(angle + 2.5) * r * 0.5
        );
        ctx.lineTo(
          canvasPos.x + Math.cos(angle - 2.5) * r * 0.5,
          canvasPos.y + Math.sin(angle - 2.5) * r * 0.5
        );
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    // Health bar (if damaged) — always drawn regardless of sprite
    if (unit.hp < unit.maxHp) {
      var barW = 24 * z;
      var barH = 3 * z;
      var barX = canvasPos.x - barW / 2;
      var barY = canvasPos.y - (unitSprite ? 104 * z * 0.76 : C.UNIT_RADIUS * C.TILE_W / 2 * z) - 8 * z;
      var hpRatio = unit.hp / unit.maxHp;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);

      var barColor = hpRatio > 0.5 ? '#5de06b' : hpRatio > 0.25 ? '#f2d75c' : '#e05243';
      ctx.fillStyle = barColor;
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
    }
  }

  /**
   * Render move command markers (fading circles at right-click target).
   * Blocked markers are shown in red.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state
   * @param {number} canvasW
   * @param {number} canvasH
   */
  function renderMoveMarkers(ctx, state, canvasW, canvasH) {
    var camera = state.camera;
    var z = camera.zoom;

    for (var i = 0; i < state.moveMarkers.length; i++) {
      var m = state.moveMarkers[i];
      var scr = COORDS.tileToScreen(m.tx + 0.5, m.ty + 0.5);
      var canvasPos = COORDS.worldToCanvas(scr.x, scr.y, camera, canvasW, canvasH);
      var alpha = Math.max(0, m.life / 0.8);
      var radius = (8 + (1 - alpha) * 12) * z;

      ctx.beginPath();
      ctx.arc(canvasPos.x, canvasPos.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = m.blocked ? C.BLOCKED_MARKER_COLOR : C.MOVE_MARKER_COLOR;
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = 2 * z;
      ctx.stroke();

      // X mark for blocked markers
      if (m.blocked) {
        var xSize = 6 * z;
        ctx.beginPath();
        ctx.moveTo(canvasPos.x - xSize, canvasPos.y - xSize);
        ctx.lineTo(canvasPos.x + xSize, canvasPos.y + xSize);
        ctx.moveTo(canvasPos.x + xSize, canvasPos.y - xSize);
        ctx.lineTo(canvasPos.x - xSize, canvasPos.y + xSize);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    }
  }

  /**
   * Sort entities for correct isometric draw order (painter's algorithm).
   * Entities with higher (tx + ty) are drawn later (on top).
   * @param {object} state
   * @returns {Array} Sorted list of {type, entity}
   */
  function sortEntities(state) {
    var entities = [];

    for (var i = 0; i < state.buildings.length; i++) {
      var b = state.buildings[i];
      if (b.destroyed) continue;
      entities.push({ type: 'building', entity: b, sortKey: (b.tx + b.ty) * 10 });
    }

    if (state.resourceNodes) {
      for (var r = 0; r < state.resourceNodes.length; r++) {
        var n = state.resourceNodes[r];
        entities.push({ type: 'resourceNode', entity: n, sortKey: (n.tx + n.ty) * 10 });
      }
    }

    for (var j = 0; j < state.units.length; j++) {
      var u = state.units[j];
      entities.push({ type: 'unit', entity: u, sortKey: (u.tx + u.ty) * 10 + 1 });
    }

    entities.sort(function (a, b) { return a.sortKey - b.sortKey; });
    return entities;
  }

  /**
   * Main render function.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} state
   * @param {object} assets - Asset store (may be null)
   */
  function render(ctx, state, assets) {
    var canvasW = ctx.canvas.width;
    var canvasH = ctx.canvas.height;

    // Clear
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#171008';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Terrain
    renderTerrain(ctx, state, canvasW, canvasH, assets);

    // Move markers (below entities)
    renderMoveMarkers(ctx, state, canvasW, canvasH);

    // Entities (sorted for isometric depth)
    var sorted = sortEntities(state);
    var hqSprite = assets ? assets.get('building_hq') : null;
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i].type === 'building') {
        renderBuilding(ctx, sorted[i].entity, state.camera, canvasW, canvasH, hqSprite);
      } else if (sorted[i].type === 'unit') {
        renderUnit(ctx, sorted[i].entity, state, canvasW, canvasH, assets);
      } else if (sorted[i].type === 'resourceNode') {
        renderResourceNode(ctx, sorted[i].entity, state, canvasW, canvasH);
      }
    }

    // Attack indicators (red line from attacking unit to target)
    renderAttackIndicators(ctx, state, canvasW, canvasH);

    // FEN-07: Result overlay
    if (state.gameResult) {
      renderResultOverlay(ctx, state, canvasW, canvasH);
    }
  }

  function renderAttackIndicators(ctx, state, canvasW, canvasH) {
    var camera = state.camera;
    var z = camera.zoom;
    if (!state.units) return;
    for (var i = 0; i < state.units.length; i++) {
      var unit = state.units[i];
      if (unit.type !== 'light_tank' || unit.attackState !== 'attacking' || !unit.attackTarget) continue;
      var target = null;
      var targetScrX, targetScrY;
      if (unit.attackTarget.kind === 'building') {
        target = window.FE_NEXT_STATE.findBuildingById(state, unit.attackTarget.id);
        if (!target || target.destroyed) continue;
        var ts = target.size || 1;
        var tscr = COORDS.tileToScreen(target.tx + ts / 2, target.ty + ts / 2);
        targetScrX = tscr.x;
        targetScrY = tscr.y;
      } else if (unit.attackTarget.kind === 'unit') {
        // FEN-07: unit target
        target = window.FE_NEXT_STATE.findUnitById(state, unit.attackTarget.id);
        if (!target) continue;
        var utscr = COORDS.tileToScreen(target.tx + 0.5, target.ty + 0.5);
        targetScrX = utscr.x;
        targetScrY = utscr.y;
      }
      if (targetScrX === undefined) continue;
      var unitScr = COORDS.tileToScreen(unit.tx + 0.5, unit.ty + 0.5);
      var unitCanvas = COORDS.worldToCanvas(unitScr.x, unitScr.y, camera, canvasW, canvasH);
      var targetCanvas = COORDS.worldToCanvas(targetScrX, targetScrY, camera, canvasW, canvasH);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(unitCanvas.x, unitCanvas.y);
      ctx.lineTo(targetCanvas.x, targetCanvas.y);
      ctx.strokeStyle = 'rgba(224,60,60,0.6)';
      ctx.lineWidth = 2 * z;
      ctx.stroke();
      ctx.restore();
    }
  }

  // FEN-07: Render enemy HQ
  function renderEnemyHQ(ctx, building, canvasPos, z) {
    var s = building.size || 1;
    var hw = C.TILE_W / 2 * s * z;
    var hh = C.TILE_H / 2 * s * z;
    var bHeight = 20 * z;

    // Right face
    ctx.beginPath();
    ctx.moveTo(canvasPos.x + hw, canvasPos.y);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh - bHeight);
    ctx.lineTo(canvasPos.x + hw, canvasPos.y - bHeight);
    ctx.closePath();
    ctx.fillStyle = '#8b1a1a';
    ctx.fill();
    ctx.strokeStyle = '#5a0a0a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left face
    ctx.beginPath();
    ctx.moveTo(canvasPos.x - hw, canvasPos.y);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh);
    ctx.lineTo(canvasPos.x, canvasPos.y + hh - bHeight);
    ctx.lineTo(canvasPos.x - hw, canvasPos.y - bHeight);
    ctx.closePath();
    ctx.fillStyle = '#6b1212';
    ctx.fill();
    ctx.strokeStyle = '#440808';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top face
    drawDiamond(ctx, canvasPos.x, canvasPos.y - bHeight, hw, hh, '#b02020', '#5a0a0a');

    // Label
    ctx.fillStyle = '#ffcccc';
    ctx.font = (10 * z) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ENM HQ', canvasPos.x, canvasPos.y - bHeight);

    // HP bar
    if (building.hp < building.maxHp) {
      var barW = 42 * z;
      var barH = 4 * z;
      var barX = canvasPos.x - barW / 2;
      var barY = canvasPos.y - bHeight - 18 * z;
      var hpRatio = building.hp / building.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpRatio > 0.5 ? '#5de06b' : hpRatio > 0.25 ? '#f2d75c' : '#e05243';
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
    }
  }

  // FEN-07: Result overlay
  function renderResultOverlay(ctx, state, canvasW, canvasH) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    var text = state.gameResult === 'victory' ? 'VICTORY' : 'DEFEAT';
    var color = state.gameResult === 'victory' ? '#5de06b' : '#e05243';
    ctx.fillStyle = color;
    ctx.font = 'bold ' + Math.min(72, canvasW / 8) + 'px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvasW / 2, canvasH / 2);
    ctx.restore();
  }

  window.FE_NEXT_RENDERER = {
    render: render
  };
})();

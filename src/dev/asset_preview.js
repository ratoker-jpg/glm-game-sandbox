// Four Elements v0.4 dev tool: ASSET-PREVIEW-01
// Debug-only in-game building candidate preview sandbox.
// Allows loading a local PNG candidate and rendering it on the game canvas
// using the same building render pipeline (alpha-bounds, containFit, profile size,
// footprint, vertical offset) to visually validate candidate art before committing
// it as a production asset.
//
// Toggle: press 0 (zero) key, or call FE_ASSET_PREVIEW.toggle()
// No gameplay changes. No production asset changes. No profile tuning.

(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  const state = {
    enabled: false,
    candidateImage: null,       // HTMLImageElement loaded from file input
    candidateFileName: '',
    alphaBounds: null,          // { x, y, w, h } from FE_SPRITE_ALPHA
    footprint: [2, 2],         // selected footprint (1x1, 2x2, 3x3)
    profileSize: 128,          // adjustable profile size (pixels at zoom=1)
    verticalOffset: 14,        // adjustable groundOffset (pixels at zoom=1)
    showFootprintOutline: true, // toggle footprint diamond outline
    showPlatform: true,        // toggle construction-site platform visual
    showAlphaBoundsRect: false, // toggle alpha-bounds rect overlay
    // Position: anchored near player HQ, or fallback to map center
    anchorTileX: null,
    anchorTileY: null
  };

  // ── Helpers ─────────────────────────────────────────────────
  function core() {
    return window.FE_CORE || null;
  }

  function isReadyImage(im) {
    return !!(im && im.complete && im.naturalWidth && im.naturalHeight);
  }

  function getAlphaBounds(im) {
    if (!window.FE_SPRITE_ALPHA || !isReadyImage(im)) return null;
    return window.FE_SPRITE_ALPHA.getAlphaBounds(im, 125);
  }

  // containFit: compute draw dimensions preserving visible aspect ratio
  // within a bounding box. Same logic as the production building pipeline.
  function containFit(srcW, srcH, boxW, boxH) {
    if (!srcW || !srcH || !boxW || !boxH) return { w: boxW, h: boxH };
    const scale = Math.min(boxW / srcW, boxH / srcH);
    return { w: srcW * scale, h: srcH * scale };
  }

  // Find player HQ tile position for placement context
  function findPlayerHqTile() {
    const a = core();
    if (!a || !a.game || !a.game.buildings) return null;
    const hq = a.game.buildings.find(function (b) {
      return b.type === 'hq_base' && b.owner !== 'enemy';
    });
    if (!hq) return null;
    // Place preview 3 tiles to the right of HQ
    return {
      x: hq.x + (hq.w || 3) + 1,
      y: hq.y
    };
  }

  // ── UI Panel ────────────────────────────────────────────────
  let panelEl = null;
  let metadataEl = null;

  function createPanel() {
    if (panelEl) return;

    panelEl = document.createElement('div');
    panelEl.id = 'fe-asset-preview-panel';
    panelEl.style.cssText = [
      'position: fixed',
      'top: 64px',
      'right: 12px',
      'width: 280px',
      'background: rgba(30, 22, 10, 0.94)',
      'border: 1px solid #f0c96a',
      'border-radius: 6px',
      'padding: 10px 12px',
      'font: 12px/1.5 "Courier New", monospace',
      'color: #f0d080',
      'z-index: 9999',
      'display: none',
      'max-height: calc(100vh - 80px)',
      'overflow-y: auto',
      'user-select: none'
    ].join(';');

    // ── Header ──
    var header = document.createElement('div');
    header.style.cssText = 'font-weight:bold;font-size:13px;margin-bottom:8px;color:#ffd35b;border-bottom:1px solid #8a7030;padding-bottom:4px;';
    header.textContent = 'ASSET PREVIEW (0)';
    panelEl.appendChild(header);

    // ── File Input ──
    var fileRow = document.createElement('div');
    fileRow.style.cssText = 'margin-bottom:8px;';
    var fileLabel = document.createElement('label');
    fileLabel.style.cssText = 'display:block;cursor:pointer;background:#3a2e16;border:1px solid #8a7030;border-radius:3px;padding:4px 8px;text-align:center;color:#f0d080;';
    fileLabel.textContent = 'Load PNG Candidate...';
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,.png';
    fileInput.style.cssText = 'display:none;';
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var im = new Image();
        im.onload = function () {
          state.candidateImage = im;
          state.candidateFileName = file.name;
          state.alphaBounds = getAlphaBounds(im);
          updateMetadata();
          fileLabel.textContent = file.name.length > 24 ? file.name.slice(0, 21) + '...' : file.name;
        };
        im.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
    fileLabel.appendChild(fileInput);
    fileRow.appendChild(fileLabel);
    panelEl.appendChild(fileRow);

    // ── Footprint Selector ──
    panelEl.appendChild(makeLabel('Footprint'));
    var fpRow = document.createElement('div');
    fpRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
    [[1,1],[2,2],[3,3]].forEach(function (fp) {
      var btn = document.createElement('button');
      btn.textContent = fp[0] + 'x' + fp[1];
      btn.style.cssText = 'flex:1;padding:4px 0;border:1px solid #8a7030;border-radius:3px;background:' +
        (state.footprint[0] === fp[0] ? '#5a4416' : '#2a1e06') +
        ';color:#f0d080;cursor:pointer;font:inherit;';
      btn.addEventListener('click', function () {
        state.footprint = fp;
        fpRow.querySelectorAll('button').forEach(function (b, i) {
          b.style.background = ([[1,1],[2,2],[3,3]][i][0] === fp[0]) ? '#5a4416' : '#2a1e06';
        });
        updateMetadata();
      });
      fpRow.appendChild(btn);
    });
    panelEl.appendChild(fpRow);

    // ── Profile Size Slider ──
    panelEl.appendChild(makeLabel('Profile Size: ' + state.profileSize + 'px'));
    var sizeSlider = makeSlider(64, 256, state.profileSize, function (v) {
      state.profileSize = v;
      panelEl.querySelector('[data-label=profileSize]').textContent = 'Profile Size: ' + v + 'px';
      updateMetadata();
    });
    sizeSlider.setAttribute('data-label', 'profileSize');
    panelEl.appendChild(sizeSlider);

    // ── Vertical Offset Slider ──
    panelEl.appendChild(makeLabel('Vertical Offset: ' + state.verticalOffset + 'px'));
    var offSlider = makeSlider(-40, 80, state.verticalOffset, function (v) {
      state.verticalOffset = v;
      panelEl.querySelector('[data-label=verticalOffset]').textContent = 'Vertical Offset: ' + v + 'px';
      updateMetadata();
    });
    offSlider.setAttribute('data-label', 'verticalOffset');
    panelEl.appendChild(offSlider);

    // ── Toggles ──
    panelEl.appendChild(makeToggle('Footprint Outline', state.showFootprintOutline, function (v) { state.showFootprintOutline = v; }));
    panelEl.appendChild(makeToggle('Construction Platform', state.showPlatform, function (v) { state.showPlatform = v; }));
    panelEl.appendChild(makeToggle('Alpha-Bounds Rect', state.showAlphaBoundsRect, function (v) { state.showAlphaBoundsRect = v; }));

    // ── Clear Candidate ──
    var clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear Candidate';
    clearBtn.style.cssText = 'width:100%;margin-top:8px;padding:5px 0;border:1px solid #8a7030;border-radius:3px;background:#2a1e06;color:#f0d080;cursor:pointer;font:inherit;';
    clearBtn.addEventListener('click', function () {
      state.candidateImage = null;
      state.candidateFileName = '';
      state.alphaBounds = null;
      fileLabel.textContent = 'Load PNG Candidate...';
      fileInput.value = '';
      updateMetadata();
    });
    panelEl.appendChild(clearBtn);

    // ── Metadata Panel ──
    metadataEl = document.createElement('div');
    metadataEl.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid #8a7030;font-size:11px;line-height:1.6;color:#c0a060;white-space:pre-wrap;';
    panelEl.appendChild(metadataEl);

    document.body.appendChild(panelEl);
  }

  function makeLabel(text) {
    var el = document.createElement('div');
    el.style.cssText = 'font-size:11px;margin-bottom:2px;color:#c0a060;';
    el.textContent = text;
    return el;
  }

  function makeSlider(min, max, val, onChange) {
    var el = document.createElement('input');
    el.type = 'range';
    el.min = min;
    el.max = max;
    el.value = val;
    el.style.cssText = 'width:100%;margin-bottom:6px;accent-color:#f0c96a;';
    el.addEventListener('input', function () { onChange(Number(el.value)); });
    return el;
  }

  function makeToggle(label, initial, onChange) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = initial;
    cb.style.cssText = 'accent-color:#f0c96a;';

    var lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:#c0a060;';
    lbl.textContent = label;

    cb.addEventListener('change', function () { onChange(cb.checked); });

    row.appendChild(cb);
    row.appendChild(lbl);
    return row;
  }

  function updateMetadata() {
    if (!metadataEl) return;
    var im = state.candidateImage;
    var ab = state.alphaBounds;
    var lines = [];

    if (!im) {
      metadataEl.textContent = '(no candidate loaded)';
      return;
    }

    lines.push('File: ' + state.candidateFileName);
    lines.push('Natural: ' + im.naturalWidth + ' x ' + im.naturalHeight);

    if (ab) {
      lines.push('Alpha Bounds: ' + ab.w + ' x ' + ab.h);
      lines.push('Alpha Offset: (' + ab.x + ', ' + ab.y + ')');
      var visAspect = (ab.w / Math.max(1, ab.h)).toFixed(3);
      lines.push('Visible Aspect: ' + visAspect);
    } else {
      lines.push('Alpha Bounds: (not computed)');
    }

    lines.push('Profile Size: ' + state.profileSize + 'px');
    lines.push('Footprint: ' + state.footprint[0] + 'x' + state.footprint[1]);
    lines.push('GroundOffset: ' + state.verticalOffset + 'px');

    // Compute destination rect for display
    var a = core();
    if (a && a.game) {
      var z = a.game.camera.zoom || 1;
      var destInfo = computeDestRect(im, ab, z);
      lines.push('Dest Rect: ' + Math.round(destInfo.x) + ',' + Math.round(destInfo.y) +
        ' ' + Math.round(destInfo.w) + 'x' + Math.round(destInfo.h));
    }

    metadataEl.textContent = lines.join('\n');
  }

  // ── Rendering ───────────────────────────────────────────────

  function computeDestRect(im, ab, zoom) {
    // Use alpha bounds for containFit, fallback to natural dimensions
    var srcW = ab ? ab.w : im.naturalWidth;
    var srcH = ab ? ab.h : im.naturalHeight;
    var boxW = state.profileSize * zoom;
    var boxH = state.profileSize * zoom;
    var fit = containFit(srcW, srcH, boxW, boxH);
    return { x: 0, y: 0, w: fit.w, h: fit.h };
  }

  function drawFootprintDiamond(ctx, tx, ty, w, h, z) {
    var a = core();
    if (!a) return;

    var tileW = a.TILE_W * z;
    var tileH = a.TILE_H * z;

    ctx.save();
    for (var yy = ty; yy < ty + h; yy++) {
      for (var xx = tx; xx < tx + w; xx++) {
        var p = a.tileToScreen(xx, yy);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + tileW / 2, p.y + tileH / 2);
        ctx.lineTo(p.x, p.y + tileH);
        ctx.lineTo(p.x - tileW / 2, p.y + tileH / 2);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 0, 180, 0.95)';
        ctx.lineWidth = Math.max(1, 2 * z);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawConstructionPlatform(ctx, tx, ty, fpW, fpH, z) {
    // Draw the construction-site platform: a filled isometric diamond
    // slightly inset from the exact footprint, representing the safe art target.
    var a = core();
    if (!a) return;

    var tileW = a.TILE_W * z;
    var tileH = a.TILE_H * z;
    var inset = 0.12; // 12% inset from each tile edge = the "safe margin"

    ctx.save();

    // Draw a slightly inset filled diamond for each tile in the footprint
    for (var yy = ty; yy < ty + fpH; yy++) {
      for (var xx = tx; xx < tx + fpW; xx++) {
        var p = a.tileToScreen(xx, yy);

        // Inset diamond: shrink tile diamond by inset percentage
        var hw = tileW / 2 * (1 - inset);
        var hh = tileH / 2 * (1 - inset);

        ctx.beginPath();
        ctx.moveTo(p.x, p.y - hh + tileH / 2);               // top (inset)
        ctx.lineTo(p.x + hw, p.y + tileH / 2);                // right (inset)
        ctx.lineTo(p.x, p.y + hh + tileH / 2);                // bottom (inset)
        ctx.lineTo(p.x - hw, p.y + tileH / 2);                // left (inset)
        ctx.closePath();

        // Fill with sand/construction color
        ctx.fillStyle = 'rgba(160, 120, 50, 0.30)';
        ctx.fill();

        // Platform border
        ctx.strokeStyle = 'rgba(200, 160, 60, 0.70)';
        ctx.lineWidth = Math.max(1, 1.5 * z);
        ctx.stroke();
      }
    }

    // Draw a single unified platform outline around the entire footprint
    // This shows the "safe art target" area
    var centerP = a.tileToScreen(tx + fpW / 2 - 0.5, ty + fpH / 2 - 0.5);
    var totalW = fpW * tileW;
    var totalH = fpH * tileH;
    var platformHw = totalW / 2 * (1 - inset * 0.5);
    var platformHh = totalH / 2 * (1 - inset * 0.5);

    ctx.beginPath();
    ctx.moveTo(centerP.x, centerP.y - platformHh);
    ctx.lineTo(centerP.x + platformHw, centerP.y);
    ctx.lineTo(centerP.x, centerP.y + platformHh);
    ctx.lineTo(centerP.x - platformHw, centerP.y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(180, 140, 50, 0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 200, 80, 0.85)';
    ctx.lineWidth = Math.max(1, 2 * z);
    ctx.stroke();

    ctx.restore();
  }

  function drawCandidateOnCanvas(ctx) {
    var a = core();
    if (!a || !a.game) return;

    var im = state.candidateImage;
    if (!isReadyImage(im)) return;

    var game = a.game;
    var z = game.camera.zoom || 1;
    var ab = state.alphaBounds || getAlphaBounds(im);
    state.alphaBounds = ab;

    var fpW = state.footprint[0];
    var fpH = state.footprint[1];

    // Find anchor tile position
    var anchor = findPlayerHqTile();
    if (!anchor) {
      // Fallback: center of visible area
      anchor = { x: Math.floor(game.mapW / 2), y: Math.floor(game.mapH / 2) };
    }
    state.anchorTileX = anchor.x;
    state.anchorTileY = anchor.y;

    // Center of footprint (same logic as drawBuilding)
    var cx = anchor.x + fpW / 2 - 0.5;
    var cy = anchor.y + fpH / 2 - 0.5;

    var p = a.tileToScreen(cx, cy);

    // ── Draw construction platform (under candidate) ──
    if (state.showPlatform) {
      drawConstructionPlatform(ctx, anchor.x, anchor.y, fpW, fpH, z);
    }

    // ── Draw footprint diamond outline ──
    if (state.showFootprintOutline) {
      drawFootprintDiamond(ctx, anchor.x, anchor.y, fpW, fpH, z);
    }

    // ── Draw candidate sprite using same pipeline as drawBuilding ──
    // groundFactor and groundOffset from profile, matching building render logic
    var groundFactor = 1.00;
    var groundOffset = state.verticalOffset;

    var bottomY = p.y + a.TILE_H * z * groundFactor + groundOffset * z;
    var drawX = p.x;
    var drawY = bottomY;

    // containFit: use alpha bounds for source dimensions, profile size for box
    var srcW = ab ? ab.w : im.naturalWidth;
    var srcH = ab ? ab.h : im.naturalHeight;
    var boxW = state.profileSize * z;
    var boxH = state.profileSize * z;
    var fit = containFit(srcW, srcH, boxW, boxH);

    var anchorX = 0.5;
    var anchorY = 1.0;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(drawX, drawY);

    // Use 9-arg drawImage with alpha-bounds source crop (same as production pipeline)
    if (ab && (ab.x > 0 || ab.y > 0 || ab.w < im.naturalWidth || ab.h < im.naturalHeight)) {
      ctx.drawImage(im, ab.x, ab.y, ab.w, ab.h,
        -fit.w * anchorX, -fit.h * anchorY, fit.w, fit.h);
    } else {
      ctx.drawImage(im, -fit.w * anchorX, -fit.h * anchorY, fit.w, fit.h);
    }

    ctx.restore();

    // ── Draw alpha-bounds debug rect ──
    if (state.showAlphaBoundsRect && ab) {
      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.90)';
      ctx.lineWidth = Math.max(1, 2 * z);
      ctx.setLineDash([6 * z, 4 * z]);
      ctx.strokeRect(-fit.w * anchorX, -fit.h * anchorY, fit.w, fit.h);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── Draw anchor point ──
    ctx.save();
    ctx.fillStyle = 'rgba(255, 50, 50, 0.95)';
    ctx.beginPath();
    ctx.arc(drawX, drawY, Math.max(4, 5 * z), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Draw candidate label on canvas ──
    ctx.save();
    ctx.fillStyle = 'rgba(255, 210, 90, 0.95)';
    ctx.font = 'bold ' + Math.round(11 * z) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('[PREVIEW] ' + (state.candidateFileName || ''), drawX, drawY - fit.h - 6 * z);
    ctx.restore();

    // ── Update metadata ──
    updateMetadata();
  }

  // ── Toggle / API ────────────────────────────────────────────
  function toggle() {
    state.enabled = !state.enabled;
    if (state.enabled) {
      createPanel();
      panelEl.style.display = 'block';
      console.warn('[FE ASSET PREVIEW] ON — press 0 to toggle');
    } else {
      if (panelEl) panelEl.style.display = 'none';
      console.warn('[FE ASSET PREVIEW] OFF');
    }
  }

  function on() {
    if (!state.enabled) toggle();
  }

  function off() {
    if (state.enabled) toggle();
  }

  // ── Hook into render loop ───────────────────────────────────
  // The game's render() function calls FE_ASSET_PREVIEW.draw(ctx)
  // after fog overlay and combat debug, before the frame ends.
  // No separate rAF loop needed — avoids flicker and race conditions.
  var _hookInstalled = false;

  function installRenderHook() {
    if (_hookInstalled) return;
    _hookInstalled = true;
    // Hook is in main.js render() — nothing to install here.
    // This function exists for API compatibility and future use.
  }

  // ── Keyboard shortcut ───────────────────────────────────────
  if (!window.__FE_ASSET_PREVIEW_KEY_INSTALLED) {
    window.__FE_ASSET_PREVIEW_KEY_INSTALLED = true;

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;

      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        toggle();
        if (state.enabled) installRenderHook();
      }
    });
  }

  // ── Public API ──────────────────────────────────────────────
  window.FE_ASSET_PREVIEW = {
    toggle: toggle,
    on: on,
    off: off,
    state: state,
    draw: drawCandidateOnCanvas,
    installRenderHook: installRenderHook
  };

  console.warn('[Four Elements] asset_preview.js loaded; press 0 to toggle preview mode');
})();

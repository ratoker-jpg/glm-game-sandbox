// FEN-02: Minimal asset loader with manifest-based loading.
// Loads Image objects from a manifest of paths. Never throws.
// Missing assets return null from get() — callers must use geometric fallback.
// Exposed as window.FE_NEXT_ASSETS.

(function () {
  'use strict';

  /**
   * Create a new asset store.
   * @returns {object} Asset store with loadManifest, get, stats methods.
   */
  function createAssetStore() {
    var cache = {};       // key -> HTMLImageElement (only if loaded successfully)
    var pending = {};     // key -> true (currently loading)
    var failed = {};      // key -> true (failed to load)

    /**
     * Load all assets from a manifest object.
     * Manifest format: { key: 'path/to/image.png', ... }
     * Loading is asynchronous and non-blocking.
     * Already-loaded or pending assets are skipped.
     *
     * @param {object} manifest - Key-to-path mapping
     */
    function loadManifest(manifest) {
      if (!manifest) return;
      var keys = Object.keys(manifest);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var path = manifest[key];
        loadSingle(key, path);
      }
    }

    /**
     * Load a single asset by key and path.
     * @param {string} key
     * @param {string} path
     */
    function loadSingle(key, path) {
      // Skip if already loaded, pending, or failed
      if (cache[key] || pending[key]) return;

      pending[key] = true;

      var img = new Image();
      img.onload = function () {
        cache[key] = img;
        delete pending[key];
      };
      img.onerror = function () {
        // Silently fail — renderer will use geometric fallback
        failed[key] = true;
        delete pending[key];
        console.warn('[FE Next Assets] Failed to load: ' + key + ' from ' + path);
      };

      // Set src last (triggers load)
      img.src = path;
    }

    /**
     * Get a loaded asset by key.
     * Returns null if not loaded yet, failed, or unknown key.
     *
     * @param {string} key
     * @returns {HTMLImageElement|null}
     */
    function get(key) {
      return cache[key] || null;
    }

    /**
     * Get loading statistics.
     * @returns {object} { loaded, pending, failed }
     */
    function stats() {
      return {
        loaded: Object.keys(cache).length,
        pending: Object.keys(pending).length,
        failed: Object.keys(failed).length
      };
    }

    return {
      loadManifest: loadManifest,
      loadSingle: loadSingle,
      get: get,
      stats: stats
    };
  }

  window.FE_NEXT_ASSETS = {
    createAssetStore: createAssetStore
  };
})();

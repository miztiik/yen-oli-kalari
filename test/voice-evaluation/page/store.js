/* Where a listener's judgements live.
 *
 * IndexedDB with a localStorage fallback, because localStorage caps near 5 MB
 * and this page accumulates a verdict, four scores, a note and a list of
 * timestamped defects for every clip of every run - plus a pairwise vote for
 * every A/B comparison. Twenty-four clips across six runs is already thousands
 * of small writes, and localStorage would start throwing QuotaExceededError
 * partway through a listening session, which is the worst possible moment.
 *
 * Nothing leaves the browser. There is no account, no sync and no endpoint -
 * the export button is the only way data moves, and a person has to press it.
 *
 * The API is deliberately async even on the fallback path, so the page never
 * has to know which store it got.
 */

(function (global) {
	'use strict';

	var DB_NAME = 'yen-oli-kalari-evaluation';
	var DB_VERSION = 1;
	var STORE = 'judgements';
	var FALLBACK_KEY = 'yen-oli-kalari:voice-evaluation:v2';

	var db = null;
	var usingFallback = false;

	function openDatabase() {
		return new Promise(function (resolve) {
			if (!global.indexedDB) {
				usingFallback = true;
				resolve(null);
				return;
			}
			var request = global.indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = function (event) {
				var database = event.target.result;
				if (!database.objectStoreNames.contains(STORE)) {
					database.createObjectStore(STORE);
				}
			};
			request.onsuccess = function () {
				db = request.result;
				resolve(db);
			};
			/* A browser in private mode can refuse IndexedDB outright. Falling
			   back is better than a page that will not score. */
			request.onerror = function () {
				usingFallback = true;
				resolve(null);
			};
		});
	}

	function fallbackRead() {
		try {
			var raw = global.localStorage.getItem(FALLBACK_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch (e) {
			return null;
		}
	}

	function fallbackWrite(value) {
		try {
			global.localStorage.setItem(FALLBACK_KEY, JSON.stringify(value));
			return true;
		} catch (e) {
			return false;
		}
	}

	function get(key) {
		if (usingFallback || !db) {
			var all = fallbackRead();
			return Promise.resolve(all ? all[key] : undefined);
		}
		return new Promise(function (resolve) {
			var request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
			request.onsuccess = function () { resolve(request.result); };
			request.onerror = function () { resolve(undefined); };
		});
	}

	function put(key, value) {
		if (usingFallback || !db) {
			var all = fallbackRead() || {};
			all[key] = value;
			return Promise.resolve(fallbackWrite(all));
		}
		return new Promise(function (resolve) {
			var request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
			request.onsuccess = function () { resolve(true); };
			request.onerror = function () { resolve(false); };
		});
	}

	function clear() {
		if (usingFallback || !db) {
			try { global.localStorage.removeItem(FALLBACK_KEY); } catch (e) { /* ignore */ }
			return Promise.resolve(true);
		}
		return new Promise(function (resolve) {
			var request = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
			request.onsuccess = function () { resolve(true); };
			request.onerror = function () { resolve(false); };
		});
	}

	/* How much room is left, so a listener is warned before a write fails
	   rather than after. Not every browser implements it. */
	function estimate() {
		if (!global.navigator || !global.navigator.storage || !global.navigator.storage.estimate) {
			return Promise.resolve(null);
		}
		return global.navigator.storage.estimate().catch(function () { return null; });
	}

	global.EvaluationStore = {
		ready: openDatabase().then(function () {
			return { usingFallback: usingFallback };
		}),
		get: get,
		put: put,
		clear: clear,
		estimate: estimate,
		isFallback: function () { return usingFallback; }
	};
})(window);

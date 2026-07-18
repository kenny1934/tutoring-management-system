/* MathConcept Companion Games — GameBridge
 *
 * The one shared runtime every game uses for:
 *   i18n     — bilingual string tables, ?lang=c|e, in-game toggle
 *   theme    — light/dark via [data-theme], ?theme= override
 *   rooms    — multi-device sync over Firebase RTDB REST + SSE
 *              (no SDK, no WebRTC: works on centre Wi-Fi, survives
 *              phone screen-lock via automatic SSE reconnect)
 *   lesson   — postMessage events to CSM Lesson Mode when embedded
 *
 * Classic script, exposes window.GameBridge. Load qrcode.js first if
 * the game uses GameBridge.qr().
 */
(function () {
  "use strict";

  var DB_URL =
    "https://csm-database-project-default-rtdb.asia-southeast1.firebasedatabase.app";
  var ROOT = "game-rooms"; // rules for this node live in growing-minds database.rules.json

  var params = new URLSearchParams(location.search);

  /* ---------------- anonymous auth ----------------
   * The game-rooms rules require a signed-in user: reads need auth,
   * writes are scoped to the room's hostUid / each player entry's uid.
   * REST flow, no SDK: identitytoolkit signUp once per device (the uid
   * + refresh token persist in localStorage, so the same device keeps
   * the same identity across tabs and reloads), securetoken refresh
   * near expiry. The web API key is a public identifier, not a secret
   * — it ships in every Firebase client bundle. */
  var API_KEY = "AIzaSyDOAqE0DKY-0eSQAi5uMnlDJ3q1lf_N9_g";
  var AUTH_STORE = "mc-games-auth";
  var auth = null; // { uid, idToken, refreshToken, expiresAt }
  var authPromise = null;

  function loadAuth() {
    if (auth) return;
    try {
      var saved = JSON.parse(localStorage.getItem(AUTH_STORE));
      if (saved && saved.uid && saved.refreshToken) auth = saved;
    } catch (_) {}
  }

  function storeAuth() {
    try {
      localStorage.setItem(AUTH_STORE, JSON.stringify(auth));
    } catch (_) {}
  }

  function authPost(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok)
        return r
          .json()
          .catch(function () { return {}; })
          .then(function (e) {
            throw new Error(
              "auth " + r.status + " " + ((e.error && e.error.message) || "")
            );
          });
      return r.json();
    });
  }

  function signUp() {
    return authPost(
      "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + API_KEY,
      { returnSecureToken: true }
    ).then(function (d) {
      auth = {
        uid: d.localId,
        idToken: d.idToken,
        refreshToken: d.refreshToken,
        expiresAt: Date.now() + (parseInt(d.expiresIn, 10) - 300) * 1000,
      };
      storeAuth();
      return auth;
    });
  }

  function refreshAuth() {
    return authPost(
      "https://securetoken.googleapis.com/v1/token?key=" + API_KEY,
      { grant_type: "refresh_token", refresh_token: auth.refreshToken }
    ).then(function (d) {
      auth.uid = d.user_id || auth.uid;
      auth.idToken = d.id_token;
      auth.refreshToken = d.refresh_token || auth.refreshToken;
      auth.expiresAt = Date.now() + (parseInt(d.expires_in, 10) - 300) * 1000;
      storeAuth();
      return auth;
    });
  }

  /* Resolve a live auth record, minting or refreshing as needed.
   * force=true discards the cached idToken (after a 401 / revoke). */
  function ensureAuth(force) {
    loadAuth();
    if (!force && auth && auth.idToken && Date.now() < auth.expiresAt)
      return Promise.resolve(auth);
    if (!authPromise) {
      var attempt =
        auth && auth.refreshToken
          ? refreshAuth().catch(function () {
              // refresh token revoked or account deleted: start over
              auth = null;
              return signUp();
            })
          : signUp();
      authPromise = attempt.then(
        function (a) { authPromise = null; return a; },
        function (err) { authPromise = null; throw err; }
      );
    }
    return authPromise;
  }

  /* ---------------- i18n ---------------- */
  // Lang codes follow the courseware convention: c = 中文, e = English.
  var strings = {};
  var lang = null;

  function detectLang() {
    var q = params.get("lang");
    if (q === "c" || q === "e") return q;
    try {
      var saved = localStorage.getItem("mc-games-lang");
      if (saved === "c" || saved === "e") return saved;
    } catch (_) {}
    return "c"; // Traditional Chinese default (Macau)
  }

  /* Strings may mark CJK phrase boundaries with "|" — lines then wrap
   * only between phrases (rendered as inline-block segments), never
   * inside one. t() strips the markers, so direct use is always safe. */
  function rawT(key) {
    var entry = strings[key];
    if (!entry) return "⟦" + key + "⟧"; // loud missing-string marker
    return entry[lang] !== undefined ? entry[lang] : "⟦" + key + ":" + lang + "⟧";
  }

  function t(key) {
    return rawT(key).split("|").join("");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function applyI18n(root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(function (el) {
      var raw = rawT(el.getAttribute("data-i18n"));
      if (raw.indexOf("|") === -1) {
        el.textContent = raw;
      } else {
        el.innerHTML = raw
          .split("|")
          .map(function (seg) {
            return '<span style="display:inline-block">' + escapeHtml(seg) + "</span>";
          })
          .join("");
      }
    });
    (root || document)
      .querySelectorAll("[data-i18n-placeholder]")
      .forEach(function (el) {
        el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
      });
    document.documentElement.lang = lang === "c" ? "zh-Hant" : "en";
  }

  function initI18n(table) {
    strings = table || {};
    lang = detectLang();
    applyI18n();
  }

  function setLang(next) {
    lang = next === "e" ? "e" : "c";
    try {
      localStorage.setItem("mc-games-lang", lang);
    } catch (_) {}
    applyI18n();
    document.dispatchEvent(new CustomEvent("mc:lang", { detail: lang }));
  }

  /* ---------------- theme ---------------- */
  function initTheme() {
    var q = params.get("theme");
    var saved = null;
    try {
      saved = localStorage.getItem("mc-games-theme");
    } catch (_) {}
    var mode = q === "dark" || q === "light" ? q : saved;
    if (mode) document.documentElement.setAttribute("data-theme", mode);
    // no attribute → theme.css follows prefers-color-scheme
  }

  function toggleTheme() {
    var el = document.documentElement;
    var current =
      el.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = current === "dark" ? "light" : "dark";
    el.setAttribute("data-theme", next);
    try {
      localStorage.setItem("mc-games-theme", next);
    } catch (_) {}
    return next;
  }

  /* ---------------- RTDB REST helpers ---------------- */
  function dbUrl(path, token) {
    return (
      DB_URL + "/" + ROOT + "/" + path + ".json" +
      (token ? "?auth=" + encodeURIComponent(token) : "")
    );
  }

  /* Authenticated fetch with one forced-refresh retry: RTDB REST
   * answers 401 both for an expired token and a rules denial, so a
   * single retry with a fresh token disambiguates cheaply. */
  function dbFetch(path, opts, label) {
    return ensureAuth()
      .then(function (a) {
        return fetch(dbUrl(path, a.idToken), opts).then(function (r) {
          if (r.status !== 401) return r;
          return ensureAuth(true).then(function (a2) {
            return fetch(dbUrl(path, a2.idToken), opts);
          });
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error("db " + label + " " + r.status);
        return r;
      });
  }

  function dbGet(path) {
    return dbFetch(path, undefined, "get").then(function (r) {
      return r.json();
    });
  }

  function dbSet(path, value) {
    return dbFetch(path, { method: "PUT", body: JSON.stringify(value) }, "set")
      .then(function () {});
  }

  function dbUpdate(path, patch) {
    return dbFetch(path, { method: "PATCH", body: JSON.stringify(patch) }, "update")
      .then(function () {});
  }

  /* Watch a path via Server-Sent Events. Calls cb(fullValue) on every
   * change; reconnects automatically with backoff (phones resume after
   * screen-lock). Returns { close() }. */
  function dbWatch(path, cb, onStatus) {
    var es = null;
    var closed = false;
    var backoff = 1000;
    var value = null;

    function status(s) {
      if (onStatus) onStatus(s);
      var pill = document.querySelector(".mc-conn");
      if (pill) pill.setAttribute("data-conn", s);
    }

    function applyPatch(base, subPath, data) {
      if (subPath === "/" || subPath === "") return data;
      var keys = subPath.replace(/^\//, "").split("/");
      var root = base && typeof base === "object" ? base : {};
      var node = root;
      for (var i = 0; i < keys.length - 1; i++) {
        if (typeof node[keys[i]] !== "object" || node[keys[i]] === null)
          node[keys[i]] = {};
        node = node[keys[i]];
      }
      if (data === null) delete node[keys[keys.length - 1]];
      else node[keys[keys.length - 1]] = data;
      return root;
    }

    var forceRefresh = false;

    function retry() {
      if (closed) return;
      status("reconnecting");
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 15000);
    }

    function connect() {
      if (closed) return;
      ensureAuth(forceRefresh).then(function (a) {
        forceRefresh = false;
        if (closed) return;
        es = new EventSource(dbUrl(path, a.idToken));
        es.addEventListener("put", function (e) {
          var msg = JSON.parse(e.data);
          value = applyPatch(value, msg.path, msg.data);
          backoff = 1000;
          status("online");
          cb(value);
        });
        es.addEventListener("patch", function (e) {
          var msg = JSON.parse(e.data);
          var target = msg.path.replace(/^\//, "");
          Object.keys(msg.data || {}).forEach(function (k) {
            value = applyPatch(value, "/" + (target ? target + "/" : "") + k, msg.data[k]);
          });
          cb(value);
        });
        // the stream's token expired (streams outlive the 1h idToken on
        // a long lobby) or rules revoked the read: fresh token, rejoin
        es.addEventListener("auth_revoked", function () {
          forceRefresh = true;
          es.close();
          retry();
        });
        es.addEventListener("cancel", function () {
          es.close();
          retry();
        });
        es.onerror = function () {
          es.close();
          retry();
        };
      }, retry);
    }
    connect();
    return {
      close: function () {
        closed = true;
        if (es) es.close();
        status("offline");
      },
    };
  }

  /* ---------------- rooms ---------------- */
  /* 6 chars, no 0/O/1/I lookalikes: readable off a projector, and a
   * ~1e9 space so codes can't be enumerated from the open internet
   * (the old 4-digit space was brute-forceable). 32 divides 2^32, so
   * the modulo introduces no bias. */
  var CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  function randomCode() {
    var buf = new Uint32Array(6);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    else
      for (var i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 4294967296);
    var out = "";
    for (var j = 0; j < 6; j++) out += CODE_ALPHABET[buf[j] % 32];
    return out;
  }

  /* Host a room. Resolves { code, joinUrl, set, update, watch, close }.
   * Room lives at game-rooms/<slug>/<code>. Pass opts.code to reclaim
   * an existing room after a host refresh: the room data is kept and
   * only the handle is rebuilt (the host then re-publishes state). */
  function host(opts) {
    var slug = opts.slug;
    function handle(code) {
      var path = slug + "/" + code;
      return {
        code: code,
        joinUrl:
          location.origin +
          location.pathname +
          "?room=" +
          code +
          (lang ? "&lang=" + lang : ""),
        set: function (sub, v) {
          return dbSet(path + "/" + sub, v);
        },
        update: function (sub, patch) {
          return dbUpdate(path + "/" + sub, patch);
        },
        watch: function (cb, onStatus) {
          return dbWatch(path, cb, onStatus);
        },
        close: function () {
          return dbSet(path, null);
        },
      };
    }
    if (opts.code) {
      return ensureAuth().then(function (a) {
        return dbGet(slug + "/" + opts.code).then(function (existing) {
          if (!existing) throw new Error("room gone");
          // rules deny the writes anyway; failing here gives the UI a
          // clean message instead of a half-reclaimed room
          if (existing.hostUid && existing.hostUid !== a.uid)
            throw new Error("not your room");
          return handle(opts.code);
        });
      });
    }
    function tryCreate(attempt) {
      var code = randomCode();
      var path = slug + "/" + code;
      return dbGet(path).then(function (existing) {
        var stale =
          existing &&
          existing.createdAt &&
          Date.now() - existing.createdAt > 6 * 3600 * 1000;
        if (existing && !stale) {
          if (attempt >= 8) throw new Error("no free room code");
          return tryCreate(attempt + 1);
        }
        return ensureAuth().then(function (a) {
          return dbSet(path, {
            createdAt: Date.now(),
            slug: slug,
            hostUid: a.uid, // rules scope state/verdict writes to this uid
            state: opts.initialState || {},
          }).then(function () {
            return handle(code);
          });
        });
      });
    }
    return tryCreate(0);
  }

  /* Join an existing room (code from opts.code or ?room=). Resolves the
   * same handle shape as host(), or rejects if the room doesn't exist. */
  function join(opts) {
    var slug = opts.slug;
    var code = opts.code || params.get("room");
    if (!code) return Promise.reject(new Error("no room code"));
    var path = slug + "/" + code;
    return dbGet(path).then(function (room) {
      if (!room) throw new Error("room not found");
      return {
        code: code,
        set: function (sub, v) {
          return dbSet(path + "/" + sub, v);
        },
        update: function (sub, patch) {
          return dbUpdate(path + "/" + sub, patch);
        },
        watch: function (cb, onStatus) {
          return dbWatch(path, cb, onStatus);
        },
      };
    });
  }

  /* ---------------- QR ---------------- */
  /* Render a QR for a URL into a container element. Needs vendor/qrcode.js. */
  function qr(el, url, size) {
    if (typeof qrcode !== "function") {
      el.textContent = url;
      return;
    }
    var q = qrcode(0, "M");
    q.addData(url);
    q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2 });
    var svg = el.querySelector("svg");
    if (svg) {
      svg.style.width = (size || 180) + "px";
      svg.style.height = (size || 180) + "px";
      svg.style.background = "#fff";
      svg.style.borderRadius = "8px";
    }
  }

  /* ---------------- lesson-mode events ---------------- */
  /* Emit game lifecycle events to the embedding CSM Lesson Mode iframe
   * host. Contract: { source: "mc-game", slug, event, payload }.
   * Events: "ready" | "start" | "complete" | "score". */
  function emit(slug, event, payload) {
    if (window.parent === window) return; // standalone, not embedded
    window.parent.postMessage(
      { source: "mc-game", slug: slug, event: event, payload: payload || {} },
      "*"
    );
  }

  window.GameBridge = {
    initI18n: initI18n,
    t: t,
    applyI18n: applyI18n,
    setLang: setLang,
    getLang: function () {
      return lang;
    },
    initTheme: initTheme,
    toggleTheme: toggleTheme,
    host: host,
    join: join,
    /* the device's stable anonymous uid, or null before the first
     * host()/join() ever authenticated on this device. Synchronous on
     * purpose: games attach it to player records they write. */
    uid: function () {
      loadAuth();
      return (auth && auth.uid) || null;
    },
    roomParam: function () {
      return params.get("room");
    },
    qr: qr,
    emit: emit,
  };
})();

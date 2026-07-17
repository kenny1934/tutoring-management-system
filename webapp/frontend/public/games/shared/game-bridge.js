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
  function dbUrl(path) {
    return DB_URL + "/" + ROOT + "/" + path + ".json";
  }

  function dbGet(path) {
    return fetch(dbUrl(path)).then(function (r) {
      if (!r.ok) throw new Error("db get " + r.status);
      return r.json();
    });
  }

  function dbSet(path, value) {
    return fetch(dbUrl(path), {
      method: "PUT",
      body: JSON.stringify(value),
    }).then(function (r) {
      if (!r.ok) throw new Error("db set " + r.status);
    });
  }

  function dbUpdate(path, patch) {
    return fetch(dbUrl(path), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then(function (r) {
      if (!r.ok) throw new Error("db update " + r.status);
    });
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

    function connect() {
      if (closed) return;
      es = new EventSource(dbUrl(path));
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
      es.onerror = function () {
        es.close();
        if (closed) return;
        status("reconnecting");
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 15000);
      };
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
  function randomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
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
      return dbGet(slug + "/" + opts.code).then(function (existing) {
        if (!existing) throw new Error("room gone");
        return handle(opts.code);
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
        return dbSet(path, {
          createdAt: Date.now(),
          slug: slug,
          state: opts.initialState || {},
        }).then(function () {
          return handle(code);
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
    roomParam: function () {
      return params.get("room");
    },
    qr: qr,
    emit: emit,
  };
})();

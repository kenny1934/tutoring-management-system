/* MathConcept companion games — shared room protocol helpers
 *
 * The multi-device round protocol, promoted out of Zero Blast for
 * game #2. The shape every game shares (documented in full in
 * docs/companion-games/CONVENTIONS.md §6.5):
 *
 *   state     host-published, phones render from it. { phase, level,
 *             deadlineEpoch, claims, scores, ... } — phases: lobby →
 *             playing ⇄ paused → reveal | cooldown → … → end. The
 *             published level must carry NO answer key.
 *   players/<pid>   one entry per phone: { name, joinedAt, uid }.
 *             The rules pin it to the device uid; the host still
 *             filters ids and truncates names (defence in depth).
 *   subs/<pid>      one slot per player: { v, seq, lv, ts }. seq
 *             strictly increases; lv binds the answer to a round.
 *   verdicts/<pid>  host-only, private: the judged result, including
 *             any host-computed working the phone should render.
 *
 * These helpers are the protocol's mechanical parts — id hygiene and
 * the seq-dedupe judging loop — kept engine-agnostic so each game
 * brings its own judging and rendering.
 */
(function () {
  "use strict";

  /* client-generated player ids: anything else under players/ or
   * subs/ is junk or an attack (an RTDB key like "__proto__" would
   * resolve processedSeq[pid] to Object.prototype and misfire the
   * dedupe). Must agree with the deployed rules' $pid pattern. */
  var PID_RE = /^p[a-z0-9]{6,10}$/;

  var PID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
  function newPid() {
    var s = "";
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint8Array(6);
      crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) s += PID_ALPHABET[a[i] % 36];
    } else {
      s = Math.random().toString(36).slice(2, 8);
    }
    return "p" + s;
  }

  /* the host's view of players/: ids filtered to the client shape,
   * names truncated (rules cap at 24 chars; one oversize write must
   * never thrash the projector layout) */
  function sanePlayers(raw, maxName) {
    var out = {};
    Object.keys(raw || {}).forEach(function (pid) {
      if (!PID_RE.test(pid)) return;
      var pl = raw[pid] || {};
      out[pid] = Object.assign({}, pl, { name: String(pl.name || "").slice(0, maxName || 24) });
    });
    return out;
  }

  /* the judging loop: one slot per player, seq strictly increasing.
   * Mutates processedSeq (the host's dedupe book — persist it in the
   * host's resume snapshot).
   *
   *   opts.paused()    true → leave the sub unconsumed; the resume
   *                    publish triggers a snapshot that judges it then
   *   opts.idle()      true → consumed but not judged (between rounds)
   *   opts.levelSeq()  current round's seq, or null; a sub carrying a
   *                    different lv is dropped (a delayed answer must
   *                    not be judged against the next equation)
   *   opts.judge(pid, sub)  the game's verdict path
   */
  function drainSubs(subs, processedSeq, opts) {
    Object.keys(subs || {}).forEach(function (pid) {
      if (!PID_RE.test(pid)) return;
      var sub = subs[pid];
      if (!sub || typeof sub.seq !== "number" || typeof sub.v !== "number") return;
      if ((processedSeq[pid] || 0) >= sub.seq) return;
      if (opts.paused && opts.paused()) return;
      processedSeq[pid] = sub.seq;
      if (opts.idle && opts.idle()) return;
      if (typeof sub.lv === "number" && opts.levelSeq) {
        var lv = opts.levelSeq();
        if (lv != null && sub.lv !== lv) return;
      }
      opts.judge(pid, sub);
    });
  }

  window.MCRoom = {
    PID_RE: PID_RE,
    newPid: newPid,
    sanePlayers: sanePlayers,
    drainSubs: drainSubs,
  };
})();

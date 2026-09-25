/* Umumiy yordamchi funksiyalar */
window.U = (function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function parseNum(str) { var d = String(str).replace(/[^\d]/g, ""); return d === "" ? null : parseInt(d, 10); }
  function pad(x) { return (x < 10 ? "0" : "") + x; }
  function todayISO() { // Toshkent vaqti bo'yicha
    var d = new Date(Date.now() + (5 * 60 + new Date().getTimezoneOffset()) * 60000);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function dmy(iso) { if (!iso) return ""; var p = String(iso).slice(0, 10).split("-"); return p[2] + "." + p[1] + "." + p[0]; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var toastTimer;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }
  function norm(s) { return String(s || "").trim().replace(/\s+/g, " ").toLowerCase(); }

  // Oddiy modal oyna. opts: {title, body(html|Node), wide, actions:[{label, cls, onClick(close)}]}
  function modal(opts) {
    var root = $("modalRoot");
    var back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = '<div class="modal' + (opts.wide ? " wide" : "") + '" role="dialog" aria-modal="true">' +
      '<div class="modal-h"><h3></h3><button class="btn sm ghost" data-x type="button" aria-label="Yopish">✕</button></div>' +
      '<div class="modal-b"></div><div class="modal-f"></div></div>';
    back.querySelector("h3").textContent = opts.title || "";
    var b = back.querySelector(".modal-b");
    if (typeof opts.body === "string") b.innerHTML = opts.body; else if (opts.body) b.appendChild(opts.body);
    function close() { back.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    back.querySelector("[data-x]").onclick = close;
    back.addEventListener("mousedown", function (e) { if (e.target === back) close(); });
    var f = back.querySelector(".modal-f");
    (opts.actions || []).forEach(function (a) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "btn " + (a.cls || ""); btn.textContent = a.label;
      btn.onclick = async function () {
        if (!a.onClick) return close();
        btn.disabled = true;
        try { await a.onClick(close, back); } finally { btn.disabled = false; }
      };
      f.appendChild(btn);
    });
    if (!opts.actions || !opts.actions.length) f.remove();
    root.appendChild(back);
    var first = back.querySelector(".modal-b input, .modal-b select, .modal-b textarea");
    if (first) first.focus();
    return { el: back, close: close };
  }
  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      var done = false;
      var m = modal({ title: title, body: "<p>" + esc(text) + "</p>", actions: [
        { label: "Bekor qilish", onClick: function (close) { done = true; resolve(false); close(); } },
        { label: okLabel || "Ha", cls: "danger", onClick: function (close) { done = true; resolve(true); close(); } }
      ] });
      var obs = new MutationObserver(function () { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
      obs.observe($("modalRoot"), { childList: true });
    });
  }
  function download(filename, buf, mime) {
    var url = URL.createObjectURL(new Blob([buf], { type: mime || "application/octet-stream" }));
    var a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }
  return { $: $, fmt: fmt, parseNum: parseNum, todayISO: todayISO, dmy: dmy, esc: esc, toast: toast, norm: norm, modal: modal, confirm: confirmBox, download: download };
})();

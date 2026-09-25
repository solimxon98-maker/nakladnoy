/*
 * ADMIN PANEL: Agentlar, Klientlar (import bilan), Mahsulotlar, Nakladnoylar tarixi.
 * Barcha yozish amallari bazada ham "faqat admin" deb tekshiriladi (RLS / edge function).
 */
window.ADMIN = (function () {
  "use strict";
  var U = window.U, $ = U.$, API = window.API, esc = U.esc;
  var me = null, tab = "agents";
  var data = { profiles: [], clients: [], products: [] };

  function agents() { return data.profiles.filter(function (p) { return p.role === "agent"; }); }
  function agentName(id) { var p = data.profiles.find(function (x) { return x.id === id; }); return p ? p.full_name : ""; }
  function body() { return $("adminBody"); }
  function loading() { body().innerHTML = '<p class="empty">Yuklanmoqda…</p>'; }
  function errBox(e) { body().innerHTML = '<p class="empty">' + esc(e.message || e) + "</p>"; }

  async function open(profile) {
    if (profile) me = profile;
    await go(tab);
  }
  document.querySelectorAll("#scrAdmin .tab").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.tab); });
  });
  async function go(t) {
    tab = t;
    document.querySelectorAll("#scrAdmin .tab").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === t); });
    loading();
    try {
      if (t === "agents") await renderAgents();
      else if (t === "clients") await renderClients();
      else if (t === "products") await renderProducts();
      else await renderInvoices();
    } catch (e) { errBox(e); }
  }

  // =================================================================
  //  AGENTLAR
  // =================================================================
  async function renderAgents() {
    var res = await Promise.all([API.profiles(), API.clients()]);
    data.profiles = res[0]; data.clients = res[1];
    var counts = {};
    data.clients.forEach(function (c) { if (c.agent_id) counts[c.agent_id] = (counts[c.agent_id] || 0) + 1; });
    var rows = data.profiles.map(function (p) {
      var isAgent = p.role === "agent";
      return '<tr data-id="' + p.id + '">' +
        '<td data-l="Ism">' + esc(p.full_name) + (p.role === "admin" ? ' <span class="pill muted">admin</span>' : "") + "</td>" +
        '<td data-l="Login" class="num">' + esc(p.login) + "</td>" +
        '<td data-l="Holat">' + (p.active ? '<span class="pill">Faol</span>' : '<span class="pill off">Bloklangan</span>') + "</td>" +
        '<td data-l="Klientlar" class="r num">' + (isAgent ? (counts[p.id] || 0) : "–") + "</td>" +
        '<td class="act">' +
          (isAgent ? '<button class="btn sm" data-a="clients">Klientlar</button>' : "") +
          '<button class="btn sm" data-a="edit">Tahrirlash</button>' +
          (isAgent ? '<button class="btn sm ghost danger-text" data-a="del">O\'chirish</button>' : "") +
        "</td></tr>";
    }).join("");
    body().innerHTML =
      '<div class="panel-h"><h2>Agentlar</h2><button class="btn primary sm" id="addAgent" type="button">+ Agent qo\'shish</button></div>' +
      '<div class="dt-wrap"><table class="dt stack"><thead><tr><th>Ism-familiya</th><th>Login</th><th>Holat</th><th class="r">Klientlar</th><th></th></tr></thead><tbody>' +
      (rows || '<tr class="empty-row"><td colspan="5">Agentlar yo\'q</td></tr>') + "</tbody></table></div>";
    $("addAgent").onclick = function () { agentForm(null); };
    body().querySelector("tbody").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-a]"); if (!b) return;
      var p = data.profiles.find(function (x) { return x.id === b.closest("tr").dataset.id; });
      if (b.dataset.a === "edit") agentForm(p);
      else if (b.dataset.a === "clients") assignForm(p);
      else if (b.dataset.a === "del") deleteAgent(p);
    });
  }

  function agentForm(p) {
    var isNew = !p;
    var html =
      '<div class="field"><label for="afName">Ism-familiya</label><input id="afName" value="' + esc(p ? p.full_name : "") + '" placeholder="Отабек Хусниддинов"></div>' +
      '<div class="field"><label for="afLogin">Login</label><input id="afLogin" autocapitalize="none" spellcheck="false" value="' + esc(p ? p.login : "") + '" placeholder="otabek"><span class="note">Kichik lotin harflari, raqam, . _ - (3–32 belgi)</span></div>' +
      '<div class="field"><label for="afPass">' + (isNew ? "Parol" : "Yangi parol") + '</label><input id="afPass" type="text" autocomplete="new-password" placeholder="' + (isNew ? "kamida 6 belgi" : "o'zgartirmaslik uchun bo'sh qoldiring") + '"></div>' +
      (!isNew && p.id !== me.id ? '<label class="toggle"><input id="afActive" type="checkbox"' + (p.active ? " checked" : "") + "> Faol (tizimga kira oladi)</label>" : "") +
      '<p class="form-err" id="afErr"></p>';
    U.modal({ title: isNew ? "Yangi agent" : "Tahrirlash: " + p.full_name, body: html, actions: [
      { label: "Bekor qilish" },
      { label: "Saqlash", cls: "primary", onClick: async function (close) {
        var payload = { full_name: $("afName").value, login: $("afLogin").value.trim().toLowerCase() };
        var pass = $("afPass").value;
        try {
          if (isNew) {
            if (pass.length < 6) throw new Error("Parol kamida 6 belgidan iborat bo'lsin");
            payload.action = "create"; payload.password = pass;
          } else {
            payload.action = "update"; payload.id = p.id;
            if (pass) payload.password = pass;
            if ($("afActive")) payload.active = $("afActive").checked;
          }
          await API.adminUsers(payload);
          close();
          U.toast(isNew ? "Agent qo'shildi" : "Saqlandi");
          if (!isNew && p.id === me.id) { me = await API.myProfile(); $("whoName").textContent = me.full_name; }
          go("agents");
        } catch (e) { $("afErr").textContent = e.message; }
      } }
    ] });
  }

  async function deleteAgent(p) {
    var n = data.clients.filter(function (c) { return c.agent_id === p.id; }).length;
    var ok = await U.confirm("Agentni o'chirish", p.full_name + " (" + p.login + ") o'chiriladi. " +
      (n ? n + " ta klienti biriktirilmagan holatga o'tadi. " : "") + "Uning nakladnoylari tarixda qoladi.", "O'chirish");
    if (!ok) return;
    try { await API.adminUsers({ action: "delete", id: p.id }); U.toast("Agent o'chirildi"); go("agents"); }
    catch (e) { U.toast(e.message); }
  }

  function assignForm(p) {
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="search" style="margin-bottom:10px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input id="asSearch" type="search" placeholder="Klient qidirish…" autocomplete="off"></div>' +
      '<div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><label class="toggle"><input id="asOnly" type="checkbox"> Faqat belgilanganlar</label><span class="note" id="asCount"></span></div>' +
      '<div class="check-list" id="asList"></div>' +
      '<p class="note" style="margin-top:8px">Boshqa agentdagi klientni belgilasangiz, u shu agentga o\'tkaziladi.</p>';
    var sel = {};
    data.clients.forEach(function (c) { if (c.agent_id === p.id) sel[c.id] = true; });
    function draw() {
      var q = U.norm(wrap.querySelector("#asSearch").value), only = wrap.querySelector("#asOnly").checked;
      var list = data.clients.filter(function (c) { return (!q || U.norm(c.name).indexOf(q) !== -1) && (!only || sel[c.id]); });
      var shown = list.slice(0, 500);
      wrap.querySelector("#asList").innerHTML = shown.map(function (c) {
        var other = c.agent_id && c.agent_id !== p.id ? agentName(c.agent_id) : "";
        return '<label class="check-item"><input type="checkbox" data-id="' + c.id + '"' + (sel[c.id] ? " checked" : "") + "><span>" + esc(c.name) + "</span>" +
          (other ? '<span class="owner">' + esc(other) + "</span>" : "") + "</label>";
      }).join("") + (list.length > 500 ? '<p class="empty">Yana ' + (list.length - 500) + " ta — qidiruvdan foydalaning</p>" : "") +
        (!list.length ? '<p class="empty">Klient topilmadi</p>' : "");
      wrap.querySelector("#asCount").textContent = "Belgilangan: " + Object.keys(sel).length;
    }
    wrap.addEventListener("input", function (e) { if (e.target.id === "asSearch") draw(); });
    wrap.addEventListener("change", function (e) {
      if (e.target.id === "asOnly") return draw();
      var id = e.target.dataset.id; if (!id) return;
      if (e.target.checked) sel[id] = true; else delete sel[id];
      wrap.querySelector("#asCount").textContent = "Belgilangan: " + Object.keys(sel).length;
    });
    draw();
    U.modal({ title: "Klientlar: " + p.full_name, body: wrap, wide: true, actions: [
      { label: "Bekor qilish" },
      { label: "Saqlash", cls: "primary", onClick: async function (close) {
        var add = [], remove = [];
        data.clients.forEach(function (c) {
          var want = !!sel[c.id], has = c.agent_id === p.id;
          if (want && !has) add.push(c.id);
          if (!want && has) remove.push(c.id);
        });
        try { await API.assignClients(p.id, add, remove); close(); U.toast("Saqlandi: " + Object.keys(sel).length + " ta klient"); go(tab); }
        catch (e) { U.toast(e.message); }
      } }
    ] });
  }

  // =================================================================
  //  KLIENTLAR
  // =================================================================
  var clientFilter = { q: "", agent: "" };
  async function renderClients() {
    var res = await Promise.all([API.profiles(), API.clients()]);
    data.profiles = res[0]; data.clients = res[1];
    var agentOpts = agents().map(function (a) { return '<option value="' + a.id + '">' + esc(a.full_name) + "</option>"; }).join("");
    body().innerHTML =
      '<div class="panel-h"><h2>Klientlar <span class="note" id="clCount"></span></h2>' +
      '<button class="btn sm" id="impBtn" type="button">Excel / CSV import</button>' +
      '<button class="btn primary sm" id="addClient" type="button">+ Klient qo\'shish</button></div>' +
      '<div class="panel-b filters">' +
        '<div class="fld" style="flex:1 1 220px">Qidirish<input id="clQ" type="search" placeholder="Klient nomi…" value="' + esc(clientFilter.q) + '"></div>' +
        '<div class="fld">Agent<select id="clA"><option value="">Barchasi</option><option value="none">— Biriktirilmagan —</option>' + agentOpts + "</select></div>" +
      "</div>" +
      '<div class="dt-wrap"><table class="dt stack"><thead><tr><th>Klient</th><th>Biriktirilgan agent</th><th></th></tr></thead><tbody id="clBody"></tbody></table></div>';
    $("clA").value = clientFilter.agent;
    $("clQ").oninput = function () { clientFilter.q = this.value; drawClients(); };
    $("clA").onchange = function () { clientFilter.agent = this.value; drawClients(); };
    $("addClient").onclick = function () { clientForm(null); };
    $("impBtn").onclick = importForm;
    $("clBody").addEventListener("change", async function (e) {
      if (!e.target.matches("select[data-move]")) return;
      var c = data.clients.find(function (x) { return x.id === Number(e.target.dataset.move); });
      try {
        await API.clientSave({ id: c.id, name: c.name, agent_id: e.target.value || null });
        c.agent_id = e.target.value || null;
        U.toast(c.name + " → " + (agentName(c.agent_id) || "biriktirilmagan"));
      } catch (err) { U.toast(err.message); e.target.value = c.agent_id || ""; }
    });
    $("clBody").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-a]"); if (!b) return;
      var c = data.clients.find(function (x) { return x.id === Number(b.closest("tr").dataset.id); });
      if (b.dataset.a === "edit") clientForm(c); else deleteClient(c);
    });
    drawClients();
  }
  function drawClients() {
    var q = U.norm(clientFilter.q), a = clientFilter.agent;
    var list = data.clients.filter(function (c) {
      return (!q || U.norm(c.name).indexOf(q) !== -1) &&
        (!a || (a === "none" ? !c.agent_id : c.agent_id === a));
    });
    $("clCount").textContent = "· " + list.length + " / " + data.clients.length;
    var opts = '<option value="">— Biriktirilmagan —</option>' + agents().map(function (x) { return '<option value="' + x.id + '">' + esc(x.full_name) + "</option>"; }).join("");
    var shown = list.slice(0, 300);
    $("clBody").innerHTML = shown.map(function (c) {
      return '<tr data-id="' + c.id + '"><td data-l="Klient">' + esc(c.name) + "</td>" +
        '<td data-l="Agent"><select class="in" data-move="' + c.id + '" aria-label="Agent">' + opts.replace('value="' + (c.agent_id || "") + '"', 'value="' + (c.agent_id || "") + '" selected') + "</select></td>" +
        '<td class="act"><button class="btn sm" data-a="edit">Tahrirlash</button><button class="btn sm ghost danger-text" data-a="del">O\'chirish</button></td></tr>';
    }).join("") + (list.length > 300 ? '<tr class="empty-row"><td colspan="3">Yana ' + (list.length - 300) + " ta — qidiruvdan foydalaning</td></tr>" : "") +
      (!list.length ? '<tr class="empty-row"><td colspan="3">Klient topilmadi</td></tr>' : "");
  }
  function clientForm(c) {
    var extra = c && c.extra && Object.keys(c.extra).length ? c.extra : null;
    var html = '<div class="field"><label for="cfName">Klient nomi</label><input id="cfName" value="' + esc(c ? c.name : "") + '" placeholder="Аптека №1"></div>' +
      '<div class="field"><label for="cfAgent">Agent</label><select id="cfAgent" class="cell-in" style="text-align:left"><option value="">— Biriktirilmagan —</option>' +
      agents().map(function (a) { return '<option value="' + a.id + '">' + esc(a.full_name) + "</option>"; }).join("") + "</select></div>" +
      (extra ? '<p class="note">Qo\'shimcha: ' + Object.keys(extra).map(function (k) { return esc(k) + ": " + esc(extra[k]); }).join(" · ") + "</p>" : "") +
      '<p class="form-err" id="cfErr"></p>';
    var m = U.modal({ title: c ? "Klientni tahrirlash" : "Yangi klient", body: html, actions: [
      { label: "Bekor qilish" },
      { label: "Saqlash", cls: "primary", onClick: async function (close) {
        var name = $("cfName").value.trim().replace(/\s+/g, " ");
        if (!name) { $("cfErr").textContent = "Klient nomini kiriting"; return; }
        try {
          await API.clientSave({ id: c && c.id, name: name, agent_id: $("cfAgent").value || null });
          close(); U.toast("Saqlandi"); go("clients");
        } catch (e) { $("cfErr").textContent = e.message; }
      } }
    ] });
    m.el.querySelector("#cfAgent").value = c && c.agent_id ? c.agent_id : "";
  }
  async function deleteClient(c) {
    if (!(await U.confirm("Klientni o'chirish", c.name + " o'chiriladi. Oldingi nakladnoylar tarixda qoladi.", "O'chirish"))) return;
    try { await API.clientDelete(c.id); U.toast("O'chirildi"); go("clients"); } catch (e) { U.toast(e.message); }
  }

  // ---------- IMPORT ----------
  var NAME_KEYS = ["name", "klient", "client", "клиент", "наименование", "название", "nomi", "klient nomi", "mijoz", "контрагент", "аптека"];
  var AGENT_KEYS = ["agent", "агент", "login", "логин", "тп", "tp"];
  function importForm() {
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<p class="note" style="margin-top:0">Excel (.xlsx, .xls) yoki CSV fayl. Birinchi qator — sarlavha. Kamida <b>klient nomi</b> ustuni bo\'lsin ' +
      '(masalan: «Клиент», «Наименование», «Name»). Ixtiyoriy: «Agent» ustunida agent logini. Qolgan ustunlar qo\'shimcha ma\'lumot sifatida saqlanadi.</p>' +
      '<input id="impFile" type="file" accept=".xlsx,.xls,.csv,.txt">' +
      '<div class="filters" style="margin-top:12px"><div class="fld">Nom ustuni<select id="impCol"></select></div>' +
      '<div class="fld">Hammasini shu agentga biriktirish<select id="impAgent"><option value="">— Yo\'q (fayldagi yoki biriktirilmagan) —</option>' +
      agents().map(function (a) { return '<option value="' + a.id + '">' + esc(a.full_name) + "</option>"; }).join("") + "</select></div></div>" +
      '<div id="impSum" class="import-sum"></div><div class="dt-wrap" style="max-height:45vh;overflow:auto"><table class="dt"><thead><tr><th>#</th><th>Klient nomi</th><th>Agent</th><th>Holat</th></tr></thead><tbody id="impBody"></tbody></table></div>';
    var parsed = { header: [], rows: [] }, preview = [];
    function build() {
      var col = Number(wrap.querySelector("#impCol").value);
      var agentCol = parsed.header.findIndex(function (h) { return AGENT_KEYS.indexOf(U.norm(h)) !== -1; });
      var forced = wrap.querySelector("#impAgent").value;
      var existing = {}; data.clients.forEach(function (c) { existing[U.norm(c.name)] = true; });
      var seen = {};
      var byLogin = {}; agents().forEach(function (a) { byLogin[U.norm(a.login)] = a; byLogin[U.norm(a.full_name)] = a; });
      preview = parsed.rows.map(function (r, i) {
        var name = String(r[col] == null ? "" : r[col]).trim().replace(/\s+/g, " ");
        var key = U.norm(name), st = "new", note = "";
        var agentId = forced || null, agentLabel = forced ? agentName(forced) : "";
        if (!forced && agentCol !== -1 && r[agentCol] != null && String(r[agentCol]).trim()) {
          var a = byLogin[U.norm(r[agentCol])];
          if (a) { agentId = a.id; agentLabel = a.full_name; } else { note = "agent topilmadi: " + r[agentCol]; }
        }
        if (!name) { st = "err"; note = "nom bo'sh"; }
        else if (name.length > 300) { st = "err"; note = "nom juda uzun"; }
        else if (existing[key]) { st = "dup"; note = "bazada bor"; }
        else if (seen[key]) { st = "dup"; note = "faylda takror"; }
        seen[key] = true;
        var extra = {};
        parsed.header.forEach(function (h, j) { if (j !== col && j !== agentCol && h && r[j] != null && String(r[j]).trim() !== "") extra[String(h).trim()] = String(r[j]).trim(); });
        return { line: i + 2, name: name, agent_id: agentId, agentLabel: agentLabel, st: st, note: note, extra: extra };
      });
      var c = { new: 0, dup: 0, err: 0 }; preview.forEach(function (p) { c[p.st]++; });
      wrap.querySelector("#impSum").innerHTML = '<span class="pill">Yangi: ' + c.new + '</span><span class="pill muted">Dublikat: ' + c.dup + '</span><span class="pill off">Xato: ' + c.err + "</span>";
      wrap.querySelector("#impBody").innerHTML = preview.slice(0, 1000).map(function (p) {
        var lbl = p.st === "new" ? '<span class="st-new">Qo\'shiladi</span>' : p.st === "dup" ? '<span class="st-dup">Dublikat</span>' : '<span class="st-err">Xato</span>';
        return "<tr><td class=\"num muted\">" + p.line + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.agentLabel) + "</td><td>" + lbl + (p.note ? ' <span class="note">(' + esc(p.note) + ")</span>" : "") + "</td></tr>";
      }).join("") + (preview.length > 1000 ? '<tr class="empty-row"><td colspan="4">… yana ' + (preview.length - 1000) + " qator</td></tr>" : "");
    }
    wrap.querySelector("#impFile").addEventListener("change", async function () {
      var f = this.files[0]; if (!f) return;
      if (!window.XLSX) { U.toast("Import moduli yuklanmadi. Sahifani yangilang."); return; }
      try {
        var buf = await f.arrayBuffer();
        var wb = window.XLSX.read(buf, { type: "array", codepage: 65001 });
        var rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
        rows = rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
        if (!rows.length) throw new Error("Fayl bo'sh");
        parsed.header = rows[0].map(function (h) { return String(h).trim(); });
        parsed.rows = rows.slice(1);
        var guess = parsed.header.findIndex(function (h) { return NAME_KEYS.indexOf(U.norm(h)) !== -1; });
        if (guess === -1) guess = 0;
        wrap.querySelector("#impCol").innerHTML = parsed.header.map(function (h, i) { return '<option value="' + i + '">' + esc(h || "Ustun " + (i + 1)) + "</option>"; }).join("");
        wrap.querySelector("#impCol").value = String(guess);
        build();
      } catch (e) { U.toast("Faylni o'qib bo'lmadi: " + e.message); }
    });
    wrap.querySelector("#impCol").addEventListener("change", build);
    wrap.querySelector("#impAgent").addEventListener("change", function () { if (parsed.rows.length) build(); });
    U.modal({ title: "Klientlarni import qilish", body: wrap, wide: true, actions: [
      { label: "Bekor qilish" },
      { label: "Import qilish", cls: "primary", onClick: async function (close) {
        var toAdd = preview.filter(function (p) { return p.st === "new"; });
        if (!toAdd.length) { U.toast(preview.length ? "Qo'shiladigan yangi klient yo'q" : "Avval fayl tanlang"); return; }
        try {
          var n = await API.clientsInsertMany(toAdd.map(function (p) { return { name: p.name, agent_id: p.agent_id, extra: p.extra }; }));
          var skipped = preview.length - toAdd.length;
          close();
          U.modal({ title: "Import yakunlandi", body: "<p><b>" + n + "</b> ta klient qo'shildi." + (skipped ? " " + skipped + " ta qator o'tkazib yuborildi (dublikat yoki xato)." : "") + "</p>", actions: [{ label: "Yopish", cls: "primary" }] });
          go("clients");
        } catch (e) { U.toast("Import xatosi: " + e.message); }
      } }
    ] });
  }

  // =================================================================
  //  MAHSULOTLAR
  // =================================================================
  async function renderProducts() {
    data.products = await API.products();
    body().innerHTML =
      '<div class="panel-h"><h2>Mahsulotlar <span class="note">· ' + data.products.length + '</span></h2>' +
      '<input id="prQ" type="search" placeholder="Qidirish…" class="cell-in" style="width:220px;text-align:left">' +
      '<button class="btn primary sm" id="addProd" type="button">+ Mahsulot qo\'shish</button></div>' +
      '<p class="note panel-b" style="margin:0;padding-bottom:0">Nom yoki narxni o\'zgartirib, katakdan chiqsangiz — avtomatik saqlanadi. Narx o\'zgarishi faqat keyingi nakladnoylarga ta\'sir qiladi.</p>' +
      '<div class="dt-wrap"><table class="dt stack"><thead><tr><th style="width:60px">№</th><th>Наименование</th><th class="r" style="width:170px">Цена</th><th style="width:100px">Tartib</th><th></th></tr></thead><tbody id="prBody"></tbody></table></div>';
    drawProducts();
    $("prQ").oninput = drawProducts;
    $("addProd").onclick = function () {
      var maxSort = data.products.reduce(function (m, p) { return Math.max(m, p.sort_order || 0); }, 0);
      var html = '<div class="field"><label for="pfName">Mahsulot nomi</label><input id="pfName"></div>' +
        '<div class="field"><label for="pfPrice">Narx (so\'m)</label><input id="pfPrice" inputmode="numeric"></div><p class="form-err" id="pfErr"></p>';
      U.modal({ title: "Yangi mahsulot", body: html, actions: [{ label: "Bekor qilish" }, { label: "Qo'shish", cls: "primary", onClick: async function (close) {
        var name = $("pfName").value.trim().replace(/\s+/g, " "), price = U.parseNum($("pfPrice").value);
        if (!name) { $("pfErr").textContent = "Nomini kiriting"; return; }
        if (price == null) { $("pfErr").textContent = "Narxni kiriting"; return; }
        try { await API.productSave({ name: name, price: price, sort_order: maxSort + 1 }); close(); U.toast("Qo'shildi"); go("products"); }
        catch (e) { $("pfErr").textContent = e.message; }
      } }] });
    };
    var tb = $("prBody");
    tb.addEventListener("change", async function (e) {
      var tr = e.target.closest("tr"); if (!tr) return;
      var p = data.products.find(function (x) { return x.id === Number(tr.dataset.id); });
      var name = tr.querySelector("[data-f=name]").value.trim().replace(/\s+/g, " ");
      var price = U.parseNum(tr.querySelector("[data-f=price]").value);
      var sort = parseInt(tr.querySelector("[data-f=sort]").value, 10);
      if (!name || price == null) { U.toast("Nom va narx bo'sh bo'lmasin"); drawProducts(); return; }
      try {
        await API.productSave({ id: p.id, name: name, price: price, sort_order: isNaN(sort) ? p.sort_order : sort });
        p.name = name; p.price = price; if (!isNaN(sort)) p.sort_order = sort;
        tr.querySelector("[data-f=price]").value = U.fmt(price);
        U.toast("Saqlandi: " + name);
      } catch (err) { U.toast(err.message); }
    });
    tb.addEventListener("click", async function (e) {
      var b = e.target.closest("button[data-a=del]"); if (!b) return;
      var p = data.products.find(function (x) { return x.id === Number(b.closest("tr").dataset.id); });
      if (!(await U.confirm("Mahsulotni o'chirish", p.name + " ro'yxatdan o'chiriladi. Eski nakladnoylarda saqlanib qoladi.", "O'chirish"))) return;
      try { await API.productDelete(p.id); U.toast("O'chirildi"); go("products"); } catch (err) { U.toast(err.message); }
    });
  }
  function drawProducts() {
    var q = U.norm($("prQ") ? $("prQ").value : "");
    var list = data.products.filter(function (p) { return !q || U.norm(p.name).indexOf(q) !== -1; });
    $("prBody").innerHTML = list.map(function (p, i) {
      return '<tr data-id="' + p.id + '"><td data-l="№" class="num muted">' + (i + 1) + "</td>" +
        '<td data-l="Nomi"><input class="in" data-f="name" value="' + esc(p.name) + '" aria-label="Nomi"></td>' +
        '<td data-l="Narx"><input class="in num" data-f="price" style="text-align:right" inputmode="numeric" value="' + U.fmt(p.price) + '" aria-label="Narx"></td>' +
        '<td data-l="Tartib"><input class="in num" data-f="sort" inputmode="numeric" value="' + (p.sort_order || 0) + '" aria-label="Tartib"></td>' +
        '<td class="act"><button class="btn sm ghost danger-text" data-a="del">O\'chirish</button></td></tr>';
    }).join("") || '<tr class="empty-row"><td colspan="5">Mahsulot topilmadi</td></tr>';
  }

  // =================================================================
  //  NAKLADNOYLAR TARIXI
  // =================================================================
  var invFilter = { agentId: "", client: "", from: "", to: "" };
  async function renderInvoices() {
    data.profiles = await API.profiles();
    var agentOpts = data.profiles.map(function (a) { return '<option value="' + a.id + '">' + esc(a.full_name) + "</option>"; }).join("");
    body().innerHTML =
      '<div class="panel-h"><h2>Nakladnoylar</h2><span class="note" id="invSum"></span></div>' +
      '<div class="panel-b filters">' +
        '<div class="fld">Agent<select id="ivA"><option value="">Barchasi</option>' + agentOpts + "</select></div>" +
        '<div class="fld" style="flex:1 1 200px">Klient<input id="ivC" type="search" placeholder="Klient nomi…"></div>' +
        '<div class="fld">Sanadan<input id="ivF" type="date"></div>' +
        '<div class="fld">Sanagacha<input id="ivT" type="date"></div>' +
        '<button class="btn sm" id="ivToday" type="button">Bugun</button>' +
        '<button class="btn sm ghost" id="ivClear" type="button">Tozalash</button>' +
      "</div>" +
      '<div class="dt-wrap"><table class="dt stack"><thead><tr><th>№</th><th>Sana</th><th>Agent</th><th>Klient</th><th class="r">Summa</th></tr></thead><tbody id="ivBody"></tbody></table></div>';
    $("ivA").value = invFilter.agentId; $("ivC").value = invFilter.client; $("ivF").value = invFilter.from; $("ivT").value = invFilter.to;
    var t;
    function upd() { invFilter = { agentId: $("ivA").value, client: $("ivC").value.trim(), from: $("ivF").value, to: $("ivT").value }; clearTimeout(t); t = setTimeout(loadInvoices, 250); }
    ["ivA", "ivF", "ivT"].forEach(function (id) { $(id).onchange = upd; });
    $("ivC").oninput = upd;
    $("ivToday").onclick = function () { $("ivF").value = $("ivT").value = U.todayISO(); upd(); };
    $("ivClear").onclick = function () { $("ivA").value = ""; $("ivC").value = ""; $("ivF").value = ""; $("ivT").value = ""; upd(); };
    $("ivBody").addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]"); if (tr) invoiceDetail(Number(tr.dataset.id));
    });
    await loadInvoices();
  }
  var lastInvoices = [];
  async function loadInvoices() {
    $("ivBody").innerHTML = '<tr class="empty-row"><td colspan="5">Yuklanmoqda…</td></tr>';
    try {
      lastInvoices = await API.invoices(invFilter);
      var total = lastInvoices.reduce(function (s, i) { return s + Number(i.total); }, 0);
      $("invSum").textContent = lastInvoices.length + " ta · jami " + U.fmt(total) + " so'm" + (lastInvoices.length >= 500 ? " (oxirgi 500 ta)" : "");
      $("ivBody").innerHTML = lastInvoices.map(function (i) {
        return '<tr class="clickable" data-id="' + i.id + '"><td data-l="№" class="num">' + i.number + '</td><td data-l="Sana" class="num">' + U.dmy(i.doc_date) +
          '</td><td data-l="Agent">' + esc(i.agent_name) + '</td><td data-l="Klient">' + esc(i.client_name) + '</td><td data-l="Summa" class="r num">' + U.fmt(i.total) + "</td></tr>";
      }).join("") || '<tr class="empty-row"><td colspan="5">Nakladnoy topilmadi</td></tr>';
    } catch (e) { $("ivBody").innerHTML = '<tr class="empty-row"><td colspan="5">' + esc(e.message) + "</td></tr>"; }
  }
  async function invoiceDetail(id) {
    var inv = lastInvoices.find(function (x) { return x.id === id; });
    var items = await API.invoiceItems(id);
    var html = '<p style="margin-top:0"><b>Кому:</b> ' + esc(inv.client_name) + "<br><b>ТП:</b> " + esc(inv.agent_name) + "<br><b>Sana:</b> " + U.dmy(inv.doc_date) + "</p>" +
      '<div class="dt-wrap"><table class="dt"><thead><tr><th>№</th><th>Наименование</th><th class="r">Цена</th><th class="r">Кол-во</th><th class="r">Сумма</th></tr></thead><tbody>' +
      items.map(function (it) { return '<tr><td class="num">' + it.position + "</td><td>" + esc(it.name) + '</td><td class="r num">' + U.fmt(it.price) + '</td><td class="r num">' + it.qty + '</td><td class="r num">' + U.fmt(it.sum) + "</td></tr>"; }).join("") +
      '</tbody><tfoot><tr><td colspan="4" class="r"><b>ИТОГО:</b></td><td class="r num"><b>' + U.fmt(inv.total) + "</b></td></tr></tfoot></table></div>";
    U.modal({ title: "Накладная №" + inv.number, body: html, wide: true, actions: [
      { label: "O'chirish", cls: "ghost danger-text", onClick: async function (close) {
        if (!(await U.confirm("Nakladnoyni o'chirish", "№" + inv.number + " butunlay o'chiriladi.", "O'chirish"))) return;
        try { await API.invoiceDelete(inv.id); close(); U.toast("O'chirildi"); loadInvoices(); } catch (e) { U.toast(e.message); }
      } },
      { label: "Excel yuklab olish", cls: "primary", onClick: async function () {
        try {
          await window.EXCEL.download({ number: inv.number, date: U.dmy(inv.doc_date), client: inv.client_name, agent: inv.agent_name,
            from: window.APP_CONFIG.FROM, lines: items.map(function (it) { return { name: it.name, price: Number(it.price), qty: it.qty }; }) });
        } catch (e) { U.toast(e.message); }
      } }
    ] });
  }

  return { open: open };
})();

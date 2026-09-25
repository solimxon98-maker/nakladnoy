/*
 * Ilova boshqaruvi: login, rollar bo'yicha yo'naltirish, agent sahifalari.
 */
(function () {
  "use strict";
  var U = window.U, $ = U.$, API = window.API;
  var me = null;            // joriy profil
  var myClients = [];       // agentga biriktirilgan klientlar (RLS bo'yicha)
  var picked = null;

  var SCREENS = ["scrLoading", "scrLogin", "scrHome", "scrPick", "step2", "scrAdmin"];
  function show(id) {
    SCREENS.forEach(function (s) { $(s).hidden = s !== id; });
    $("topbar").hidden = id === "scrLogin" || id === "scrLoading";
    document.body.classList.toggle("has-bar", id === "step2");
    $("btnAdminPanel").hidden = !(me && me.role === "admin" && id !== "scrAdmin");
    $("btnAgentHome").hidden = !(me && me.role === "admin" && id === "scrAdmin");
    window.scrollTo(0, 0);
  }

  // ---------- Login ----------
  function fieldOk(inputId, fieldId) {
    var ok = $(inputId).value.trim() !== "";
    $(fieldId).classList.toggle("invalid", !ok);
    $(fieldId).querySelector(".err").hidden = ok;
    return ok;
  }
  $("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("loginErr").textContent = "";
    var a = fieldOk("loginInput", "f-login"), b = fieldOk("passInput", "f-pass");
    if (!a) return $("loginInput").focus();
    if (!b) return $("passInput").focus();
    $("loginBtn").disabled = true;
    try {
      await API.login($("loginInput").value, $("passInput").value);
      $("passInput").value = "";
      await boot();
    } catch (err) {
      $("loginErr").textContent = err.message;
    } finally { $("loginBtn").disabled = false; }
  });
  ["loginInput", "passInput"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      var f = $(id === "loginInput" ? "f-login" : "f-pass");
      if (this.value.trim()) { f.classList.remove("invalid"); f.querySelector(".err").hidden = true; }
    });
  });

  $("btnLogout").addEventListener("click", async function () {
    await API.logout(); me = null; show("scrLogin"); $("loginInput").focus();
  });
  $("btnAdminPanel").addEventListener("click", function () { show("scrAdmin"); window.ADMIN.open(); });
  $("btnAgentHome").addEventListener("click", function () { goHome(); });

  // ---------- Boshlash ----------
  async function boot() {
    show("scrLoading");
    var s = await API.session();
    if (!s) return show("scrLogin");
    try { me = await API.myProfile(); } catch (e) { me = null; }
    if (!me || !me.active) {
      await API.logout();
      show("scrLogin");
      $("loginErr").textContent = me ? "Akkauntingiz bloklangan. Admin bilan bog'laning" : "Profil topilmadi. Admin bilan bog'laning";
      return;
    }
    $("whoName").textContent = me.full_name;
    $("whoRole").textContent = me.role === "admin" ? "Admin" : "Agent";
    if (me.role === "admin") { show("scrAdmin"); window.ADMIN.open(me); }
    else goHome();
  }

  // ---------- Agent: bosh sahifa ----------
  async function goHome() {
    show("scrHome");
    $("homeInvoices").innerHTML = '<tr class="empty-row"><td colspan="4">Yuklanmoqda…</td></tr>';
    try {
      var res = await Promise.all([API.clients(), API.invoices({ agentId: me.id, limit: 15 })]);
      myClients = me.role === "admin" ? res[0] : res[0].filter(function (c) { return c.agent_id === me.id; });
      $("homeClients").textContent = myClients.length;
      var today = U.todayISO();
      $("homeToday").textContent = res[1].filter(function (i) { return i.doc_date === today; }).length;
      var rows = res[1].map(function (i) {
        return '<tr><td data-l="№" class="num">' + i.number + '</td><td data-l="Sana" class="num">' + U.dmy(i.doc_date) +
          '</td><td data-l="Klient">' + U.esc(i.client_name) + '</td><td data-l="Summa" class="r num">' + U.fmt(i.total) + '</td></tr>';
      }).join("");
      $("homeInvoices").innerHTML = rows || '<tr class="empty-row"><td colspan="4">Hali nakladnoy yo\'q</td></tr>';
    } catch (err) {
      $("homeInvoices").innerHTML = '<tr class="empty-row"><td colspan="4">' + U.esc(err.message) + '</td></tr>';
    }
  }
  $("btnNewInvoice").addEventListener("click", function () { openPick(); });

  // ---------- Agent: klient tanlash ----------
  function openPick() {
    picked = null;
    $("pickSearch").value = "";
    $("pickErr").textContent = "";
    renderPick();
    show("scrPick");
    $("pickSearch").focus();
  }
  function renderPick() {
    var q = U.norm($("pickSearch").value);
    var list = myClients.filter(function (c) { return !q || U.norm(c.name).indexOf(q) !== -1; });
    var box = $("pickList");
    if (!myClients.length) { box.innerHTML = '<p class="empty">Sizga hali klient biriktirilmagan. Admin bilan bog\'laning.</p>'; return; }
    if (!list.length) { box.innerHTML = '<p class="empty">Hech narsa topilmadi.</p>'; return; }
    box.innerHTML = list.map(function (c) {
      return '<button type="button" class="pick-item" role="option" data-id="' + c.id + '" aria-selected="' + (picked && picked.id === c.id) + '"><span class="dot"></span><span></span></button>';
    }).join("");
    Array.prototype.forEach.call(box.children, function (el, i) { el.lastChild.textContent = list[i].name; });
  }
  $("pickSearch").addEventListener("input", renderPick);
  $("pickSearch").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { var f = $("pickList").querySelector(".pick-item"); if (f) { f.click(); } }
  });
  $("pickList").addEventListener("click", function (e) {
    var it = e.target.closest(".pick-item"); if (!it) return;
    picked = myClients.find(function (c) { return c.id === Number(it.dataset.id); });
    $("pickErr").textContent = "";
    $("pickList").querySelectorAll(".pick-item").forEach(function (b) { b.setAttribute("aria-selected", b === it); });
  });
  $("pickList").addEventListener("dblclick", function (e) { if (e.target.closest(".pick-item")) $("pickNext").click(); });
  $("pickBack").addEventListener("click", goHome);
  $("pickNext").addEventListener("click", async function () {
    if (!picked) { $("pickErr").textContent = "Klientni tanlang"; return; }
    var btn = this; btn.disabled = true;
    try {
      // Ism har safar bazadan yangidan olinadi (admin o'zgartirgan bo'lsa ham to'g'ri chiqadi)
      var res = await Promise.all([API.products(), API.myProfile()]);
      me = res[1];
      if (!res[0].length) { $("pickErr").textContent = "Mahsulotlar ro'yxati bo'sh"; return; }
      window.INVOICE.open({ products: res[0], agentName: me.full_name, client: picked, onExit: goHome });
      show("step2");
    } catch (err) { $("pickErr").textContent = err.message; }
    finally { btn.disabled = false; }
  });

  // Sessiya tugasa — login oynasiga
  API.sb.auth.onAuthStateChange(function (ev) {
    if (ev === "SIGNED_OUT") { me = null; show("scrLogin"); }
  });

  if (window.APP_CONFIG.SUPABASE_URL.indexOf("__") === 0) {
    show("scrLoading");
    $("scrLoading").innerHTML = '<p class="note" style="padding-top:30vh;text-align:center">config.js da SUPABASE_URL va SUPABASE_ANON_KEY kiritilmagan.</p>';
  } else {
    boot();
  }
})();

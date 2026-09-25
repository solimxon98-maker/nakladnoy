/*
 * NAKLADNOY oynasi — oldingi versiyadagi logika saqlangan:
 * narx o'zgartirish, Количество, Сумма = Цена × Количество, ИТОГО, qidiruv,
 * "Faqat tanlanganlar", Enter/↑/↓ navigatsiya, summani nusxalash, Excel.
 * Yangi: Кому/ТП tizimdan olinadi, nakladnoy bazaga saqlanadi va raqam oladi.
 */
window.INVOICE = (function () {
  "use strict";
  var U = window.U, $ = U.$, fmt = U.fmt, parseNum = U.parseNum;
  var C = window.APP_CONFIG;

  var PRODUCTS = [];
  var state = { agent: "", client: null, lines: {}, saved: null, date: "" };
  var onExit = function () {};

  function resetLines() {
    state.lines = {};
    PRODUCTS.forEach(function (p) { state.lines[p.id] = { price: Number(p.price), qty: null }; });
  }
  function lineSum(id) { var l = state.lines[id]; return l.qty ? l.price * l.qty : 0; }
  function totals() {
    var sum = 0, count = 0, units = 0;
    PRODUCTS.forEach(function (p) {
      var l = state.lines[p.id];
      if (l.qty) { sum += l.price * l.qty; count++; units += l.qty; }
    });
    return { sum: sum, count: count, units: units };
  }
  function prodById(id) { return PRODUCTS.find(function (p) { return p.id === id; }); }

  // ---------- Ochish ----------
  function open(opts) {
    PRODUCTS = opts.products;
    onExit = opts.onExit || onExit;
    state.agent = opts.agentName;
    state.client = opts.client;
    state.saved = null;
    state.date = U.dmy(U.todayISO());
    resetLines();
    $("docNumber").textContent = "______";
    $("docDate").textContent = state.date;
    $("outClient").textContent = state.client.name;
    $("outAgent").textContent = state.agent;
    $("outFrom").textContent = C.FROM;
    $("search").value = "";
    $("onlyFilled").checked = false;
    setLocked(false);
    renderRows();
    updateTotals();
    window.scrollTo(0, 0);
  }

  function renderRows() {
    var tbody = $("rows");
    tbody.textContent = "";
    var frag = document.createDocumentFragment();
    PRODUCTS.forEach(function (p, i) {
      var tr = document.createElement("tr");
      tr.dataset.id = p.id;
      tr.dataset.search = p.name.toLowerCase();
      tr.innerHTML =
        '<td class="c-no num"></td>' +
        '<td class="c-name"></td>' +
        '<td class="c-price" data-l="Цена"><div class="price-box">' +
          '<input class="cell-in price-in" inputmode="numeric" autocomplete="off">' +
          '<button type="button" class="price-reset">asl narx</button></div></td>' +
        '<td class="c-qty" data-l="Количество"><input class="cell-in qty-in" inputmode="numeric" autocomplete="off"></td>' +
        '<td class="c-sum num zero" data-l="Сумма"></td>';
      tr.children[0].textContent = i + 1;
      tr.children[1].textContent = p.name; // nom o'zgartirilmaydi — oddiy matn
      var priceIn = tr.querySelector(".price-in"), qtyIn = tr.querySelector(".qty-in");
      priceIn.id = "price-" + p.id; qtyIn.id = "qty-" + p.id;
      priceIn.setAttribute("aria-label", "Цена: " + p.name);
      qtyIn.setAttribute("aria-label", "Количество: " + p.name);
      priceIn.value = fmt(p.price);
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    applyFilter();
  }

  function refreshRow(tr) {
    var id = Number(tr.dataset.id), l = state.lines[id];
    var cell = tr.querySelector(".c-sum");
    cell.textContent = l.qty ? fmt(lineSum(id)) : "";
    cell.classList.toggle("zero", !l.qty);
    tr.classList.toggle("filled", !!l.qty);
    tr.querySelector(".price-in").classList.toggle("changed", l.price !== Number(prodById(id).price));
  }

  function updateTotals() {
    var t = totals();
    $("footTotal").textContent = fmt(t.sum);
    $("barTotal").textContent = fmt(t.sum) + " " + C.CURRENCY;
    $("barMeta").textContent = state.saved
      ? "Saqlandi · №" + state.saved.number + " · " + t.count + " ta mahsulot"
      : (t.count ? t.count + " ta mahsulot · " + fmt(t.units) + " dona" : "Hali mahsulot tanlanmagan");
  }

  function setLocked(locked) {
    document.querySelectorAll("#rows .cell-in, #rows .price-reset").forEach(function (el) { el.disabled = locked; });
    $("btnSave").hidden = locked;
    $("btnExcel").hidden = !locked;
  }

  // ---------- Kiritishlar ----------
  $("rows").addEventListener("input", function (e) {
    var tr = e.target.closest("tr"); if (!tr || state.saved) return;
    var id = Number(tr.dataset.id);
    if (e.target.classList.contains("qty-in")) {
      var q = parseNum(e.target.value);
      if (e.target.value !== "" && String(q == null ? "" : q) !== e.target.value) e.target.value = q == null ? "" : q;
      state.lines[id].qty = q && q > 0 ? q : null;
    } else if (e.target.classList.contains("price-in")) {
      var pr = parseNum(e.target.value);
      state.lines[id].price = pr == null ? 0 : pr;
    }
    refreshRow(tr);
    updateTotals();
  });
  $("rows").addEventListener("focusout", function (e) {
    if (!e.target.classList.contains("price-in")) return;
    var id = Number(e.target.closest("tr").dataset.id);
    e.target.value = fmt(state.lines[id].price);
    if ($("onlyFilled").checked) applyFilter();
  });
  $("rows").addEventListener("focusin", function (e) {
    if (e.target.classList.contains("cell-in")) setTimeout(function () { e.target.select(); }, 0);
  });
  $("rows").addEventListener("click", function (e) {
    if (!e.target.classList.contains("price-reset") || state.saved) return;
    var tr = e.target.closest("tr"), id = Number(tr.dataset.id), prod = prodById(id);
    state.lines[id].price = Number(prod.price);
    tr.querySelector(".price-in").value = fmt(prod.price);
    refreshRow(tr); updateTotals();
  });
  $("rows").addEventListener("keydown", function (e) {
    if (!e.target.classList.contains("cell-in")) return;
    if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    var cls = e.target.classList.contains("qty-in") ? ".qty-in" : ".price-in";
    var visible = Array.prototype.filter.call(document.querySelectorAll("#rows tr"), function (r) { return !r.hidden; });
    var next = visible[visible.indexOf(e.target.closest("tr")) + (e.key === "ArrowUp" ? -1 : 1)];
    if (next) next.querySelector(cls).focus();
  });

  function applyFilter() {
    var q = $("search").value.trim().toLowerCase(), only = $("onlyFilled").checked, shown = 0;
    document.querySelectorAll("#rows tr").forEach(function (tr) {
      var vis = (!q || tr.dataset.search.indexOf(q) !== -1) && (!only || !!state.lines[Number(tr.dataset.id)].qty);
      tr.hidden = !vis; if (vis) shown++;
    });
    $("emptyMsg").hidden = shown > 0;
    $("emptyMsg").textContent = only && !q ? "Hali birorta mahsulotga son kiritilmagan." : "Hech narsa topilmadi.";
  }
  $("search").addEventListener("input", applyFilter);
  $("onlyFilled").addEventListener("change", applyFilter);

  // ---------- Chiqish ----------
  function showConfirm(on) { $("confirmBox").hidden = !on; $("actions").hidden = on; }
  $("btnBack").addEventListener("click", function () {
    if (state.saved || totals().count === 0) return onExit();
    showConfirm(true);
  });
  $("btnNo").addEventListener("click", function () { showConfirm(false); });
  $("btnYes").addEventListener("click", function () { showConfirm(false); onExit(); });

  // ---------- Summani nusxalash ----------
  $("btnCopy").addEventListener("click", function () {
    var text = fmt(totals().sum).replace(/ /g, " ");
    var done = function () { U.toast("Nusxalandi: " + text + " " + C.CURRENCY); };
    var sel = function () {
      var r = document.createRange(); r.selectNodeContents($("barTotal"));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      U.toast("Summa belgilandi — nusxalash uchun Ctrl+C bosing");
    };
    try { navigator.clipboard.writeText(text).then(done, sel); } catch (err) { sel(); }
  });

  // ---------- Saqlash ----------
  $("btnSave").addEventListener("click", async function () {
    var items = [];
    PRODUCTS.forEach(function (p) {
      var l = state.lines[p.id];
      if (l.qty) items.push({ product_id: p.id, price: l.price, qty: l.qty });
    });
    if (!items.length) { U.toast("Avval kamida bitta mahsulotga son kiriting"); return; }
    var btn = this; btn.disabled = true;
    try {
      var inv = await window.API.createInvoice(state.client.id, items);
      state.saved = inv;
      state.date = U.dmy(inv.doc_date);
      $("docNumber").textContent = inv.number;
      $("docDate").textContent = state.date;
      setLocked(true);
      updateTotals();
      U.toast("Saqlandi: Накладная №" + inv.number);
    } catch (err) {
      U.toast("Saqlanmadi: " + err.message);
    } finally { btn.disabled = false; }
  });

  // ---------- Excel ----------
  $("btnExcel").addEventListener("click", async function () {
    var btn = this; btn.disabled = true;
    try {
      await window.EXCEL.download({
        number: state.saved && state.saved.number, date: state.date,
        client: state.client.name, agent: state.agent, from: C.FROM,
        lines: PRODUCTS.map(function (p) { var l = state.lines[p.id]; return { name: p.name, price: l.price, qty: l.qty }; })
      });
    } catch (err) { U.toast(err.message || "Excel yaratishda xatolik"); }
    finally { btn.disabled = false; }
  });

  return { open: open };
})();

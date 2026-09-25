/*
 * Ma'lumotlar bazasi bilan ishlash (Supabase). Barcha so'rovlar shu yerda.
 * Xavfsizlik bazadagi RLS qoidalari bilan ta'minlanadi — bu fayldagi tekshiruvlar faqat qulaylik uchun.
 */
window.API = (function () {
  "use strict";
  var C = window.APP_CONFIG;
  var sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "nakladnoy-auth" }
  });

  function check(res) {
    if (res.error) {
      var m = res.error.message || "Xatolik";
      if (/duplicate key|clients_name_uniq/i.test(m)) m = "Bunday nomli klient allaqachon bor";
      if (/row-level security|permission denied/i.test(m)) m = "Ruxsat yo'q";
      throw new Error(m);
    }
    return res.data;
  }

  // ---------- Auth ----------
  async function login(login, password) {
    // Agent: login → login@domen. Admin o'z emaili bilan ham kira oladi.
    var l = String(login).trim().toLowerCase();
    var email = l.indexOf("@") !== -1 ? l : l + "@" + C.LOGIN_DOMAIN;
    var res = await sb.auth.signInWithPassword({ email: email, password: password });
    if (res.error) {
      if (/invalid login|invalid credentials/i.test(res.error.message)) throw new Error("Login yoki parol noto'g'ri");
      if (/banned/i.test(res.error.message)) throw new Error("Akkauntingiz bloklangan. Admin bilan bog'laning");
      throw new Error(res.error.message);
    }
    return res.data.session;
  }
  async function logout() { await sb.auth.signOut(); }
  async function session() { var r = await sb.auth.getSession(); return r.data.session; }
  async function myProfile() {
    var s = await session(); if (!s) return null;
    return check(await sb.from("profiles").select("*").eq("id", s.user.id).maybeSingle());
  }

  // ---------- Mahsulotlar ----------
  async function products() {
    return check(await sb.from("products").select("id,name,price,sort_order").order("sort_order").order("id"));
  }
  async function productSave(p) {
    if (p.id) return check(await sb.from("products").update({ name: p.name, price: p.price, sort_order: p.sort_order }).eq("id", p.id).select().single());
    return check(await sb.from("products").insert({ name: p.name, price: p.price, sort_order: p.sort_order }).select().single());
  }
  async function productDelete(id) { return check(await sb.from("products").delete().eq("id", id)); }

  // ---------- Klientlar ----------
  // Agent uchun RLS avtomatik faqat o'z klientlarini qaytaradi.
  async function clients() {
    var all = [], from = 0, size = 1000;
    for (;;) {
      var page = check(await sb.from("clients").select("id,name,extra,agent_id").order("name").range(from, from + size - 1));
      all = all.concat(page); if (page.length < size) break; from += size;
    }
    return all;
  }
  async function clientSave(c) {
    var row = { name: c.name, agent_id: c.agent_id || null };
    if (c.extra) row.extra = c.extra;
    if (c.id) return check(await sb.from("clients").update(row).eq("id", c.id).select().single());
    return check(await sb.from("clients").insert(row).select().single());
  }
  async function clientDelete(id) { return check(await sb.from("clients").delete().eq("id", id)); }
  async function clientsInsertMany(rows) {
    var out = 0;
    for (var i = 0; i < rows.length; i += 500) {
      var chunk = rows.slice(i, i + 500);
      check(await sb.from("clients").insert(chunk));
      out += chunk.length;
    }
    return out;
  }
  // Agentga biriktirish: belgilanganlar shu agentga, olib tashlanganlar biriktirilmagan holatga
  async function assignClients(agentId, addIds, removeIds) {
    if (addIds.length) check(await sb.from("clients").update({ agent_id: agentId }).in("id", addIds));
    if (removeIds.length) check(await sb.from("clients").update({ agent_id: null }).in("id", removeIds).eq("agent_id", agentId));
  }

  // ---------- Agentlar (profillar) ----------
  async function profiles() { return check(await sb.from("profiles").select("*").order("role").order("full_name")); }
  async function adminUsers(payload) {
    var res = await sb.functions.invoke("admin-users", { body: payload });
    if (res.error) {
      var msg = res.error.message;
      try { var j = await res.error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    if (res.data && res.data.error) throw new Error(res.data.error);
    return res.data;
  }

  // ---------- Nakladnoylar ----------
  async function createInvoice(clientId, items) {
    return check(await sb.rpc("create_invoice", { p_client_id: clientId, p_items: items }));
  }
  async function invoices(f) {
    f = f || {};
    var q = sb.from("invoices").select("id,number,doc_date,agent_id,agent_name,client_id,client_name,total,created_at")
      .order("created_at", { ascending: false }).limit(f.limit || 500);
    if (f.agentId) q = q.eq("agent_id", f.agentId);
    if (f.client) q = q.ilike("client_name", "%" + f.client.replace(/[%_]/g, "") + "%");
    if (f.from) q = q.gte("doc_date", f.from);
    if (f.to) q = q.lte("doc_date", f.to);
    if (f.number) q = q.eq("number", f.number);
    return check(await q);
  }
  async function invoiceItems(invoiceId) {
    return check(await sb.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"));
  }
  async function invoiceDelete(id) { return check(await sb.from("invoices").delete().eq("id", id)); }

  return {
    sb: sb, login: login, logout: logout, session: session, myProfile: myProfile,
    products: products, productSave: productSave, productDelete: productDelete,
    clients: clients, clientSave: clientSave, clientDelete: clientDelete, clientsInsertMany: clientsInsertMany, assignClients: assignClients,
    profiles: profiles, adminUsers: adminUsers,
    createInvoice: createInvoice, invoices: invoices, invoiceItems: invoiceItems, invoiceDelete: invoiceDelete
  };
})();

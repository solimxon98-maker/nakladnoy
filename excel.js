/*
 * Excel eksport — shablon ko'rinishida (oldingi versiyadagi bilan bir xil).
 * doc = { number, date: "dd.mm.yyyy", client, agent, from, lines: [{name, price, qty}] }
 * Faqat soni kiritilgan qatorlar yoziladi.
 */
window.EXCEL = (function () {
  "use strict";
  async function build(doc) {
    var wb = new window.ExcelJS.Workbook();
    var ws = wb.addWorksheet("Sheet1", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 6 }, { width: 52 }, { width: 16.7 }, { width: 13.7 }, { width: 30 }];
    var font = { name: "Calibri", size: 12 };
    var bold = { name: "Calibri", size: 12, bold: true };
    var numFmt = '_-* #,##0_-;\\-* #,##0_-;_-* "-"??_-;_-@_-';
    var thin = { style: "thin" };
    var box = { top: thin, left: thin, bottom: thin, right: thin };

    ws.mergeCells("A1:E1");
    ws.getCell("A1").value = "Накладная №" + (doc.number ? doc.number : "______") + " от " + doc.date;
    ws.getCell("A1").font = bold;
    ws.getCell("A1").alignment = { horizontal: "center" };
    ["B2:C2", "B3:C3", "B4:C4", "B5:C5", "A6:E6"].forEach(function (r) { ws.mergeCells(r); });
    ws.getCell("B2").value = "Кому: " + doc.client;
    ws.getCell("E2").value = "От: " + doc.from;
    ws.getCell("E3").value = "ТП: " + doc.agent;
    ["B2", "E2", "E3"].forEach(function (c) { ws.getCell(c).font = font; });

    var head = ws.getRow(7);
    head.values = ["№", "Наименование", "Цена", "Количество", "Сумма"];
    head.eachCell(function (c) {
      c.font = font; c.border = box; c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD3D3D3" } };
    });

    var r = 8, n = 1, total = 0;
    doc.lines.forEach(function (l) {
      if (!l.qty) return;
      var row = ws.getRow(r);
      row.getCell(1).value = n++;
      row.getCell(2).value = l.name;
      row.getCell(3).value = l.price;
      row.getCell(4).value = l.qty;
      row.getCell(5).value = { formula: "+D" + r + "*C" + r, result: l.price * l.qty };
      total += l.price * l.qty;
      for (var c = 1; c <= 5; c++) {
        var cell = row.getCell(c);
        cell.border = box;
        cell.font = c === 1 || c === 4 ? font : bold;
        if (c === 3 || c === 5) cell.numFmt = numFmt;
        if (c === 1 || c === 4) cell.alignment = { horizontal: "center" };
      }
      r++;
    });
    var tot = ws.getRow(r);
    tot.getCell(4).value = "ИТОГО:";
    tot.getCell(4).font = bold;
    tot.getCell(4).alignment = { horizontal: "right" };
    tot.getCell(5).value = { formula: "SUM(E8:E" + (r - 1) + ")", result: total };
    tot.getCell(5).font = bold; tot.getCell(5).numFmt = numFmt; tot.getCell(5).border = box;
    return wb.xlsx.writeBuffer();
  }

  function safeName(s) { return String(s).replace(/[\\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60); }

  async function download(doc) {
    if (!window.ExcelJS) throw new Error("Excel moduli yuklanmadi. Internetni tekshirib, sahifani yangilang.");
    var buf = await build(doc);
    var name = "Накладная " + (doc.number ? "№" + doc.number + " " : "") + safeName(doc.client) + " " + doc.date + ".xlsx";
    window.U.download(name, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  return { build: build, download: download };
})();

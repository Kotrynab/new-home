// ArtboardCreator.jsx — Create artboards in bulk with CSV import/export

#target illustrator

(function () {

  var GAP = 20;
  var COLUMNS = 5;

  var UNITS = ["px", "in", "mm", "cm"];
  var UNIT_LABELS = ["Pixels (px)", "Inches (in)", "Millimeters (mm)", "Centimeters (cm)"];

  // Convert any unit to points (Illustrator uses points internally)
  function toPoints(value, unit) {
    if (unit === "px") return value * 0.75;         // 1px = 0.75pt at 72dpi
    if (unit === "in") return value * 72;
    if (unit === "mm") return value * 2.8346;
    if (unit === "cm") return value * 28.346;
    return value;
  }

  function fromPoints(pts, unit) {
    if (unit === "px") return pts / 0.75;
    if (unit === "in") return pts / 72;
    if (unit === "mm") return pts / 2.8346;
    if (unit === "cm") return pts / 28.346;
    return pts;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // --- SOCIAL MEDIA PRESETS (in px) ---
  var PRESETS = [
    { name: "Instagram Post", w: 1080, h: 1080 },
    { name: "Instagram Story", w: 1080, h: 1920 },
    { name: "Facebook Post", w: 1200, h: 630 },
    { name: "Facebook Cover", w: 851, h: 315 },
    { name: "Twitter Post", w: 1600, h: 900 },
    { name: "Twitter Header", w: 1500, h: 500 },
    { name: "LinkedIn Post", w: 1200, h: 627 },
    { name: "LinkedIn Cover", w: 1584, h: 396 },
    { name: "Pinterest Pin", w: 1000, h: 1500 },
    { name: "YouTube Thumbnail", w: 1280, h: 720 },
    { name: "A4 Print (mm)", w: 210, h: 297 }
  ];

  // --- CSV HELPERS ---
  function parseCSV(text) {
    var results = [];
    var lines = text.split(/\r?\n/);
    for (var i = 1; i < lines.length; i++) { // skip header
      var line = lines[i].replace(/^\s+|\s+$/g, "");
      if (!line) continue;
      var parts = line.split(",");
      if (parts.length >= 4) {
        results.push({
          name: parts[0].replace(/^\s+|\s+$/g, "") || ("Artboard " + (i)),
          width: parseFloat(parts[1]),
          height: parseFloat(parts[2]),
          unit: (parts[3].replace(/^\s+|\s+$/g, "") || "px").toLowerCase()
        });
      }
    }
    return results;
  }

  function buildCSVTemplate() {
    var lines = ["Name,Width,Height,Unit"];
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      var unit = (p.name.indexOf("mm") !== -1) ? "mm" : "px";
      lines.push(p.name + "," + p.w + "," + p.h + "," + unit);
    }
    return lines.join("\n");
  }

  function exportCurrentArtboards(doc, unit) {
    var lines = ["Name,Width,Height,Unit"];
    for (var i = 0; i < doc.artboards.length; i++) {
      var ab = doc.artboards[i];
      var rect = ab.artboardRect;
      var w = round2(fromPoints(rect[2] - rect[0], unit));
      var h = round2(fromPoints(rect[1] - rect[3], unit));
      lines.push(ab.name + "," + w + "," + h + "," + unit);
    }
    return lines.join("\n");
  }

  // --- LAYOUT ---
  function layoutArtboards(doc, startIndex, count, gapPt) {
    if (count === 0) return;

    // Find bounding box of existing artboards (before our new ones)
    var existingEnd = 0;
    for (var i = 0; i < startIndex; i++) {
      var r = doc.artboards[i].artboardRect;
      if (r[2] > existingEnd) existingEnd = r[2];
    }

    var col = 0, row = 0;
    var rowHeights = [];
    var rowWidths = [];
    var currentRowMax = 0;
    var x = 0, y = 0;
    var colIndex = 0;

    // Collect sizes first
    var sizes = [];
    for (var j = startIndex; j < startIndex + count; j++) {
      var ab = doc.artboards[j];
      var r = ab.artboardRect;
      sizes.push({ w: r[2] - r[0], h: r[1] - r[3] });
    }

    // Find max height per row
    var rowMaxH = [];
    for (var k = 0; k < sizes.length; k++) {
      var rowNum = Math.floor(k / COLUMNS);
      if (!rowMaxH[rowNum]) rowMaxH[rowNum] = 0;
      if (sizes[k].h > rowMaxH[rowNum]) rowMaxH[rowNum] = sizes[k].h;
    }

    // Starting offset — place after existing artboards or at 0
    var offsetX = (startIndex > 0) ? existingEnd + gapPt : 0;
    // Actually, always lay new artboards from x=0 if this is the first batch,
    // otherwise append after existing ones on a new row
    if (startIndex > 0) {
      // Put on next row below existing artboards
      var maxY = 0;
      for (var e = 0; e < startIndex; e++) {
        var er = doc.artboards[e].artboardRect;
        if (-er[3] > maxY) maxY = -er[3];
      }
      offsetX = 0;
      y = -(maxY + gapPt);
    } else {
      offsetX = 0;
      y = 0;
    }

    colIndex = 0;
    var rowY = y;

    for (var m = 0; m < count; m++) {
      var ab = doc.artboards[startIndex + m];
      var sz = sizes[m];
      var rn = Math.floor(m / COLUMNS);
      var cn = m % COLUMNS;

      if (cn === 0 && m > 0) {
        rowY -= rowMaxH[rn - 1] + gapPt;
      }

      var colX = 0;
      for (var c = 0; c < cn; c++) {
        colX += sizes[m - cn + c].w + gapPt;
      }

      ab.artboardRect = [offsetX + colX, rowY, offsetX + colX + sz.w, rowY - sz.h];
    }
  }

  // --- MAIN DIALOG ---
  function showDialog() {
    var doc = app.documents.length > 0 ? app.activeDocument : null;

    var dlg = new Window("dialog", "Artboard Creator", undefined, { closeButton: true });
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.spacing = 10;
    dlg.margins = 16;

    // Unit selector
    var unitRow = dlg.add("group");
    unitRow.add("statictext", undefined, "Units:");
    var unitDD = unitRow.add("dropdownlist", undefined, UNIT_LABELS);
    unitDD.selection = 0; // default px

    // Artboard list header
    dlg.add("statictext", undefined, "Artboards to create:");

    // Scrollable list panel
    var listPanel = dlg.add("panel");
    listPanel.orientation = "column";
    listPanel.alignChildren = ["fill", "top"];
    listPanel.spacing = 4;
    listPanel.margins = 8;
    listPanel.preferredSize.height = 200;

    var rows = [];

    function addRow(name, w, h) {
      var row = listPanel.add("group");
      row.orientation = "row";
      row.spacing = 6;
      var nameField = row.add("edittext", undefined, name || "");
      nameField.preferredSize.width = 130;
      var wField = row.add("edittext", undefined, w || "");
      wField.preferredSize.width = 60;
      row.add("statictext", undefined, "×");
      var hField = row.add("edittext", undefined, h || "");
      hField.preferredSize.width = 60;
      var removeBtn = row.add("button", undefined, "✕");
      removeBtn.preferredSize.width = 28;
      removeBtn.onClick = function () {
        listPanel.remove(row);
        rows.splice(rows.indexOf(rowObj), 1);
        dlg.layout.layout(true);
      };
      var rowObj = { row: row, name: nameField, w: wField, h: hField };
      rows.push(rowObj);
      dlg.layout.layout(true);
    }

    // Preset row
    var presetRow = dlg.add("group");
    presetRow.add("statictext", undefined, "Add preset:");
    var presetDD = presetRow.add("dropdownlist", undefined, (function () {
      var names = ["— choose —"];
      for (var i = 0; i < PRESETS.length; i++) names.push(PRESETS[i].name);
      return names;
    })());
    presetDD.selection = 0;
    var addPresetBtn = presetRow.add("button", undefined, "Add");
    addPresetBtn.onClick = function () {
      var idx = presetDD.selection.index - 1;
      if (idx < 0) return;
      var p = PRESETS[idx];
      var unit = UNITS[unitDD.selection.index];
      // Convert preset px values to selected unit
      var wInUnit = round2(fromPoints(toPoints(p.w, "px"), unit));
      var hInUnit = round2(fromPoints(toPoints(p.h, "px"), unit));
      addRow(p.name, wInUnit, hInUnit);
    };

    var addRowBtn = dlg.add("button", undefined, "+ Add Artboard Row");
    addRowBtn.onClick = function () { addRow("Artboard", "", ""); };

    // CSV buttons
    var csvGroup = dlg.add("group");
    var importBtn = csvGroup.add("button", undefined, "Import CSV");
    var exportBtn = csvGroup.add("button", undefined, "Export Current Artboards");
    var templateBtn = csvGroup.add("button", undefined, "Download CSV Template");

    importBtn.onClick = function () {
      var f = File.openDialog("Select CSV file", "CSV files:*.csv,All files:*.*");
      if (!f) return;
      f.open("r");
      var text = f.read();
      f.close();
      var items = parseCSV(text);
      if (items.length === 0) {
        alert("No valid rows found in CSV.\nExpected columns: Name, Width, Height, Unit");
        return;
      }
      var unit = UNITS[unitDD.selection.index];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var wConverted = round2(fromPoints(toPoints(item.width, item.unit), unit));
        var hConverted = round2(fromPoints(toPoints(item.height, item.unit), unit));
        addRow(item.name, wConverted, hConverted);
      }
    };

    exportBtn.onClick = function () {
      if (!doc) { alert("No document open."); return; }
      var unit = UNITS[unitDD.selection.index];
      var csv = exportCurrentArtboards(doc, unit);
      var f = File.saveDialog("Save artboards as CSV", "CSV files:*.csv");
      if (!f) return;
      f.open("w");
      f.write(csv);
      f.close();
      alert("Exported " + doc.artboards.length + " artboards.");
    };

    templateBtn.onClick = function () {
      var f = File.saveDialog("Save CSV Template", "CSV files:*.csv");
      if (!f) return;
      f.open("w");
      f.write(buildCSVTemplate());
      f.close();
      alert("Template saved! It includes popular social media sizes.");
    };

    // Bottom buttons
    var btnGroup = dlg.add("group");
    btnGroup.alignment = "right";
    var cancelBtn = btnGroup.add("button", undefined, "Cancel", { name: "cancel" });
    var createBtn = btnGroup.add("button", undefined, "Create Artboards", { name: "ok" });

    createBtn.onClick = function () {
      if (rows.length === 0) {
        alert("Please add at least one artboard row.");
        return;
      }

      var unit = UNITS[unitDD.selection.index];
      var toCreate = [];

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var name = r.name.text || ("Artboard " + (i + 1));
        var w = parseFloat(r.w.text);
        var h = parseFloat(r.h.text);
        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
          alert("Row " + (i + 1) + " (" + name + ") has invalid width or height.");
          return;
        }
        toCreate.push({ name: name, wPt: toPoints(w, unit), hPt: toPoints(h, unit) });
      }

      // Create or use existing document
      if (!doc) {
        doc = app.documents.add();
      }

      var startIndex = doc.artboards.length;
      var gapPt = toPoints(GAP, "px");

      // Add artboards
      for (var j = 0; j < toCreate.length; j++) {
        var item = toCreate[j];
        var rect = [0, 0, item.wPt, -item.hPt]; // placeholder position
        if (startIndex === 0 && j === 0) {
          doc.artboards[0].artboardRect = rect;
          doc.artboards[0].name = item.name;
        } else {
          doc.artboards.add(rect);
          doc.artboards[doc.artboards.length - 1].name = item.name;
        }
      }

      // Layout all new artboards
      layoutArtboards(doc, startIndex === 0 ? 0 : startIndex, toCreate.length, gapPt);

      dlg.close();
      alert("Done! Created " + toCreate.length + " artboard(s).");
    };

    // Start with 1 empty row
    addRow("Artboard 1", "", "");

    dlg.show();
  }

  showDialog();

})();

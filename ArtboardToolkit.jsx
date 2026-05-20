// ArtboardToolkit.jsx — Artboard Creator + Smart Copy in one panel

#target illustrator

(function () {

  // =====================================================================
  // SHARED UTILITIES
  // =====================================================================

  var GAP = 20;
  var COLUMNS = 5;
  var UNITS = ["px", "in", "mm", "cm"];
  var UNIT_LABELS = ["Pixels (px)", "Inches (in)", "Millimeters (mm)", "Centimeters (cm)"];

  function toPoints(value, unit) {
    if (unit === "px") return value * 0.75;
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

  function round2(n) { return Math.round(n * 100) / 100; }

  // =====================================================================
  // ARTBOARD CREATOR — DATA
  // =====================================================================

  var PRESETS = [
    { name: "Instagram Post",    w: 1080, h: 1080 },
    { name: "Instagram Story",   w: 1080, h: 1920 },
    { name: "Facebook Post",     w: 1200, h: 630  },
    { name: "Facebook Cover",    w: 851,  h: 315  },
    { name: "Twitter Post",      w: 1600, h: 900  },
    { name: "Twitter Header",    w: 1500, h: 500  },
    { name: "LinkedIn Post",     w: 1200, h: 627  },
    { name: "LinkedIn Cover",    w: 1584, h: 396  },
    { name: "Pinterest Pin",     w: 1000, h: 1500 },
    { name: "YouTube Thumbnail", w: 1280, h: 720  },
    { name: "A4 Print (mm)",     w: 210,  h: 297  }
  ];

  function parseCSV(text) {
    var results = [];
    var lines = text.split(/\r?\n/);
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].replace(/^\s+|\s+$/g, "");
      if (!line) continue;
      var parts = line.split(",");
      if (parts.length >= 4) {
        results.push({
          name:  parts[0].replace(/^\s+|\s+$/g, "") || ("Artboard " + i),
          width: parseFloat(parts[1]),
          height: parseFloat(parts[2]),
          unit:  (parts[3].replace(/^\s+|\s+$/g, "") || "px").toLowerCase()
        });
      }
    }
    return results;
  }

  function buildCSVTemplate() {
    var lines = ["Name,Width,Height,Unit"];
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      var u = (p.name.indexOf("mm") !== -1) ? "mm" : "px";
      lines.push(p.name + "," + p.w + "," + p.h + "," + u);
    }
    return lines.join("\n");
  }

  function exportCurrentArtboards(doc, unit) {
    var lines = ["Name,Width,Height,Unit"];
    for (var i = 0; i < doc.artboards.length; i++) {
      var ab = doc.artboards[i];
      var r  = ab.artboardRect;
      var w  = round2(fromPoints(r[2] - r[0], unit));
      var h  = round2(fromPoints(r[1] - r[3], unit));
      lines.push(ab.name + "," + w + "," + h + "," + unit);
    }
    return lines.join("\n");
  }

  function layoutArtboards(doc, startIndex, count, gapPt) {
    if (count === 0) return;
    var sizes = [];
    for (var j = startIndex; j < startIndex + count; j++) {
      var r = doc.artboards[j].artboardRect;
      sizes.push({ w: r[2] - r[0], h: r[1] - r[3] });
    }
    var rowMaxH = [];
    for (var k = 0; k < sizes.length; k++) {
      var rn = Math.floor(k / COLUMNS);
      if (!rowMaxH[rn]) rowMaxH[rn] = 0;
      if (sizes[k].h > rowMaxH[rn]) rowMaxH[rn] = sizes[k].h;
    }
    var offsetX = 0, startY = 0;
    if (startIndex > 0) {
      var maxY = 0;
      for (var e = 0; e < startIndex; e++) {
        var er = doc.artboards[e].artboardRect;
        if (-er[3] > maxY) maxY = -er[3];
      }
      startY = -(maxY + gapPt);
    }
    var rowY = startY;
    for (var m = 0; m < count; m++) {
      var ab  = doc.artboards[startIndex + m];
      var sz  = sizes[m];
      var rnm = Math.floor(m / COLUMNS);
      var cn  = m % COLUMNS;
      if (cn === 0 && m > 0) rowY -= rowMaxH[rnm - 1] + gapPt;
      var colX = 0;
      for (var c = 0; c < cn; c++) colX += sizes[m - cn + c].w + gapPt;
      ab.artboardRect = [offsetX + colX, rowY, offsetX + colX + sz.w, rowY - sz.h];
    }
  }

  // =====================================================================
  // SMART COPY — DATA
  // =====================================================================

  function getItemBounds(item) {
    var b = item.visibleBounds;
    return { left: b[0], top: b[1], right: b[2], bottom: b[3],
             width: b[2] - b[0], height: b[1] - b[3] };
  }

  function getArtboardRect(ab) {
    var r = ab.artboardRect;
    return { left: r[0], top: r[1], right: r[2], bottom: r[3],
             width: r[2] - r[0], height: r[1] - r[3] };
  }

  function findSourceArtboard(doc, ib) {
    var best = null, bestArea = -1;
    for (var i = 0; i < doc.artboards.length; i++) {
      var ab = getArtboardRect(doc.artboards[i]);
      var ox = Math.max(0, Math.min(ib.right, ab.right)   - Math.max(ib.left,   ab.left));
      var oy = Math.max(0, Math.min(ib.top,   ab.top)     - Math.max(ib.bottom, ab.bottom));
      var area = ox * oy;
      if (area > bestArea) { bestArea = area; best = i; }
    }
    return best;
  }

  function analysePosition(ib, srcAB) {
    var relCX = (ib.left + ib.width  / 2 - srcAB.left)   / srcAB.width;
    var relCY = (ib.top  - ib.height / 2 - srcAB.bottom) / (srcAB.top - srcAB.bottom);
    var hAnchor = relCX < 0.35 ? "left"   : relCX > 0.65 ? "right"  : "center";
    var vAnchor = relCY < 0.35 ? "top"    : relCY > 0.65 ? "bottom" : "center";
    return {
      relCX: relCX, relCY: relCY,
      marginLeft:   ib.left   - srcAB.left,
      marginRight:  srcAB.right  - ib.right,
      marginTop:    srcAB.top    - ib.top,
      marginBottom: ib.bottom - srcAB.bottom,
      hAnchor: hAnchor, vAnchor: vAnchor,
      srcWidth: ib.width, srcHeight: ib.height,
      srcABWidth: srcAB.width, srcABHeight: srcAB.height
    };
  }

  function placeItemOnArtboard(copy, pos, dstAB, mode) {
    var newW, newH, newCX, newCY;
    if (mode === "fit") {
      var scale = Math.min(dstAB.width / pos.srcWidth, dstAB.height / pos.srcHeight);
      newW  = pos.srcWidth  * scale;
      newH  = pos.srcHeight * scale;
      newCX = dstAB.left + dstAB.width  / 2;
      newCY = dstAB.top  - dstAB.height / 2;
    } else {
      var areaScale = Math.sqrt((dstAB.width * dstAB.height) / (pos.srcABWidth * pos.srcABHeight));
      newW = pos.srcWidth  * areaScale;
      newH = pos.srcHeight * areaScale;
      if (pos.hAnchor === "left") {
        newCX = dstAB.left  + pos.marginLeft  * (dstAB.width  / pos.srcABWidth)  + newW / 2;
      } else if (pos.hAnchor === "right") {
        newCX = dstAB.right - pos.marginRight * (dstAB.width  / pos.srcABWidth)  - newW / 2;
      } else {
        newCX = dstAB.left + dstAB.width / 2;
      }
      if (pos.vAnchor === "top") {
        newCY = dstAB.top    - pos.marginTop    * (dstAB.height / pos.srcABHeight) - newH / 2;
      } else if (pos.vAnchor === "bottom") {
        newCY = dstAB.bottom + pos.marginBottom * (dstAB.height / pos.srcABHeight) + newH / 2;
      } else {
        newCY = dstAB.top - dstAB.height / 2;
      }
    }
    var cb = getItemBounds(copy);
    copy.resize((newW / cb.width) * 100, (newH / cb.height) * 100,
                true, true, true, true, 1, Transformation.CENTER);
    var ab2 = getItemBounds(copy);
    copy.translate(newCX - (ab2.left + ab2.width / 2),
                   newCY - (ab2.top  - ab2.height / 2));
  }

  // =====================================================================
  // MAIN DIALOG — TABBED
  // =====================================================================

  var dlg = new Window("dialog", "Artboard Toolkit", undefined, { closeButton: true });
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];
  dlg.spacing = 8;
  dlg.margins = 14;

  // --- TAB BAR (simulated with buttons) ---
  var tabBar = dlg.add("group");
  tabBar.orientation = "row";
  tabBar.spacing = 0;
  var tabCreate = tabBar.add("button", undefined, "  Create Artboards  ");
  var tabCopy   = tabBar.add("button", undefined, "  Smart Copy  ");

  // --- TAB PANELS ---
  var stackGroup = dlg.add("group");
  stackGroup.orientation = "stack";
  stackGroup.alignChildren = ["fill", "top"];

  var panelCreate = stackGroup.add("panel", undefined, "");
  panelCreate.orientation = "column";
  panelCreate.alignChildren = ["fill", "top"];
  panelCreate.spacing = 8;
  panelCreate.margins = 10;

  var panelCopy = stackGroup.add("panel", undefined, "");
  panelCopy.orientation = "column";
  panelCopy.alignChildren = ["fill", "top"];
  panelCopy.spacing = 8;
  panelCopy.margins = 10;

  function showTab(which) {
    panelCreate.visible = (which === "create");
    panelCopy.visible   = (which === "copy");
    dlg.layout.layout(true);
    dlg.update();
  }

  tabCreate.onClick = function () { showTab("create"); };
  tabCopy.onClick   = function () { showTab("copy");   };

  // =====================================================================
  // TAB 1 — CREATE ARTBOARDS
  // =====================================================================

  var doc = app.documents.length > 0 ? app.activeDocument : null;

  // Units
  var unitRow = panelCreate.add("group");
  unitRow.add("statictext", undefined, "Units:");
  var unitDD = unitRow.add("dropdownlist", undefined, UNIT_LABELS);
  unitDD.selection = 0;

  panelCreate.add("statictext", undefined, "Artboards to create:");

  var listPanel = panelCreate.add("panel");
  listPanel.orientation = "column";
  listPanel.alignChildren = ["fill", "top"];
  listPanel.spacing = 4;
  listPanel.margins = 8;
  listPanel.preferredSize.height = 180;

  var rows = []; // each entry: { data: {name, w, h}, row: uiGroup }

  function addRow(name, w, h) {
    // Store values in a plain JS object — never read from ScriptUI references later
    var data = { name: String(name || ""), w: String(w || ""), h: String(h || "") };

    var row = listPanel.add("group");
    row.orientation = "row";
    row.spacing = 6;

    var nameField = row.add("edittext", undefined, data.name);
    nameField.preferredSize.width = 120;
    nameField.onChanging = function () { data.name = nameField.text; };

    var wField = row.add("edittext", undefined, data.w);
    wField.preferredSize.width = 55;
    wField.onChanging = function () { data.w = wField.text; };

    row.add("statictext", undefined, "x");

    var hField = row.add("edittext", undefined, data.h);
    hField.preferredSize.width = 55;
    hField.onChanging = function () { data.h = hField.text; };

    var removeBtn = row.add("button", undefined, "X");
    removeBtn.preferredSize.width = 26;

    var rowObj = { row: row, data: data };
    removeBtn.onClick = function () {
      listPanel.remove(row);
      for (var ri = 0; ri < rows.length; ri++) {
        if (rows[ri] === rowObj) { rows.splice(ri, 1); break; }
      }
      dlg.layout.layout(true);
    };
    rows.push(rowObj);
    dlg.layout.layout(true);
  }

  // Preset picker
  var presetRow = panelCreate.add("group");
  presetRow.add("statictext", undefined, "Preset:");
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
    var p    = PRESETS[idx];
    var unit = UNITS[unitDD.selection.index];
    addRow(p.name,
      round2(fromPoints(toPoints(p.w, "px"), unit)),
      round2(fromPoints(toPoints(p.h, "px"), unit)));
  };

  var addRowBtn = panelCreate.add("button", undefined, "+ Add Row");
  addRowBtn.onClick = function () { addRow("Artboard", "", ""); };

  // CSV row
  var csvGroup = panelCreate.add("group");
  csvGroup.spacing = 6;
  var importBtn   = csvGroup.add("button", undefined, "Import CSV");
  var exportBtn   = csvGroup.add("button", undefined, "Export Artboards");
  var templateBtn = csvGroup.add("button", undefined, "CSV Template");

  importBtn.onClick = function () {
    var f = File.openDialog("Select CSV", "CSV files:*.csv,All files:*.*");
    if (!f) return;
    f.open("r"); var text = f.read(); f.close();
    var items = parseCSV(text);
    if (items.length === 0) { alert("No valid rows found.\nExpected: Name, Width, Height, Unit"); return; }
    var unit = UNITS[unitDD.selection.index];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      addRow(it.name,
        round2(fromPoints(toPoints(it.width,  it.unit), unit)),
        round2(fromPoints(toPoints(it.height, it.unit), unit)));
    }
  };

  exportBtn.onClick = function () {
    if (!doc) { alert("No document open."); return; }
    var unit = UNITS[unitDD.selection.index];
    var csv  = exportCurrentArtboards(doc, unit);
    var f    = File.saveDialog("Save CSV", "CSV files:*.csv");
    if (!f) return;
    f.open("w"); f.write(csv); f.close();
    alert("Exported " + doc.artboards.length + " artboard(s).");
  };

  templateBtn.onClick = function () {
    var f = File.saveDialog("Save CSV Template", "CSV files:*.csv");
    if (!f) return;
    f.open("w"); f.write(buildCSVTemplate()); f.close();
    alert("Template saved — includes popular social media sizes.");
  };

  // Create & View button
  var createBtnGroup = panelCreate.add("group");
  createBtnGroup.alignment = "fill";

  function doCreateArtboards() {
    try {
      if (rows.length === 0) { alert("Add at least one artboard row first."); return 0; }
      var unit = UNITS[unitDD.selection.index];
      var toCreate = [];
      for (var i = 0; i < rows.length; i++) {
        var r    = rows[i];
        var name = r.data.name || ("Artboard " + (i + 1));
        var w    = parseFloat(r.data.w);
        var h    = parseFloat(r.data.h);
        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
          alert("Row " + (i + 1) + ' "' + name + '" has no valid width/height.\nPlease enter numbers greater than 0.');
          return 0;
        }
        toCreate.push({ name: name, wPt: toPoints(w, unit), hPt: toPoints(h, unit) });
      }

      var activeDoc = app.documents.length > 0 ? app.activeDocument : app.documents.add();
      var gapPt = toPoints(GAP, "px");

      // Always modify existing artboard[0] if this is the first set, otherwise append
      var startIndex = activeDoc.artboards.length;

      for (var j = 0; j < toCreate.length; j++) {
        var item = toCreate[j];
        var rect = [0, 0, item.wPt, -item.hPt];
        if (j === 0 && startIndex <= 1) {
          activeDoc.artboards[0].artboardRect = rect;
          activeDoc.artboards[0].name = item.name;
        } else {
          activeDoc.artboards.add(rect);
          activeDoc.artboards[activeDoc.artboards.length - 1].name = item.name;
        }
      }

      var layoutStart = (startIndex <= 1) ? 0 : startIndex;
      layoutArtboards(activeDoc, layoutStart, toCreate.length, gapPt);

      return { count: toCreate.length, doc: activeDoc };
    } catch (err) {
      alert("Error creating artboards:\n" + err.message + "\n(line " + err.line + ")");
      return 0;
    }
  }

  var createBtn     = createBtnGroup.add("button", undefined, "Create Artboards");
  var createViewBtn = createBtnGroup.add("button", undefined, "Create + View in Workspace");

  createBtn.onClick = function () {
    var result = doCreateArtboards();
    if (result && result.count) alert("Done! Created " + result.count + " artboard(s).");
  };

  createViewBtn.onClick = function () {
    var result = doCreateArtboards();
    if (!result || !result.count) return;
    var d = result.doc;
    try {
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (var i = 0; i < d.artboards.length; i++) {
        var r = d.artboards[i].artboardRect;
        if (r[0] < minX) minX = r[0];
        if (r[2] > maxX) maxX = r[2];
        if (r[3] < minY) minY = r[3];
        if (r[1] > maxY) maxY = r[1];
      }
      d.views[0].centerPoint = [(minX + maxX) / 2, (minY + maxY) / 2];
      var fitW = 600 / (maxX - minX + 80);
      var fitH = 400 / (maxY - minY + 80);
      d.views[0].zoom = Math.min(fitW, fitH, 4);
    } catch (e) {
      try { app.executeMenuCommand("fitall"); } catch (e2) {}
    }
    dlg.close();
    alert("Done! Created " + result.count + " artboard(s).");
  };

  addRow("Artboard 1", "", "");

  // =====================================================================
  // TAB 2 — SMART COPY
  // =====================================================================

  var copyDoc        = app.documents.length > 0 ? app.activeDocument : null;
  var copySelection  = copyDoc ? copyDoc.selection : [];
  var pos            = null;
  var srcABIndex     = null;

  var hintText = panelCopy.add("statictext", undefined, "Step 1: Create artboards first  →  Step 2: Select object  →  Step 3: Analyse & Copy");
  hintText.graphics.foregroundColor = hintText.graphics.newPen(hintText.graphics.PenType.SOLID_COLOR, [0.6, 0.6, 0.6, 1], 1);

  var infoText = panelCopy.add("statictext", undefined, "Select an object on an artboard, then click Analyse.");
  infoText.preferredSize.width = 340;

  var analyseBtn = panelCopy.add("button", undefined, "Analyse Selection");
  analyseBtn.onClick = function () {
    copyDoc       = app.documents.length > 0 ? app.activeDocument : null;
    copySelection = copyDoc ? copyDoc.selection : [];
    if (!copyDoc || copySelection.length === 0) {
      infoText.text = "No selection found. Select an object first."; return;
    }
    var ib;
    if (copySelection.length === 1) {
      ib = getItemBounds(copySelection[0]);
    } else {
      var minL = Infinity, maxR = -Infinity, maxT = -Infinity, minB = Infinity;
      for (var s = 0; s < copySelection.length; s++) {
        var sb = getItemBounds(copySelection[s]);
        if (sb.left   < minL) minL = sb.left;
        if (sb.right  > maxR) maxR = sb.right;
        if (sb.top    > maxT) maxT = sb.top;
        if (sb.bottom < minB) minB = sb.bottom;
      }
      ib = { left: minL, top: maxT, right: maxR, bottom: minB,
             width: maxR - minL, height: maxT - minB };
    }
    srcABIndex = findSourceArtboard(copyDoc, ib);
    if (srcABIndex === null) {
      infoText.text = "Could not detect artboard. Is your object on an artboard?"; return;
    }
    var srcAB = getArtboardRect(copyDoc.artboards[srcABIndex]);
    pos = analysePosition(ib, srcAB);
    infoText.text = "Source: " + copyDoc.artboards[srcABIndex].name +
                    "   Position: " + pos.hAnchor + "-" + pos.vAnchor;

    // Refresh artboard list
    abListBox.removeAll();
    for (var i = 0; i < copyDoc.artboards.length; i++) {
      if (i !== srcABIndex) {
        var li = abListBox.add("item", copyDoc.artboards[i].name);
        li.abIndex = i;
      }
    }
    copyBtn.enabled = true;
  };

  // Scaling mode
  var modePanel = panelCopy.add("panel", undefined, "Scaling Mode");
  modePanel.orientation = "column";
  modePanel.alignChildren = ["left", "top"];
  modePanel.margins = 10;
  var radioSmart = modePanel.add("radiobutton", undefined, "Maintain Relative Size & Position");
  var radioFit   = modePanel.add("radiobutton", undefined, "Scale to Fit Artboard (full-bleed)");
  radioSmart.value = true;

  // Destination
  var destPanel = panelCopy.add("panel", undefined, "Destination");
  destPanel.orientation = "column";
  destPanel.alignChildren = ["left", "top"];
  destPanel.margins = 10;
  var radioAll = destPanel.add("radiobutton", undefined, "Copy to all other artboards");
  var radioSel = destPanel.add("radiobutton", undefined, "Select from list:");
  radioAll.value = true;

  var abListBox = destPanel.add("listbox", [0, 0, 320, 110], [], { multiselect: true });
  abListBox.enabled = false;
  radioSel.onClick = function () { abListBox.enabled = true; };
  radioAll.onClick = function () { abListBox.enabled = false; };

  var copyBtnGroup = panelCopy.add("group");
  copyBtnGroup.alignment = "right";
  var copyBtn = copyBtnGroup.add("button", undefined, "Copy to Artboards");
  copyBtn.enabled = false;

  copyBtn.onClick = function () {
    if (!pos) { alert("Click Analyse first."); return; }
    var mode    = radioFit.value ? "fit" : "smart";
    var targets = [];
    if (radioAll.value) {
      for (var j = 0; j < copyDoc.artboards.length; j++) {
        if (j !== srcABIndex) targets.push(j);
      }
    } else {
      var sel = abListBox.selection;
      if (!sel || sel.length === 0) { alert("Select at least one artboard from the list."); return; }
      for (var k = 0; k < sel.length; k++) targets.push(sel[k].abIndex);
    }
    if (targets.length === 0) { alert("No target artboards found.\n\nYou need at least 2 artboards to use Smart Copy.\nGo to the 'Create Artboards' tab first to add more artboards."); return; }

    try {
      for (var t = 0; t < targets.length; t++) {
        var dstAB = getArtboardRect(copyDoc.artboards[targets[t]]);
        var copies = [];
        for (var s2 = 0; s2 < copySelection.length; s2++) {
          copies.push(copySelection[s2].duplicate());
        }
        var workItem;
        if (copies.length > 1) {
          workItem = copyDoc.groupItems.add();
          for (var c = copies.length - 1; c >= 0; c--) {
            copies[c].move(workItem, ElementPlacement.PLACEATBEGINNING);
          }
        } else {
          workItem = copies[0];
        }
        placeItemOnArtboard(workItem, pos, dstAB, mode);
        if (copies.length > 1) workItem.ungroup();
      }
      alert("Done! Copied to " + targets.length + " artboard(s).\nCmd+Z to undo.");
    } catch (err) {
      alert("Error during copy:\n" + err.message + "\n(line " + err.line + ")");
    }
  };

  // =====================================================================
  // CLOSE BUTTON
  // =====================================================================

  var closeBtnGroup = dlg.add("group");
  closeBtnGroup.alignment = "right";
  closeBtnGroup.add("button", undefined, "Close", { name: "cancel" });

  // =====================================================================
  // SHOW
  // =====================================================================

  showTab("create");
  dlg.show();

})();

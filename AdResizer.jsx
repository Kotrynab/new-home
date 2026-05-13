// AdResizer.jsx — Ad Size Converter for Adobe Illustrator CC 2024+
//
// HOW TO RUN (one-time):
//   File > Scripts > Other Script… > browse to this file > Open
//
// HOW TO INSTALL PERMANENTLY (appears in File > Scripts menu every time):
//   Copy this file to:
//   /Applications/Adobe Illustrator 2024/Presets/en_US/Scripts/
//   then restart Illustrator.
//
// SMART LAYOUT RULES:
//   Portrait → Landscape  :  top-to-bottom stack  →  left-to-right
//   Landscape → Portrait  :  left-to-right         →  top-to-bottom stack
//   Similar proportions   :  proportional scale, positions preserved
//   Background is always stretched to fill the destination artboard.

#target illustrator

// =============================================================================
//  ENTRY POINT
// =============================================================================

function main() {
    if (app.documents.length === 0) { alert("Please open a document first."); return; }
    var doc = app.activeDocument;
    if (doc.artboards.length < 2) {
        alert("You need at least 2 artboards — source and destination.\nCreate the destination artboard first, then run this script.");
        return;
    }

    var dlg = buildDialog(doc);
    if (dlg.show() !== 1) return;

    var srcIdx  = dlg.sourceDD.selection.index;
    var tgtIdx  = dlg.targetMap[dlg.targetDD.selection.index];
    var fitMode = dlg.fitRB.value;

    if (srcIdx === tgtIdx) { alert("Source and destination must be different."); return; }

    // ── Collect source items ─────────────────────────────────────────────────
    var sr  = doc.artboards[srcIdx].artboardRect;
    var sL  = Math.min(sr[0], sr[2]),  sR  = Math.max(sr[0], sr[2]);
    var sT  = Math.max(sr[1], sr[3]),  sBo = Math.min(sr[1], sr[3]);
    var sW  = sR - sL,  sH  = sT - sBo;

    var tr  = doc.artboards[tgtIdx].artboardRect;
    var tL  = Math.min(tr[0], tr[2]),  tR  = Math.max(tr[0], tr[2]);
    var tT  = Math.max(tr[1], tr[3]),  tBo = Math.min(tr[1], tr[3]);
    var tW  = tR - tL,  tH  = tT - tBo;

    var items = collectItems(doc, sL, sR, sT, sBo);
    if (items.length === 0) {
        alert("No visible, unlocked objects found on the source artboard.\nCheck that objects are not locked and layers are visible.");
        return;
    }

    // ── Auto-assign zones ────────────────────────────────────────────────────
    var zoneIds = autoLayout(items, sW, sH, tW, tH, sL, sR, sT, sBo);

    // ── Convert ──────────────────────────────────────────────────────────────
    var ok = convert(doc, srcIdx, tgtIdx, items, zoneIds, fitMode);
    if (ok) alert("Done!\n\nIf the result isn't right, press Cmd+Z to undo and try again.");
}

// =============================================================================
//  DIALOG
// =============================================================================

function buildDialog(doc) {
    var dlg = new Window("dialog", "Ad Size Converter");
    dlg.orientation   = "column";
    dlg.alignChildren = "fill";
    dlg.spacing = 12;
    dlg.margins = 20;

    var activeIdx = doc.artboards.getActiveArtboardIndex();

    // Source
    var g1 = dlg.add("group");
    g1.add("statictext", undefined, "Copy FROM:");
    var srcDD = g1.add("dropdownlist", undefined, artboardLabels(doc));
    srcDD.selection = activeIdx;
    srcDD.preferredSize.width = 300;
    dlg.sourceDD = srcDD;

    // Destination
    var g2 = dlg.add("group");
    g2.add("statictext", undefined, "Copy TO:");
    var map   = buildTargetMap(doc, activeIdx);
    var tgtDD = g2.add("dropdownlist", undefined, map.labels);
    tgtDD.selection = 0;
    tgtDD.preferredSize.width = 300;
    dlg.targetDD  = tgtDD;
    dlg.targetMap = map.indices;

    // Smart layout description — updates when dropdowns change
    var descPanel = dlg.add("panel", undefined, "Smart layout");
    descPanel.orientation   = "column";
    descPanel.alignChildren = "left";
    descPanel.margins = [14, 18, 14, 12];

    var descText = descPanel.add("statictext", undefined, "", { multiline: true });
    descText.preferredSize = [360, 60];

    function refreshDesc() {
        var si = srcDD.selection ? srcDD.selection.index : 0;
        var tm = dlg.targetMap;
        var ti = (tgtDD.selection && tm) ? tm[tgtDD.selection.index] : -1;
        descText.text = (ti >= 0 && si !== ti)
            ? layoutDescription(doc, si, ti)
            : "Select source and destination to preview the layout.";
        dlg.layout.layout(true);
    }

    srcDD.onChange = function () {
        var m = buildTargetMap(doc, srcDD.selection.index);
        while (tgtDD.items.length > 0) tgtDD.remove(0);
        for (var k = 0; k < m.labels.length; k++) tgtDD.add("item", m.labels[k]);
        tgtDD.selection  = 0;
        dlg.targetMap    = m.indices;
        refreshDesc();
    };
    tgtDD.onChange = function () { refreshDesc(); };
    refreshDesc();

    // Scale mode
    var scalePanel = dlg.add("panel", undefined, "Scale mode");
    scalePanel.orientation = "row";
    scalePanel.margins     = [14, 18, 14, 10];
    var fitRB  = scalePanel.add("radiobutton", undefined, "Fit  (no cropping)");
    var fillRB = scalePanel.add("radiobutton", undefined, "Fill  (covers the artboard)");
    fitRB.value = true;
    dlg.fitRB  = fitRB;
    dlg.fillRB = fillRB;

    // Buttons
    var btnGrp = dlg.add("group");
    btnGrp.alignment = "right";
    btnGrp.add("button", undefined, "Cancel",  { name: "cancel" }).onClick = function () { dlg.close(0); };
    btnGrp.add("button", undefined, "Convert", { name: "ok"     }).onClick = function () { dlg.close(1); };

    return dlg;
}

// Human-readable description of the layout that will be applied
function layoutDescription(doc, srcIdx, tgtIdx) {
    var sr   = doc.artboards[srcIdx].artboardRect;
    var sW   = Math.abs(sr[2] - sr[0]),  sH = Math.abs(sr[1] - sr[3]);
    var tr   = doc.artboards[tgtIdx].artboardRect;
    var tW   = Math.abs(tr[2] - tr[0]),  tH = Math.abs(tr[1] - tr[3]);
    var shift = (tW / tH) / (sW / sH);   // how much wider target is relative to source

    if (shift >= 1.5) {
        return "Portrait → Landscape\nElements stacked top-to-bottom will be placed left-to-right.\nBackground will fill the destination.";
    } else if (shift <= 0.67) {
        return "Landscape → Portrait\nElements arranged left-to-right will be stacked top-to-bottom.\nBackground will fill the destination.";
    } else {
        return "Similar proportions\nAll elements scale and reposition proportionally.\nNo layout rearrangement.";
    }
}

// =============================================================================
//  SMART AUTO-LAYOUT
// =============================================================================

function autoLayout(items, sW, sH, tW, tH, sL, sR, sT, sBo) {
    var shift = (tW / tH) / (sW / sH);

    // Detect background: backmost item covering ≥ 75% of artboard in both axes
    var bgIdx = -1;
    for (var i = items.length - 1; i >= 0; i--) {
        var b  = items[i].geometricBounds;
        var iW = Math.abs(b[2] - b[0]);
        var iH = Math.abs(b[1] - b[3]);
        if (iW / sW >= 0.75 && iH / sH >= 0.75) { bgIdx = i; break; }
    }

    // Separate background index from content indices
    var content = [];   // indices of non-background items
    for (var i = 0; i < items.length; i++) {
        if (i !== bgIdx) content.push(i);
    }

    var zones = [];
    for (var i = 0; i < items.length; i++) zones.push("keep");
    if (bgIdx !== -1) zones[bgIdx] = "full";

    if (content.length === 0) return zones;

    if (shift >= 1.5) {
        // ── Portrait → Landscape: top element left, bottom element right ────
        var byY = sortedByYDesc(items, content);  // top-first (descending Y)
        var hz  = horzZones(byY.length);
        for (var k = 0; k < byY.length; k++) zones[byY[k]] = hz[k];

    } else if (shift <= 0.67) {
        // ── Landscape → Portrait: left element top, right element bottom ────
        var byX = sortedByXAsc(items, content);   // left-first (ascending X)
        var vz  = vertZones(byX.length);
        for (var k = 0; k < byX.length; k++) zones[byX[k]] = vz[k];

    }
    // else: similar ratio → all stay "keep" (proportional)

    return zones;
}

// Sort content indices by item centre Y, highest first (= top of artboard first)
function sortedByYDesc(items, indices) {
    var pairs = [];
    for (var i = 0; i < indices.length; i++) {
        var b = items[indices[i]].geometricBounds;
        pairs.push({ idx: indices[i], cy: (b[1] + b[3]) / 2 });
    }
    pairs.sort(function (a, b) { return b.cy - a.cy; });   // descending Y = top first
    var out = [];
    for (var i = 0; i < pairs.length; i++) out.push(pairs[i].idx);
    return out;
}

// Sort content indices by item centre X, lowest first (= left of artboard first)
function sortedByXAsc(items, indices) {
    var pairs = [];
    for (var i = 0; i < indices.length; i++) {
        var b = items[indices[i]].geometricBounds;
        pairs.push({ idx: indices[i], cx: (b[0] + b[2]) / 2 });
    }
    pairs.sort(function (a, b) { return a.cx - b.cx; });   // ascending X = left first
    var out = [];
    for (var i = 0; i < pairs.length; i++) out.push(pairs[i].idx);
    return out;
}

// Zone names for horizontal arrangement (left → right)
function horzZones(count) {
    if (count === 1) return ["full"];
    if (count === 2) return ["left", "right"];
    if (count === 3) return ["left3", "mid3", "right3"];
    // 4+ : fall back to proportional — too complex to auto-zone reliably
    var z = [];
    for (var i = 0; i < count; i++) z.push("keep");
    return z;
}

// Zone names for vertical arrangement (top → bottom)
function vertZones(count) {
    if (count === 1) return ["full"];
    if (count === 2) return ["top", "bottom"];
    if (count === 3) return ["top", "keep", "bottom"];  // middle item stays centred
    var z = [];
    for (var i = 0; i < count; i++) z.push("keep");
    return z;
}

// =============================================================================
//  CONVERSION
// =============================================================================

function convert(doc, srcIdx, tgtIdx, items, zoneIds, fitMode) {
    var sr  = doc.artboards[srcIdx].artboardRect;
    var sL  = Math.min(sr[0], sr[2]),  sR  = Math.max(sr[0], sr[2]);
    var sT  = Math.max(sr[1], sr[3]),  sBo = Math.min(sr[1], sr[3]);
    var sW  = sR - sL,  sH  = sT - sBo;

    var tr  = doc.artboards[tgtIdx].artboardRect;
    var tL  = Math.min(tr[0], tr[2]),  tR  = Math.max(tr[0], tr[2]);
    var tT  = Math.max(tr[1], tr[3]),  tBo = Math.min(tr[1], tr[3]);
    var tW  = tR - tL,  tH  = tT - tBo;

    var rx  = tW / sW,  ry  = tH / sH;
    var defaultSc = (fitMode ? Math.min(rx, ry) : Math.max(rx, ry)) * 100;

    var copies = [];

    for (var i = 0; i < items.length; i++) {
        var item   = items[i];
        var zoneId = zoneIds[i];

        var b   = item.geometricBounds;
        var icx = (b[0] + b[2]) / 2;
        var icy = (b[1] + b[3]) / 2;
        var iW  = Math.abs(b[2] - b[0]);
        var iH  = Math.abs(b[1] - b[3]);

        var tx, ty, sc;
        var zb = zoneBounds(zoneId, tL, tR, tT, tBo);

        if (zb === null) {
            // "keep" — proportional position, uniform scale
            var normX = (icx - sL) / sW;
            var normY = (icy - sBo) / sH;
            tx = tL  + normX * tW;
            ty = tBo + normY * tH;
            sc = defaultSc;
        } else {
            // Zone — centre in zone, scale to fit with padding
            var PAD = 0.07;
            var zW  = (zb[2] - zb[0]) * (1 - 2 * PAD);
            var zH  = (zb[1] - zb[3]) * (1 - 2 * PAD);
            tx = (zb[0] + zb[2]) / 2;
            ty = (zb[1] + zb[3]) / 2;
            var zsx = zW / iW,  zsy = zH / iH;
            sc = (fitMode ? Math.min(zsx, zsy) : Math.max(zsx, zsy)) * 100;
        }

        var copy;
        try { copy = item.duplicate(); } catch (e) { copies.push(null); continue; }

        try { copy.resize(sc, sc, false, true, true, true, sc); } catch (e) {}

        var nb  = copy.geometricBounds;
        var ccx = (nb[0] + nb[2]) / 2;
        var ccy = (nb[1] + nb[3]) / 2;
        copy.translate(tx - ccx, ty - ccy);

        copies.push(copy);
    }

    // Restore z-order: bring from back to front so frontmost item ends on top
    for (var j = copies.length - 1; j >= 0; j--) {
        if (copies[j] !== null) {
            try { copies[j].zOrder(ZOrderMethod.BRINGTOFRONT); } catch (e) {}
        }
    }

    doc.artboards.setActiveArtboardIndex(tgtIdx);
    return true;
}

// =============================================================================
//  ZONE BOUNDS  (Illustrator coords: tT > tBo)
// =============================================================================

function zoneBounds(zoneId, tL, tR, tT, tBo) {
    var midX = (tL + tR)  / 2;
    var midY = (tT + tBo) / 2;
    var w    = tR - tL;
    switch (zoneId) {
        case "full":   return [tL,         tT,  tR,           tBo ];
        case "left":   return [tL,         tT,  midX,         tBo ];
        case "right":  return [midX,       tT,  tR,           tBo ];
        case "top":    return [tL,         tT,  tR,           midY];
        case "bottom": return [tL,         midY,tR,           tBo ];
        case "left3":  return [tL,         tT,  tL + w/3,     tBo ];
        case "mid3":   return [tL + w/3,   tT,  tL + 2*w/3,   tBo ];
        case "right3": return [tL + 2*w/3, tT,  tR,           tBo ];
        default:       return null;  // "keep"
    }
}

// =============================================================================
//  HELPERS
// =============================================================================

// Top-level visible unlocked items whose centre is inside the artboard.
// Ordered front → back (pageItems index 0 = frontmost).
function collectItems(doc, L, R, T, Bo) {
    var out = [];
    for (var i = 0; i < doc.pageItems.length; i++) {
        var it = doc.pageItems[i];
        if (it.locked || it.hidden) continue;
        if (!it.parent || it.parent.typename !== "Layer") continue;
        var b  = it.geometricBounds;
        var cx = (b[0] + b[2]) / 2;
        var cy = (b[1] + b[3]) / 2;
        if (cx >= L && cx <= R && cy >= Bo && cy <= T) out.push(it);
    }
    return out;
}

function artboardLabels(doc) {
    var labels = [];
    for (var i = 0; i < doc.artboards.length; i++) {
        var r  = doc.artboards[i].artboardRect;
        var pw = Math.round(Math.abs(r[2] - r[0]));
        var ph = Math.round(Math.abs(r[1] - r[3]));
        labels.push(doc.artboards[i].name + "  (" + pw + " \xd7 " + ph + ")");
    }
    return labels;
}

function buildTargetMap(doc, excludeIdx) {
    var labels = [], indices = [];
    for (var i = 0; i < doc.artboards.length; i++) {
        if (i === excludeIdx) continue;
        var r  = doc.artboards[i].artboardRect;
        var pw = Math.round(Math.abs(r[2] - r[0]));
        var ph = Math.round(Math.abs(r[1] - r[3]));
        labels.push(doc.artboards[i].name + "  (" + pw + " \xd7 " + ph + ")");
        indices.push(i);
    }
    return { labels: labels, indices: indices };
}

// =============================================================================

main();

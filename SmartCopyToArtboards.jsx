// SmartCopyToArtboards.jsx — Intelligently copy objects across artboards

#target illustrator

(function () {

  // --- GEOMETRY HELPERS ---

  function getItemBounds(item) {
    var b = item.visibleBounds; // [left, top, right, bottom]
    return { left: b[0], top: b[1], right: b[2], bottom: b[3],
             width: b[2] - b[0], height: b[1] - b[3] };
  }

  function getRectCenter(rect) {
    return {
      x: (rect[0] + rect[2]) / 2,
      y: (rect[1] + rect[3]) / 2
    };
  }

  function getArtboardRect(ab) {
    var r = ab.artboardRect;
    return { left: r[0], top: r[1], right: r[2], bottom: r[3],
             width: r[2] - r[0], height: r[1] - r[3] };
  }

  // Detect which artboard the item lives on (most overlap)
  function findSourceArtboard(doc, itemBounds) {
    var best = null, bestArea = -1;
    for (var i = 0; i < doc.artboards.length; i++) {
      var ab = getArtboardRect(doc.artboards[i]);
      var ox = Math.max(0, Math.min(itemBounds.right, ab.right) - Math.max(itemBounds.left, ab.left));
      var oy = Math.max(0, Math.min(itemBounds.top, ab.top) - Math.max(itemBounds.bottom, ab.bottom));
      var area = ox * oy;
      if (area > bestArea) { bestArea = area; best = i; }
    }
    return best;
  }

  // Analyse where the item sits relative to source artboard (0..1 normalised)
  function analysePosition(itemBounds, srcAB) {
    var relCX = (itemBounds.left + itemBounds.width / 2 - srcAB.left) / srcAB.width;
    var relCY = (itemBounds.top  - itemBounds.height / 2 - srcAB.bottom) / (srcAB.top - srcAB.bottom);

    // Margins from each edge (in points)
    var marginLeft   = itemBounds.left   - srcAB.left;
    var marginRight  = srcAB.right  - itemBounds.right;
    var marginTop    = srcAB.top    - itemBounds.top;
    var marginBottom = itemBounds.bottom - srcAB.bottom;

    // Classify horizontal anchor
    var hAnchor; // "left" | "center" | "right"
    if (relCX < 0.35)       hAnchor = "left";
    else if (relCX > 0.65)  hAnchor = "right";
    else                    hAnchor = "center";

    // Classify vertical anchor
    var vAnchor; // "top" | "center" | "bottom"
    if (relCY < 0.35)       vAnchor = "top";
    else if (relCY > 0.65)  vAnchor = "bottom";
    else                    vAnchor = "center";

    return {
      relCX: relCX, relCY: relCY,
      marginLeft: marginLeft, marginRight: marginRight,
      marginTop: marginTop, marginBottom: marginBottom,
      hAnchor: hAnchor, vAnchor: vAnchor,
      srcWidth: itemBounds.width, srcHeight: itemBounds.height,
      srcABWidth: srcAB.width, srcABHeight: srcAB.height
    };
  }

  // Area-preservation scale: sqrt of area ratio keeps visual weight consistent
  function areaPreserveScale(srcW, srcH, dstABW, dstABH, srcABW, srcABH) {
    var srcArea = srcABW * srcABH;
    var dstArea = dstABW * dstABH;
    return Math.sqrt(dstArea / srcArea);
  }

  // Place a copy on the target artboard using smart positioning
  function placeItemOnArtboard(copy, pos, dstAB, mode) {
    var newW, newH, newCX, newCY;

    if (mode === "fit") {
      // Scale to fill artboard
      var scaleX = dstAB.width  / pos.srcWidth;
      var scaleY = dstAB.height / pos.srcHeight;
      var scale  = Math.min(scaleX, scaleY);
      newW  = pos.srcWidth  * scale;
      newH  = pos.srcHeight * scale;
      newCX = dstAB.left + dstAB.width  / 2;
      newCY = dstAB.top  - dstAB.height / 2;
    } else {
      // Smart relative mode
      var areaScale = areaPreserveScale(
        pos.srcWidth, pos.srcHeight,
        dstAB.width, dstAB.height,
        pos.srcABWidth, pos.srcABHeight
      );
      newW = pos.srcWidth  * areaScale;
      newH = pos.srcHeight * areaScale;

      // Horizontal position
      if (pos.hAnchor === "left") {
        var scaledMarginL = pos.marginLeft * (dstAB.width / pos.srcABWidth);
        newCX = dstAB.left + scaledMarginL + newW / 2;
      } else if (pos.hAnchor === "right") {
        var scaledMarginR = pos.marginRight * (dstAB.width / pos.srcABWidth);
        newCX = dstAB.right - scaledMarginR - newW / 2;
      } else {
        newCX = dstAB.left + dstAB.width / 2;
      }

      // Vertical position
      if (pos.vAnchor === "top") {
        var scaledMarginT = pos.marginTop * (dstAB.height / pos.srcABHeight);
        newCY = dstAB.top - scaledMarginT - newH / 2;
      } else if (pos.vAnchor === "bottom") {
        var scaledMarginB = pos.marginBottom * (dstAB.height / pos.srcABHeight);
        newCY = dstAB.bottom + scaledMarginB + newH / 2;
      } else {
        newCY = dstAB.top - dstAB.height / 2;
      }
    }

    // Apply scale relative to current size
    var currentBounds = getItemBounds(copy);
    var scaleFactorW = (newW / currentBounds.width)  * 100;
    var scaleFactorH = (newH / currentBounds.height) * 100;
    copy.resize(scaleFactorW, scaleFactorH, true, true, true, true, 1, Transformation.CENTER);

    // Move to target position
    var afterBounds = getItemBounds(copy);
    var currentCX = afterBounds.left + afterBounds.width  / 2;
    var currentCY = afterBounds.top  - afterBounds.height / 2;
    copy.translate(newCX - currentCX, newCY - currentCY);
  }

  // --- MAIN ---
  var doc = app.activeDocument;

  if (doc.selection.length === 0) {
    alert("Please select at least one object first.");
    return;
  }

  var selection = doc.selection;
  var itemBounds = getItemBounds(selection[0]);

  // Handle multi-selection bounding box
  if (selection.length > 1) {
    var minL = Infinity, maxR = -Infinity, maxT = -Infinity, minB = Infinity;
    for (var s = 0; s < selection.length; s++) {
      var sb = getItemBounds(selection[s]);
      if (sb.left   < minL) minL = sb.left;
      if (sb.right  > maxR) maxR = sb.right;
      if (sb.top    > maxT) maxT = sb.top;
      if (sb.bottom < minB) minB = sb.bottom;
    }
    itemBounds = { left: minL, top: maxT, right: maxR, bottom: minB,
                   width: maxR - minL, height: maxT - minB };
  }

  var srcABIndex = findSourceArtboard(doc, itemBounds);
  if (srcABIndex === null) {
    alert("Could not detect which artboard your object is on.\nMake sure your object is placed on an artboard.");
    return;
  }

  var srcAB = getArtboardRect(doc.artboards[srcABIndex]);
  var pos = analysePosition(itemBounds, srcAB);

  // --- DIALOG ---
  var dlg = new Window("dialog", "Smart Copy to Artboards", undefined, { closeButton: true });
  dlg.orientation = "column";
  dlg.alignChildren = ["fill", "top"];
  dlg.spacing = 10;
  dlg.margins = 16;

  // Source info
  dlg.add("statictext", undefined,
    "Source: " + doc.artboards[srcABIndex].name +
    "  |  Position: " + pos.hAnchor + "-" + pos.vAnchor);

  // Scaling mode
  var modePanel = dlg.add("panel", undefined, "Scaling Mode");
  modePanel.orientation = "column";
  modePanel.alignChildren = ["left", "top"];
  modePanel.margins = 10;
  var radioSmart = modePanel.add("radiobutton", undefined, "Maintain Relative Size & Position (Smart)");
  var radioFit   = modePanel.add("radiobutton", undefined, "Scale to Fit Artboard (full-bleed)");
  radioSmart.value = true;

  // Destination
  var destPanel = dlg.add("panel", undefined, "Destination Artboards");
  destPanel.orientation = "column";
  destPanel.alignChildren = ["left", "top"];
  destPanel.margins = 10;
  var radioAll  = destPanel.add("radiobutton", undefined, "Copy to all other artboards");
  var radioSel  = destPanel.add("radiobutton", undefined, "Select from list:");
  radioAll.value = true;

  // Artboard list
  var abListBox = destPanel.add("listbox", [0, 0, 300, 120], [], { multiselect: true });
  for (var i = 0; i < doc.artboards.length; i++) {
    if (i !== srcABIndex) {
      var item = abListBox.add("item", doc.artboards[i].name);
      item.abIndex = i;
    }
  }
  abListBox.enabled = false;

  radioSel.onClick = function () { abListBox.enabled = true; };
  radioAll.onClick = function () { abListBox.enabled = false; };

  // Buttons
  var btnGroup = dlg.add("group");
  btnGroup.alignment = "right";
  btnGroup.add("button", undefined, "Cancel", { name: "cancel" });
  var okBtn = btnGroup.add("button", undefined, "Copy", { name: "ok" });

  okBtn.onClick = function () {
    var mode = radioFit.value ? "fit" : "smart";

    // Which artboards?
    var targets = [];
    if (radioAll.value) {
      for (var j = 0; j < doc.artboards.length; j++) {
        if (j !== srcABIndex) targets.push(j);
      }
    } else {
      var sel = abListBox.selection;
      if (!sel || sel.length === 0) {
        alert("Please select at least one artboard from the list.");
        return;
      }
      for (var k = 0; k < sel.length; k++) {
        targets.push(sel[k].abIndex);
      }
    }

    if (targets.length === 0) {
      alert("No target artboards found.");
      return;
    }

    dlg.close();

    // --- Execute with single undo ---
    app.undoGroup("Smart Copy to Artboards", function () {
      for (var t = 0; t < targets.length; t++) {
        var dstAB = getArtboardRect(doc.artboards[targets[t]]);

        // Duplicate selection
        var copies = [];
        for (var s2 = 0; s2 < selection.length; s2++) {
          var copy = selection[s2].duplicate();
          copies.push(copy);
        }

        // If multiple items, group them temporarily for positioning
        var workItem;
        if (copies.length > 1) {
          workItem = doc.groupItems.add();
          for (var c = copies.length - 1; c >= 0; c--) {
            copies[c].move(workItem, ElementPlacement.PLACEATBEGINNING);
          }
        } else {
          workItem = copies[0];
        }

        placeItemOnArtboard(workItem, pos, dstAB, mode);

        // Ungroup if we grouped
        if (copies.length > 1) {
          workItem.ungroup();
        }
      }
    });

    alert("Done! Copied to " + targets.length + " artboard(s).\nUndo with Cmd+Z to reverse.");
  };

  dlg.show();

})();

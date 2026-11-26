/*
 * Clippy browser-side inspector and extraction engine.
 * Injected into the embedded Chromium document. It owns the hover overlay,
 * selection set, DOM serialisation and CSS/asset discovery. The host only
 * receives JSON; no extracted markup is executed by Clippy.
 */
(function () {
  'use strict';

  var VERSION = 22;
  if (window.__clippy && window.__clippy.version === VERSION) return;

  var OVERLAY_ID = '__clippy_overlay__';
  var MAX_ELEMENTS = 3000;
  var MAX_TEXT = 6000;

  var COMPUTED_PROPS = [
    'display', 'position', 'box-sizing', 'float', 'clear', 'visibility', 'opacity', 'z-index',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'aspect-ratio',
    'top', 'right', 'bottom', 'left', 'inset',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'background-color', 'background-image', 'background-size', 'background-position',
    'background-repeat', 'background-clip', 'background-origin', 'background-attachment',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
    'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform',
    'text-decoration-line', 'text-decoration-color', 'text-indent', 'text-overflow',
    'white-space', 'word-break', 'overflow-wrap', 'vertical-align', 'direction', 'writing-mode',
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'align-self',
    'flex-grow', 'flex-shrink', 'flex-basis', 'gap', 'row-gap', 'column-gap', 'order',
    'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow',
    'grid-auto-columns', 'grid-auto-rows', 'grid-column-start', 'grid-column-end',
    'grid-row-start', 'grid-row-end', 'justify-items', 'justify-self',
    'overflow-x', 'overflow-y', 'transform', 'transform-origin', 'box-shadow',
    'outline-width', 'outline-style', 'outline-color', 'outline-offset',
    'object-fit', 'object-position', 'clip-path', 'mask-image', 'filter', 'mix-blend-mode',
    'list-style-type', 'list-style-position', 'list-style-image',
    'border-collapse', 'border-spacing', 'table-layout', 'cursor', 'pointer-events',
    'scrollbar-width', 'scrollbar-color', 'caret-color', 'accent-color', '-webkit-line-clamp'
  ];

  var PSEUDO_STYLE_PROPS = [
    'content', 'display', 'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
    'letter-spacing', 'text-align', 'text-transform', 'transform', 'transform-origin',
    'opacity', 'z-index', 'box-shadow', 'clip-path', 'mask-image', 'filter'
  ];

  var INHERITED_PROPS = {
    'color': 1, 'font': 1, 'font-family': 1, 'font-size': 1, 'font-weight': 1, 'font-style': 1,
    'font-stretch': 1, 'font-variant': 1, 'line-height': 1, 'letter-spacing': 1, 'word-spacing': 1,
    'text-align': 1, 'text-transform': 1, 'text-indent': 1, 'white-space': 1, 'direction': 1,
    'writing-mode': 1, 'visibility': 1, 'cursor': 1, 'list-style': 1, 'list-style-type': 1,
    'list-style-position': 1, 'list-style-image': 1, 'border-collapse': 1, 'border-spacing': 1,
    'quotes': 1, 'accent-color': 1, 'caret-color': 1, '-webkit-text-fill-color': 1,
    'text-decoration-color': 1, 'text-emphasis': 1, 'text-orientation': 1,
    'background': 1, 'background-color': 1, 'background-image': 1
  };

  var SAFE_ANCESTOR_PROPS = Object.assign({}, INHERITED_PROPS);

  var CONTEXT_PROPS = {
    'display': 1, 'position': 1, 'float': 1, 'clear': 1, 'box-sizing': 1,
    'width': 1, 'max-width': 1, 'min-width': 1, 'height': 1, 'max-height': 1, 'min-height': 1,
    'margin': 1, 'margin-top': 1, 'margin-right': 1, 'margin-bottom': 1, 'margin-left': 1,
    'padding': 1, 'padding-top': 1, 'padding-right': 1, 'padding-bottom': 1, 'padding-left': 1,
    'border': 1, 'border-width': 1, 'border-style': 1, 'border-color': 1,
    'border-top': 1, 'border-right': 1, 'border-bottom': 1, 'border-left': 1,
    'border-radius': 1, 'border-top-left-radius': 1, 'border-top-right-radius': 1,
    'border-bottom-right-radius': 1, 'border-bottom-left-radius': 1,
    'background': 1, 'background-color': 1, 'background-image': 1, 'background-size': 1,
    'background-position': 1, 'background-repeat': 1, 'box-shadow': 1,
    'gap': 1, 'row-gap': 1, 'column-gap': 1,
    'grid': 1, 'grid-template': 1, 'grid-template-columns': 1, 'grid-template-rows': 1,
    'grid-template-areas': 1, 'grid-auto-flow': 1, 'grid-auto-columns': 1, 'grid-auto-rows': 1,
    'grid-column': 1, 'grid-column-start': 1, 'grid-column-end': 1,
    'grid-row': 1, 'grid-row-start': 1, 'grid-row-end': 1, 'grid-area': 1,
    'flex': 1, 'flex-direction': 1, 'flex-wrap': 1, 'flex-flow': 1,
    'flex-grow': 1, 'flex-shrink': 1, 'flex-basis': 1,
    'align-items': 1, 'align-content': 1, 'align-self': 1,
    'justify-items': 1, 'justify-content': 1, 'justify-self': 1,
    'order': 1, 'overflow': 1, 'overflow-x': 1, 'overflow-y': 1,
    'top': 1, 'right': 1, 'bottom': 1, 'left': 1, 'inset': 1, 'z-index': 1, 'container-type': 1, 'container-name': 1,
    'max-width': 1, 'min-width': 1, 'max-height': 1, 'min-height': 1
  };
  var SYSTEM_FONTS = {
    'serif': 1, 'sans-serif': 1, 'monospace': 1, 'cursive': 1, 'fantasy': 1, 'system-ui': 1,
    'ui-serif': 1, 'ui-sans-serif': 1, 'ui-monospace': 1, 'ui-rounded': 1, 'emoji': 1, 'math': 1,
    'segoe ui': 1, 'arial': 1, 'helvetica': 1, 'helvetica neue': 1, 'times new roman': 1,
    'georgia': 1, 'verdana': 1, 'tahoma': 1, 'trebuchet ms': 1, 'courier new': 1,
    'consolas': 1, 'calibri': 1, 'cambria': 1, 'candara': 1, 'corbel': 1, 'franklin gothic medium': 1,
    'gill sans': 1, 'lucida grande': 1, 'lucida sans unicode': 1, 'palatino linotype': 1,
    'book antiqua': 1, 'garamond': 1, 'ms sans serif': 1, 'microsoft sans serif': 1,
    'blinkmacsystemfont': 1, '-apple-system': 1, 'roboto': 1, 'noto sans': 1, 'noto serif': 1
  };

  var DYNAMIC_PSEUDO = /:(hover|focus-visible|focus-within|focus|active|visited|link|any-link|target|checked|disabled|enabled|required|optional|placeholder-shown|read-only|read-write|indeterminate|invalid|valid|default|autofill)\b(\([^)]*\))?/gi;

  var state = {
    version: VERSION,
    active: false,
    selections: [],
    nextId: 1,
    zoom: 1,
    hoverElement: null,
    hoverRect: null,
    pointer: { x: 0, y: 0 },
    overlay: null,
    hoverBoxes: null,
    hoverLabel: null,
    selectionLayer: null,
    selectionViews: [],
    raf: 0,
    cursorBefore: null,
    lastNotify: 0
  };

  // ---------------------------------------------------------------- helpers

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeCss(value) {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/([^\w-])/g, '\\$1');
  }

  function isOverlay(el) {
    return el && (el.id === OVERLAY_ID || (el.closest && el.closest('#' + OVERLAY_ID)));
  }

  function isIgnoredTag(el) {
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' ||
      tag === 'noscript' || tag === 'template' || tag === 'head';
  }

  function deepElementFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    var guard = 0;
    while (el && el.shadowRoot && guard++ < 12) {
      var inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  function composedTarget(event) {
    if (event.composedPath && event.composedPath().length) {
      var path = event.composedPath();
      for (var i = 0; i < path.length; i++) {
        if (path[i] && path[i].nodeType === 1 && !isOverlay(path[i])) return path[i];
      }
    }
    return deepElementFromPoint(event.clientX, event.clientY);
  }

  function parentElementDeep(el) {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    var root = el.getRootNode && el.getRootNode();
    if (root && root.host) return root.host;
    return null;
  }

  function elementIndex(el) {
    var parent = el.parentElement;
    if (!parent) return 0;
    var index = 0;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i] === el) return index;
      if (!isOverlay(parent.children[i])) index++;
    }
    return index;
  }

  function pathParts(el) {
    var parts = [];
    var current = el;
    var guard = 0;
    while (current && current.nodeType === 1 && guard++ < 60) {
      var classes = [];
      if (current.classList) {
        for (var i = 0; i < current.classList.length && classes.length < 4; i++) {
          classes.push(current.classList[i]);
        }
      }
      var root = current.getRootNode && current.getRootNode();
      parts.push({
        tag: (current.tagName || '').toLowerCase(),
        id: current.id || null,
        classes: classes,
        index: elementIndex(current),
        shadow: !!(root && root.host)
      });
      if (root && root.host) {
        current = root.host;
      } else {
        current = current.parentElement;
      }
    }
    parts.reverse();
    return parts;
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) {
      var byId = '#' + escapeCss(el.id);
      try {
        if (document.querySelectorAll(byId).length === 1) return byId;
      } catch (e) { }
    }
    var parts = [];
    var current = el;
    var guard = 0;
    while (current && current.nodeType === 1 && guard++ < 30) {
      var tag = (current.tagName || '').toLowerCase();
      if (current.id) {
        parts.unshift('#' + escapeCss(current.id));
        break;
      }
      var index = elementIndex(current) + 1;
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      var root = current.getRootNode && current.getRootNode();
      if (root && root.host) {
        current = root.host;
      } else {
        current = current.parentElement;
      }
      if (tag === 'html') break;
    }
    return parts.join(' > ');
  }

  function domLabel(el) {
    if (!el) return '';
    var tag = (el.tagName || '').toLowerCase();
    var text = tag;
    if (el.id) text += '#' + el.id;
    if (el.classList) {
      for (var i = 0; i < el.classList.length && i < 3; i++) text += '.' + el.classList[i];
    }
    return text;
  }

  function shortDomPath(el) {
    var parts = [];
    var current = el;
    var guard = 0;
    while (current && current.nodeType === 1 && guard++ < 8) {
      var text = (current.tagName || '').toLowerCase();
      if (current.id) text += '#' + current.id;
      else if (current.classList && current.classList.length) text += '.' + current.classList[0];
      parts.unshift(text);
      var root = current.getRootNode && current.getRootNode();
      current = root && root.host ? root.host : current.parentElement;
    }
    return parts.join(' > ');
  }

  function classListOf(el) {
    var list = [];
    if (el && el.classList) {
      for (var i = 0; i < el.classList.length; i++) list.push(el.classList[i]);
    }
    return list;
  }

  function firstText(el) {
    if (!el) return '';
    var text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 120 ? text.slice(0, 117) + '…' : text;
  }

  function selectionSnapshot(selection) {
    var el = selection.element;
    var rect = el.getBoundingClientRect();
    return {
      id: selection.id,
      tag: (el.tagName || '').toLowerCase(),
      domId: el.id || null,
      classes: classListOf(el),
      label: domLabel(el),
      selector: selection.selector || '',
      text: firstText(el),
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
      x: Math.round(rect.left * 10) / 10,
      y: Math.round(rect.top * 10) / 10,
      path: pathParts(el),
      inShadow: !!(el.getRootNode && el.getRootNode().host)
    };
  }

  function pageInfo() {
    return {
      url: location.href,
      title: document.title || '',
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      inspectorActive: state.active,
      ready: true,
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
      selections: state.selections.map(selectionSnapshot)
    };
  }

  // ---------------------------------------------------------------- overlay

  function ensureOverlay() {
    if (state.overlay && document.documentElement.contains(state.overlay)) return;

    var old = document.getElementById(OVERLAY_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var host = document.createElement('div');
    host.id = OVERLAY_ID;
    host.setAttribute('data-clippy-ui', '1');
    host.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'width:100vw', 'height:100vh',
      'margin:0', 'padding:0', 'border:0', 'pointer-events:none',
      'z-index:2147483647', 'overflow:hidden', 'contain:strict', 'isolation:isolate',
      'background:transparent', 'display:block', 'visibility:visible', 'opacity:1'
    ].join(';') + ';';

    var layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    host.appendChild(layer);

    var boxes = {};
    ['margin', 'border', 'padding', 'content'].forEach(function (name) {
      var box = document.createElement('div');
      box.setAttribute('data-clippy-box', name);
      box.style.cssText = 'position:absolute;box-sizing:border-box;pointer-events:none;display:none;';
      layer.appendChild(box);
      boxes[name] = box;
    });

    var label = document.createElement('div');
    label.setAttribute('data-clippy-label', 'hover');
    label.style.cssText = [
      'position:absolute', 'display:none', 'pointer-events:none',
      'padding:4px 7px', 'border-radius:4px', 'background:#111827', 'color:#f8fafc',
      'border:1px solid #475569', 'font:11px/1.35 Consolas, "Courier New", monospace',
      'white-space:nowrap', 'max-width:520px', 'overflow:hidden', 'text-overflow:ellipsis',
      'box-shadow:0 4px 14px rgba(0,0,0,.4)', 'z-index:3'
    ].join(';') + ';';
    layer.appendChild(label);

    var selectionLayer = document.createElement('div');
    selectionLayer.setAttribute('data-clippy-selections', '1');
    selectionLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    layer.appendChild(selectionLayer);

    document.documentElement.appendChild(host);

    state.overlay = host;
    state.hoverBoxes = boxes;
    state.hoverLabel = label;
    state.selectionLayer = selectionLayer;
    state.selectionViews = [];
  }

  function hideHover() {
    if (!state.hoverBoxes) return;
    Object.keys(state.hoverBoxes).forEach(function (key) {
      state.hoverBoxes[key].style.display = 'none';
    });
    if (state.hoverLabel) state.hoverLabel.style.display = 'none';
  }

  function setBox(box, rect, background, borderColor) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.style.background = background;
    box.style.border = '1px solid ' + borderColor;
  }

  function boxRects(el) {
    var rect = el.getBoundingClientRect();
    var style = getComputedStyle(el);
    function px(name) { return parseFloat(style.getPropertyValue(name)) || 0; }
    var bt = px('border-top-width'), br = px('border-right-width');
    var bb = px('border-bottom-width'), bl = px('border-left-width');
    var pt = px('padding-top'), pr = px('padding-right');
    var pb = px('padding-bottom'), pl = px('padding-left');
    var mt = px('margin-top'), mr = px('margin-right');
    var mb = px('margin-bottom'), ml = px('margin-left');

    return {
      margin: { left: rect.left - ml, top: rect.top - mt, width: rect.width + ml + mr, height: rect.height + mt + mb },
      border: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      padding: { left: rect.left + bl, top: rect.top + bt, width: rect.width - bl - br, height: rect.height - bt - bb },
      content: { left: rect.left + bl + pl, top: rect.top + bt + pt, width: rect.width - bl - br - pl - pr, height: rect.height - bt - bb - pt - pb },
      style: style
    };
  }

  function drawHover() {
    var el = state.hoverElement;
    if (!state.active || !el || !el.isConnected) {
      hideHover();
      return;
    }

    var rects = el.getClientRects ? Array.prototype.slice.call(el.getClientRects()) : [];
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      hideHover();
      return;
    }

    var model = boxRects(el);
    var inline = (model.style.display || '').indexOf('inline') === 0 && rects.length > 1;

    if (inline) {
      // Multi-line inline elements do not have a single box model. Show the
      // border box for each line while keeping the tooltip.
      var border = state.hoverBoxes.border;
      border.style.display = 'block';
      border.style.left = rects[0].left + 'px';
      border.style.top = rects[0].top + 'px';
      border.style.width = rect.width + 'px';
      border.style.height = rect.height + 'px';
      border.style.background = 'rgba(111, 168, 220, 0.22)';
      border.style.border = '1px solid rgba(111, 168, 220, 0.95)';
      state.hoverBoxes.margin.style.display = 'none';
      state.hoverBoxes.padding.style.display = 'none';
      state.hoverBoxes.content.style.display = 'none';
    } else {
      setBox(state.hoverBoxes.margin, model.margin, 'rgba(246, 178, 107, 0.28)', 'rgba(246, 178, 107, 0.85)');
      setBox(state.hoverBoxes.border, model.border, 'rgba(255, 229, 153, 0.34)', 'rgba(255, 229, 153, 0.95)');
      setBox(state.hoverBoxes.padding, model.padding, 'rgba(147, 196, 125, 0.32)', 'rgba(147, 196, 125, 0.95)');
      setBox(state.hoverBoxes.content, model.content, 'rgba(111, 168, 220, 0.34)', 'rgba(111, 168, 220, 0.98)');
    }

    var label = state.hoverLabel;
    label.style.display = 'block';
    var text = domLabel(el) + '  ' + Math.round(rect.width) + ' × ' + Math.round(rect.height) +
      '   ' + shortDomPath(el);
    label.textContent = text;
    var labelWidth = Math.min(520, Math.max(90, text.length * 6.2));
    var left = clamp(rect.left, 6, window.innerWidth - labelWidth - 8);
    var top = rect.top - 28;
    if (top < 4) top = Math.min(window.innerHeight - 26, rect.bottom + 6);
    label.style.left = left + 'px';
    label.style.top = top + 'px';
    label.style.maxWidth = labelWidth + 'px';
  }

  function selectionViewFor(index) {
    while (state.selectionViews.length <= index) {
      var box = document.createElement('div');
      box.style.cssText = [
        'position:absolute', 'box-sizing:border-box', 'pointer-events:none',
        'background:rgba(45, 212, 191, 0.10)', 'border:2px solid rgba(45, 212, 191, 0.92)',
        'border-radius:2px', 'display:none'
      ].join(';') + ';';
      var tag = document.createElement('div');
      tag.style.cssText = [
        'position:absolute', 'left:-2px', 'top:-20px', 'padding:2px 6px', 'border-radius:3px',
        'background:#0f766e', 'color:#ecfeff', 'font:10px/1.3 Consolas, monospace',
        'white-space:nowrap', 'pointer-events:none'
      ].join(';') + ';';
      state.selectionLayer.appendChild(box);
      state.selectionLayer.appendChild(tag);
      state.selectionViews.push({ box: box, tag: tag });
    }
    return state.selectionViews[index];
  }

  function drawSelections() {
    ensureOverlay();
    for (var i = 0; i < state.selections.length; i++) {
      var view = selectionViewFor(i);
      var selection = state.selections[i];
      var el = selection.element;
      if (!el || !el.isConnected) {
        view.box.style.display = 'none';
        view.tag.style.display = 'none';
        continue;
      }
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        view.box.style.display = 'none';
        view.tag.style.display = 'none';
        continue;
      }
      view.box.style.display = 'block';
      view.box.style.left = rect.left + 'px';
      view.box.style.top = rect.top + 'px';
      view.box.style.width = rect.width + 'px';
      view.box.style.height = rect.height + 'px';
      view.tag.style.display = 'block';
      view.tag.textContent = (i + 1) + '  ' + selection.name;
      view.tag.style.left = rect.left + 'px';
      view.tag.style.top = Math.max(2, rect.top - 20) + 'px';
    }
    for (var j = state.selections.length; j < state.selectionViews.length; j++) {
      state.selectionViews[j].box.style.display = 'none';
      state.selectionViews[j].tag.style.display = 'none';
    }
  }

  function loop() {
    state.raf = requestAnimationFrame(loop);
    if (!state.active && state.selections.length === 0) {
      if (state.overlay) state.overlay.style.display = 'none';
      return;
    }
    if (state.overlay) state.overlay.style.display = 'block';
    if (state.active) drawHover();
    drawSelections();
  }

  // ------------------------------------------------------------- interaction

  function selectionByElement(el) {
    for (var i = 0; i < state.selections.length; i++) {
      if (state.selections[i].element === el) return state.selections[i];
    }
    return null;
  }

  function addSelection(el) {
    if (!el || el.nodeType !== 1 || isOverlay(el) || isIgnoredTag(el)) return null;
    var existing = selectionByElement(el);
    if (existing) return existing;
    var selection = {
      id: 'c' + (state.nextId++),
      element: el,
      selector: cssPath(el),
      name: domLabel(el)
    };
    state.selections.push(selection);
    drawSelections();
    notify('selection-added', selection.id);
    return selection;
  }

  function removeSelection(id) {
    for (var i = 0; i < state.selections.length; i++) {
      if (state.selections[i].id === id) {
        state.selections.splice(i, 1);
        drawSelections();
        notify('selection-removed', id);
        return true;
      }
    }
    return false;
  }

  function clearSelections() {
    state.selections = [];
    drawSelections();
    notify('selections-cleared', '');
  }

  function setActive(active) {
    state.active = !!active;
    try { window.__clippyInspectorActive = state.active; } catch (e) { }
    ensureOverlay();
    if (!state.active) {
      state.hoverElement = null;
      hideHover();
    }
    if (state.overlay) state.overlay.style.display = 'block';
    notify('inspector', state.active ? 'on' : 'off');
  }

  function setZoom(value) {
    state.zoom = clamp(parseFloat(value) || 1, 0.25, 2.5);
    document.documentElement.style.zoom = state.zoom === 1 ? '' : String(state.zoom);
  }

  function notify(type, detail) {
    try {
      if (window.donkeh && typeof window.donkeh.send === 'function') {
        window.donkeh.send('clippy', JSON.stringify({ type: type, detail: detail || '', at: Date.now() }));
      }
    } catch (e) { }
  }

  function onMove(event) {
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    if (!state.active) return;
    var el = composedTarget(event);
    if (event.altKey) {
      var parent = parentElementDeep(el);
      if (parent && parent.nodeType === 1) el = parent;
    }
    if (el && isOverlay(el)) el = null;
    state.hoverElement = el;
  }

  function suppress(event) {
    if (!state.active) return;
    if (event.type === 'keydown' && event.key === 'Escape') {
      setActive(false);
      return;
    }
    if (event.type === 'wheel' || event.type === 'scroll') return;
    if (event.type === 'mousemove' || event.type === 'pointermove') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
  }

  function onClick(event) {
    if (!state.active) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();

    var el = composedTarget(event);
    if (!el || isOverlay(el)) return;
    if (event.altKey) {
      var parent = parentElementDeep(el);
      if (parent && parent.nodeType === 1) el = parent;
    }

    if (event.ctrlKey || event.metaKey) {
      var current = selectionByElement(el);
      if (current) removeSelection(current.id);
      return;
    }

    var selection = addSelection(el);
    if (selection) {
      state.hoverElement = el;
      drawHover();
    }
  }

  function onKeyDown(event) {
    if (!state.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setActive(false);
    }
  }

  function installEvents() {
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu', 'submit'].forEach(function (type) {
      document.addEventListener(type, suppress, true);
    });
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', function () { if (state.active) drawHover(); }, true);
    window.addEventListener('resize', function () { if (state.active) drawHover(); });
    document.addEventListener('DOMContentLoaded', ensureOverlay, true);
  }

  // ------------------------------------------------------------ CSS matching

  function splitSelectorList(text) {
    var result = [];
    var current = '';
    var depth = 0;
    var quote = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quote) {
        current += ch;
        if (ch === quote && text[i - 1] !== '\\') quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  function selectorTokens(selector) {
    var tokens = [];
    var current = '';
    var depth = 0;
    var quote = '';
    for (var i = 0; i < selector.length; i++) {
      var ch = selector[i];
      if (quote) {
        current += ch;
        if (ch === quote && selector[i - 1] !== '\\') quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
      if (ch === '(' || ch === '[') { depth++; current += ch; continue; }
      if (ch === ')' || ch === ']') { depth--; current += ch; continue; }
      if (depth === 0 && (ch === '>' || ch === '+' || ch === '~')) {
        if (current.trim()) tokens.push(current.trim());
        tokens.push(ch);
        current = '';
        continue;
      }
      if (depth === 0 && /\s/.test(ch)) {
        if (current.trim()) { tokens.push(current.trim()); current = ''; }
        continue;
      }
      current += ch;
    }
    if (current.trim()) tokens.push(current.trim());
    return tokens;
  }

  function staticSelector(selector, hostSelector) {
    var text = selector;
    if (hostSelector) text = text.replace(/:host-context\([^)]*\)/gi, '').replace(/:host\b/gi, hostSelector);
    text = text.replace(/:not\(\s*:(hover|focus|focus-visible|focus-within|active|visited|link|any-link|target|checked|disabled|enabled|required|optional|placeholder-shown|read-only|read-write|indeterminate|invalid|valid|default|autofill)\s*\)/gi, '');
    text = text.replace(/::?(before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button|part|slotted)\b(\([^)]*\))?/gi, '');
    text = text.replace(DYNAMIC_PSEUDO, '');
    text = text.replace(/::?part\([^)]*\)/gi, '');
    text = text.trim();
    if (!text || text === '*' && false) return text;
    return text;
  }

  function matchesSafe(el, selector) {
    try { return el.matches(selector); } catch (e) { return false; }
  }

  function collectElements(root) {
    var list = [];
    function walk(el) {
      if (!el || el.nodeType !== 1 || isOverlay(el) || isIgnoredTag(el)) return;
      list.push(el);
      if (el.shadowRoot) {
        for (var s = 0; s < el.shadowRoot.children.length; s++) walk(el.shadowRoot.children[s]);
      }
      for (var i = 0; i < el.children.length; i++) walk(el.children[i]);
    }
    walk(root);
    return list;
  }

  function matchElements(selector, elements) {
    var result = [];
    for (var i = 0; i < elements.length; i++) {
      if (matchesSafe(elements[i], selector)) result.push(elements[i]);
    }
    return result;
  }

  function firstCompound(selector) {
    var tokens = selectorTokens(selector);
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] !== '>' && tokens[i] !== '+' && tokens[i] !== '~') return tokens[i];
    }
    return '';
  }

  function scopeHasCompound(compound, elements) {
    if (!compound) return false;
    for (var i = 0; i < elements.length; i++) {
      if (matchesSafe(elements[i], compound)) return true;
    }
    return false;
  }

  function reduceSelector(selector, targets, elements, hostSelector) {
    var tokens = selectorTokens(selector);
    if (!tokens.length) return [];
    for (var start = 0; start < tokens.length; start++) {
      if (tokens[start] === '>' || tokens[start] === '+' || tokens[start] === '~') continue;
      var suffix = tokens.slice(start).join(' ');
      suffix = suffix.replace(/^[>+~]\s*/, '');
      var stat = staticSelector(suffix, hostSelector);
      if (!stat) continue;
      var compound = firstCompound(stat);
      if (start > 0 && !scopeHasCompound(compound, elements)) continue;
      var all = true;
      for (var i = 0; i < targets.length; i++) {
        if (!matchesSafe(targets[i], stat)) { all = false; break; }
      }
      if (all) return [suffix];
    }
    return [];
  }

  function mapGlobalSelector(selector) {
    var text = selector.trim();
    if (text === ':root' || text === 'html' || text === 'body') return '.clippy-root';
    if (text === '*') return '.clippy-root, .clippy-root *';
    if (text === 'body *' || text === 'html body *') return '.clippy-root *';
    if (/^:root\b/i.test(text)) return text.replace(/^:root\b/i, '.clippy-root');
    if (/^html\s+body\b/i.test(text)) return text.replace(/^html\s+body\b/i, '.clippy-root');
    if (/^body\b/i.test(text)) return text.replace(/^body\b/i, '.clippy-root');
    if (/^html\b/i.test(text)) return text.replace(/^html\b/i, '.clippy-root');
    return null;
  }

  function splitDeclarations(text) {
    var parts = [];
    var current = '';
    var depth = 0;
    var quote = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quote) {
        current += ch;
        if (ch === quote && text[i - 1] !== '\\') quote = '';
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ';' && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  function parsedDeclarations(style, base) {
    var result = [];
    var text = (style && style.cssText) || '';
    var parts = splitDeclarations(text);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var colon = part.indexOf(':');
      if (colon <= 0) continue;
      var rawName = part.slice(0, colon).trim();
      var name = rawName.indexOf('--') === 0 ? rawName : rawName.toLowerCase();
      var value = part.slice(colon + 1).trim();
      if (!name || !value) continue;
      result.push({ name: name, value: normalizeCssValue(value, base) });
    }
    return result;
  }

  function declaredProperties(style) {
    return parsedDeclarations(style, document.baseURI).map(function (d) { return d.name; });
  }

  function normalizeCssValue(value, base) {
    if (!value) return value;
    return value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, function (match, quote, url) {
      var trimmed = (url || '').trim();
      if (!trimmed || trimmed.indexOf('data:') === 0) return match;
      try {
        return 'url("' + new URL(trimmed, base || document.baseURI).href + '")';
      } catch (e) {
        return match;
      }
    });
  }

  function cssDeclarations(style, base) {
    var decls = parsedDeclarations(style, base);
    return decls.map(function (d) { return d.name + ': ' + d.value + ';'; }).join(' ');
  }

  function urlsIn(value, base) {
    var urls = [];
    if (!value) return urls;
    value.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, function (match, quote, url) {
      var trimmed = (url || '').trim();
      if (!trimmed) return match;
      try { urls.push(new URL(trimmed, base || document.baseURI).href); } catch (e) { }
      return match;
    });
    return urls;
  }

  function assetKind(url, property) {
    var lower = (url || '').toLowerCase();
    if ((property || '').indexOf('font') >= 0) return 'font';
    if (/\.(woff2?|ttf|otf)(\?|#|$)/.test(lower)) return 'font';
    if (/\.(mp4|webm|ogg|mov)(\?|#|$)/.test(lower)) return 'video';
    if (/\.(mp3|wav|m4a)(\?|#|$)/.test(lower)) return 'audio';
    if (/\.svg(\?|#|$)/.test(lower)) return 'svg';
    return 'image';
  }

  // --------------------------------------------------------------- CSS walk

  function collectStyles(root, elements) {
    var stateCss = {
      blocks: [],
      rules: [],
      fonts: [],
      pendingFonts: [],
      assets: [],
      unreadable: new Set(),
      seenSheets: new Set(),
      matched: new Map(),
      matchedProps: new Map(),
      usedFamilies: new Set(),
      keyframes: [],
      order: 0
    };

    for (var fe = 0; fe < elements.length; fe++) {
      try {
        var ff = getComputedStyle(elements[fe]).fontFamily || '';
        splitSelectorList(ff).forEach(function (family) {
          var clean = family.replace(/["']/g, '').trim().toLowerCase();
          if (clean) stateCss.usedFamilies.add(clean);
        });
      } catch (e) { }
    }
    var subtreeSet = new Set(elements);
    var ancestors = [];
    var current = parentElementDeep(root);
    while (current && current.nodeType === 1) {
      ancestors.push(current);
      current = parentElementDeep(current);
    }

    function recordMatch(el, props) {
      stateCss.matched.set(el, (stateCss.matched.get(el) || 0) + 1);
      var set = stateCss.matchedProps.get(el);
      if (!set) { set = new Set(); stateCss.matchedProps.set(el, set); }
      for (var i = 0; i < props.length; i++) set.add(props[i]);
    }

    function addAsset(url, property, nodeIndex) {
      if (!url || /^data:/i.test(url) && url.length > 500000) return;
      if (stateCss.assets.some(function (a) { return a.url === url; })) return;
      stateCss.assets.push({
        url: url,
        kind: assetKind(url, property),
        property: property || null,
        nodeIndex: typeof nodeIndex === 'number' ? nodeIndex : null
      });
    }

    var blockKeys = new Set();
    function addBlock(wrappers, text, ruleInfo) {
      var key = wrappers.join('|') + '||' + text;
      if (!blockKeys.has(key)) {
        blockKeys.add(key);
        stateCss.blocks.push({ wrappers: wrappers, text: text });
      }
      if (ruleInfo) stateCss.rules.push(ruleInfo);
    }

    function scopeReducedSelector(selector, root, targets) {
    var text = selector.trim();
    if (!text) return [];
    if (text.indexOf('.clippy-context') === 0) return [text];
    if (text === '*') return ['.clippy-root', '.clippy-root *'];
    if (text.indexOf('.clippy-root') === 0) return [text];

    var stat = staticSelector(text, null);
    if (!stat) return [text];
    var matchesRoot = matchesSafe(root, stat);
    var matchesDescendant = false;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i] !== root) { matchesDescendant = true; break; }
    }
    if (!matchesRoot && !matchesDescendant) return [text];

    var scopedRoot = null;
    if (matchesRoot) {
      var tokens = selectorTokens(text);
      var last = -1;
      for (var t = tokens.length - 1; t >= 0; t--) {
        if (tokens[t] !== '>' && tokens[t] !== '+' && tokens[t] !== '~') { last = t; break; }
      }
      if (last >= 0) {
        var compound = tokens[last];
        var pseudoIndex = compound.indexOf(':');
        if (pseudoIndex < 0) compound += '.clippy-root';
        else compound = compound.slice(0, pseudoIndex) + '.clippy-root' + compound.slice(pseudoIndex);
        tokens[last] = compound;
        scopedRoot = tokens.join(' ');
      }
    }

    var first = firstCompound(stat);
    var firstMatchesRoot = first && matchesSafe(root, first);
    var scopedDesc = null;
    if (matchesDescendant) scopedDesc = firstMatchesRoot ? text : '.clippy-root ' + text;
    if (scopedRoot && scopedDesc && scopedRoot !== scopedDesc) return [scopedRoot, scopedDesc];
    return [scopedRoot || scopedDesc || text];
  }

  function processStyleRule(rule, wrappers, source, sheetBase, inShadow, hostSelector) {
      var selectors = splitSelectorList(rule.selectorText || '');
      if (!selectors.length) return;
      var declarations = cssDeclarations(rule.style, sheetBase);
      if (!declarations.trim()) return;
      var props = declaredProperties(rule.style);
      var keptSelectors = [];
      var affects = 0;
      var recovered = false;

      for (var s = 0; s < selectors.length; s++) {
        var original = selectors[s];
        var stat = staticSelector(original, hostSelector);
        if (!stat) continue;

        var global = mapGlobalSelector(stat);
        if (global) {
          var globalParts = splitSelectorList(global);
          for (var g = 0; g < globalParts.length; g++) keptSelectors.push(globalParts[g]);
          recordMatch(root, props);
          continue;
        }

        var targets = matchElements(stat, elements);
        if (targets.length) {
          var reduced = reduceSelector(original, targets, elements, hostSelector);
          if (!reduced.length) reduced = [stat];
          for (var r = 0; r < reduced.length; r++) {
            var scoped = scopeReducedSelector(reduced[r], root, targets);
            for (var sc = 0; sc < scoped.length; sc++) keptSelectors.push(scoped[sc]);
          }
          if (reduced.length && reduced[0] !== stat) recovered = true;
          affects += targets.length;
          for (var t = 0; t < targets.length; t++) recordMatch(targets[t], props);
        }
      }

      // Ancestor rules supplying inherited values, custom properties or the
      // page background are included against the scope root.
      if (!targetsMatch(selectors, elements)) {
        var inherited = filterInheritedDeclarations(rule.style);
        if (inherited) {
          var ancestorMatch = false;
          for (var a = 0; a < ancestors.length; a++) {
            for (var q = 0; q < selectors.length; q++) {
              var as = staticSelector(selectors[q], hostSelector);
              if (as && matchesSafe(ancestors[a], as)) { ancestorMatch = true; break; }
            }
            if (ancestorMatch) break;
          }
          if (ancestorMatch) {
            keptSelectors.push('.clippy-root');
            addBlock(wrappers, '.clippy-root { ' + inherited + ' }', null);
            collectFontsFromDeclarations(inherited);
            return;
          }
        }
      }

      if (stateCss.contextAncestors && stateCss.contextAncestors.length) {
        for (var ci = 0; ci < stateCss.contextAncestors.length; ci++) {
          var ctxTarget = stateCss.contextAncestors[ci];
          var ctxMatch = false;
          for (var q2 = 0; q2 < selectors.length; q2++) {
            var ctxStat = staticSelector(selectors[q2], null);
            if (ctxStat && matchesSafe(ctxTarget, ctxStat)) { ctxMatch = true; break; }
          }
          if (!ctxMatch) continue;
          var ctxDecl = filterContextDeclarations(rule.style, sheetBase);
          if (ctxDecl) addBlock(wrappers, '.clippy-context-' + (ci + 1) + ' { ' + ctxDecl + ' }', null);
        }
      }
      if (!keptSelectors.length) return;

      var selectorText = unique(keptSelectors).join(', ');
      var blockText = selectorText + ' { ' + declarations + ' }';
      addBlock(wrappers, blockText, {
        selector: selectorText,
        declarations: declarations,
        conditions: wrappers.slice(),
        source: source || '',
        origin: 'author',
        recovered: recovered,
        affects: affects,
        pseudo: /::?(before|after|placeholder|marker|selection)\b/i.test(selectorText)
      });

      collectFontsFromDeclarations(declarations);
      collectAssetsFromDeclarations(declarations, sheetBase, null);


    }

    function targetsMatch(selectors, elements) {
      for (var i = 0; i < selectors.length; i++) {
        var stat = staticSelector(selectors[i], null);
        if (!stat) continue;
        if (matchElements(stat, elements).length) return true;
      }
      return false;
    }

    function filterInheritedDeclarations(style) {
      var parts = [];
      var decls = parsedDeclarations(style, document.baseURI);
      for (var i = 0; i < decls.length; i++) {
        var name = decls[i].name;
        if (name.indexOf('--') === 0 || SAFE_ANCESTOR_PROPS[name]) {
          parts.push(name + ': ' + decls[i].value + ';');
        }
      }
      return parts.join(' ');
    }

    function collectFontsFromDeclarations(declarations) {
      var match = declarations.match(/font-family\s*:\s*([^;]+)/gi);
      if (!match) return;
      for (var i = 0; i < match.length; i++) {
        var value = match[i].replace(/font-family\s*:\s*/i, '');
        splitSelectorList(value).forEach(function (family) {
          var clean = family.replace(/["']/g, '').trim().toLowerCase();
          if (clean) stateCss.usedFamilies.add(clean);
        });
      }
    }

    function collectAssetsFromDeclarations(declarations, base, nodeIndex) {
      var urlMatches = declarations.match(/url\([^)]*\)/gi);
      if (!urlMatches) return;
      for (var i = 0; i < urlMatches.length; i++) {
        var urls = urlsIn(urlMatches[i], base);
        for (var u = 0; u < urls.length; u++) addAsset(urls[u], 'css', nodeIndex);
      }
    }

    function processFontFace(rule, wrappers, source, base) {
      var family = (rule.style.getPropertyValue('font-family') || '').replace(/["']/g, '').trim();
      if (!family) return;
      stateCss.pendingFonts.push({
        style: rule.style,
        wrappers: wrappers.slice(),
        source: source,
        base: base,
        family: family
      });
    }

    function flushFontFaces() {
      for (var f = 0; f < stateCss.pendingFonts.length; f++) {
        var pending = stateCss.pendingFonts[f];
        var lower = pending.family.toLowerCase();
        if (stateCss.usedFamilies.size && !stateCss.usedFamilies.has(lower)) continue;
        var declarations = cssDeclarations(pending.style, pending.base);
        if (!declarations.trim()) continue;
        var urls = urlsIn(declarations, pending.base);
        for (var u = 0; u < urls.length; u++) addAsset(urls[u], 'font');
        stateCss.fonts.push({
          family: pending.family,
          weight: pending.style.getPropertyValue('font-weight') || '400',
          style: pending.style.getPropertyValue('font-style') || 'normal',
          display: pending.style.getPropertyValue('font-display') || 'auto',
          src: pending.style.getPropertyValue('src') || '',
          urls: urls
        });
        addBlock(pending.wrappers, '@font-face { ' + declarations + ' }', null);
      }
    }

    function processKeyframes(rule, wrappers, source) {
      var text = rule.cssText || '';
      var names = stateCss.keyframes.map(function (k) { return k.name; });
      stateCss.keyframes.push({ name: rule.name || '', text: text, wrappers: wrappers.slice(), source: source });
    }

    function processRuleList(rules, wrappers, source, sheetBase, inShadow, hostSelector) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        try {
          var ctor = rule.constructor && rule.constructor.name;
          if (rule.selectorText && rule.style) {
            processStyleRule(rule, wrappers, source, sheetBase, inShadow, hostSelector);
          } else if (ctor === 'CSSFontFaceRule' || (rule.style && /@font-face/i.test(rule.cssText || ''))) {
            processFontFace(rule, wrappers, source, sheetBase);
          } else if (ctor === 'CSSKeyframesRule' || /@(-webkit-)?keyframes/i.test(rule.cssText || '')) {
            processKeyframes(rule, wrappers, source);
          } else if (ctor === 'CSSLayerStatementRule' || (rule.nameList && !rule.cssRules)) {
            addBlock(wrappers, rule.cssText || '', null);
          } else if (rule.cssRules) {
            var nextWrappers = wrappers.slice();
            var header = '';
            if (ctor === 'CSSMediaRule' || /@media/i.test(rule.cssText || '')) {
              header = '@media ' + (rule.conditionText || rule.media.mediaText || 'all');
            } else if (ctor === 'CSSSupportsRule' || /@supports/i.test(rule.cssText || '')) {
              header = '@supports ' + (rule.conditionText || '');
            } else if (ctor === 'CSSContainerRule' || /@container/i.test(rule.cssText || '')) {
              header = '@container ' + (rule.containerName ? rule.containerName + ' ' : '') + (rule.conditionText || '');
            } else if (ctor === 'CSSLayerBlockRule' || /@layer/i.test(rule.cssText || '')) {
              header = '@layer' + (rule.name ? ' ' + rule.name : '');
            } else if (ctor === 'CSSImportRule' || /@import/i.test(rule.cssText || '')) {
              if (rule.styleSheet) {
                if (stateCss.seenSheets.has(rule.styleSheet)) continue;
                stateCss.seenSheets.add(rule.styleSheet);
                processSheet(rule.styleSheet, nextWrappers, rule.href || source, inShadow, hostSelector);
              } else {
                stateCss.unreadable.add(rule.href || '');
              }
              continue;
            } else if (ctor === 'CSSStartingStyleRule' || /@starting-style/i.test(rule.cssText || '')) {
              header = '@starting-style';
            } else if (ctor === 'CSSScopeRule' || /@scope/i.test(rule.cssText || '')) {
              continue;
            }
            if (header) nextWrappers.push(header);
            processRuleList(rule.cssRules, nextWrappers, source, sheetBase, inShadow, hostSelector);
          } else if (ctor === 'CSSPropertyRule' || /@property/i.test(rule.cssText || '')) {
            addBlock(wrappers, rule.cssText || '', null);
          }
        } catch (e) { }
      }
    }

    function hasInjectedSheet(href) {
    try {
      var nodes = document.querySelectorAll('style[data-clippy-src]');
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('data-clippy-src') === href) return true;
      }
    } catch (e) { }
    return false;
  }

  function processSheet(sheet, wrappers, source, inShadow, hostSelector) {
      if (!sheet) return;
      if (stateCss.seenSheets.has(sheet)) return;
      stateCss.seenSheets.add(sheet);
      var rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        if (sheet.href && !hasInjectedSheet(sheet.href)) stateCss.unreadable.add(sheet.href);
        return;
      }
      if (!rules) {
        if (sheet.href && !hasInjectedSheet(sheet.href)) stateCss.unreadable.add(sheet.href);
        return;
      }
      processRuleList(rules, wrappers, source || sheet.href || '', sheet.href || document.baseURI, inShadow, hostSelector);
    }

    function scanDocument(doc, inShadow, hostSelector) {
      var sheets = [];
      try { sheets = Array.prototype.slice.call(doc.styleSheets || []); } catch (e) { }
      if (doc.adoptedStyleSheets) {
        for (var a = 0; a < doc.adoptedStyleSheets.length; a++) sheets.push(doc.adoptedStyleSheets[a]);
      }
      for (var i = 0; i < sheets.length; i++) processSheet(sheets[i], [], sheets[i].href || 'inline', inShadow, hostSelector);
      var styleNodes = doc.querySelectorAll ? doc.querySelectorAll('style') : [];
      for (var s = 0; s < styleNodes.length; s++) {
        var owner = styleNodes[s];
        if (owner.sheet && !stateCss.seenSheets.has(owner.sheet)) {
          processSheet(owner.sheet, [], owner.getAttribute('data-clippy-src') || 'inline', inShadow, hostSelector);
        }
      }
    }

    var contextAncestors = [];
    var ctxEl = parentElementDeep(root);
    while (ctxEl && ctxEl.nodeType === 1 && contextAncestors.length < 6) {
      var ctag = (ctxEl.tagName || '').toLowerCase();
      if (ctag === 'body' || ctag === 'html' || ctag === 'head') break;
      if (!isOverlay(ctxEl) && !isIgnoredTag(ctxEl)) contextAncestors.push(ctxEl);
      ctxEl = parentElementDeep(ctxEl);
    }
    stateCss.contextAncestors = contextAncestors;

    function filterContextDeclarations(style, base) {
      var parts = [];
      var decls = parsedDeclarations(style, base);
      for (var i = 0; i < decls.length; i++) {
        var name = decls[i].name;
        var family = name.split('-')[0];
        if (!CONTEXT_PROPS[name] && name.indexOf('--') !== 0 &&
            !(family === 'background' || family === 'border' || family === 'margin' ||
              family === 'padding' || family === 'grid' || family === 'flex')) continue;
        parts.push(name + ': ' + decls[i].value + ';');
      }
      return parts.join(' ');
    }
    // Document stylesheets first.
    scanDocument(document, false, null);

    // Open shadow roots: collect their adopted/embedded styles too.
    for (var e = 0; e < elements.length; e++) {
      var el = elements[e];
      if (!el.shadowRoot) continue;
      var hostSel = el === root ? '.clippy-root' : '.' + rootFallbackClass(el);
      scanDocument(el.shadowRoot, true, hostSel);
      var adopted = el.shadowRoot.adoptedStyleSheets || [];
      for (var ad = 0; ad < adopted.length; ad++) {
        if (!stateCss.seenSheets.has(adopted[ad])) processSheet(adopted[ad], [], adopted[ad].href || 'inline', true, hostSel);
      }
    }

    // Computed base for context wrappers so inline-styled ancestors and
    // default layout still reproduce correctly.
    if (contextAncestors.length) {
      var contextBase = [];
      for (var cb = 0; cb < contextAncestors.length; cb++) {
        var ctxComputed = getComputedStyle(contextAncestors[cb]);
        var decls = ['box-sizing: border-box;'];
        var display = ctxComputed.getPropertyValue('display');
        if (display) decls.push('display: ' + display + ';');
        var containerType = ctxComputed.getPropertyValue('container-type');
        if (containerType && containerType !== 'normal') decls.push('container-type: ' + containerType + ';');
        var containerName = ctxComputed.getPropertyValue('container-name');
        if (containerName && containerName !== 'none') decls.push('container-name: ' + containerName + ';');
        if (display === 'grid' || display === 'inline-grid') {
          ['gap', 'row-gap', 'column-gap', 'justify-items', 'align-items'].forEach(function (prop) {
            var v = ctxComputed.getPropertyValue(prop);
            if (v && v !== 'none' && v !== 'normal' && v !== 'auto') decls.push(prop + ': ' + v + ';');
          });
        }
        if (display === 'flex' || display === 'inline-flex') {
          ['flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content', 'gap',
           'row-gap', 'column-gap'].forEach(function (prop) {
            var v = ctxComputed.getPropertyValue(prop);
            if (v && v !== 'none' && v !== 'normal') decls.push(prop + ': ' + v + ';');
          });
        }
        contextBase.push({
          wrappers: [],
          text: '.clippy-context-' + (cb + 1) + ' { ' + decls.join(' ') + ' }'
        });
      }
      stateCss.blocks = contextBase.concat(stateCss.blocks);
    }
    flushFontFaces();

    // Keep keyframes referenced by any kept declaration.
    var allDeclarations = stateCss.rules.map(function (r) { return r.declarations; }).join(' ');
    var keptKeyframes = stateCss.keyframes.filter(function (k) {
      return k.name && allDeclarations.indexOf(k.name) >= 0;
    });
    for (var k = 0; k < keptKeyframes.length; k++) {
      stateCss.blocks.push({ wrappers: keptKeyframes[k].wrappers, text: keptKeyframes[k].text });
    }

    stateCss.cssText = assembleBlocks(stateCss.blocks);
    return stateCss;
  }

  function assembleBlocks(blocks) {
    var output = [];
    var open = null;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var key = block.wrappers.join('\n');
      if (open !== null && open.key !== key) {
        for (var c = open.wrappers.length - 1; c >= 0; c--) output.push('}');
        open = null;
      }
      if (open === null) {
        open = { key: key, wrappers: block.wrappers };
        for (var w = 0; w < block.wrappers.length; w++) output.push(block.wrappers[w] + ' {');
      }
      output.push(block.text);
    }
    if (open !== null) {
      for (var z = open.wrappers.length - 1; z >= 0; z--) output.push('}');
    }
    return output.join('\n');
  }

  function unique(list) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  }

  function rootFallbackClass(el) {
    return 'cc-' + (el.__clippyIndex || 0);
  }

  // ------------------------------------------------------------- DOM capture

  function captureNode(el, ctx) {
    if (!el || el.nodeType !== 1) return null;
    if (isOverlay(el) || isIgnoredTag(el)) return null;
    var tag = (el.tagName || '').toLowerCase();
    if (!tag) return null;

    var index = ctx.nextIndex++;
    el.__clippyIndex = index;
    if (ctx.count++ >= MAX_ELEMENTS) {
      ctx.truncated = true;
      return null;
    }

    var node = {
      index: index,
      tag: tag,
      attributes: {},
      text: null,
      children: [],
      computed: {},
      before: null,
      after: null,
      shadowHost: !!el.shadowRoot,
      shadowMode: el.shadowRoot ? 'open' : null,
      matchedRules: ctx.css.matched.get(el) || 0,
      fallback: false,
      isSvg: !!(el.namespaceURI && el.namespaceURI.indexOf('svg') >= 0),
      sourceTag: el.tagName || null
    };

    if (el.shadowRoot) ctx.shadowRoots.add(domLabel(el));

    // Attributes
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      var name = attr.name;
      var value = attr.value;
      var lower = name.toLowerCase();
      if (lower.indexOf('on') === 0 && lower.length > 2) continue;
      if (lower === 'nonce' || lower === 'integrity' || lower === 'crossorigin' ||
          lower === 'srcdoc' || lower === 'ping' || lower === 'http-equiv') continue;
      if (lower === 'style') {
        node.attributes.style = normalizeCssValue(value, document.baseURI);
        collectInlineAssets(value, index, ctx);
        continue;
      }
      if (lower === 'srcset' || lower === 'imagesrcset') {
        node.attributes[name] = normalizeSrcSet(value);
        collectAttributesAssets(name, node.attributes[name], index, ctx);
        continue;
      }
      if (lower === 'src' || lower === 'href' || lower === 'poster' || lower === 'data' || lower === 'action') {
        var absolute = absoluteUrl(value);
        if (absolute) value = absolute;
        node.attributes[name] = value;
        // Links and form actions navigate; they are not resources to download.
        // Only SVG references (and media attributes) point at assets.
        var isAssetAttr = lower === 'src' || lower === 'poster' || lower === 'data' ||
          (lower === 'href' && (tag === 'image' || tag === 'use'));
        if (isAssetAttr && !/^(#|mailto:|tel:)/i.test(value)) {
          collectAttributesAssets(name, value, index, ctx);
        }
        continue;
      }
      if (lower === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
        node.attributes[name] = value;
        continue;
      }
      if (value.length > 100000) value = value.slice(0, 100000);
      node.attributes[name] = value;
    }

    // Current responsive image source (lazy loading can leave src stale).
    if (tag === 'img' && el.currentSrc) {
      node.attributes.src = el.currentSrc;
      collectAttributesAssets('src', el.currentSrc, index, ctx);
    }

    // Current responsive image source (lazy loading can leave src stale).
    if (tag === 'img' && el.currentSrc) {
      node.attributes.src = el.currentSrc;
      collectAttributesAssets('src', el.currentSrc, index, ctx);
    }

    // Live control state.
    if (tag === 'input') {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) node.attributes.checked = 'true'; else delete node.attributes.checked;
      } else if (el.value != null) {
        node.attributes.value = String(el.value);
      }
    } else if (tag === 'textarea') {
      node.attributes.value = el.value || '';
    } else if (tag === 'select') {
      var selected = [];
      for (var o = 0; o < el.options.length; o++) {
        if (el.options[o].selected) selected.push(el.options[o].value);
      }
      if (selected.length) node.attributes.value = selected.join(',');
    }

    // Computed styles.
    var computed = getComputedStyle(el);
    for (var p = 0; p < COMPUTED_PROPS.length; p++) {
      var prop = COMPUTED_PROPS[p];
      var val = computed.getPropertyValue(prop);
      if (val) node.computed[prop] = val;
    }
    node.fallback = node.matchedRules === 0;

    // Pseudo elements.
    node.before = capturePseudo(el, '::before', ctx);
    node.after = capturePseudo(el, '::after', ctx);

    // Assets referenced by computed styles.
    collectComputedAssets(computed, index, ctx);

    // Children, with shadow DOM flattening and slot assignment.
    if (el.shadowRoot) {
      node.children = captureChildren(el.shadowRoot, ctx, true, tag);
      ctx.warnings.push({
        code: 'shadow-flattened',
        severity: 'info',
        message: 'Open shadow root on <' + tag + '> was flattened into the extraction.'
      });
      ctx.flattenedShadowRoots.add(domLabel(el));
    } else {
      node.children = captureChildren(el, ctx, false, tag);
    }

    return node;
  }

  function textNode(value, ctx, preserve) {
    var text = value || '';
    if (!text.trim()) return null;
    var normalized = preserve ? text : text.replace(/[ \t\r\n]+/g, ' ');
    if (normalized.length > MAX_TEXT)
      normalized = normalized.slice(0, MAX_TEXT);
    return {
      index: ctx.nextIndex++,
      tag: '#text',
      attributes: {},
      text: normalized,
      children: [],
      computed: {},
      before: null,
      after: null,
      shadowHost: false,
      shadowMode: null,
      matchedRules: 0,
      fallback: false,
      isSvg: false,
      sourceTag: '#text'
    };
  }

  function captureChildren(parent, ctx, inShadow, parentTag) {
    var result = [];
    var nodes = parent && parent.childNodes ? Array.prototype.slice.call(parent.childNodes) : [];
    var preserve = parentTag === 'pre' || parentTag === 'textarea';
    for (var i = 0; i < nodes.length; i++) {
      var child = nodes[i];
      if (child.nodeType === 3) {
        var capturedText = textNode(child.nodeValue, ctx, preserve);
        if (capturedText) result.push(capturedText);
        continue;
      }
      if (child.nodeType !== 1) continue;
      var tag = (child.tagName || '').toLowerCase();
      if (tag === 'slot' && child.assignedNodes) {
        var assigned = child.assignedNodes({ flatten: true });
        for (var a = 0; a < assigned.length; a++) {
          if (assigned[a].nodeType === 1) {
            var assignedNode = captureNode(assigned[a], ctx);
            if (assignedNode) result.push(assignedNode);
          } else if (assigned[a].nodeType === 3) {
            var assignedText = textNode(assigned[a].nodeValue, ctx, preserve);
            if (assignedText) result.push(assignedText);
          }
        }
        continue;
      }
      var captured = captureNode(child, ctx);
      if (captured) result.push(captured);
    }
    return result;
  }

  function capturePseudo(el, pseudo, ctx) {
    try {
      var style = getComputedStyle(el, pseudo);
      var content = style.getPropertyValue('content');
      if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") {
        return null;
      }
      var styles = {};
      for (var i = 0; i < PSEUDO_STYLE_PROPS.length; i++) {
        var prop = PSEUDO_STYLE_PROPS[i];
        var value = style.getPropertyValue(prop);
        if (value && value !== 'none' && value !== 'normal') styles[prop] = normalizeCssValue(value, document.baseURI);
      }
      var urls = urlsIn(styles['background-image'] || '', document.baseURI)
        .concat(urlsIn(styles['mask-image'] || '', document.baseURI))
        .concat(urlsIn(content, document.baseURI));
      for (var u = 0; u < urls.length; u++) ctx.assets.push({
        url: urls[u], kind: assetKind(urls[u], 'pseudo'), property: pseudo, nodeIndex: el.__clippyIndex
      });
      return { content: content, styles: styles, assetUrls: urls };
    } catch (e) {
      return null;
    }
  }

  function collectComputedAssets(computed, nodeIndex, ctx) {
    ['background-image', 'mask-image', 'border-image-source', 'list-style-image', 'cursor', 'filter', 'clip-path', 'content'].forEach(function (prop) {
      var value = computed.getPropertyValue(prop);
      if (!value || value === 'none') return;
      var urls = urlsIn(value, document.baseURI);
      for (var i = 0; i < urls.length; i++) {
        ctx.assets.push({ url: urls[i], kind: assetKind(urls[i], prop), property: prop, nodeIndex: nodeIndex });
      }
    });
  }

  function collectInlineAssets(value, nodeIndex, ctx) {
    var urls = urlsIn(value, document.baseURI);
    for (var i = 0; i < urls.length; i++) {
      ctx.assets.push({ url: urls[i], kind: assetKind(urls[i], 'style'), property: 'style', nodeIndex: nodeIndex });
    }
  }

  function collectAttributesAssets(name, value, nodeIndex, ctx) {
    if (!value) return;
    if (name.toLowerCase() === 'srcset' || name.toLowerCase() === 'imagesrcset') {
      value.split(',').forEach(function (part) {
        var url = part.trim().split(/\s+/)[0];
        if (!url) return;
        ctx.assets.push({ url: absoluteUrl(url) || url, kind: 'image', property: name, nodeIndex: nodeIndex });
      });
      return;
    }
    if (!/^https?:|^data:/i.test(value)) return;
    ctx.assets.push({ url: value, kind: assetKind(value, name), property: name, nodeIndex: nodeIndex });
  }

  function normalizeSrcSet(value) {
    return String(value || '').split(',').map(function (part) {
      var trimmed = part.trim();
      if (!trimmed) return '';
      var space = trimmed.indexOf(' ');
      var url = space < 0 ? trimmed : trimmed.slice(0, space);
      var descriptor = space < 0 ? '' : trimmed.slice(space);
      return (absoluteUrl(url) || url) + descriptor;
    }).filter(Boolean).join(', ');
  }

  function absoluteUrl(value) {
    if (!value) return '';
    var text = String(value).trim();
    if (!text || text[0] === '#' || /^(data:|mailto:|tel:|javascript:)/i.test(text)) return text;
    try { return new URL(text, document.baseURI).href; } catch (e) { return text; }
  }

  function warningsFor(root, elements, css, ctx) {
    var warnings = [];
    if (css.unreadable.size) {
      warnings.push({
        code: 'cross-origin',
        severity: 'warning',
        message: css.unreadable.size + ' stylesheet(s) could not be read directly: ' +
          Array.from(css.unreadable).slice(0, 4).join(', ')
      });
    }
    if (ctx.flattenedShadowRoots.size) {
      warnings.push({
        code: 'shadow',
        severity: 'info',
        message: 'Open shadow DOM was flattened: ' + Array.from(ctx.flattenedShadowRoots).slice(0, 3).join(', ')
      });
    }
    var hasCanvas = elements.some(function (el) { return el.tagName.toLowerCase() === 'canvas'; });
    if (hasCanvas) warnings.push({ code: 'canvas', severity: 'error', message: 'Canvas pixels cannot be captured as DOM; only the canvas box is exported.' });
    var hasIframe = elements.some(function (el) { return el.tagName.toLowerCase() === 'iframe'; });
    if (hasIframe) warnings.push({ code: 'iframe', severity: 'info', message: 'Embedded iframe content stays outside the extraction.' });
    if (ctx.truncated) warnings.push({ code: 'limit', severity: 'warning', message: 'The element tree exceeded ' + MAX_ELEMENTS + ' nodes and was truncated.' });
    if (css.usedFamilies.size) {
      var found = new Set(css.fonts.map(function (f) { return f.family.toLowerCase(); }));
      css.usedFamilies.forEach(function (family) {
        if (!found.has(family) && !SYSTEM_FONTS[family] && family.indexOf('var(') < 0) {
          warnings.push({ code: 'font-unresolved', severity: 'warning', message: 'Font "' + family + '" has no accessible @font-face source; the browser may substitute it.' });
        }
      });
    }
    return warnings;
  }

  function extract(id, options) {
    options = options || {};
    var selection = null;
    for (var i = 0; i < state.selections.length; i++) {
      if (state.selections[i].id === id) { selection = state.selections[i]; break; }
    }
    if (!selection || !selection.element || !selection.element.isConnected) return null;
    var root = selection.element;
    var elements = collectElements(root);
    var css = collectStyles(root, elements);

    var ctx = {
      nextIndex: 0,
      count: 0,
      css: css,
      assets: [],
      warnings: [],
      shadowRoots: new Set(),
      flattenedShadowRoots: new Set(),
      truncated: false
    };

    var node = captureNode(root, ctx);
    if (!node) return null;

    var rootComputed = {};
    for (var c = 0; c < COMPUTED_PROPS.length; c++) {
      var prop = COMPUTED_PROPS[c];
      if (node.computed[prop]) rootComputed[prop] = node.computed[prop];
    }

    // Include assets discovered during CSS walk.
    for (var a = 0; a < css.assets.length; a++) {
      var asset = css.assets[a];
      if (!ctx.assets.some(function (x) { return x.url === asset.url; })) ctx.assets.push(asset);
    }

    // Font-face sources are assets too.
    for (var f = 0; f < css.fonts.length; f++) {
      for (var u = 0; u < css.fonts[f].urls.length; u++) {
        var furl = css.fonts[f].urls[u];
        if (!ctx.assets.some(function (x) { return x.url === furl; })) {
          ctx.assets.push({ url: furl, kind: 'font', property: 'font-face' });
        }
      }
    }

    var warnings = warningsFor(root, elements, css, ctx);
    for (var w = 0; w < ctx.warnings.length; w++) warnings.push(ctx.warnings[w]);

    var result = {
      id: selection.id,
      selector: selection.selector,
      path: pathParts(root),
      nameHint: domLabel(root),
      root: node,
      rootComputed: rootComputed,
      usedFontFamilies: Array.from(css.usedFamilies),
      cssText: css.cssText || '',
      rules: css.rules.slice(0, 400),
      fonts: css.fonts,
      assets: dedupeAssets(ctx.assets),
      warnings: warnings,
      unreadableSheets: Array.from(css.unreadable),
      flattenedShadowRoots: Array.from(ctx.flattenedShadowRoots),
      sourceUrl: location.href,
      pageTitle: document.title || '',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      nodeCount: ctx.count,
      contextChain: (css.contextAncestors || []).map(function (el) { return { tag: (el.tagName || '').toLowerCase(), id: el.id || null, classes: classListOf(el) }; }),
      styleSheetHrefs: Array.from(document.querySelectorAll('link[rel~="stylesheet" i]')).map(function (l) { return l.href; }).filter(Boolean),
      inlineStyleText: Array.from(document.querySelectorAll('style')).map(function (s) { return s.textContent || ''; }).join('\n').slice(0, 600000),
      usedComputedFallback: elements.some(function (el) { return (css.matched.get(el) || 0) === 0; }),
      extractedAt: new Date().toISOString()
    };

    return result;
  }

  function dedupeAssets(assets) {
    var seen = new Set();
    var out = [];
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      if (!a || !a.url || seen.has(a.url)) continue;
      seen.add(a.url);
      out.push(a);
    }
    return out;
  }

  // ------------------------------------------------------------------- API

  function focusSelection(id) {
    for (var i = 0; i < state.selections.length; i++) {
      if (state.selections[i].id === id) {
        try { state.selections[i].element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) { }
        drawSelections();
        return;
      }
    }
  }

  function climb(id) {
    for (var i = 0; i < state.selections.length; i++) {
      if (state.selections[i].id !== id) continue;
      var parent = parentElementDeep(state.selections[i].element);
      if (parent && parent.nodeType === 1 && !isOverlay(parent) && !isIgnoredTag(parent)) {
        state.selections[i].element = parent;
        state.selections[i].selector = cssPath(parent);
        state.selections[i].name = domLabel(parent);
        drawSelections();
        notify('selection-changed', id);
      }
      return;
    }
  }

  function scrollToSelector(selector) {
    try {
      var el = document.querySelector(selector);
      if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    } catch (e) { }
  }

  function selectBySelector(selector, add) {
    var el = null;
    try { el = document.querySelector(selector); } catch (e) { }
    if (!el) return null;
    if (!add) clearSelections();
    var selection = addSelection(el);
    if (selection) {
      state.hoverElement = el;
      try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch (e) { }
      drawSelections();
    }
    return selection ? selection.id : null;
  }

  function selectByNodeIndex(rootSelectionId, nodeIndex) {
    var rootSelection = null;
    for (var i = 0; i < state.selections.length; i++) {
      if (state.selections[i].id === rootSelectionId) { rootSelection = state.selections[i]; break; }
    }
    if (!rootSelection || !rootSelection.element) return null;
    var elements = collectElements(rootSelection.element);
    for (var e = 0; e < elements.length; e++) {
      if (elements[e].__clippyIndex === nodeIndex) {
        var selection = addSelection(elements[e]);
        if (selection) {
          state.hoverElement = elements[e];
          try { elements[e].scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch (err) { }
          drawSelections();
        }
        return selection ? selection.id : null;
      }
    }
    return null;
  }

  function addStylesheetText(url, text) {
    try {
      var style = document.createElement('style');
      style.setAttribute('data-clippy-src', url || 'clippy-fetched');
      style.textContent = text || '';
      (document.head || document.documentElement).appendChild(style);
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = {
    version: VERSION,
    setActive: setActive,
    isActive: function () { return state.active; },
    setZoom: setZoom,
    pageInfo: function () { return JSON.stringify(pageInfo()); },
    snapshot: function () { return JSON.stringify(pageInfo()); },
    extract: function (id, options) {
      try {
        var result = extract(id, options || {});
        return result ? JSON.stringify(result) : null;
      } catch (e) {
        return JSON.stringify({ error: String(e && e.stack || e) });
      }
    },
    climb: climb,
    remove: removeSelection,
    clear: clearSelections,
    focus: focusSelection,
    scrollToSelector: scrollToSelector,
    addStylesheetText: addStylesheetText,
    selectBySelector: selectBySelector,
    selectByNodeIndex: selectByNodeIndex,
    selectionInfo: function (id) {
      for (var i = 0; i < state.selections.length; i++) {
        if (state.selections[i].id === id) return JSON.stringify(selectionSnapshot(state.selections[i]));
      }
      return null;
    }
  };

  ensureOverlay();
  installEvents();
  loop();
  window.__clippy = api;
  notify('ready', location.href);
})();

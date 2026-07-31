// State
let nodes = [];
let edges = [];
let nodeMap = {};
let camera = { x: 0, y: 0, scale: 1 };
let selectedNodeId = null;
let hoveredNodeId = null;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragNode = null;
let imageCache = {};
let animFrame = null;
let currentChallenge = null;
let allChallenges = [];

const TYPE_COLORS = {
  1: '#f78166', 2: '#d2a8ff', 3: '#58a6ff', 6: '#ffd700', 8: '#7ee787'
};
const TYPE_NAMES = {
  1: 'national', 2: 'club', 3: 'league', 6: 'trophy', 8: 'achievement'
};
const TYPE_LABELS = {
  1: '\u0648\u0637\u0646\u064a\u0629', 2: '\u0646\u0627\u062f\u064a', 3: '\u062f\u0648\u0631\u064a',
  6: '\u0628\u0637\u0648\u0644\u0629', 8: '\u0625\u0646\u062c\u0627\u0632'
};

const canvas = document.getElementById('networkCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('miniMap');
const miniCtx = miniCanvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const statusEl = document.getElementById('status');
const fileInput = document.getElementById('fileInput');
const selectEl = document.getElementById('challengeSelect');
const playerListEl = document.getElementById('playerList');
const categoryListEl = document.getElementById('categoryList');

function resizeCanvas() {
  const c = document.getElementById('canvasContainer');
  canvas.width = c.clientWidth;
  canvas.height = c.clientHeight;
  miniCanvas.width = 160;
  miniCanvas.height = 120;
  render();
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 0);

fileInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      processData(data);
    } catch(err) {
      statusEl.textContent = '\u274c \u062e\u0637\u0623: ' + err.message;
    }
  };
  reader.readAsText(file);
});
function processData(data) {
  allChallenges = [];
  // Root challenges
  if (data.challenges) {
    for (const [key, ch] of Object.entries(data.challenges)) {
      if (ch && ch.players && ch.remit) {
        allChallenges.push({ source: 'challenges', key, challenge: ch });
      }
    }
  }
  // Elphenomeno challenges
  if (data.elphenomeno && data.elphenomeno.challenges) {
    const ep = data.elphenomeno.challenges;
    for (const gameType of ['connections', 'elphenomeno', 'impostor']) {
      if (ep[gameType]) {
        for (const [key, ch] of Object.entries(ep[gameType])) {
          if (ch && typeof ch === 'object' && ch.players && ch.remit) {
            allChallenges.push({ source: 'elphenomeno/' + gameType, key, challenge: ch });
          }
        }
      }
    }
  }
  // Build select
  selectEl.innerHTML = '';
  if (allChallenges.length === 0) {
    selectEl.disabled = true;
    statusEl.textContent = '\u0644\u0627 \u062a\u062d\u062f\u064a\u0627\u062a \u0635\u0627\u0644\u062d\u0629';
    return;
  }
  selectEl.disabled = false;
  for (let i = 0; i < allChallenges.length; i++) {
    const c = allChallenges[i];
    const opt = document.createElement('option');
    opt.value = i;
    const ch = c.challenge;
    const pCount = ch.players ? ch.players.length : 0;
    opt.textContent = c.source + ' #' + c.key + ' (' + pCount + ' players)';
    selectEl.appendChild(opt);
  }
  statusEl.textContent = allChallenges.length + ' challenges found';
  if (allChallenges.length > 0) {
    selectEl.value = 0;
    loadSelectedChallenge();
  }
}

function loadSelectedChallenge() {
  const idx = parseInt(selectEl.value);
  if (isNaN(idx) || idx < 0 || idx >= allChallenges.length) return;
  const entry = allChallenges[idx];
  buildGraph(entry.challenge);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function buildGraph(challenge) {
  nodes = [];
  edges = [];
  nodeMap = {};
  selectedNodeId = null;
  hoveredNodeId = null;
  imageCache = {};
  currentChallenge = challenge;

  var players = challenge.players || [];
  var remit = challenge.remit || [];

  // Flatten remit into category map
  var catMap = {};
  for (var r = 0; r < remit.length; r++) {
    var row = remit[r];
    for (var c = 0; c < row.length; c++) {
      var cat = row[c];
      catMap[cat.id] = cat;
    }
  }

  // Create category nodes
  for (var catId in catMap) {
    var catData = catMap[catId];
    var node = {
      id: 'cat_' + catId,
      type: 'category',
      label: catData.name || catData.displayName || '',
      shortLabel: catData.displayName || catData.name || '',
      catType: catData.type,
      catId: catData.id,
      image: catData.image || null,
      x: 0, y: 0, vx: 0, vy: 0,
      radius: 24
    };
    nodes.push(node);
    nodeMap[node.id] = node;
    if (catData.image) preloadImage(node.id, catData.image);
  }

  // Create player nodes
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    var pnode = {
      id: 'player_' + p.id,
      type: 'player',
      label: (p.g || '') + ' ' + (p.f || ''),
      shortLabel: p.f || '',
      playerData: p,
      image: p.image || null,
      x: 0, y: 0, vx: 0, vy: 0,
      radius: 28
    };
    nodes.push(pnode);
    nodeMap[pnode.id] = pnode;
    if (p.image) preloadImage(pnode.id, p.image);
  }

  // Create edges: player v[] -> category numericId
  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    if (!p.v || !Array.isArray(p.v)) continue;
    for (var v = 0; v < p.v.length; v++) {
      var catNodeId = 'cat_' + p.v[v];
      if (nodeMap[catNodeId]) {
        edges.push({
          source: 'player_' + p.id,
          target: catNodeId
        });
      }
    }
  }

  // Random initial positions
  var w = canvas.width || 800;
  var h = canvas.height || 600;
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].x = w / 2 + (Math.random() - 0.5) * w * 0.6;
    nodes[i].y = h / 2 + (Math.random() - 0.5) * h * 0.6;
  }

  // Force layout
  forceLayout(150);

  // Fit camera
  fitCamera();

  // Update sidebar
  updateSidebar();

  // Start render loop
  render();
}
function forceLayout(iterations) {
  var n = nodes.length;
  if (n === 0) return;
  var repulsion = 5000;
  var attraction = 0.005;
  var damping = 0.9;
  var idealLen = 150;

  for (var iter = 0; iter < iterations; iter++) {
    // Repulsion between all pairs
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var dx = nodes[j].x - nodes[i].x;
        var dy = nodes[j].y - nodes[i].y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = repulsion / (dist * dist);
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }
    // Attraction along edges
    for (var e = 0; e < edges.length; e++) {
      var src = nodeMap[edges[e].source];
      var tgt = nodeMap[edges[e].target];
      if (!src || !tgt) continue;
      var dx = tgt.x - src.x;
      var dy = tgt.y - src.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var force = (dist - idealLen) * attraction;
      var fx = (dx / dist) * force;
      var fy = (dy / dist) * force;
      src.vx += fx;
      src.vy += fy;
      tgt.vx -= fx;
      tgt.vy -= fy;
    }
    // Center gravity
    var cx = (canvas.width || 800) / 2;
    var cy = (canvas.height || 600) / 2;
    for (var i = 0; i < n; i++) {
      nodes[i].vx += (cx - nodes[i].x) * 0.001;
      nodes[i].vy += (cy - nodes[i].y) * 0.001;
    }
    // Apply velocity
    for (var i = 0; i < n; i++) {
      nodes[i].vx *= damping;
      nodes[i].vy *= damping;
      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;
    }
  }
}
function fitCamera() {
  if (nodes.length === 0) return;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  var padding = 80;
  var w = maxX - minX + padding * 2;
  var h = maxY - minY + padding * 2;
  var cw = canvas.width || 800;
  var ch = canvas.height || 600;
  var scale = Math.min(cw / w, ch / h, 1.5);
  camera.scale = scale;
  camera.x = (minX + maxX) / 2;
  camera.y = (minY + maxY) / 2;
}

function preloadImage(id, url) {
  if (imageCache[id]) return;
  imageCache[id] = 'loading';
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() { imageCache[id] = img; render(); };
  img.onerror = function() { imageCache[id] = null; };
  img.src = url;
}
function render() {
  var w = canvas.width;
  var h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);
  drawEdges();
  drawNodes();
  ctx.restore();
  renderMiniMap();
}
function drawEdges() {
  ctx.lineWidth = 1.5;
  for (var e = 0; e < edges.length; e++) {
    var src = nodeMap[edges[e].source];
    var tgt = nodeMap[edges[e].target];
    if (!src || !tgt) continue;
    var isH = (hoveredNodeId === src.id || hoveredNodeId === tgt.id);
    var isS = (selectedNodeId === src.id || selectedNodeId === tgt.id);
    ctx.strokeStyle = isS ? '#58a6ff' : isH ? '#58a6ff88' : '#388bfd33';
    ctx.lineWidth = isS ? 2.5 : isH ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.stroke();
  }
}
function drawNodes() {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var isS = (selectedNodeId === n.id);
    var isH = (hoveredNodeId === n.id);
    var r = n.radius;
    if (isS) {
      ctx.save();
      ctx.shadowColor = '#58a6ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#58a6ff22';
      ctx.fill();
      ctx.restore();
    }
    if (n.type === 'player') {
      drawPlayerNode(n, r, isH, isS);
    } else {
      drawCategoryNode(n, r, isH, isS);
    }
  }
}
function drawPlayerNode(n, r, isH, isS) {
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isH ? '#f7816644' : '#161b22';
  ctx.fill();
  ctx.strokeStyle = '#f78166';
  ctx.lineWidth = isS ? 3 : 2;
  ctx.stroke();
  var img = imageCache[n.id];
  if (img && img !== 'loading') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, n.x - r + 2, n.y - r + 2, (r - 2) * 2, (r - 2) * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = '#f78166';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.shortLabel.substring(0, 6), n.x, n.y);
  }
  ctx.fillStyle = '#e6edf3';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var lbl = n.shortLabel.length > 12 ? n.shortLabel.substring(0, 11) + '...' : n.shortLabel;
  ctx.fillText(lbl, n.x, n.y + r + 4);
}
function drawCategoryNode(n, r, isH, isS) {
  var color = TYPE_COLORS[n.catType] || '#a5d6ff';
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isH ? color + '44' : '#161b22';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = isS ? 3 : 2;
  ctx.stroke();
  var img = imageCache[n.id];
  if (img && img !== 'loading') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, n.x - r + 2, n.y - r + 2, (r - 2) * 2, (r - 2) * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.shortLabel.substring(0, 4), n.x, n.y);
  }
  ctx.fillStyle = '#e6edf3';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var lbl = n.shortLabel.length > 12 ? n.shortLabel.substring(0, 11) + '...' : n.shortLabel;
  ctx.fillText(lbl, n.x, n.y + r + 4);
}
function renderMiniMap() {
  var mw = miniCanvas.width;
  var mh = miniCanvas.height;
  miniCtx.clearRect(0, 0, mw, mh);
  miniCtx.fillStyle = '#0d1117';
  miniCtx.fillRect(0, 0, mw, mh);
  if (nodes.length === 0) return;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  var pad = 40;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  var rangeX = maxX - minX || 1;
  var rangeY = maxY - minY || 1;
  var scaleX = mw / rangeX;
  var scaleY = mh / rangeY;
  var s = Math.min(scaleX, scaleY);
  var ox = (mw - rangeX * s) / 2;
  var oy = (mh - rangeY * s) / 2;
  // Draw edges
  miniCtx.strokeStyle = '#388bfd33';
  miniCtx.lineWidth = 0.5;
  for (var e = 0; e < edges.length; e++) {
    var src = nodeMap[edges[e].source];
    var tgt = nodeMap[edges[e].target];
    if (!src || !tgt) continue;
    miniCtx.beginPath();
    miniCtx.moveTo(ox + (src.x - minX) * s, oy + (src.y - minY) * s);
    miniCtx.lineTo(ox + (tgt.x - minX) * s, oy + (tgt.y - minY) * s);
    miniCtx.stroke();
  }
  // Draw nodes
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var mx = ox + (n.x - minX) * s;
    var my = oy + (n.y - minY) * s;
    miniCtx.beginPath();
    miniCtx.arc(mx, my, n.type === 'player' ? 2.5 : 2, 0, Math.PI * 2);
    miniCtx.fillStyle = n.type === 'player' ? '#f78166' : (TYPE_COLORS[n.catType] || '#a5d6ff');
    miniCtx.fill();
  }
  // Draw viewport
  var cw = canvas.width;
  var ch = canvas.height;
  var vpLeft = ox + ((camera.x - cw / 2 / camera.scale) - minX) * s;
  var vpTop = oy + ((camera.y - ch / 2 / camera.scale) - minY) * s;
  var vpW = (cw / camera.scale) * s;
  var vpH = (ch / camera.scale) * s;
  miniCtx.strokeStyle = '#58a6ff88';
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(vpLeft, vpTop, vpW, vpH);
}
function screenToWorld(sx, sy) {
  var cw = canvas.width;
  var ch = canvas.height;
  var wx = (sx - cw / 2) / camera.scale + camera.x;
  var wy = (sy - ch / 2) / camera.scale + camera.y;
  return { x: wx, y: wy };
}

function findNodeAt(wx, wy) {
  for (var i = nodes.length - 1; i >= 0; i--) {
    var n = nodes[i];
    var dx = n.x - wx;
    var dy = n.y - wy;
    if (dx * dx + dy * dy < n.radius * n.radius) return n;
  }
  return null;
}

canvas.addEventListener('mousedown', function(e) {
  var rect = canvas.getBoundingClientRect();
  var sx = e.clientX - rect.left;
  var sy = e.clientY - rect.top;
  var world = screenToWorld(sx, sy);
  var node = findNodeAt(world.x, world.y);
  if (node) {
    dragNode = node;
    selectedNodeId = node.id;
    updateSidebar();
    showTooltip(node, e.clientX, e.clientY);
  } else {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    selectedNodeId = null;
    hideTooltip();
    updateSidebar();
  }
  render();
});
canvas.addEventListener('mousemove', function(e) {
  var rect = canvas.getBoundingClientRect();
  var sx = e.clientX - rect.left;
  var sy = e.clientY - rect.top;
  var world = screenToWorld(sx, sy);

  if (dragNode) {
    dragNode.x = world.x;
    dragNode.y = world.y;
    dragNode.vx = 0;
    dragNode.vy = 0;
    render();
    return;
  }
  if (isDragging) {
    var dx = e.clientX - dragStart.x;
    var dy = e.clientY - dragStart.y;
    camera.x -= dx / camera.scale;
    camera.y -= dy / camera.scale;
    dragStart = { x: e.clientX, y: e.clientY };
    render();
    return;
  }

  var node = findNodeAt(world.x, world.y);
  var newHovered = node ? node.id : null;
  if (newHovered !== hoveredNodeId) {
    hoveredNodeId = newHovered;
    canvas.style.cursor = node ? 'pointer' : 'grab';
    if (node) showTooltip(node, e.clientX, e.clientY);
    else hideTooltip();
    render();
  } else if (node) {
    positionTooltip(e.clientX, e.clientY);
  }
});

canvas.addEventListener('mouseup', function(e) {
  if (dragNode) {
    dragNode = null;
  } else if (isDragging) {
    isDragging = false;
  }
  canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseleave', function() {
  if (dragNode) dragNode = null;
  if (isDragging) isDragging = false;
  hoveredNodeId = null;
  hideTooltip();
  render();
});

canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  var rect = canvas.getBoundingClientRect();
  var sx = e.clientX - rect.left;
  var sy = e.clientY - rect.top;
  var world = screenToWorld(sx, sy);
  var factor = e.deltaY > 0 ? 0.9 : 1.1;
  var newScale = camera.scale * factor;
  newScale = Math.max(0.1, Math.min(5, newScale));
  camera.x = world.x - (sx - canvas.width / 2) / newScale;
  camera.y = world.y - (sy - canvas.height / 2) / newScale;
  camera.scale = newScale;
  render();
}, { passive: false });
// Touch support
var touchState = { lastDist: 0, lastCenter: null, touching: false };

canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    var t = e.touches[0];
    var rect = canvas.getBoundingClientRect();
    var sx = t.clientX - rect.left;
    var sy = t.clientY - rect.top;
    var world = screenToWorld(sx, sy);
    var node = findNodeAt(world.x, world.y);
    if (node) {
      dragNode = node;
      selectedNodeId = node.id;
      updateSidebar();
      showTooltip(node, t.clientX, t.clientY);
    } else {
      isDragging = true;
      dragStart = { x: t.clientX, y: t.clientY };
      selectedNodeId = null;
      hideTooltip();
      updateSidebar();
    }
  } else if (e.touches.length === 2) {
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    touchState.lastDist = Math.sqrt(dx * dx + dy * dy);
    touchState.lastCenter = {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2
    };
  }
  render();
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    var t = e.touches[0];
    if (dragNode) {
      var rect = canvas.getBoundingClientRect();
      var sx = t.clientX - rect.left;
      var sy = t.clientY - rect.top;
      var world = screenToWorld(sx, sy);
      dragNode.x = world.x;
      dragNode.y = world.y;
      dragNode.vx = 0;
      dragNode.vy = 0;
    } else if (isDragging) {
      var dx = t.clientX - dragStart.x;
      var dy = t.clientY - dragStart.y;
      camera.x -= dx / camera.scale;
      camera.y -= dy / camera.scale;
      dragStart = { x: t.clientX, y: t.clientY };
    }
  } else if (e.touches.length === 2) {
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (touchState.lastDist > 0) {
      var factor = dist / touchState.lastDist;
      camera.scale = Math.max(0.1, Math.min(5, camera.scale * factor));
    }
    touchState.lastDist = dist;
  }
  render();
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  if (e.touches.length === 0) {
    dragNode = null;
    isDragging = false;
    touchState.lastDist = 0;
    touchState.lastCenter = null;
  }
});
function showTooltip(node, cx, cy) {
  var html = '';
  var imgSrc = node.image || (node.playerData && node.playerData.image) || '';
  if (imgSrc) {
    html += '<div class="tip-header"><img src="' + imgSrc + '" alt=""><span class="name">' + node.label + '</span></div>';
  } else {
    html += '<div class="tip-header"><span class="name">' + node.label + '</span></div>';
  }
  if (node.type === 'player') {
    var p = node.playerData;
    if (p) {
      html += '<div class="detail"><b>\u0627\u0644\u0645\u0648\u0642\u0639:</b> ' + (p.p || '-') + '</div>';
      if (p.v && p.v.length > 0) {
        var catNames = p.v.map(function(vid) {
          var cn = nodeMap['cat_' + vid];
          return cn ? cn.shortLabel : vid;
        });
        html += '<div class="detail"><b>\u0627\u0644\u0631\u0635\u064a\u062f:</b> ' + catNames.join(', ') + '</div>';
      }
      html += '<div class="detail"><b>ID:</b> ' + p.id + '</div>';
    }
  } else {
    var typeName = TYPE_LABELS[node.catType] || '';
    html += '<div class="detail"><b>\u0627\u0644\u0646\u0648\u0639:</b> ' + typeName + '</div>';
    html += '<div class="detail"><b>\u0627\u0644\u0645\u0639\u0631\u0636:</b> ' + node.shortLabel + '</div>';
    html += '<div class="detail"><b>\u0627\u0644\u0645\u0631\u062a\u0628\u0637:</b> ' + (node.catId || '-') + '</div>';
  }
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');
  positionTooltip(cx, cy);
}

function positionTooltip(cx, cy) {
  var container = document.getElementById('canvasContainer');
  var rect = container.getBoundingClientRect();
  var x = cx - rect.left + 16;
  var y = cy - rect.top + 16;
  var tw = tooltip.offsetWidth;
  var th = tooltip.offsetHeight;
  if (x + tw > rect.width) x = cx - rect.left - tw - 8;
  if (y + th > rect.height) y = cy - rect.top - th - 8;
  if (x < 0) x = 8;
  if (y < 0) y = 8;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}
function updateSidebar() {
  playerListEl.innerHTML = '';
  categoryListEl.innerHTML = '';
  var players = [];
  var categories = [];
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'player') players.push(nodes[i]);
    else categories.push(nodes[i]);
  }
  players.sort(function(a, b) { return (a.shortLabel || '').localeCompare(b.shortLabel || ''); });
  categories.sort(function(a, b) { return (a.shortLabel || '').localeCompare(b.shortLabel || ''); });

  for (var i = 0; i < players.length; i++) {
    var p = players[i];
    var li = document.createElement('li');
    li.dataset.nodeId = p.id;
    if (selectedNodeId === p.id) li.className = 'active';
    var thumbSrc = p.image || '';
    var thumbHtml = thumbSrc ? '<img class="thumb" src="' + thumbSrc + '" alt="">' : '<span class="thumb"></span>';
    li.innerHTML = thumbHtml + '<span>' + p.shortLabel + '</span>';
    li.addEventListener('click', (function(nodeId) {
      return function() {
        focusNode(nodeId);
      };
    })(p.id));
    playerListEl.appendChild(li);
  }

  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    var li = document.createElement('li');
    li.dataset.nodeId = c.id;
    if (selectedNodeId === c.id) li.className = 'active';
    var typeName = TYPE_NAMES[c.catType] || '';
    var thumbSrc = c.image || '';
    var thumbHtml = thumbSrc ? '<img class="thumb" src="' + thumbSrc + '" alt="">' : '<span class="thumb"></span>';
    li.innerHTML = '<span class="type-badge ' + typeName + '">' + typeName + '</span>' + thumbHtml + '<span>' + c.shortLabel + '</span>';
    li.addEventListener('click', (function(nodeId) {
      return function() {
        focusNode(nodeId);
      };
    })(c.id));
    categoryListEl.appendChild(li);
  }
}

function focusNode(nodeId) {
  var node = nodeMap[nodeId];
  if (!node) return;
  selectedNodeId = nodeId;
  camera.x = node.x;
  camera.y = node.y;
  camera.scale = 1.5;
  updateSidebar();
  render();
}

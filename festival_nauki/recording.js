const recordings = globalThis.SWARM_RECORDINGS ?? [];
const queryId = new URLSearchParams(window.location.search).get("recording");
const pathMatch = window.location.pathname.match(/\/recordings\/([^/]+)\/?$/);
const id = queryId || (pathMatch ? decodeURIComponent(pathMatch[1]) : "");
const recording = recordings.find((item) => item.id === id);
const video = document.getElementById("recording-video");
const el = (elementId) => document.getElementById(elementId);

function diagramSvg(title, description, content) {
  return `<svg class="recording-diagram-svg" viewBox="0 0 520 320" role="img" aria-label="${title}" preserveAspectRatio="xMidYMid meet">
    <title>${title}</title>
    <desc>${description}</desc>
    <defs>
      <marker id="diagram-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 Z" class="diagram-arrow-head"></path>
      </marker>
    </defs>
    <rect x="1" y="1" width="518" height="318" rx="14" class="diagram-frame"></rect>
    ${content}
  </svg>`;
}

function diagramHeader(titlePl, titleEn) {
  return `<line x1="1" y1="40" x2="519" y2="40" class="diagram-divider"></line>
    <text x="18" y="26" class="diagram-title-pl">${titlePl}</text>
    <text x="502" y="26" text-anchor="end" class="diagram-title-en">${titleEn}</text>`;
}

function diagramLegend(items) {
  const slots = [18, 206, 366];
  return `<line x1="1" y1="280" x2="519" y2="280" class="diagram-divider"></line>` +
    items
      .map(
        (item, index) => `<g>
          <rect x="${slots[index]}" y="289" width="11" height="11" rx="2" class="diagram-legend-chip ${item.className}"></rect>
          <text x="${slots[index] + 17}" y="299" class="diagram-legend-text">${item.text}</text>
        </g>`
      )
      .join("");
}

function diagramBlocks(rows, x, y, width, height, columns) {
  const cellWidth = width / columns;
  const cellHeight = height / rows.length;
  return rows
    .flatMap((row, rowIndex) => [...row].map((cell, columnIndex) => ({ cell, rowIndex, columnIndex })))
    .filter(({ cell }) => cell === "X")
    .map(
      ({ rowIndex, columnIndex }) =>
        `<rect x="${(x + columnIndex * cellWidth).toFixed(1)}" y="${(y + rowIndex * cellHeight).toFixed(1)}" width="${(cellWidth + 0.6).toFixed(1)}" height="${(cellHeight + 0.6).toFixed(1)}" rx="1.4" class="diagram-block"></rect>`
    )
    .join("");
}

function findCells(rows) {
  const cells = {};
  rows.forEach((row, rowIndex) => {
    [...row].forEach((cell, columnIndex) => {
      if (cell !== "X" && cell !== "_" && cell !== " ") cells[cell] = { columnIndex, rowIndex };
    });
  });
  return cells;
}

function cellCenter(x, y, width, height, columns, rows, cell) {
  const cellWidth = width / columns;
  const cellHeight = height / rows.length;
  return { x: x + (cell.columnIndex + 0.5) * cellWidth, y: y + (cell.rowIndex + 0.5) * cellHeight };
}

function polyline(points, className) {
  return `<polyline points="${points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")}" class="${className}"></polyline>`;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellIsFree(rows, column, row) {
  if (row < 0 || row >= rows.length) return false;
  if (column < 0 || column >= rows[row].length) return false;
  return rows[row][column] !== "X";
}

function segmentIsFree(rows, ax, ay, bx, by) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 6));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    if (!cellIsFree(rows, Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t))) return false;
  }
  return true;
}

function growRrt(rows, start, goal, seed) {
  const random = mulberry32(seed);
  const columns = rows[0].length;
  const nodes = [{ x: start.columnIndex + 0.5, y: start.rowIndex + 0.5, parent: -1 }];
  const goalX = goal.columnIndex + 0.5;
  const goalY = goal.rowIndex + 0.5;
  for (let iteration = 0; iteration < 260; iteration += 1) {
    const sample = { x: random() * columns, y: random() * rows.length };
    let nearest = 0;
    let best = Infinity;
    for (let index = 0; index < nodes.length; index += 1) {
      const distance = (nodes[index].x - sample.x) ** 2 + (nodes[index].y - sample.y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    const base = nodes[nearest];
    const distance = Math.hypot(sample.x - base.x, sample.y - base.y);
    if (distance < 1e-6) continue;
    const step = Math.min(1.1, distance);
    const nextX = base.x + ((sample.x - base.x) / distance) * step;
    const nextY = base.y + ((sample.y - base.y) / distance) * step;
    if (!cellIsFree(rows, Math.floor(nextX), Math.floor(nextY))) continue;
    if (!segmentIsFree(rows, base.x, base.y, nextX, nextY)) continue;
    nodes.push({ x: nextX, y: nextY, parent: nearest });
    if (Math.hypot(nextX - goalX, nextY - goalY) < 1.1) break;
  }
  return nodes;
}

function rrtBranches(rows, segments, seed) {
  const branches = [];
  segments.forEach((segment, index) => {
    const nodes = growRrt(rows, segment[0], segment[1], seed + index * 101);
    nodes.forEach((node) => {
      if (node.parent >= 0) branches.push([nodes[node.parent], node]);
    });
  });
  return branches;
}

function branchMarkup(branches, toPixel) {
  return branches
    .map(([from, to]) => {
      const a = toPixel(from);
      const b = toPixel(to);
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="diagram-rrt-branch"></line>`;
    })
    .join("");
}

function castRay(origin, angle, rows, x, y, width, height, columns, maxLength) {
  const cellWidth = width / columns;
  const cellHeight = height / rows.length;
  for (let distance = 2; distance <= maxLength; distance += 2) {
    const px = origin.x + Math.cos(angle) * distance;
    const py = origin.y + Math.sin(angle) * distance;
    const column = Math.floor((px - x) / cellWidth);
    const row = Math.floor((py - y) / cellHeight);
    if (row < 0 || row >= rows.length || column < 0 || column >= columns) return distance;
    if (rows[row][column] === "X") return distance;
  }
  return maxLength;
}

function lidarRays(origin, rows, x, y, width, height, columns) {
  const angles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  const maxLength = (width / columns) * 1.7;
  const horizontal = angles
    .map((angle) => {
      const distance = castRay(origin, angle, rows, x, y, width, height, columns, maxLength);
      const end = pointAt(origin.x, origin.y, angle, distance);
      return `<line x1="${origin.x.toFixed(1)}" y1="${origin.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" class="diagram-ray"></line><circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="2.4" class="diagram-ray-hit"></circle>`;
    })
    .join("");
  const top = origin.y - 30;
  const bottom = origin.y - 16;
  const vertical = `<line x1="${origin.x.toFixed(1)}" y1="${top.toFixed(1)}" x2="${origin.x.toFixed(1)}" y2="${bottom.toFixed(1)}" class="diagram-ray-vertical"></line>
    <path d="M${(origin.x - 3).toFixed(1)},${(top + 4).toFixed(1)} L${origin.x.toFixed(1)},${top.toFixed(1)} L${(origin.x + 3).toFixed(1)},${(top + 4).toFixed(1)}" class="diagram-ray-vertical-head"></path>
    <path d="M${(origin.x - 3).toFixed(1)},${(bottom - 4).toFixed(1)} L${origin.x.toFixed(1)},${bottom.toFixed(1)} L${(origin.x + 3).toFixed(1)},${(bottom - 4).toFixed(1)}" class="diagram-ray-vertical-head"></path>`;
  return horizontal + vertical;
}

function waypointMarker(point, label) {
  return `<g><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="9" class="diagram-waypoint"></circle><text x="${point.x.toFixed(1)}" y="${(point.y + 3.6).toFixed(1)}" text-anchor="middle" class="diagram-waypoint-label">${label}</text></g>`;
}

function boidTriangle(cx, cy, angle, className) {
  const shape = [
    [10, 0],
    [-6.5, -6],
    [-6.5, 6],
  ];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points = shape
    .map(([px, py]) => `${(cx + px * cos - py * sin).toFixed(1)},${(cy + px * sin + py * cos).toFixed(1)}`)
    .join(" ");
  return `<polygon points="${points}" class="${className}"></polygon>`;
}

function pointAt(x, y, angle, length) {
  return { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length };
}

function forceArrow(fromX, fromY, toX, toY, className) {
  return `<line x1="${fromX.toFixed(1)}" y1="${fromY.toFixed(1)}" x2="${toX.toFixed(1)}" y2="${toY.toFixed(1)}" class="diagram-vector ${className}" marker-end="url(#diagram-arrow)"></line>`;
}

function diagramBoids() {
  const cx = 258;
  const cy = 160;
  const outer = 104;
  const inner = 46;
  const flock = [
    { x: 232, y: 146, angle: 0.9, className: "diagram-boid-tri-close" },
    { x: 288, y: 182, angle: -2.2, className: "diagram-boid-tri-close" },
    { x: 172, y: 118, angle: -0.4, className: "diagram-boid-tri" },
    { x: 350, y: 128, angle: 2.6, className: "diagram-boid-tri" },
    { x: 338, y: 216, angle: -2.6, className: "diagram-boid-tri" },
    { x: 186, y: 214, angle: 0.5, className: "diagram-boid-tri" },
    { x: 262, y: 66, angle: 3.0, className: "diagram-boid-tri" },
    { x: 70, y: 80, angle: 0.4, className: "diagram-boid-tri-far" },
    { x: 452, y: 78, angle: -0.3, className: "diagram-boid-tri-far" },
    { x: 78, y: 250, angle: 1.8, className: "diagram-boid-tri-far" },
    { x: 452, y: 246, angle: -2.0, className: "diagram-boid-tri-far" },
    { x: 140, y: 58, angle: 0.2, className: "diagram-boid-tri-far" },
  ];
  const boids = flock.map(({ x, y, angle, className }) => boidTriangle(x, y, angle, className)).join("");
  return diagramSvg("Rój boidsów / Boids flock", "Strefa ochronna, pole widzenia i reakcje na sąsiadów.", `
    ${diagramHeader("Rój boidsów", "Boids flock")}
    <circle cx="${cx}" cy="${cy}" r="${outer}" class="diagram-range-outer"></circle>
    <circle cx="${cx}" cy="${cy}" r="${inner}" class="diagram-range-inner"></circle>
    ${boids}
    ${boidTriangle(cx, cy, -0.8, "diagram-boid-tri-core")}
    <circle cx="${cx - 24}" cy="${cy - 28}" r="2.2" class="diagram-leader-dot"></circle>
    <line x1="368" y1="256" x2="${cx + 66}" y2="${cy + 44}" class="diagram-leader"></line>
    <circle cx="${cx + 66}" cy="${cy + 44}" r="2.2" class="diagram-leader-dot"></circle>
    ${diagramLegend([
      { className: "diagram-legend-red", text: "za blisko" },
      { className: "diagram-legend-green", text: "sąsiedzi" },
      { className: "diagram-legend-grey", text: "poza zasięgiem" },
    ])}
  `);
}

function diagramFlockMaze() {
  const rows = [
    "XXXXXXXXXXXXXXXX",
    "X______XXX_____X",
    "X______XXX___T_X",
    "X______XXX___X_X",
    "X_A___C___D____X",
    "X______XXX_____X",
    "X____X______X__X",
    "X______XXX_____X",
    "X______XXX__X__X",
    "XS_____XXXX____X",
    "XXXXXXXXXXXXXXXX",
  ];
  const x = 20;
  const y = 48;
  const width = 480;
  const height = 220;
  const cells = findCells(rows);
  const point = (cell) => cellCenter(x, y, width, height, 16, rows, cell);
  const start = point(cells.S);
  const routeCells = [cells.S, cells.A, cells.C, cells.D, { columnIndex: 11, rowIndex: 3 }, { columnIndex: 12, rowIndex: 2 }, cells.T];
  const route = routeCells.map(point);
  const waypoints = [
    { cell: cells.A, label: "A" },
    { cell: cells.C, label: "C" },
    { cell: cells.D, label: "D" },
    { cell: cells.T, label: "T" },
  ];
  const tree = [
    [cells.A, { columnIndex: 2, rowIndex: 5 }, { columnIndex: 1, rowIndex: 6 }],
    [cells.C, { columnIndex: 5, rowIndex: 5 }, { columnIndex: 5, rowIndex: 6 }, { columnIndex: 5, rowIndex: 7 }],
    [cells.D, { columnIndex: 9, rowIndex: 5 }, { columnIndex: 9, rowIndex: 6 }, { columnIndex: 10, rowIndex: 6 }],
  ]
    .map((branch) => polyline(branch.map(point), "diagram-tree"))
    .join("");
  const flock = [
    { x: start.x, y: start.y },
    { x: start.x - 13, y: start.y - 9 },
    { x: start.x + 12, y: start.y - 10 },
  ]
    .map(({ x: fx, y: fy }, index) => `<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="${index === 0 ? 7 : 4.5}" class="diagram-drone"></circle>`)
    .join("");
  return diagramSvg("Rój w labiryncie / Flock maze", "Plan RRT przez dwa pokoje i promienie LiDAR.", `
    ${diagramHeader("Rój w labiryncie", "Flock maze")}
    ${diagramBlocks(rows, x, y, width, height, 16)}
    ${tree}
    ${polyline(route, "diagram-route")}
    ${waypoints.map(({ cell, label }) => waypointMarker(point(cell), label)).join("")}
    ${lidarRays(start, rows, x, y, width, height, 16)}
    ${flock}
    <text x="${start.x.toFixed(1)}" y="${(start.y + 22).toFixed(1)}" text-anchor="middle" class="diagram-small-label">S</text>
    ${diagramLegend([
      { className: "diagram-legend-green", text: "trasa RRT" },
      { className: "diagram-legend-grey", text: "drzewo RRT" },
      { className: "diagram-legend-amber", text: "LiDAR 6 × 2 m" },
    ])}
  `);
}

function diagramRrtRunner() {
  const rows = [
    "XXXXXXXX",
    "XA____BX",
    "X__XX_XX",
    "XSXX__CX",
    "XXX__XXX",
    "XD__XXFX",
    "X___E__X",
    "XXXXXXXX",
  ];
  const x = 40;
  const y = 48;
  const width = 440;
  const height = 220;
  const cells = findCells(rows);
  const point = (cell) => cellCenter(x, y, width, height, 8, rows, cell);
  const start = point(cells.S);
  const routeCells = [
    cells.S,
    { columnIndex: 1, rowIndex: 2 },
    cells.A,
    { columnIndex: 2, rowIndex: 1 },
    { columnIndex: 3, rowIndex: 1 },
    { columnIndex: 4, rowIndex: 1 },
    { columnIndex: 5, rowIndex: 1 },
    cells.B,
    { columnIndex: 5, rowIndex: 2 },
    { columnIndex: 5, rowIndex: 3 },
    cells.C,
    { columnIndex: 5, rowIndex: 3 },
    { columnIndex: 4, rowIndex: 3 },
    { columnIndex: 4, rowIndex: 4 },
    { columnIndex: 3, rowIndex: 4 },
    { columnIndex: 3, rowIndex: 5 },
    { columnIndex: 2, rowIndex: 5 },
    cells.D,
    { columnIndex: 1, rowIndex: 6 },
    { columnIndex: 2, rowIndex: 6 },
    { columnIndex: 3, rowIndex: 6 },
    cells.E,
    { columnIndex: 5, rowIndex: 6 },
    { columnIndex: 6, rowIndex: 6 },
    cells.F,
  ];
  const route = routeCells.map(point);
  const waypoints = [
    { cell: cells.A, label: "A" },
    { cell: cells.B, label: "B" },
    { cell: cells.C, label: "C" },
    { cell: cells.D, label: "D" },
    { cell: cells.E, label: "E" },
    { cell: cells.F, label: "F" },
  ];
  const tree = [
    [{ columnIndex: 1, rowIndex: 1 }, { columnIndex: 1, rowIndex: 2 }, cells.S],
    [cells.B, { columnIndex: 5, rowIndex: 2 }],
    [cells.C, { columnIndex: 5, rowIndex: 3 }],
    [cells.D, { columnIndex: 1, rowIndex: 6 }],
    [cells.E, { columnIndex: 3, rowIndex: 6 }],
    [cells.E, { columnIndex: 5, rowIndex: 6 }, { columnIndex: 6, rowIndex: 6 }],
  ]
    .map((branch) => polyline(branch.map(point), "diagram-tree"))
    .join("");
  return diagramSvg("Robot w labiryncie / Maze runner", "Drzewo RRT, waypointy i promienie LiDAR.", `
    ${diagramHeader("Robot w labiryncie", "Maze runner")}
    ${diagramBlocks(rows, x, y, width, height, 8)}
    ${tree}
    ${polyline(route, "diagram-route")}
    ${waypoints.map(({ cell, label }) => waypointMarker(point(cell), label)).join("")}
    ${lidarRays(start, rows, x, y, width, height, 8)}
    <circle cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="8" class="diagram-drone"></circle>
    <text x="${start.x.toFixed(1)}" y="${(start.y + 22).toFixed(1)}" text-anchor="middle" class="diagram-small-label">S</text>
    ${diagramLegend([
      { className: "diagram-legend-grey", text: "drzewo RRT" },
      { className: "diagram-legend-green", text: "trasa" },
      { className: "diagram-legend-amber", text: "LiDAR 6 × 2 m" },
    ])}
  `);
}

function renderDiagram(item) {
  const captions = {
    boids: {
      pl: "Rysunek 1. Żółty dron reaguje tylko na sąsiadów w polu widzenia. Czerwone drony są za blisko i są odpychane, zielone wyznaczają wspólny kierunek i środek grupy, a szare pozostają poza zasięgiem.",
      en: "Figure 1. The yellow drone reacts only to neighbours inside its visual range. Red drones are too close and get pushed away, green ones set the shared heading and group centre, and grey ones stay out of range.",
    },
    "flock-maze": {
      pl: "Rysunek 2. Rój leci do jednego aktywnego waypointu naraz; zielona linia to trasa RRT, a pomarańczowe promienie to pomiary LiDAR — cztery poziome oraz po jednym w górę i w dół.",
      en: "Figure 2. The flock flies to one active waypoint at a time; the green line is the RRT route and the amber rays are LiDAR measurements — four horizontal plus one up and one down.",
    },
    "rrt-image": {
      pl: "Rysunek 3. Drzewo RRT* (niebieskie gałęzie) rozrasta się w przestrzeni z przeszkodami, a różowa linia to znaleziona trasa od startu do celu.",
      en: "Figure 3. An RRT* tree (blue branches) grows through the obstacle space, and the magenta line is the resulting path from start to goal.",
    },
  };
  let diagram;
  if (item.diagram === "rrt-image") {
    diagram = `<a class="recording-diagram-link" href="${item.imageSource}" target="_blank" rel="noopener noreferrer"><img class="recording-diagram-image" src="${item.image}" alt="${captions[item.diagram].pl}" /></a>`;
  } else if (item.diagram === "boids") {
    diagram = diagramBoids();
  } else {
    diagram = diagramFlockMaze();
  }
  el("recording-diagram").innerHTML = diagram;
  const source = item.imageSource
    ? `<a class="recording-source" href="${item.imageSource}" target="_blank" rel="noopener noreferrer">Źródło / Source &nearr;</a>`
    : "";
  el("recording-diagram-caption").innerHTML = `<span lang="pl">${captions[item.diagram].pl}</span><span class="recording-translation-text" lang="en">${captions[item.diagram].en}</span>${source}`;
}

function renderPoints(item) {
  const list = el("recording-points");
  if (!item.points) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = item.points
    .map(
      (point) => `<li>
        <span lang="pl">${point.pl}</span>
        <span class="recording-translation-text" lang="en">${point.en}</span>
      </li>`
    )
    .join("");
}

function renderFacts(item) {
  el("recording-facts").innerHTML = item.facts
    .map(
      (fact) => `<div class="recording-fact">
        <strong>${fact.value}</strong>
        <span lang="pl">${fact.labelPl}</span>
        <span class="recording-translation-text" lang="en">${fact.labelEn}</span>
      </div>`
    )
    .join("");
}

function renderSections(item) {
  el("recording-sections").innerHTML = item.sections
    .map(
      (section) => `<article class="recording-section">
        <div class="recording-section-index">${section.number}</div>
        <div class="recording-section-content">
          <h3><span lang="pl">${section.headingPl}</span><span class="recording-heading-en" lang="en">${section.headingEn}</span></h3>
          <div class="recording-section-copy">
            <p lang="pl">${section.bodyPl}</p>
            <p class="recording-translation-text" lang="en">${section.bodyEn}</p>
          </div>
          <div class="recording-formula">
            <div class="recording-formula-label"><span lang="pl">${section.formulaLabelPl}</span><span class="recording-heading-en" lang="en"> / ${section.formulaLabelEn}</span></div>
            <div class="recording-formula-line">${section.formulaEn}</div>
            <p lang="pl">${section.notePl}</p>
            <p class="recording-translation-text" lang="en">${section.noteEn}</p>
          </div>
        </div>
      </article>`
    )
    .join("");
}

function setupWhiteboard() {
  const toggle = el("whiteboard-toggle");
  const layout = document.querySelector(".recording-layout");
  const panel = el("recording-whiteboard");
  const frame = el("whiteboard-frame");
  if (!toggle || !layout || !panel || !frame) return;
  toggle.addEventListener("click", () => {
    const open = layout.classList.toggle("whiteboard-open");
    toggle.setAttribute("aria-pressed", String(open));
    panel.hidden = !open;
    if (open && !frame.dataset.loaded) {
      frame.src = "https://www.tldraw.com/";
      frame.dataset.loaded = "true";
    }
  });
}

if (!recording) {
  el("recording-label").textContent = "Nagranie";
  el("recording-label-en").textContent = "Recording";
  el("recording-title").textContent = "Nie znaleziono nagrania";
  el("recording-title-en").textContent = "Recording not found";
  el("recording-copy-pl").textContent = "Wybierz jedno z nagrań w galerii, aby obejrzeć je tutaj.";
  el("recording-copy-en").textContent = "Choose one of the recordings from the main gallery to watch it here.";
  document.querySelector(".recording-poster-visuals").hidden = true;
  document.querySelector(".recording-explanation").hidden = true;
} else {
  document.title = `${recording.titlePl} · Festiwal Nauki`;
  el("recording-label").textContent = recording.labelPl;
  el("recording-label-en").textContent = recording.labelEn;
  el("recording-title").textContent = recording.titlePl;
  el("recording-title-en").textContent = recording.titleEn;
  el("recording-copy-pl").textContent = recording.introPl;
  el("recording-copy-en").textContent = recording.introEn;
  video.innerHTML = `<source src="${recording.source}" type="video/mp4" />`;
  video.load();
  video.play().catch(() => {});
  renderPoints(recording);
  renderDiagram(recording);
  renderFacts(recording);
  renderSections(recording);
  setupWhiteboard();
}

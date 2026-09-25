const MAX_DOM_LINES = 2500;
const PALETTE = ["#006872", "#004a6c", "#c8c1b5", "#c0d1c8", "#3466af", "#e7a217", "#e63312", "#9a1006", "#552c4d"];
const SHOWCASE = globalThis.SWARM_RECORDINGS ?? [];

const state = {
  catalog: null,
  group: 0,
  tileId: null,
  showcaseId: SHOWCASE[0]?.id ?? null,
  values: {},
  runs: [],
  currentRunId: null,
  logSince: 0,
  source: null,
};

const el = (id) => document.getElementById(id);

function tile() {
  for (const group of state.catalog.groups) {
    for (const tile of group.tiles) {
      if (tile.id === state.tileId) return tile;
    }
  }
  return null;
}

function groupFor(tileId) {
  for (const group of state.catalog.groups) {
    if (group.tiles.some((t) => t.id === tileId)) return group;
  }
  return null;
}

function decimals(step) {
  if (!step) return 2;
  return Math.max(0, -Math.floor(Math.log10(step)));
}

function fmt(value, step) {
  return Number(value).toFixed(decimals(step));
}

function roundToStep(value, param) {
  const snapped = Math.round((value - param.minimum) / param.step) * param.step + param.minimum;
  return Number(snapped.toFixed(decimals(param.step)));
}

function defaultValues(tile) {
  return Object.fromEntries(tile.params.map((p) => [p.name, p.default]));
}

function mediaTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const minutesPart = Math.floor(total / 60);
  const secondsPart = String(total % 60).padStart(2, "0");
  if (minutesPart < 60) return `${minutesPart}:${secondsPart}`;
  return `${Math.floor(minutesPart / 60)}:${String(minutesPart % 60).padStart(2, "0")}:${secondsPart}`;
}

function renderShowcase() {
  el("showcase-grid").innerHTML = SHOWCASE.map((demo, index) => {
    const active = demo.id === state.showcaseId;
    return `<article class="showcase-tile ${active ? "active" : ""}" data-showcase-id="${demo.id}">
      <a class="showcase-select" href="recording.html?recording=${encodeURIComponent(demo.id)}" target="_blank" rel="noopener noreferrer" aria-current="${active ? "true" : "false"}" aria-label="Otwórz nagranie ${demo.titlePl} w nowej karcie / Open ${demo.titleEn} recording in a new tab">
        <span class="showcase-media">
          <video muted loop autoplay playsinline preload="metadata">
            <source src="${demo.source}" type="video/mp4" />
          </video>
          <span class="showcase-number">${String(index + 1).padStart(2, "0")}</span>
          <span class="showcase-play-state" data-playing="true" data-play-state>
            <span class="showcase-play-dot" aria-hidden="true"></span>
            <span data-play-label>Playing</span>
          </span>
        </span>
        <span class="showcase-copy">
          <span class="showcase-kicker">${demo.labelPl}</span>
          <span class="showcase-kicker-en" lang="en">${demo.labelEn}</span>
          <span class="showcase-title">${demo.titlePl}</span>
          <span class="showcase-title-en" lang="en">${demo.titleEn}</span>
          <span class="showcase-description" lang="pl">${demo.tilePl}</span>
          <span class="showcase-description showcase-description-en" lang="en">${demo.tileEn}</span>
        </span>
      </a>
      <div class="showcase-controls">
        <button class="showcase-toggle" type="button" data-playing="true" aria-label="Pauza / Pause — ${demo.titlePl}">
          <span class="showcase-play-icon" aria-hidden="true"></span>
        </button>
        <span class="showcase-time" data-showcase-current>0:00</span>
        <input class="showcase-seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Przewiń / Seek — ${demo.titlePl}" />
        <span class="showcase-time" data-showcase-duration>0:00</span>
      </div>
    </article>`;
  }).join("");

  el("showcase-grid").querySelectorAll(".showcase-tile").forEach((card) => {
    const id = card.dataset.showcaseId;
    const video = card.querySelector("video");
    const select = card.querySelector(".showcase-select");
    const toggle = card.querySelector(".showcase-toggle");
    const seek = card.querySelector(".showcase-seek");

    select.onclick = () => selectShowcase(id);
    toggle.onclick = () => {
      if (video.paused || video.ended) selectShowcase(id);
      else {
        video.pause();
        selectShowcase(id, false);
      }
    };
    seek.oninput = () => {
      selectShowcase(id, false);
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(Number(seek.value), Math.max(0, video.duration - 0.01));
      }
      updateShowcaseProgress(card, video);
    };

    video.addEventListener("loadedmetadata", () => updateShowcaseProgress(card, video));
    video.addEventListener("durationchange", () => updateShowcaseProgress(card, video));
    video.addEventListener("timeupdate", () => updateShowcaseProgress(card, video));
    video.addEventListener("seeked", () => updateShowcaseProgress(card, video));
    video.addEventListener("play", () => syncShowcasePlayback(card, video));
    video.addEventListener("pause", () => syncShowcasePlayback(card, video));
    updateShowcaseProgress(card, video);
    syncShowcasePlayback(card, video);
  });
}

function updateShowcaseProgress(card, video) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const current = duration > 0 ? Math.min(video.currentTime || 0, duration) : 0;
  const progress = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
  const seek = card.querySelector(".showcase-seek");

  seek.max = String(duration || 1);
  seek.value = String(current);
  seek.style.setProperty("--progress", `${progress * 100}%`);
  seek.setAttribute("aria-valuetext", `${mediaTime(current)} of ${mediaTime(duration)}`);
  card.querySelector("[data-showcase-current]").textContent = mediaTime(current);
  card.querySelector("[data-showcase-duration]").textContent = mediaTime(duration);
}

function syncShowcasePlayback(card, video) {
  const playing = !video.paused && !video.ended;
  const title = card.querySelector(".showcase-title").textContent;
  const toggle = card.querySelector(".showcase-toggle");
  const playbackState = card.querySelector("[data-play-state]");

  toggle.dataset.playing = String(playing);
  toggle.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${title}`);
  playbackState.dataset.playing = String(playing);
  playbackState.querySelector("[data-play-label]").textContent = playing ? "Playing" : "Paused";
}

function selectShowcase(id, autoplay = true) {
  const selected = SHOWCASE.find((demo) => demo.id === id);
  if (!selected) return;
  state.showcaseId = id;

  el("showcase-grid").querySelectorAll(".showcase-tile").forEach((card) => {
    const active = card.dataset.showcaseId === id;
    card.classList.toggle("active", active);
    card.querySelector(".showcase-select").setAttribute("aria-current", String(active));
    if (!active) return;

    const video = card.querySelector("video");
    if (autoplay && video.paused) {
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => {});
    }
  });
}

/* ---------- tiles ---------- */

function renderTabs() {
  el("group-tabs").innerHTML = state.catalog.groups
    .map(
      (group, index) =>
        `<button class="tab ${index === state.group ? "active" : ""}" data-index="${index}">${group.name}</button>`
    )
    .join("");
  el("group-tabs").querySelectorAll(".tab").forEach((button) => {
    button.onclick = () => {
      state.group = Number(button.dataset.index);
      renderTabs();
      renderTiles();
    };
  });
}

function renderTiles() {
  const group = state.catalog.groups[state.group];
  el("tiles").innerHTML = group.tiles
    .map(
      (tile) => `<button class="tile ${tile.id === state.tileId ? "active" : ""}" data-id="${tile.id}">
        <h3>${tile.title}</h3>
        <p>${tile.description}</p>
      </button>`
    )
    .join("");
  el("tiles").querySelectorAll(".tile").forEach((button) => {
    button.onclick = () => selectTile(button.dataset.id);
  });
}

function selectTile(tileId) {
  state.tileId = tileId;
  const found = tile();
  if (!(tileId in state.values)) state.values[tileId] = defaultValues(found);
  renderTiles();
  renderDetail();
}

/* ---------- parameters ---------- */

function controlFor(param) {
  const value = state.values[state.tileId][param.name];
  const isGuiSwitch = tile().kind === "entry" && param.name === "gui";

  if (param.kind === "float" || param.kind === "int") {
    const step = param.kind === "int" ? 1 : param.step;
    return `<div class="param-row">
      <input type="range" data-name="${param.name}" min="${param.minimum}" max="${param.maximum}" step="${step}" value="${value}" />
      <input type="number" class="value" data-name="${param.name}" min="${param.minimum}" max="${param.maximum}" step="${step}" value="${value}" />
    </div>`;
  }
  if (param.kind === "bool") {
    const note = isGuiSwitch ? "opens a PyBullet window on the machine running the server" : "";
    const disabled = isGuiSwitch && !state.catalog.has_display ? "disabled" : "";
    return `<label class="switch" title="${state.catalog.has_display ? note : "no display on the server"}">
      <input type="checkbox" data-name="${param.name}" ${value ? "checked" : ""} ${disabled} />
      <span>${value ? "on" : "off"}${isGuiSwitch ? " &middot; " + note : ""}</span>
    </label>`;
  }
  if (param.kind === "choice") {
    return `<select data-name="${param.name}">
      ${param.choices.map((choice) => `<option ${choice === value ? "selected" : ""}>${choice}</option>`).join("")}
    </select>`;
  }
  return `<input type="text" data-name="${param.name}" value="${value ?? ""}" placeholder="${param.help || ""}" />`;
}

function renderDetail() {
  const found = tile();
  el("detail-group").textContent = groupFor(found.id).name;
  el("detail-title").textContent = found.title;
  el("detail-description").textContent = found.description;

  el("params").innerHTML = found.params
    .map(
      (param) => `<div class="param">
        <div class="param-head">
          <span>${param.label}${param.required ? " *" : ""}</span>
          <span class="value">${fmt(state.values[state.tileId][param.name] ?? 0, param.step)}</span>
        </div>
        ${param.help ? `<p class="param-help">${param.help}</p>` : ""}
        ${controlFor(param)}
      </div>`
    )
    .join("");

  el("params").querySelectorAll("[data-name]").forEach((input) => {
    input.onchange = () => onParamChange(input);
  });
  el("params").querySelectorAll('input[type="range"]').forEach((input) => {
    input.oninput = () => onParamChange(input);
  });

  updatePreview();
}

function onParamChange(input) {
  const found = tile();
  const param = found.params.find((item) => item.name === input.dataset.name);
  let value;
  if (param.kind === "bool") value = input.checked;
  else if (param.kind === "float" || param.kind === "int") {
    value = roundToStep(Number(input.value), param);
    if (param.kind === "int") value = Math.round(value);
  } else value = input.value;

  state.values[state.tileId][param.name] = value;

  const card = input.closest(".param");
  card.querySelector(".param-head .value").textContent = fmt(value, param.step);
  const numberInput = card.querySelector('input[type="number"]');
  if (numberInput) numberInput.value = value;
  const rangeInput = card.querySelector('input[type="range"]');
  if (rangeInput && rangeInput !== input) rangeInput.value = value;
  if (param.kind === "bool") {
    const note = tile().kind === "entry" && param.name === "gui" ? " &middot; opens a PyBullet window on the machine running the server" : "";
    card.querySelector(".switch span").innerHTML = value ? `on${note}` : "off";
  }

  updatePreview();
}

let previewTimer = null;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const response = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tile_id: state.tileId, params: state.values[state.tileId] }),
    });
    const data = await response.json();
    el("command").textContent = data.command;
  }, 120);
}

/* ---------- runs ---------- */

async function refreshRuns() {
  const response = await fetch("/api/runs");
  const data = await response.json();
  state.runs = data.runs;
  el("run-counter").textContent = `${state.runs.length} run${state.runs.length === 1 ? "" : "s"}`;

  const select = el("run-select");
  const previous = state.currentRunId;
  select.innerHTML = state.runs
    .map((run) => `<option value="${run.id}">${run.id} &middot; ${run.title}</option>`)
    .join("");
  if (previous && state.runs.some((run) => run.id === previous)) select.value = previous;
  else if (state.runs.length) select.value = state.runs[0].id;
  state.currentRunId = select.value || null;

  renderRunHeader();
  if (!state.currentRunId) {
    el("stop").disabled = true;
    return;
  }
  const run = state.runs.find((item) => item.id === state.currentRunId);
  renderArtifacts(run);
  el("stop").disabled = !state.runs.some((item) => item.status === "running");
  el("stop-selected").disabled = run.status !== "running";
}

function renderRunHeader() {
  const run = state.runs.find((item) => item.id === state.currentRunId);
  el("run-status").textContent = run ? run.status : "none";
  el("run-status").className = `badge ${run ? run.status : ""}`;
  el("run-timer").textContent = run
    ? `${run.duration.toFixed(1)}s${run.exit_code === null ? "" : ` · exit ${run.exit_code}`}`
    : "";
}

function renderArtifacts(run) {
  const artifacts = run?.artifacts ?? [];
  const signature = JSON.stringify(artifacts);
  // Polling every 2s must not restart playback, so only rebuild on real changes.
  if (el("artifacts").dataset.signature === signature) return;
  el("artifacts").dataset.signature = signature;
  el("artifacts").innerHTML = artifacts
    .map((artifact) => {
      const source = artifact.preview_url || artifact.url;
      const media =
        artifact.kind === "video"
          ? `<video src="${source}" controls preload="metadata"></video>`
          : artifact.kind === "image"
            ? `<img src="${source}" alt="${artifact.name}" loading="lazy" />`
            : `<div class="artifact-meta">${(artifact.size / 1024).toFixed(1)} kB</div>`;
      const pending = artifact.kind === "video" && !source ? " · transcoding…" : "";
      return `<div class="artifact">
        ${media}
        <div class="artifact-meta"><a href="${artifact.url}" target="_blank">${artifact.name}</a>${pending}</div>
      </div>`;
    })
    .join("");
}

async function launch() {
  const found = tile();
  const response = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tile_id: state.tileId,
      params: state.values[state.tileId],
    }),
  });
  if (!response.ok) {
    const detail = await response.json();
    appendLine(`✗ ${detail.detail}\n`, "err");
    return;
  }
  const run = await response.json();
  await refreshRuns();
  el("run-select").value = run.id;
  state.currentRunId = run.id;
  state.logSince = 0;
  el("log").textContent = "";
  attachStream(run.id);
  renderRunHeader();
}

async function stopRun(runId) {
  await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
  await refreshRuns();
}

function attachStream(runId) {
  state.source?.close();
  state.source = new EventSource(`/api/runs/${runId}/log?since=${state.logSince}`);
  state.source.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.index < state.logSince) return;
    state.logSince = payload.index + 1;
    const line = payload.line;
    const cls = /Traceback|Error|error:/.test(line) ? "err" : line.startsWith("$") || line.startsWith("^") ? "head" : "";
    appendLine(line, cls);
  };
  state.source.addEventListener("end", () => {
    state.source.close();
    state.source = null;
    refreshRuns();
  });
}

function appendLine(line, cls = "") {
  const log = el("log");
  if (log.textContent === "Launch something to see its output here.") log.textContent = "";
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = line;
  log.appendChild(span);
  while (log.childNodes.length > MAX_DOM_LINES) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

/* ---------- boot ---------- */

async function boot() {
  document.querySelector(".palette-stripe").innerHTML = PALETTE.map((color) => `<span style="background:${color}"></span>`).join("");

  if (el("showcase-grid")) {
    renderShowcase();
    selectShowcase(state.showcaseId);
  }

  if (el("tiles")) {
    const response = await fetch("/api/catalog");
    state.catalog = await response.json();
    renderTabs();
    selectTile(state.catalog.groups[0].tiles[0].id);
    await refreshRuns();

    el("launch").onclick = launch;
    el("stop").onclick = () => {
      const busy = state.runs.find((run) => run.status === "running");
      if (busy) stopRun(busy.id);
    };
    el("stop-selected").onclick = () => state.currentRunId && stopRun(state.currentRunId);
    el("defaults").onclick = () => {
      state.values[state.tileId] = defaultValues(tile());
      renderDetail();
    };
    el("clear-log").onclick = () => {
      el("log").textContent = "";
    };
    el("run-select").onchange = () => {
      state.currentRunId = el("run-select").value;
      const run = state.runs.find((item) => item.id === state.currentRunId);
      state.logSince = 0;
      el("log").textContent = "";
      renderRunHeader();
      renderArtifacts(run);
      attachStream(run.id);
    };

    setInterval(() => {
      if (state.runs.length) refreshRuns();
    }, 2000);
  }
}

boot();

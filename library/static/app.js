"use strict";

const $ = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat("ru-RU").format(value ?? 0);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const state = {status:"all", color:"both", page:1, limit:24, playerId:"", eventId:"", federation:"", game:null, ply:0, request:0};
const statusNames = {accepted:"Подтверждено",quarantine:"На проверке",rejected:"Исключено",unclassified:"Не классифицировано"};
const reasonNames = {
  invalid_pgn:"Ошибка записи PGN", unfinished_game:"Незавершённая партия",
  same_player_both_colors:"Один FIDE ID у обоих игроков", unknown_game_date:"Дата партии неизвестна",
  unverified_official_event:"Официальное событие не подтверждено", ambiguous_official_event:"Событие определено неоднозначно",
  not_classical_event:"Контроль события не классический", unverified_otb_event:"Очный формат не подтверждён",
  missing_event_evidence:"Нет доказательства события", players_not_verified_in_event_roster:"Игроки не подтверждены в составе события",
  white_missing_fide_id:"Нет FIDE ID белых", black_missing_fide_id:"Нет FIDE ID чёрных",
  white_missing_historical_fide_rating:"Нет исторического рейтинга белых", black_missing_historical_fide_rating:"Нет исторического рейтинга чёрных",
  white_identity_name_mismatch:"Имя белых не совпадает с FIDE", black_identity_name_mismatch:"Имя чёрных не совпадает с FIDE",
  rating_not_above_threshold:"Рейтинг не выше порога 1800"
};
const pieces = {P:"♙",N:"♘",B:"♗",R:"♖",Q:"♕",K:"♔",p:"♟",n:"♞",b:"♝",r:"♜",q:"♛",k:"♚"};

async function api(path, signal) {
  const response = await fetch(path, {signal});
  let body;
  try { body = await response.json(); } catch { throw new Error("Сервер вернул некорректный ответ"); }
  if (!response.ok) throw new Error(body.error || `Ошибка ${response.status}`);
  return body;
}

function query() {
  const p = new URLSearchParams({status:state.status, page:String(state.page), limit:String(state.limit), color:state.color, sort:$("sort").value});
  if ($("year-from").value) p.set("from", $("year-from").value);
  if ($("year-to").value) p.set("to", $("year-to").value);
  const player = $("player-search").value.trim();
  const event = $("event-search").value.trim();
  const federation = $("federation-search").value.trim().toUpperCase();
  if (state.playerId) p.set("player_id", state.playerId);
  else if (player) p.set(/^\d+$/.test(player) ? "player_id" : "player", player);
  if (state.eventId) p.set("event_id", state.eventId);
  else if (event) p.set("event", event);
  if (state.federation || /^[A-Z]{3}$/.test(federation)) p.set("federation", state.federation || federation);
  return p;
}

function flag(value) { return value ? `<span class="flag" aria-hidden="true">${esc(value)}</span>` : `<span class="flag-placeholder" aria-hidden="true">◇</span>`; }
function rating(value) { return value ? ` · ${esc(value)} ELO` : ""; }
function gameRow(game) {
  const date = game.played_on || "Дата неизвестна";
  return `<button type="button" class="game-row" data-id="${game.id}" aria-label="Открыть партию ${esc(game.white_name)} против ${esc(game.black_name)}">
    <div class="game-info"><div class="tournament-name" title="${esc(game.tournament)}">${esc(game.tournament || "Турнир не указан")}</div>
      <div class="players-line">${flag(game.white_flag)}${esc(game.white_name || "?")}<span class="versus">vs</span>${flag(game.black_flag)}${esc(game.black_name || "?")}</div>
      <div class="subline">${esc(game.white_rating || "—")} : ${esc(game.black_rating || "—")} ELO${game.round ? ` · Раунд ${esc(game.round)}` : ""}</div></div>
    <div class="date-cell"><strong>${esc(date)}</strong></div>
    <div class="result-cell">${esc(game.result || "*")}</div>
    <div class="row-status"><span class="badge ${esc(game.status)}">${esc(statusNames[game.status] || game.status)}</span></div>
  </button>`;
}

async function loadGames() {
  const request = ++state.request;
  $("game-list").innerHTML = '<div class="loading-state">Загружаем партии…</div>';
  try {
    const result = await api(`/api/games?${query()}`);
    if (request !== state.request) return;
    $("results-count").textContent = number(result.total);
    $("game-list").innerHTML = result.games.length ? result.games.map(gameRow).join("") : '<div class="empty-state"><strong>Партий не найдено</strong>Измените фильтры или выберите другой статус проверки.</div>';
    const pages = Math.max(1, Math.ceil(result.total / state.limit));
    $("page-label").textContent = `Страница ${number(state.page)} из ${number(pages)}`;
    $("prev-page").disabled = state.page <= 1;
    $("next-page").disabled = state.page >= pages;
  } catch (error) {
    if (request !== state.request) return;
    $("game-list").innerHTML = `<div class="empty-state"><strong>Не удалось загрузить партии</strong>${esc(error.message)}<br><button type="button" id="retry">Повторить</button></div>`;
    $("results-count").textContent = "—";
    $("page-label").textContent = "—";
    $("retry").addEventListener("click", loadGames);
  }
}

async function loadOverview() {
  try {
    const data = await api("/api/overview");
    $("archive-total").textContent = number(data.games);
    for (const name of ["accepted","quarantine","rejected"]) $("count-" + name).textContent = number(data.status[name] || 0);
    $("count-all").textContent = number(data.games);
    const years = data.years.map((item) => item.year);
    const options = years.map((year) => `<option value="${year}">${year}</option>`).join("");
    $("year-from").insertAdjacentHTML("beforeend", options);
    $("year-to").insertAdjacentHTML("beforeend", options);
  } catch (error) {
    $("archive-total").textContent = "—";
    console.error("Overview:", error);
  }
}

function closeSuggestions() { document.querySelectorAll(".suggestions").forEach((node) => { node.hidden = true; }); }
function setupSuggest(inputId, boxId, endpoint, format, select) {
  const input = $(inputId), box = $(boxId);
  let timer = 0, serial = 0;
  input.addEventListener("input", () => {
    select(null);
    clearTimeout(timer);
    const value = input.value.trim();
    if (!value) { box.hidden = true; return; }
    const current = ++serial;
    timer = setTimeout(async () => {
      try {
        const results = await api(`${endpoint}?q=${encodeURIComponent(value)}`);
        if (current !== serial || input.value.trim() !== value) return;
        box.replaceChildren();
        for (const item of results) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "suggestion";
          const rendered = format(item);
          button.innerHTML = `<span>${rendered.main}</span><small>${rendered.meta}</small>`;
          button.addEventListener("click", () => { select(item); input.value = rendered.value; box.hidden = true; state.page = 1; loadGames(); });
          box.append(button);
        }
        box.hidden = !results.length;
      } catch { box.hidden = true; }
    }, 220);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") box.hidden = true;
    if (event.key === "Enter") { box.hidden = true; state.page = 1; loadGames(); }
  });
}

function safeLink(value) {
  try { const url = new URL(value); return ["http:","https:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function boardAt(ply) {
  if (!state.game) return;
  state.ply = Math.max(0, Math.min(ply, state.game.moves.length));
  const fen = state.ply ? state.game.moves[state.ply - 1].fen : state.game.initial_fen;
  const placement = fen.split(" ")[0].split("/");
  let html = "";
  placement.forEach((rank, row) => {
    let col = 0;
    for (const char of rank) {
      if (/\d/.test(char)) { for (let i = 0; i < Number(char); i++) html += square(row, col++, ""); }
      else html += square(row, col++, char);
    }
  });
  $("chess-board").innerHTML = html;
  $("move-position").textContent = `${state.ply} / ${state.game.moves.length}`;
  for (const [id, disabled] of [["move-first", state.ply === 0],["move-prev", state.ply === 0],["move-next", state.ply === state.game.moves.length],["move-last", state.ply === state.game.moves.length]]) $(id).disabled = disabled;
  document.querySelectorAll(".move-strip button").forEach((button) => { button.classList.toggle("active", Number(button.dataset.ply) === state.ply); });
  document.querySelector(".move-strip button.active")?.scrollIntoView({block:"nearest"});
}

function square(row, col, piece) {
  const shade = (row + col) % 2 ? "dark" : "light";
  const glyph = pieces[piece] ? `<span class="piece ${piece === piece.toUpperCase() ? "white" : "black"}">${pieces[piece]}</span>` : "";
  const coord = row === 7 ? `<span class="coord">${"abcdefgh"[col]}</span>` : "";
  return `<div class="square ${shade}">${glyph}${coord}</div>`;
}

function detailGridItem(label, value) { return `<div><span>${esc(label)}</span><strong title="${esc(value || "—")}">${esc(value || "—")}</strong></div>`; }
function renderGame(game) {
  state.game = game; state.ply = 0;
  $("drawer-title").textContent = game.tournament || "Партия";
  const source = safeLink(game.source_url), gameUrl = safeLink(game.game_url);
  const reasons = game.reasons?.length ? `<ul>${game.reasons.map((reason) => `<li>${esc(reasonNames[reason] || reason)}</li>`).join("")}</ul>` : "<p>Проверка не указала причин исключения.</p>";
  $("drawer-content").innerHTML = `<div class="matchup">
    <div class="match-player"><span class="name">${flag(game.white_flag)}${esc(game.white_name || "?")}</span><small>Белые${rating(game.white_rating)}</small></div>
    <span class="match-result">${esc(game.result || "*")}</span>
    <div class="match-player black"><span class="name">${flag(game.black_flag)}${esc(game.black_name || "?")}</span><small>Чёрные${rating(game.black_rating)}</small></div></div>
    <div class="board" id="chess-board" role="img" aria-label="Шахматная доска"></div>
    <div class="board-controls"><button id="move-first" type="button" aria-label="В начало">⏮</button><button id="move-prev" type="button" aria-label="Предыдущий ход">←</button><span id="move-position">0 / 0</span><button id="move-next" type="button" aria-label="Следующий ход">→</button><button id="move-last" type="button" aria-label="В конец">⏭</button></div>
    <div class="move-strip" aria-label="Ходы партии">${game.moves.length ? game.moves.map((m) => `<button type="button" data-ply="${m.ply}">${esc(m.label)}${esc(m.san)}</button>`).join("") : "Ходы не сохранены"}</div>
    <div class="detail-grid">${detailGridItem("Дата", game.played_on)}${detailGridItem("Раунд", game.round)}${detailGridItem("Дебют", game.opening || game.eco)}${detailGridItem("Ходов", Math.ceil(game.ply_count / 2))}${detailGridItem("Белые · FIDE ID", game.white_id)}${detailGridItem("Чёрные · FIDE ID", game.black_id)}${detailGridItem("Белые · федерация", game.white_fed ? `${game.white_fed} · ${game.white_fed_basis || "источник не указан"}` : "Не установлена")}${detailGridItem("Чёрные · федерация", game.black_fed ? `${game.black_fed} · ${game.black_fed_basis || "источник не указан"}` : "Не установлена")}</div>
    <div class="evidence"><h3><span class="badge ${esc(game.status)}">${esc(statusNames[game.status] || game.status)}</span></h3>${reasons}<p>Рейтинг в каталоге: исторический FIDE при наличии, иначе значение PGN. Скачанный PGN сохраняет исходные заголовки.</p><p>Источник: ${esc(game.source_kind || "не указан")}</p>${source ? `<p><a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Открыть исходный архив ↗</a></p>` : ""}${gameUrl ? `<p><a href="${esc(gameUrl)}" target="_blank" rel="noopener noreferrer">Открыть запись партии ↗</a></p>` : ""}</div>
    <div class="detail-actions"><a href="/api/games/${game.id}/pgn" download>Скачать PGN ↓</a></div>`;
  $("move-first").onclick = () => boardAt(0);
  $("move-prev").onclick = () => boardAt(state.ply - 1);
  $("move-next").onclick = () => boardAt(state.ply + 1);
  $("move-last").onclick = () => boardAt(game.moves.length);
  document.querySelectorAll(".move-strip button").forEach((button) => button.onclick = () => boardAt(Number(button.dataset.ply)));
  boardAt(0);
}

async function openGame(id) {
  $("drawer-backdrop").hidden = false;
  $("game-drawer").hidden = false;
  document.body.style.overflow = "hidden";
  $("drawer-title").textContent = "Загружаем партию";
  $("drawer-content").innerHTML = '<div class="loading-state">Открываем запись и PGN…</div>';
  try { renderGame(await api(`/api/games/${id}`)); }
  catch (error) { $("drawer-content").innerHTML = `<div class="empty-state"><strong>Партия недоступна</strong>${esc(error.message)}</div>`; }
}
function closeGame() { $("drawer-backdrop").hidden = true; $("game-drawer").hidden = true; document.body.style.overflow = ""; state.game = null; }

function initialize() {
  setupSuggest("player-search", "player-suggestions", "/api/players", (item) => ({main:`${flag(item.flag)}${esc(item.name)}`,meta:esc(item.fide_id || number(item.games)),value:item.name}), (item) => { state.playerId = item?.fide_id ? String(item.fide_id) : ""; });
  setupSuggest("event-search", "event-suggestions", "/api/events", (item) => ({main:esc(item.name),meta:number(item.games),value:item.name}), (item) => { state.eventId = item ? String(item.id) : ""; });
  setupSuggest("federation-search", "federation-suggestions", "/api/federations", (item) => ({main:`${flag(item.flag)}${esc(item.code)}`,meta:number(item.games),value:item.code}), (item) => { state.federation = item?.code || ""; });
  document.addEventListener("click", (event) => { if (!event.target.closest(".filter-section")) closeSuggestions(); });
  $("apply").onclick = () => { closeSuggestions(); state.page = 1; loadGames(); };
  $("reset").onclick = () => {
    for (const id of ["player-search","event-search","federation-search","year-from","year-to"]) $(id).value = "";
    state.playerId = state.eventId = state.federation = ""; state.color = "both"; state.page = 1;
    document.querySelectorAll("[data-color]").forEach((node) => node.classList.toggle("active", node.dataset.color === "both"));
    closeSuggestions(); loadGames();
  };
  document.querySelectorAll("[data-color]").forEach((button) => button.addEventListener("click", () => { state.color = button.dataset.color; document.querySelectorAll("[data-color]").forEach((node) => node.classList.toggle("active", node === button)); state.page = 1; loadGames(); }));
  document.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => { state.status = button.dataset.status; state.page = 1; document.querySelectorAll("[data-status]").forEach((node) => { node.classList.toggle("active", node === button); node.setAttribute("aria-selected", String(node === button)); }); loadGames(); }));
  $("sort").onchange = () => { state.page = 1; loadGames(); };
  $("prev-page").onclick = () => { if (state.page > 1) { state.page--; loadGames(); window.scrollTo({top:0,behavior:"smooth"}); } };
  $("next-page").onclick = () => { state.page++; loadGames(); window.scrollTo({top:0,behavior:"smooth"}); };
  $("game-list").addEventListener("click", (event) => { const row = event.target.closest(".game-row"); if (row) openGame(row.dataset.id); });
  $("close-drawer").onclick = closeGame;
  $("drawer-backdrop").onclick = closeGame;
  document.addEventListener("keydown", (event) => { if ($("game-drawer").hidden) return; if (event.key === "Escape") closeGame(); else if (state.game && event.key === "ArrowRight") boardAt(state.ply + 1); else if (state.game && event.key === "ArrowLeft") boardAt(state.ply - 1); });
  loadOverview(); loadGames();
}
document.addEventListener("DOMContentLoaded", initialize);

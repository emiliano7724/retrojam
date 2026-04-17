import { db } from "./firebase.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

// ========================================
// Estado global
// ========================================
const state = {
  screen: "home",
  roomId: null,
  userName: null,
  isFacilitator: false,
  facilName: null,
  boardName: null,
  connectedUsers: [],
  checklist: [],
  cards: [],
  spins: {},
  finalized: false,
  readOnlyMode: false,
  unsubscribers: [],
  presenceInterval: null,
  presenceRef: null,
};

// ========================================
// Navegación
// ========================================
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => {
    s.classList.add("hidden");
    s.classList.remove("active");
  });
  const target = document.getElementById(`screen-${name}`);
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }
  state.screen = name;

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.screen === name);
  });

  // El facilitador sincroniza la pantalla para todos
  if (state.isFacilitator && state.roomId) {
    updateDoc(doc(db, "rooms", state.roomId), { currentScreen: name }).catch(() => {});
  }

  if (name === "final") renderFinal();
}

// ========================================
// Helpers
// ========================================
function generarCodigo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return (
    "RETRO-" +
    Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("")
  );
}

function stopListeners() {
  state.unsubscribers.forEach((fn) => fn());
  state.unsubscribers = [];
}

function setupHeader() {
  document.getElementById("app-header").classList.remove("hidden");
  document.getElementById("app-nav").classList.remove("hidden");
  document.getElementById("header-room-code").textContent = state.roomId;
  document.getElementById("header-board-name").textContent = state.boardName || "";
}

// ========================================
// SCREEN: HOME
// ========================================
function initHome() {
  const btnCrear = document.getElementById("btn-crear");
  const btnUnirse = document.getElementById("btn-unirse");
  const btnEntrar = document.getElementById("btn-entrar");
  const btnCopyCode = document.getElementById("btn-copy-code");
  const errorDiv = document.getElementById("home-error");
  const codigoGeneradoDiv = document.getElementById("codigo-generado");
  const codigoDisplay = document.getElementById("codigo-display");

  function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove("hidden");
  }
  function clearError() {
    errorDiv.classList.add("hidden");
  }

  btnCrear.addEventListener("click", async () => {
    clearError();
    const nombre = document.getElementById("input-name").value.trim();
    if (!nombre) return showError("Ingresá tu nombre primero.");

    const codigo = generarCodigo();
    const boardName = document.getElementById("input-board-name").value.trim() || `Retro ${codigo}`;
    await setDoc(doc(db, "rooms", codigo), {
      id: codigo,
      titulo: boardName,
      createdAt: Date.now(),
      createdBy: nombre,
      currentScreen: "checklist",
    });
    state._pendingBoardName = boardName;

    codigoDisplay.textContent = codigo;
    codigoGeneradoDiv.classList.remove("hidden");

    state._pendingRoom = codigo;
    state._pendingName = nombre;
  });

  btnCopyCode.addEventListener("click", () => {
    navigator.clipboard.writeText(state._pendingRoom || "");
  });

  btnEntrar.addEventListener("click", () => {
    enterRoom(state._pendingRoom, state._pendingName, true, state._pendingName, state._pendingBoardName);
  });

  btnUnirse.addEventListener("click", async () => {
    clearError();
    const nombre = document.getElementById("input-name").value.trim();
    const codigo = document.getElementById("input-room").value.trim().toUpperCase();

    if (!nombre) return showError("Ingresá tu nombre.");
    if (!codigo) return showError("Ingresá el código de sala.");

    const roomRef = doc(db, "rooms", codigo);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return showError("Sala no encontrada. Verificá el código.");

    const data = snap.data();

    if (data.closedAt || data.finalizedAt) {
      const ok = confirm(
        `Esta sala está ${data.closedAt ? "cerrada" : "finalizada"}.\n\n¿Querés entrar en modo solo lectura para ver el contenido?`
      );
      if (!ok) return;
      enterRoom(codigo, nombre, false, data.createdBy, data.titulo, true);
      return;
    }

    const isFacilitador = data.createdBy === nombre;
    enterRoom(codigo, nombre, isFacilitador, data.createdBy, data.titulo);
  });
}

function enterRoom(roomId, userName, isFacilitator, facilName, boardName, readOnly = false) {
  // Limpiar estado de sesión anterior
  state.cards = [];
  state.checklist = [];
  state.spins = {};
  state.finalized = false;
  state.connectedUsers = [];

  // Limpiar UI de sesión anterior
  document.getElementById("checklist-list").innerHTML = "";
  document.getElementById("cards-feliz").innerHTML = "";
  document.getElementById("cards-triste").innerHTML = "";
  document.getElementById("cards-accionables").innerHTML = "";
  document.getElementById("sorteo-input").value = "";
  document.getElementById("sorteo-result-wrap").classList.add("hidden");
  document.getElementById("sorteo-result").textContent = "";
  document.getElementById("acordes-reales-wrap")?.classList.add("hidden");
  document.getElementById("final-actions-wrap")?.classList.add("hidden");
  document.getElementById("finalized-banner").classList.add("hidden");
  ["spin-persona-result","spin-estilo-result","spin-tonalidad-result","spin-acordes-result"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = "—"; });
  if (wheelSorteo) wheelSorteo.setOptions(["?"]);

  state.roomId = roomId;
  state.userName = userName;
  state.isFacilitator = isFacilitator;
  state.facilName = facilName || userName;
  state.boardName = boardName || roomId;
  state.readOnlyMode = readOnly;
  localStorage.setItem("roomId", roomId);
  localStorage.setItem("userName", userName);

  setupHeader();
  updateNavMode();
  startListeners();
  showScreen("checklist");
}

// ========================================
// SCREEN: CHECKLIST
// ========================================
function initChecklist() {
  document.getElementById("btn-add-checklist").addEventListener("click", addChecklistItem);
  document.getElementById("checklist-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addChecklistItem();
  });
}

async function addChecklistItem() {
  const input = document.getElementById("checklist-input");
  const texto = input.value.trim();
  if (!texto) return;

  await addDoc(collection(db, "checklist"), {
    roomId: state.roomId,
    texto,
    estado: "WIP",
    autor: state.userName,
    createdAt: Date.now(),
  });

  input.value = "";
}

function renderChecklist(items) {
  const list = document.getElementById("checklist-list");
  list.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "checklist-item";

    li.innerHTML = `
      <div>
        <span class="item-text">${escapeHtml(item.texto)}</span>
        <span class="item-autor">— ${escapeHtml(item.autor)}</span>
      </div>
      <div class="estado-btns">
        <button class="estado-btn ${item.estado === "OK"  ? "active-ok"  : ""}" data-id="${item.id}" data-estado="OK">OK</button>
        <button class="estado-btn ${item.estado === "WIP" ? "active-wip" : ""}" data-id="${item.id}" data-estado="WIP">WIP</button>
        <button class="estado-btn ${item.estado === "X"   ? "active-x"   : ""}" data-id="${item.id}" data-estado="X">X</button>
      </div>
    `;

    li.querySelectorAll(".estado-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await updateDoc(doc(db, "checklist", btn.dataset.id), {
          estado: btn.dataset.estado,
        });
      });
    });

    list.appendChild(li);
  });
}

// ========================================
// SCREEN: RETRO
// ========================================
const CARD_INPUTS = {
  feliz: "retro-feliz-input",
  triste: "retro-triste-input",
  accionable: "accionable-input",
};

function initRetro() {
  document.getElementById("btn-add-feliz").addEventListener("click", () => addCard("feliz"));
  document.getElementById("btn-add-triste").addEventListener("click", () => addCard("triste"));

  document.getElementById("retro-feliz-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCard("feliz"); }
  });
  document.getElementById("retro-triste-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCard("triste"); }
  });
}

function initAccionables() {
  document.getElementById("btn-add-accionable").addEventListener("click", () => addCard("accionable"));
  document.getElementById("accionable-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCard("accionable"); }
  });
}

async function addCard(tipo) {
  const input = document.getElementById(CARD_INPUTS[tipo]);
  if (!input) return;
  const texto = input.value.trim();
  if (!texto) return;

  await addDoc(collection(db, "cards"), {
    roomId: state.roomId,
    tipo,
    texto,
    autor: state.userName,
    createdAt: Date.now(),
  });

  input.value = "";
}

function renderCards(cards) {
  state.cards = cards;
  renderCardList("cards-feliz", cards.filter((c) => c.tipo === "feliz"));
  renderCardList("cards-triste", cards.filter((c) => c.tipo === "triste"));
  renderCardList("cards-accionables", cards.filter((c) => c.tipo === "accionable"));
}

function renderCardList(containerId, cards) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  cards.forEach((card) => {
    const isOwner = card.autor === state.userName && !state.finalized;
    const div = document.createElement("div");
    div.className = "retro-card";
    div.innerHTML = `
      <div class="card-body">
        <span class="card-texto">${escapeHtml(card.texto)}</span>
        <span class="card-autor">— ${escapeHtml(card.autor)}</span>
      </div>
      ${isOwner ? `<button class="btn-edit-card" title="Editar">✏️</button>` : ""}
    `;
    if (isOwner) {
      div.querySelector(".btn-edit-card").addEventListener("click", () => startEditCard(div, card));
    }
    container.appendChild(div);
  });
}

function startEditCard(div, card) {
  const body = div.querySelector(".card-body");
  const original = card.texto;
  body.innerHTML = `
    <textarea class="card-edit-input" maxlength="300" rows="2">${escapeHtml(original)}</textarea>
    <div class="card-edit-actions">
      <button class="btn-save-card btn-primary">Guardar</button>
      <button class="btn-cancel-card btn-secondary">Cancelar</button>
    </div>
  `;
  const textarea = body.querySelector(".card-edit-input");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  body.querySelector(".btn-save-card").addEventListener("click", async () => {
    const newText = textarea.value.trim();
    if (!newText || newText === original) return;
    await updateDoc(doc(db, "cards", card.id), { texto: newText });
    // onSnapshot re-renderiza automáticamente
  });

  body.querySelector(".btn-cancel-card").addEventListener("click", () => {
    body.innerHTML = `
      <span class="card-texto">${escapeHtml(original)}</span>
      <span class="card-autor">— ${escapeHtml(card.autor)}</span>
    `;
  });
}

// ========================================
// SpinWheel — rueda animada con Canvas
// ========================================
const WHEEL_COLORS = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#6a4c93", "#c9b458", "#e76f51", "#52b788"];

class SpinWheel {
  constructor(canvasId, options) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.options = options;
    this.currentAngle = 0;
    this.spinning = false;
    this.draw();
  }

  setOptions(options) {
    this.options = options;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const size = this.canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const r = cx - 14;
    const n = this.options.length;
    const arc = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, size, size);

    this.options.forEach((opt, i) => {
      const startAngle = this.currentAngle + i * arc;
      const endAngle = startAngle + arc;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "#0d0d0d";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${n > 6 ? 10 : 12}px Courier New`;
      const label = opt.length > 13 ? opt.slice(0, 12) + "…" : opt;
      ctx.fillText(label, r - 8, 4);
      ctx.restore();
    });

    // Centro
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
    ctx.fillStyle = "#0d0d0d";
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Puntero triangular arriba
    ctx.beginPath();
    ctx.moveTo(cx, 2);
    ctx.lineTo(cx - 10, 20);
    ctx.lineTo(cx + 10, 20);
    ctx.closePath();
    ctx.fillStyle = "#e63946";
    ctx.fill();
  }

  spin(targetIndex, onDone) {
    if (this.spinning) return;
    this.spinning = true;

    const n = this.options.length;
    const arc = (2 * Math.PI) / n;
    const targetAngle = -(Math.PI / 2) - (targetIndex * arc + arc / 2);
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const finalAngle = targetAngle - extraSpins * 2 * Math.PI;

    const startAngle = this.currentAngle;
    const duration = 3000 + Math.random() * 500;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.currentAngle = startAngle + (finalAngle - startAngle) * ease;
      this.draw();

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.spinning = false;
        onDone();
      }
    };

    requestAnimationFrame(animate);
  }
}

// ========================================
// SCREEN: SPINS
// ========================================
const ESTILOS = [
  "Rock", "Cumbia", "Trap", "Folklore", "Electrónica", "Cuarteto",
  "Hard Rock", "Thrash Metal", "Industrial Metal",
  "Metal + Cumbia", "Reggae + Trap", "Folklore + Electrónica",
  "Jazz + Trap", "Punk + Bossa Nova",
];

const SUNO_TAGS = {
  "Rock":                   "rock, electric guitar, drums, energetic, anthem",
  "Cumbia":                 "cumbia, latin percussion, accordion, danceable, festive",
  "Trap":                   "trap, 808 bass, hi-hats, dark, atmospheric, modern",
  "Folklore":               "folklore, acoustic guitar, chacarera, organic, traditional",
  "Electrónica":            "electronic, synth, four-on-the-floor, pulsing, hypnotic",
  "Cuarteto":               "cuarteto, accordion, bass, festive, danceable, upbeat",
  "Hard Rock":              "hard rock, distorted guitar, powerful drums, heavy, anthemic",
  "Thrash Metal":           "thrash metal, heavy guitar, double bass drum, aggressive, fast tempo",
  "Industrial Metal":       "industrial metal, distorted synth, heavy drums, mechanical, intense",
  "Metal + Cumbia":         "metal cumbia, heavy guitar, latin percussion, fusion, chaotic, fun",
  "Reggae + Trap":          "reggae trap, offbeat guitar, 808 bass, laid back, hybrid",
  "Folklore + Electrónica": "electronic folklore, acoustic guitar, synth pads, fusion, experimental",
  "Jazz + Trap":            "jazz trap, saxophone, 808, lo-fi, sophisticated, modern",
  "Punk + Bossa Nova":      "punk bossa nova, fast strumming, samba groove, rebellious, fun",
};
const PROGRESIONES = ["I-V-vi-IV", "ii-V-I", "I-IV-V", "vi-IV-I-V"];

// Círculo de quintas — sentido horario desde Do
const CIRCULO_QUINTAS = [
  { mayor: "Do",  menor: "Lam",   key: "C"  },
  { mayor: "Sol", menor: "Mim",   key: "G"  },
  { mayor: "Re",  menor: "Sim",   key: "D"  },
  { mayor: "La",  menor: "Fa#m",  key: "A"  },
  { mayor: "Mi",  menor: "Do#m",  key: "E"  },
  { mayor: "Si",  menor: "Sol#m", key: "B"  },
  { mayor: "Fa#", menor: "Re#m",  key: "F#" },
  { mayor: "Reb", menor: "Sibm",  key: "Db" },
  { mayor: "Lab", menor: "Fam",   key: "Ab" },
  { mayor: "Mib", menor: "Dom",   key: "Eb" },
  { mayor: "Sib", menor: "Solm",  key: "Bb" },
  { mayor: "Fa",  menor: "Rem",   key: "F"  },
];

// Grados diatónicos por tonalidad (I ii iii IV V vi vii)
const GRADOS_MAP = {
  "C":  ["C","Dm","Em","F","G","Am","Bdim"],
  "G":  ["G","Am","Bm","C","D","Em","F#dim"],
  "D":  ["D","Em","F#m","G","A","Bm","C#dim"],
  "A":  ["A","Bm","C#m","D","E","F#m","G#dim"],
  "E":  ["E","F#m","G#m","A","B","C#m","D#dim"],
  "B":  ["B","C#m","D#m","E","F#","G#m","A#dim"],
  "F#": ["F#","G#m","A#m","B","C#","D#m","Fdim"],
  "Db": ["Db","Ebm","Fm","Gb","Ab","Bbm","Cdim"],
  "Ab": ["Ab","Bbm","Cm","Db","Eb","Fm","Gdim"],
  "Eb": ["Eb","Fm","Gm","Ab","Bb","Cm","Ddim"],
  "Bb": ["Bb","Cm","Dm","Eb","F","Gm","Adim"],
  "F":  ["F","Gm","Am","Bb","C","Dm","Edim"],
};
const GRADO_IDX = { "I":0,"ii":1,"iii":2,"IV":3,"V":4,"vi":5,"vii":6 };

function traducirProgresion(keyCode, progresion) {
  const acordes = GRADOS_MAP[keyCode] || GRADOS_MAP["C"];
  return progresion.split("-").map(g => acordes[GRADO_IDX[g] ?? 0] || g).join(" - ");
}

function getAcordesRealesLabel() {
  const tonalidad = state.spins.tonalidad;
  const prog = state.spins.acordes?.resultado;
  if (!tonalidad || !prog) return null;

  // Los campos vienen directo del doc de Firestore — sin parsing
  const tonoMayor = tonalidad.resultado;
  const tonoMenor = tonalidad.menor;
  const keyCode   = tonalidad.keyCode;

  // Fallback si hay docs viejos sin los nuevos campos
  if (!tonoMayor || !keyCode) {
    const entry = CIRCULO_QUINTAS[0];
    return {
      tonoMayor: entry.mayor,
      tonoMenor: entry.menor,
      keyCode: entry.key,
      acordesReales: traducirProgresion(entry.key, prog),
    };
  }

  const acordesReales = traducirProgresion(keyCode, prog);
  return { tonoMayor, tonoMenor: tonoMenor || "", keyCode, acordesReales };
}

let wheelPersona, wheelEstilo, wheelTonalidad, wheelProgresion;

function initSpins() {
  wheelPersona    = new SpinWheel("wheel-persona", ["Esperando..."]);
  wheelEstilo     = new SpinWheel("wheel-estilo", ESTILOS);
  wheelTonalidad  = new SpinWheel("wheel-tonalidad", CIRCULO_QUINTAS.map(t => `${t.mayor}/${t.menor}`));
  wheelProgresion = new SpinWheel("wheel-progresion", PROGRESIONES);

  document.getElementById("btn-spin-persona").addEventListener("click", spinPersona);
  document.getElementById("btn-spin-estilo").addEventListener("click", spinEstilo);
  document.getElementById("btn-spin-tonalidad").addEventListener("click", spinTonalidad);
  document.getElementById("btn-spin-progresion").addEventListener("click", spinProgresion);
}

async function spinPersona() {
  const lista = state.connectedUsers;
  if (!lista.length) return;
  const idx = Math.floor(Math.random() * lista.length);
  wheelPersona.spin(idx, async () => {
    const elegido = lista[idx];
    await saveSpin("persona", elegido);
    document.getElementById("spin-persona-turn").textContent = `→ ${elegido} gira la próxima ruleta`;
  });
}

async function spinEstilo() {
  const idx = Math.floor(Math.random() * ESTILOS.length);
  wheelEstilo.spin(idx, async () => {
    await saveSpin("estilo", ESTILOS[idx]);
  });
}

async function spinTonalidad() {
  const idx = Math.floor(Math.random() * CIRCULO_QUINTAS.length);
  wheelTonalidad.spin(idx, async () => {
    const t = CIRCULO_QUINTAS[idx];
    // Guardar campos separados — sin parsing de string
    state.spins.tonalidad = {
      resultado: t.mayor,
      menor: t.menor,
      keyCode: t.key,
      createdAt: Date.now(),
    };
    renderAcordesReales();
    await addDoc(collection(db, "spins"), {
      roomId: state.roomId,
      tipo: "tonalidad",
      resultado: t.mayor,
      menor: t.menor,
      keyCode: t.key,
      createdAt: Date.now(),
    });
  });
}

async function spinProgresion() {
  const idx = Math.floor(Math.random() * PROGRESIONES.length);
  wheelProgresion.spin(idx, async () => {
    const resultado = PROGRESIONES[idx];
    state.spins.acordes = { resultado, createdAt: Date.now() };
    renderAcordesReales();
    await saveSpin("acordes", resultado);
  });
}

function renderAcordesReales() {
  const info = getAcordesRealesLabel();
  if (!info) return;

  const tonoLabel = `${info.tonoMayor} mayor / ${info.tonoMenor} menor`;

  // Resultado en la card de tonalidad
  const elTono = document.getElementById("spin-tonalidad-result");
  if (elTono) elTono.textContent = tonoLabel;

  // Resultado en la card de progresión
  const el = document.getElementById("spin-acordes-result");
  if (el) el.textContent = info.acordesReales;

  // Panel combinado debajo de las ruletas
  const wrap = document.getElementById("acordes-reales-wrap");
  const display = document.getElementById("acordes-reales-display");
  if (wrap && display) {
    display.textContent = `${tonoLabel} · ${info.acordesReales}`;
    wrap.classList.remove("hidden");
  }
}

async function saveSpin(tipo, resultado) {
  await addDoc(collection(db, "spins"), {
    roomId: state.roomId,
    tipo,
    resultado,
    createdAt: Date.now(),
  });
}

function renderSpins(spins) {
  const byTipo = {};
  spins.forEach((s) => {
    if (!byTipo[s.tipo] || s.createdAt > byTipo[s.tipo].createdAt) {
      // Preservar campos extra (menor, keyCode para tonalidad)
      byTipo[s.tipo] = { ...s };
    }
  });
  state.spins = byTipo;

  setSpinResult("persona", byTipo.persona?.resultado);
  setSpinResult("estilo", byTipo.estilo?.resultado);

  // Tonalidad y progresión → acordes reales
  if (byTipo.tonalidad && byTipo.acordes) {
    renderAcordesReales();
  } else if (byTipo.tonalidad) {
    setSpinResult("tonalidad", byTipo.tonalidad.resultado);
  }

  // Compositor del sorteo → notificar a todos
  if (byTipo.compositor?.resultado) {
    const ganadorEl = document.getElementById("sorteo-result");
    const wrapEl = document.getElementById("sorteo-result-wrap");
    if (ganadorEl) ganadorEl.textContent = byTipo.compositor.resultado;
    if (wrapEl) wrapEl.classList.remove("hidden");
  }

  updateFinalActions();
}

function setSpinResult(tipo, resultado) {
  const el = document.getElementById(`spin-${tipo}-result`);
  if (el) el.textContent = resultado || "—";
}

// ========================================
// SCREEN: FINAL
// ========================================
function renderFinal() {
  const estilo = state.spins.estilo?.resultado || "—";
  const acordes = state.spins.acordes?.resultado || "—";

  document.getElementById("final-estilo").textContent = estilo;
  document.getElementById("final-acordes").textContent = acordes;

  generarLetra();
  updateFinalActions();
}

function generarLetra() {
  const felices = state.cards.filter((c) => c.tipo === "feliz");
  const tristes = state.cards.filter((c) => c.tipo === "triste");
  const estilo = state.spins.estilo?.resultado || "Rock";
  const info = getAcordesRealesLabel();
  const acordesStr = info
    ? `${info.tonoMayor} mayor (${info.acordesReales})`
    : (state.spins.acordes?.resultado || "I-V-vi-IV");

  const promptIA = `Sos un compositor. Escribí la letra de una canción de estilo ${estilo} con progresión de acordes ${acordesStr}.

La canción refleja la retrospectiva de un equipo de tech. Inspirate en esto:

${felices.map((c) => c.texto).join("\n") || "(sin entradas)"}

${tristes.map((c) => c.texto).join("\n") || "(sin entradas)"}

Tono: divertido, energético, celebrando el trabajo en equipo.
Estructura: estrofa, coro, estrofa, coro, outro.
Máximo 20 líneas.`.slice(0, 5000);

  document.getElementById("letra-textarea").value = promptIA;
  actualizarPrompt();
}

function actualizarPrompt() {
  const estilo = state.spins.estilo?.resultado || "Rock";
  const tags = SUNO_TAGS[estilo] || estilo.toLowerCase();
  const info = getAcordesRealesLabel();

  let chordsLine = "";
  if (info) {
    chordsLine = `\nkey of ${info.tonoMayor} major\nchord progression: ${info.acordesReales}`;
  } else if (state.spins.acordes?.resultado) {
    chordsLine = `\nchord progression: ${state.spins.acordes.resultado}`;
  }

  const sunoPrompt = `${tags}, fun, upbeat, team retrospective${chordsLine}`;
  document.getElementById("prompt-preview").textContent = sunoPrompt;
}

function initFinal() {
  document.getElementById("btn-copy-prompt").addEventListener("click", async () => {
    const prompt = document.getElementById("letra-textarea").value;
    await navigator.clipboard.writeText(prompt);
    const confirm = document.getElementById("copy-confirm");
    confirm.classList.remove("hidden");
    setTimeout(() => confirm.classList.add("hidden"), 2000);
  });

  document.getElementById("btn-copy-suno").addEventListener("click", async () => {
    const prompt = document.getElementById("prompt-preview").textContent;
    await navigator.clipboard.writeText(prompt);
  });

  document.getElementById("btn-regenerar").addEventListener("click", generarLetra);
  document.getElementById("btn-export-pdf").addEventListener("click", generatePDF);
  document.getElementById("btn-finalize").addEventListener("click", finalizeRoom);
}

function updateFinalActions() {
  const sorteoHecho = !!state.spins.compositor?.resultado;
  const wrap = document.getElementById("final-actions-wrap");
  if (!wrap) return;

  // El wrapper con warning + botones aparece cuando el sorteo está hecho
  wrap.classList.toggle("hidden", !sorteoHecho);

  // PDF: visible para todos tras el sorteo
  const btnPdf = document.getElementById("btn-export-pdf");
  if (btnPdf) btnPdf.classList.toggle("hidden", !sorteoHecho);

  // Finalizar: solo facilitador, solo si no está ya finalizado
  const btnFin = document.getElementById("btn-finalize");
  if (btnFin) btnFin.classList.toggle("hidden", !sorteoHecho || !state.isFacilitator || state.finalized);
}

// ========================================
// Listeners Firestore
// ========================================
function startListeners() {
  stopListeners();

  const roomId = state.roomId;

  const sortByCreatedAt = (a, b) => a.createdAt - b.createdAt;

  // Checklist
  const unsubChecklist = onSnapshot(
    query(collection(db, "checklist"), where("roomId", "==", roomId)),
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByCreatedAt);
      state.checklist = items;
      renderChecklist(items);
    }
  );

  // Cards
  const unsubCards = onSnapshot(
    query(collection(db, "cards"), where("roomId", "==", roomId)),
    (snap) => {
      const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByCreatedAt);
      renderCards(cards);
      if (state.screen === "final") renderFinal();
    }
  );

  // Spins
  const unsubSpins = onSnapshot(
    query(collection(db, "spins"), where("roomId", "==", roomId)),
    (snap) => {
      const spins = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(sortByCreatedAt);
      renderSpins(spins);
      if (state.screen === "final") renderFinal();
    }
  );

  state.unsubscribers.push(unsubChecklist, unsubCards, unsubSpins);

  watchRoom(roomId);
  startPresence(roomId);

  if (state.readOnlyMode) {
    // Esperar a que los listeners rendericen el contenido antes de bloquear
    setTimeout(lockUI, 600);
  }
}

// ========================================
// Presencia y sala en tiempo real
// ========================================
function watchRoom(roomId) {
  const unsubRoom = onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    if (data.closedAt && !state.isFacilitator && !state.readOnlyMode) {
      showSalaCerrada();
      return;
    }

    if (data.finalizedAt && !state.finalized) {
      state.finalized = true;
      // Todos pasan a modo solo lectura con navegación libre
      state.readOnlyMode = true;
      lockUI();
    }

    // Sincronizar lista de participantes del sorteo
    if (data.sorteoParticipantes !== undefined) {
      applySorteoParticipantes(data.sorteoParticipantes);
    }

    // Solo seguir al facilitador si no somos facilitador NI estamos en modo solo lectura
    if (!state.isFacilitator && !state.readOnlyMode && data.currentScreen && data.currentScreen !== state.screen) {
      showScreen(data.currentScreen);
    }
  });
  state.unsubscribers.push(unsubRoom);
}

// ========================================
// Finalizar y bloquear sesión
// ========================================
async function finalizeRoom() {
  if (!state.isFacilitator) return;
  const ok = confirm("¿Finalizar la retro? La sesión quedará en modo lectura para todos.");
  if (!ok) return;
  await updateDoc(doc(db, "rooms", state.roomId), { finalizedAt: Date.now() });
}

function lockUI() {
  state.finalized = true;

  // Deshabilitar inputs y textareas
  document.querySelectorAll("input, textarea").forEach((el) => (el.disabled = true));

  // Deshabilitar botones de acción (excepto los de copia, PDF y salir)
  const keep = new Set(["btn-leave", "btn-copy-room", "btn-copy-prompt",
                         "btn-copy-suno", "btn-export-pdf"]);
  document.querySelectorAll("button").forEach((el) => {
    if (!keep.has(el.id)) el.disabled = true;
  });

  // Ocultar botones de escritura
  ["btn-add-checklist", "btn-add-feliz", "btn-add-triste", "btn-add-accionable",
   "btn-spin-persona", "btn-spin-estilo", "btn-spin-tonalidad", "btn-spin-progresion",
   "btn-spin-sorteo", "btn-finalize", "btn-regenerar"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  document.getElementById("finalized-banner").classList.remove("hidden");

  // En modo solo lectura los nav buttons deben seguir habilitados
  if (state.readOnlyMode) {
    updateNavMode();
  }
}

// ========================================
// Exportar PDF
// ========================================
function generatePDF() {
  if (!window.jspdf) return alert("La librería PDF no está disponible.");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210;
  const M = 14;
  const CW = W - M * 2;
  let y = 0;

  function newPage() { pdf.addPage(); y = 20; }
  function guard(h = 8) { if (y + h > 282) newPage(); }

  function section(title) {
    guard(12);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(200, 60, 60);
    pdf.text(title, M, y);
    y += 2;
    pdf.setDrawColor(200, 60, 60);
    pdf.line(M, y, W - M, y);
    y += 5;
    pdf.setTextColor(30, 30, 30);
  }

  function line(text, indent = 0, bold = false) {
    guard(7);
    pdf.setFontSize(9.5);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    const lines = pdf.splitTextToSize(text, CW - indent);
    pdf.text(lines, M + indent, y);
    y += lines.length * 5.5;
  }

  function gap(n = 4) { y += n; }

  // ── Header ──
  pdf.setFillColor(13, 13, 13);
  pdf.rect(0, 0, W, 28, "F");
  pdf.setTextColor(230, 57, 70);
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text("RetroJam", M, 14);
  pdf.setTextColor(200, 200, 200);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  pdf.text(`Sala: ${state.roomId}   |   ${fecha}`, M, 22);
  y = 36;
  pdf.setTextColor(30, 30, 30);

  // ── Checklist ──
  if (state.checklist.length) {
    section("CHECKLIST");
    const ico = { OK: "[OK]", WIP: "[WIP]", X: "[X]" };
    state.checklist.forEach((item) => {
      line(`${ico[item.estado] || "[ ]"} ${item.texto}   — ${item.autor}`, 2);
    });
    gap();
  }

  // ── Cards felices ──
  const felices = state.cards.filter((c) => c.tipo === "feliz");
  if (felices.length) {
    section("CANCIONES FELICES");
    felices.forEach((c) => line(`+ ${c.texto}   — ${c.autor}`, 2));
    gap();
  }

  // ── Cards tristes ──
  const tristes = state.cards.filter((c) => c.tipo === "triste");
  if (tristes.length) {
    section("CANCIONES TRISTES PARA VOLVERNOS MEJOR");
    tristes.forEach((c) => line(`- ${c.texto}   — ${c.autor}`, 2));
    gap();
  }

  // ── Accionables ──
  const accionables = state.cards.filter((c) => c.tipo === "accionable");
  if (accionables.length) {
    section("ACCIONABLES — CANCIONES A SACAR PARA LA PROXIMA SESION");
    accionables.forEach((c) => line(`> ${c.texto}   — ${c.autor}`, 2));
    gap();
  }

  // ── Ruletas ──
  section("RESULTADO DE RULETAS");
  line(`Estilo musical:  ${state.spins.estilo?.resultado || "—"}`, 2, true);
  line(`Acordes:         ${state.spins.acordes?.resultado || "—"}`, 2, true);
  if (state.spins.persona?.resultado)    line(`Participante:    ${state.spins.persona.resultado}`, 2);
  line(`Proximo compositor de la retro: ${state.spins.compositor?.resultado || "—"}`, 2, true);
  gap();

  // ── Prompt IA ──
  const promptIA = document.getElementById("letra-textarea")?.value?.trim();
  if (promptIA) {
    section("PROMPT PARA IA (ChatGPT / Gemini)");
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(60, 60, 60);
    const iaLines = pdf.splitTextToSize(promptIA, CW - 2);
    iaLines.forEach((l) => { guard(5); pdf.text(l, M + 2, y); y += 5; });
    pdf.setTextColor(30, 30, 30);
    gap();
  }

  // ── Prompt Suno ──
  const promptSuno = document.getElementById("prompt-preview")?.textContent?.trim();
  if (promptSuno) {
    section("PROMPT PARA SUNO");
    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "italic");
    pdf.setTextColor(60, 60, 60);
    const sunoLines = pdf.splitTextToSize(promptSuno, CW - 2);
    sunoLines.forEach((l) => { guard(5); pdf.text(l, M + 2, y); y += 5; });
  }

  // ── Footer en cada página ──
  const total = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(160, 160, 160);
    pdf.text(`RetroJam  ·  Sala ${state.roomId}  ·  ${fecha}  ·  Pag ${i}/${total}`, M, 291);
  }

  pdf.save(`retrojam-${state.roomId}.pdf`);
}

function startPresence(roomId) {
  const presenceId = `${roomId}_${state.userName}`;
  const ref = doc(db, "presence", presenceId);
  state.presenceRef = ref;

  const heartbeat = () => setDoc(ref, {
    roomId,
    userName: state.userName,
    lastSeen: Date.now(),
    active: true,
  }, { merge: true });

  heartbeat();
  state.presenceInterval = setInterval(heartbeat, 20000);

  const unsubPresence = onSnapshot(
    query(collection(db, "presence"), where("roomId", "==", roomId)),
    (snap) => renderConnected(snap.docs.map((d) => d.data()))
  );
  state.unsubscribers.push(unsubPresence);
}

function renderConnected(presences) {
  const now = Date.now();
  const online = presences.filter((p) => p.active && now - p.lastSeen < 45000);

  // Actualizar lista de conectados en state (para la ruleta de participante)
  state.connectedUsers = online.map((p) => p.userName);
  if (wheelPersona) {
    wheelPersona.setOptions(state.connectedUsers.length ? state.connectedUsers : ["?"]);
  }

  const el = document.getElementById("connected-users");
  el.innerHTML = online.map((p) => {
    const isMe = p.userName === state.userName;
    const isFacil = p.userName === state.facilName;
    return `<span class="user-dot${isMe ? " me" : ""}${isFacil ? " facilitator" : ""}">${escapeHtml(p.userName)}${isFacil ? " ⭐" : ""}</span>`;
  }).join("");
}

// ========================================
// Salir de la sala
// ========================================
async function leaveRoom() {
  if (state.isFacilitator) {
    const cerrar = confirm("¿Cerrar la sala para todos los participantes?\n\nCancelar = solo vos salís.");
    if (cerrar) {
      await updateDoc(doc(db, "rooms", state.roomId), { closedAt: Date.now() }).catch(() => {});
    }
  }

  if (state.presenceRef) {
    await updateDoc(state.presenceRef, { active: false }).catch(() => {});
  }
  if (state.presenceInterval) {
    clearInterval(state.presenceInterval);
    state.presenceInterval = null;
  }

  stopListeners();
  localStorage.removeItem("roomId");
  localStorage.removeItem("userName");

  state.roomId = null;
  state.userName = null;
  state.isFacilitator = false;
  state.facilName = null;
  state.boardName = null;
  state.cards = [];
  state.spins = {};
  state.finalized = false;
  state.readOnlyMode = false;
  state.presenceRef = null;

  // Restablecer UI bloqueada por lockUI
  document.querySelectorAll("input, textarea").forEach((el) => (el.disabled = false));
  document.querySelectorAll("button").forEach((el) => (el.disabled = false));
  document.getElementById("finalized-banner").classList.add("hidden");

  document.getElementById("app-header").classList.add("hidden");
  document.getElementById("app-nav").classList.add("hidden");
  document.getElementById("connected-users").innerHTML = "";
  showScreen("home");
}

function showSalaCerrada() {
  document.getElementById("sala-cerrada-overlay").classList.remove("hidden");
}

function initSalaCerrada() {
  document.getElementById("btn-sala-cerrada-ok").addEventListener("click", async () => {
    document.getElementById("sala-cerrada-overlay").classList.add("hidden");
    state.isFacilitator = false; // evitar loop
    await leaveRoom();
  });
}

// ========================================
// XSS helper
// ========================================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ========================================
// Header
// ========================================
function initHeaderCopy() {
  document.getElementById("btn-copy-room").addEventListener("click", () => {
    if (state.roomId) navigator.clipboard.writeText(state.roomId);
  });
  document.getElementById("btn-leave").addEventListener("click", leaveRoom);
}

// ========================================
// Nav buttons
// ========================================
function updateNavMode() {
  const lockLabel = document.getElementById("nav-lock-label");
  const canNav = state.isFacilitator || state.readOnlyMode;
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.disabled = !canNav;
    b.classList.toggle("nav-locked", !canNav);
  });
  // Mostrar el lock label solo a participantes activos (no facilitador, no solo lectura)
  lockLabel.classList.toggle("hidden", canNav);
}

function initNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!state.isFacilitator && !state.readOnlyMode) return;
      showScreen(btn.dataset.screen);
    });
  });
}

// ========================================
// SCREEN: SORTEO
// ========================================
let wheelSorteo;

let _sorteoDebounce = null;

function initSorteo() {
  wheelSorteo = new SpinWheel("wheel-sorteo", ["?"]);

  const input = document.getElementById("sorteo-input");

  // Solo el facilitador puede escribir; sincroniza a Firestore con debounce
  input.addEventListener("input", () => {
    if (!state.isFacilitator) return;
    const lista = getSorteoListFromInput();
    wheelSorteo.setOptions(lista.length ? lista : ["?"]);

    clearTimeout(_sorteoDebounce);
    _sorteoDebounce = setTimeout(() => {
      if (state.roomId) {
        updateDoc(doc(db, "rooms", state.roomId), {
          sorteoParticipantes: input.value.trim(),
        }).catch(() => {});
      }
    }, 600);
  });

  document.getElementById("btn-spin-sorteo").addEventListener("click", async () => {
    const lista = getSorteoListFromInput();
    if (!lista.length) return;
    const idx = Math.floor(Math.random() * lista.length);
    wheelSorteo.spin(idx, async () => {
      const ganador = lista[idx];
      document.getElementById("sorteo-result").textContent = ganador;
      document.getElementById("sorteo-result-wrap").classList.remove("hidden");
      state.spins.compositor = { resultado: ganador, createdAt: Date.now() };
      updateFinalActions();
      await saveSpin("compositor", ganador).catch(() => {});
    });
  });
}

function getSorteoListFromInput() {
  return document.getElementById("sorteo-input").value
    .split(",").map((s) => s.trim()).filter(Boolean);
}

function applySorteoParticipantes(valor) {
  const input = document.getElementById("sorteo-input");
  if (!input || state.isFacilitator) return; // facilitador ya lo ve en su input
  input.value = valor || "";
  const lista = valor ? valor.split(",").map(s => s.trim()).filter(Boolean) : [];
  if (wheelSorteo) wheelSorteo.setOptions(lista.length ? lista : ["?"]);
}

// ========================================
// Init
// ========================================
function init() {
  initHome();
  initChecklist();
  initRetro();
  initSpins();
  initFinal();
  initAccionables();
  initSorteo();
  initSalaCerrada();
  initNav();
  initHeaderCopy();

  // Restaurar sesión si ya hay datos en localStorage
  const savedRoom = localStorage.getItem("roomId");
  const savedName = localStorage.getItem("userName");
  if (savedRoom && savedName) {
    getDoc(doc(db, "rooms", savedRoom)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.closedAt) return;

      const isFacilitator = data.createdBy === savedName;
      state.roomId = savedRoom;
      state.userName = savedName;
      state.isFacilitator = isFacilitator;
      state.facilName = data.createdBy;
      state.boardName = data.titulo || savedRoom;
      setupHeader();
      updateNavMode();
      startListeners();
      showScreen(data.currentScreen || "checklist");
    });
  }
}

init();

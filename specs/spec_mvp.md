# 🎸 Retro Music Spartans – Spec MVP (v1.1)

## 🧭 Objetivo

Aplicación web colaborativa para realizar retrospectivas de equipo con dinámica creativa, generando una canción a partir de los resultados. La sesión culmina con un sorteo del próximo compositor y exportación en PDF.

---

# 🧑‍💻 Stack

- **Frontend:** HTML + CSS + JS (vanilla), Inter + Space Grotesk (Google Fonts)
- **Backend:** Firebase Firestore (realtime vía `onSnapshot`)
- **PDF:** jsPDF (CDN)
- **Deploy:** Vercel / Netlify

---

# 🧱 Arquitectura

```
[ Browser ] —— Firebase SDK ——> [ Firestore DB ]
```

- Sin backend propio
- Realtime vía `onSnapshot`
- Sin auth real — nombre por input + localStorage

---

# 📦 Firebase Config

```js
const firebaseConfig = {
  apiKey: "AIzaSyDbWVawfCv0yaZ_1qwh8dzMSeI45HDYfJQ",
  authDomain: "retrojam-e79c2.firebaseapp.com",
  projectId: "retrojam-e79c2",
  storageBucket: "retrojam-e79c2.firebasestorage.app",
  messagingSenderId: "3079071483",
  appId: "1:3079071483:web:3d486f1a1f01dc113f725e",
  measurementId: "G-JQ438Y9KYM"
};
```

---

# 📊 Modelo de Datos (Firestore)

## `rooms`
```json
{
  "id": "RETRO-XK7M",
  "titulo": "Sprint 2 Q3",
  "createdAt": 1710000000,
  "createdBy": "Emi",
  "currentScreen": "checklist",
  "sorteoParticipantes": "Emi, Juan, Pedro",
  "finalizedAt": null,
  "closedAt": null
}
```

## `presence`
```json
{
  "roomId": "RETRO-XK7M",
  "userName": "Juan",
  "lastSeen": 1710000000,
  "active": true
}
```

## `checklist`
```json
{
  "roomId": "RETRO-XK7M",
  "texto": "Deploy a producción",
  "estado": "OK",
  "autor": "Emi",
  "createdAt": 1710000000
}
```

## `cards`
```json
{
  "roomId": "RETRO-XK7M",
  "tipo": "feliz",
  "texto": "Buen trabajo en equipo",
  "autor": "Juan",
  "createdAt": 1710000000
}
```

## `spins`
```json
{
  "roomId": "RETRO-XK7M",
  "tipo": "tonalidad",
  "resultado": "Re",
  "menor": "Sim",
  "keyCode": "D",
  "createdAt": 1710000000
}
```

Tipos de spin: `persona` | `estilo` | `tonalidad` | `acordes` | `compositor`

**Nota:** Los spins de `tonalidad` guardan campos extra `menor` y `keyCode` para evitar parsing de strings. Los demás spins solo guardan `resultado`.

---

# 🧭 Flujo de Pantallas

## 1. 🏠 Home (Login)

- Logo guitarra 🎸 con animación flotante (`floatGuitar`)
- Título: **RetroJam Spartans** · subtítulo: v1.0.0
- Inputs: Nombre · Nombre de la retro (ej: Sprint 2 Q3) · Código de sala
- **Crear sala**: genera código `RETRO-XXXX`, crea doc en Firestore con `createdBy`
- **Unirse**: verifica existencia, detecta si es facilitador (`createdBy === nombre`)
- Salas cerradas/finalizadas: confirm dialog → entrar en **modo solo lectura**
- Al entrar: limpia UI y state de sesión anterior

---

## 2. 🎵 TrackList

- Input placeholder: "Track accionable pasado..."
- Items con estado: `[OK]` · `[WIP]` · `[X]`
- Sync realtime via `onSnapshot`
- `updateDoc` al cambiar estado

---

## 3. 🎵 Retro (Cards)

- Columna feliz: **Canciones felices**
- Columna triste: **Canciones tristes para volvernos mejor**
- Cards editables por el autor (botón ✏️ visible con hover → textarea inline)
- NO sync mientras escribe, SI sync al guardar (`addDoc`)
- `updateDoc` para editar card propia

---

## 4. 🎡 Ruletas (4 en una fila)

### 👤 Participante
- Se auto-puebla con los conectados activos (desde `presence`)
- Resultado: quién gira la próxima ruleta

### 🎧 Estilo Musical
14 opciones incluyendo combos:
```
Rock, Cumbia, Trap, Folklore, Electrónica, Cuarteto,
Hard Rock, Thrash Metal, Industrial Metal,
Metal + Cumbia, Reggae + Trap, Folklore + Electrónica,
Jazz + Trap, Punk + Bossa Nova
```

### 🎵 Tonalidad (Círculo de quintas)
12 tonalidades con mayor y relativa menor:
```
Do/Lam, Sol/Mim, Re/Sim, La/Fa#m, Mi/Do#m, Si/Sol#m,
Fa#/Re#m, Reb/Sibm, Lab/Fam, Mib/Dom, Sib/Solm, Fa/Rem
```
Guarda: `resultado` (mayor), `menor`, `keyCode`

### 🎼 Progresión
```
I-V-vi-IV, ii-V-I, I-IV-V, vi-IV-I-V
```

**Combinación tonalidad + progresión** → traduce a acordes reales:
- Ej: Re mayor + I-V-vi-IV = `D - A - Bm - G`
- Panel resultado: `Re mayor / Sim menor · D - A - Bm - G`
- Prompt Suno: `key of Re major · chord progression: D - A - Bm - G`

---

## 5. 🤖 IA

- Muestra estilo y acordes sorteados
- **Prompt IA** (ChatGPT / Gemini): textarea editable con cards de retro + estilo + acordes reales
- **Prompt Suno**: tags musicales (`SUNO_TAGS` mapping) + key + acordes reales
- Botones: Copiar prompt IA · Copiar para Suno · Regenerar

---

## 6. 🎲 Sorteo (Próximo compositor)

- Input de participantes sincronizado a Firestore (`rooms.sorteoParticipantes`) con debounce 600ms
- Solo el facilitador puede escribir; todos ven la lista en tiempo real vía `watchRoom`
- Ruleta animada con Canvas — todos ven los segmentos actualizados
- Al girar: muestra ganador, guarda en `state.spins.compositor` y Firestore
- `onSnapshot` de spins notifica el ganador a todos los participantes

**Tras el sorteo aparecen:**
- ⚠️ Aviso "una vez finalizado no se podrá editar"
- **Exportar PDF** (para todos)
- **Finalizar retro 🔒** (solo facilitador)

---

# 🔐 Control de sesión

## Facilitador (creador de sala)
- Controla la navegación entre pestañas para todos los participantes
- Puede cerrar la sala (`closedAt`) o finalizar (`finalizedAt`)
- Puede escribir los participantes del sorteo (se sincronizan a Firestore)
- Al salir: opción de cerrar para todos o solo salir

## Participante
- Sigue la pestaña del facilitador en tiempo real (hasta finalizar)
- Puede editar sus propias cards
- Ve lista del sorteo sincronizada en tiempo real

## Finalizado (`finalizedAt`)
- Todos (facilitador + participantes activos) pasan a `readOnlyMode = true`
- Todos pueden navegar libremente entre pestañas
- Nadie puede editar
- Todos pueden exportar PDF

## Modo solo lectura (sala cerrada/finalizada desde home)
- Confirm dialog al unirse
- Navega libremente todas las pestañas
- No puede editar nada
- Puede exportar PDF

## Presencia
- Heartbeat cada 20 segundos (`setDoc` con `merge: true`)
- Usuario activo = `lastSeen < 45 segundos`
- Chips en header: yo en teal, facilitador en púrpura con ⭐

---

# 📄 Exportar PDF

Genera `retrojam-RETRO-XXXX.pdf` con:
- Header negro: nombre de la retro + código + fecha
- TrackList con estados [OK] / [WIP] / [X]
- Canciones felices y tristes con autor
- Resultado de ruletas: estilo, tonalidad, acordes reales, **próximo compositor**
- Prompt completo para IA
- Tags para Suno
- Footer con código + fecha + número de página

---

# 🎨 UI/UX

- **Tema oscuro** con gradientes radiales (púrpura + teal)
- **Glassmorphism**: `backdrop-filter: blur` + bordes translúcidos
- **Tipografía**: Inter (UI) + Space Grotesk (títulos)
- **Animaciones**: `fadeUp` al navegar, `floatGuitar` en login
- **Colores**: rojo `#f0476c` · púrpura `#a855f7` · teal `#14b8a6` · naranja `#f97316`
- **4 ruletas en fila** (grid 4 columnas, responsive 2x2 en tablet, 1 col en mobile)
- Responsive con grid adaptable

---

# 🧠 Decisiones clave

- Sin `orderBy` en Firestore (evita índices compuestos) — ordenamiento client-side
- Spins de tonalidad guardan `menor` y `keyCode` como campos separados (sin parsing de string)
- Lista del sorteo guardada en `rooms` doc — no requiere colección nueva
- `enterRoom` limpia UI y state completo antes de cargar nueva sala
- Al finalizar, `readOnlyMode = true` para TODOS (no solo participantes)

---

# ✅ Checklist MVP

- [x] Crear sala con nombre personalizado
- [x] TrackList colaborativo con estados
- [x] Cards retro feliz/triste con edición propia
- [x] 4 ruletas animadas (Canvas)
- [x] Círculo de quintas con traducción a acordes reales
- [x] Prompt IA con acordes reales
- [x] Prompt Suno con key + tags musicales
- [x] Lista sorteo sincronizada a Firestore en tiempo real
- [x] Presencia en tiempo real (chips en header)
- [x] Control de navegación por facilitador
- [x] Todos navegan libremente al finalizar
- [x] Modo solo lectura para salas cerradas
- [x] Exportar PDF completo
- [x] Finalizar y bloquear sesión
- [x] Limpieza de UI al entrar a nueva sala

---

# 🚀 Deploy

```bash
npx serve .   # local
# deploy: Vercel / Netlify (static site, no build needed)
```

---

# 💡 Post MVP

- Votación de cards
- Timer de retro
- Historial de retros por código de sala
- Exportar canción (audio)
- Integración directa con Suno API

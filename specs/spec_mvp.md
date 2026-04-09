# 🎸 Retro Music Spartans – Spec MVP (actualizado)

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
  "tipo": "estilo",
  "resultado": "Thrash Metal",
  "createdAt": 1710000000
}
```
Tipos de spin: `persona` | `estilo` | `acordes` | `compositor`

---

# 🧭 Flujo de Pantallas

## 1. 🏠 Home (Login)

- Logo guitarra 🎸 con animación flotante
- Título: **Retro Music Spartans**
- Inputs: Nombre · Nombre de la retro (ej: Sprint 2 Q3) · Código de sala
- **Crear sala**: genera código aleatorio `RETRO-XXXX`, guarda en Firestore con `createdBy`
- **Unirse**: verifica existencia, detecta si es facilitador (`createdBy === nombre`)
- Salas cerradas/finalizadas: permite entrar en **modo solo lectura** (confirm dialog)

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
- Cards editables por el autor (botón ✏️ visible con hover)
- NO sync mientras escribe, SI sync al guardar (`addDoc`)
- `updateDoc` para editar card propia

---

## 4. 🎡 Ruletas

Tres ruletas animadas con Canvas (`SpinWheel` class):

### 👤 Participante
- Se auto-puebla con los conectados (desde `presence`)
- Resultado: muestra quién gira la próxima ruleta

### 🎧 Estilo Musical
```js
["Rock", "Cumbia", "Trap", "Folklore", "Electrónica", "Cuarteto",
 "Hard Rock", "Thrash Metal", "Industrial Metal",
 "Metal + Cumbia", "Reggae + Trap", "Folklore + Electrónica",
 "Jazz + Trap", "Punk + Bossa Nova"]
```

### 🎼 Acordes
```js
["I–V–vi–IV", "ii–V–I", "I–IV–V", "vi–IV–I–V"]
```

Cada spin guarda en colección `spins` con tipo correspondiente.

---

## 5. 🤖 IA

- Muestra estilo y acordes sorteados
- **Prompt para IA** (ChatGPT / Gemini): textarea editable con prompt completo incluyendo cards de retro, estilo y acordes
- **Prompt para Suno**: tags musicales generados desde `SUNO_TAGS` mapping + acordes
- Botones: Copiar prompt IA · Copiar para Suno · Regenerar

---

## 6. 🎲 Sorteo (Próximo compositor)

- Ruleta animada con Canvas — nombres separados por coma
- Al girar: muestra ganador, guarda en `state.spins.compositor` y Firestore
- **Tras el sorteo aparecen:**
  - ⚠️ Aviso "una vez finalizado no se podrá editar"
  - **Exportar PDF** (para todos)
  - **Finalizar retro 🔒** (solo facilitador)

---

# 🔐 Control de sesión

## Facilitador (creador de sala)
- Controla la navegación entre pestañas para todos
- Puede cerrar la sala (`closedAt`) o finalizar (`finalizedAt`)
- Al salir: opción de cerrar para todos o solo salir

## Participante
- Sigue la pestaña del facilitador en tiempo real
- Puede editar sus propias cards
- Ve en el header quién está conectado

## Modo solo lectura
- Al unirse a sala cerrada/finalizada → confirm dialog
- Puede navegar libremente entre todas las pestañas
- No puede editar nada
- Puede exportar PDF

## Presencia
- Heartbeat cada 20 segundos
- Usuario activo = `lastSeen < 45 segundos`
- Muestra chips en el header: autor en teal, facilitador en púrpura con ⭐

---

# 📄 Exportar PDF

Genera `retrojam-RETRO-XXXX.pdf` con:
- Header negro: nombre de la retro + código + fecha
- TrackList con estados [OK] / [WIP] / [X]
- Canciones felices y tristes con autor
- Resultado de ruletas: estilo, acordes, participante, **próximo compositor**
- Prompt completo para IA
- Tags para Suno
- Footer con código + fecha + número de página

---

# 🎨 UI/UX

- **Tema oscuro** con gradientes radiales en el fondo
- **Glassmorphism**: cards/paneles con `backdrop-filter: blur`
- **Tipografía**: Inter (UI) + Space Grotesk (títulos)
- **Animaciones**: `fadeUp` en cambio de pantalla, `floatGuitar` en el login
- **Colores**: rojo `#f0476c` · púrpura `#a855f7` · teal `#14b8a6` · naranja `#f97316`
- Responsive con grid adaptable

---

# 🧠 Decisiones clave

- ❌ Sin auth real — nombre por input
- ✅ Realtime con Firestore (`onSnapshot`)
- ❌ Sin `orderBy` en queries (evita índices compuestos) — ordenamiento client-side
- ✅ Cards editables solo por el autor
- ✅ Navegación controlada por facilitador (excepto modo solo lectura)
- ✅ PDF exportable por todos post-sorteo

---

# ✅ Checklist de entrega

- [x] Crear sala con nombre personalizado
- [x] TrackList colaborativo con estados
- [x] Cards retro feliz/triste con edición propia
- [x] 3 ruletas animadas (Canvas) + sorteo
- [x] Prompt para IA (ChatGPT) y Suno
- [x] Presencia en tiempo real
- [x] Control de navegación por facilitador
- [x] Modo solo lectura para salas cerradas
- [x] Exportar PDF completo
- [x] Finalizar y bloquear sesión
- [x] Deploy-ready (Vercel/Netlify)

---

# 🚀 Deploy

```bash
npx serve .         # local
# o abrir con Live Server en VSCode
# deploy: subir repo a Vercel/Netlify (static site)
```

---

# 💡 Posibles mejoras (post MVP)

- Votación de cards
- Timer de retro
- Roles (facilitador explícito vs participante)
- Historial de retros por sala
- Exportar canción (audio)
- Integración directa con Suno API

# Control Remoto de Pestañas

Sistema casero para abrir URLs a distancia en otras PCs de tu red local,
sin cuentas de Google ni servidores externos.

```
remote-tab-control/
├── server/                → Servidor Python (intermediario + panel del móvil)
├── extension-director/    → Extensión de la PC1: envía órdenes Y también recibe
├── extension-receptor/    → Extensión de las otras PCs: solo recibe y abre pestañas
└── mobile-director/       → Panel web para el móvil (lo entrega el servidor)
```

## Cómo encaja todo

```
 Móvil (panel web) ──8081 (página) / 8080 (órdenes)──┐
                                                      ▼
 PC1: servidor + extensión director  ◄───8080───►  SERVIDOR (PC1)
                                                      ▲
 PC2: extensión receptora ───────────8080─────────────┘
```

- El servidor corre en la PC1. Todo lo demás se conecta a él.
- Para enviar desde el móvil solo hace falta el servidor encendido en la PC1
  (Chrome en la PC1 NO hace falta). Chrome SÍ debe estar abierto en la PC
  que va a recibir la web.
- La PC1 también es receptora (aparece como "PC Director (esta PC)"): puede
  recibir webs del móvil y enviarse webs a sí misma. Para eso sí necesita
  Chrome abierto con la extensión director.

## 1. Servidor

1. `server/Install_server.bat` (una sola vez) instala las dependencias.
2. `server/abrir_firewall.bat` (una sola vez, clic derecho -> Ejecutar como
   administrador) abre los puertos 8080 y 8081 solo para tu red local.
3. `server/start_server.bat` lo inicia en segundo plano (sin ventana).
   `server/stop_server.bat` lo cierra.

Inicio automático (opcional): ejecutá `server/instalar_inicio_automatico.bat`
una sola vez y el servidor arrancará solo al iniciar sesión en Windows (sin
administrador). Para desactivarlo: `server/quitar_inicio_automatico.bat`.
Si movés la carpeta del proyecto, volvé a ejecutar el instalador.

Al iniciar se crean dos archivos junto a `server.py`:
- `direccion_movil.txt` -> la dirección exacta que abrís en el móvil.
- `server.log` -> registro de lo que pasa (útil porque no hay ventana).

## 2. Qué IP va en cada lado

Regla: todas las extensiones apuntan a la IP de la PC donde corre el
servidor. La IP del móvil no se escribe en ningún lado.

| Dónde | Archivo / lugar | Valor |
|---|---|---|
| Director (PC1) | `extension-director/background.js` -> `SERVER_URL` | `ws://127.0.0.1:8080` (o la IP de la PC1) |
| Receptor (PC2) | `extension-receptor/background.js` -> `SERVER_URL` | `ws://IP_DE_LA_PC1:8080` |
| Móvil | navegador | `http://IP_DE_LA_PC1:8081` |

Probando en una sola PC con 2 perfiles de Chrome: ambas extensiones con
`ws://127.0.0.1:8080` (así vienen configuradas ahora).

Con 2 PCs: poné una IP fija a la PC1 (reserva DHCP en el router), y esa IP
en el `SERVER_URL` del receptor de la PC2. Si querés, también en el director.

## 3. Instalar las extensiones

1. En Chrome: `chrome://extensions` -> activar Modo desarrollador.
2. "Cargar descomprimida" -> elegir `extension-director` (en el perfil/PC
   Director) o `extension-receptor` (en el perfil/PC Receptor).
3. Después de editar un `background.js`, tocá "Recargar" en la extensión.

Nota: si actualizás el director desde la versión anterior, recargala para
que se registre también como receptora.

## 4. Usar el móvil

1. Con el servidor corriendo, abrí en el navegador del móvil la dirección de
   `direccion_movil.txt` (ej: `http://192.168.1.50:8081`). El móvil debe
   estar en el mismo Wi-Fi.
2. Elegí la PC de la lista, escribí la URL y tocá Enviar.
3. Para tenerlo como icono: menú del navegador -> "Añadir a pantalla de
   inicio". (Al ser http en red local se crea un acceso directo; funciona igual.)
4. El ✏️ renombra las PCs solo en ese dispositivo (los nombres sin definir
   aparecen como "(sin nombre)").

## 5. Si algo no conecta

- El móvil no abre la página: revisar que ejecutaste `abrir_firewall.bat`, que
  la IP es la actual de la PC1 y que el router no tiene "aislamiento de
  clientes / AP isolation" activado.
- Panel dice "Sin conexión": el servidor no está corriendo (mirar `server.log`).
- La PC1 no aparece en la lista: recargar la extensión director.

## Notas de diseño

- Protocolo JSON plano sobre WebSocket, sin autenticación (confianza total en
  tu red doméstica). Si compartís el Wi-Fi con invitados, convendría sumar un
  token compartido.
- Un cliente puede registrarse con varios roles (`"roles": ["director","receptor"]`).
- El servidor responde `sent` / `error` a cada orden; el panel móvil lo muestra.
- Los service workers de Manifest V3 se duermen solos; las extensiones usan
  `chrome.alarms` para despertarse y reconectar.
- El receptor sigue siendo discreto (nombre de ancho cero, sin popup). No es
  invisible del todo: la plataforma de extensiones no lo permite.

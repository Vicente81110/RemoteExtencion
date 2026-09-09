# Control Remoto de Pestañas

Sistema casero para abrir URLs a distancia en otras PCs de tu red local
(Wi-Fi o Ethernet), sin depender de cuentas de Google ni servidores externos.

```
remote-tab-control/
├── server/                  → Servidor Python (el intermediario)
│   ├── server.py
│   ├── requirements.txt
│   └── start_server.bat
├── extension-director/      → Extensión que controla (elige PC + URL)
└── extension-receptor/      → Extensión que obedece (abre la pestaña)
```

Usa: chrome://extensions/ Para entrar al aparatado de extenciones e instalar las extenciones.

## 1. Preparar el servidor

Abre Install_server.bat ----> Instala todo y cierra el cmd automaticamente

```bash
cd server
pip install -r requirements.txt
python server.py
```

Abre start_server para abrilo

Abre stop_server para cerrarlo

Vas a ver algo como:
```
2026-08-03 ... [INFO] Servidor iniciando en ws://0.0.0.0:8080
```

Dejalo corriendo en esa consola mientras probás. Más adelante lo vas a poder
arrancar con `start_server.bat` con doble clic.

> **Sobre la versión "invisible" del .bat**: un `.bat` normal siempre abre
> una ventana de consola. Para que en el futuro corra sin ventana visible,
> la forma estándar es usar `pythonw.exe` (en vez de `python.exe`) o un
> pequeño wrapper en VBScript que lance el `.bat` oculto. Lo dejamos
> pendiente para la Fase 4, cuando ya esté todo estable — por ahora conviene
> ver los logs mientras debuggeamos.

## 2. Crear los dos perfiles de Chrome (para testear en 1 sola PC)

1. Abrí Chrome → ícono de perfil (arriba a la derecha) → **Agregar cuenta / Añadir perfil**.
2. Creá un perfil llamado, por ejemplo, **"Director"**.
3. Repetí y creá otro llamado **"Receptor"**.
4. Vas a tener dos ventanas de Chrome totalmente independientes entre sí.

## 3. Cargar la extensión Directora

1. En el perfil **Director**, andá a `chrome://extensions`.
2. Activá **Modo desarrollador** (arriba a la derecha).
3. Clic en **Cargar descomprimida** ("Load unpacked").
4. Seleccioná la carpeta `extension-director`.
5. Debería aparecer el ícono en la barra de extensiones (fijalo con el pin 📌).

## 4. Cargar la extensión Receptora

1. En el perfil **Receptor**, repetí los mismos pasos pero apuntando a la
   carpeta `extension-receptor`.
2. Esta extensión no tiene popup ni ícono con nombre: apenas se carga, ya
   se conecta sola al servidor en segundo plano. En `chrome://extensions`
   la vas a ver listada sin nombre visible (a propósito).

## 5. Probar

1. Con el servidor corriendo, abrí el popup del **Director**.
2. Debería aparecer una entrada nueva en la lista (sin texto, solo el
   ícono 🖥️) — puede tardar 1-2s en aparecer.
3. Escribí una URL (ej: `youtube.com`) y clic en **Enviar a la PC seleccionada**.
4. En la ventana del perfil **Receptor** debería abrirse una pestaña nueva
   con esa URL automáticamente. 🎉

## 6. Cuando tengas otra PC física en casa

Solo hay que cambiar una línea en cada extensión: reemplazar
`ws://localhost:8080` por la IP local de la PC donde corre el servidor,
por ejemplo `ws://192.168.1.35:8080`, en:

- `extension-director/background.js` (constante `SERVER_URL`)
- `extension-receptor/background.js` (constante `SERVER_URL`)

Para saber esa IP en la PC del servidor: `ipconfig` (Windows) y buscar la
"Dirección IPv4" de tu adaptador Wi-Fi o Ethernet. También hay que asegurarse
de que el Firewall de Windows permita conexiones entrantes al puerto 8080.

## Notas de diseño

- El protocolo es JSON plano sobre WebSocket, sin autenticación (asumimos
  confianza total dentro de tu red doméstica). Si más adelante lo querés
  exponer fuera de tu LAN, habría que sumar un token/clave compartida.
- Los `service_worker` de Manifest V3 se "duermen" solos a los ~30s de
  inactividad; por eso ambas extensiones usan `chrome.alarms` para
  despertarse y reconectar solas si el socket se cortó.
- El Receptor se registra siempre con nombre vacío y no tiene popup ni
  ícono con texto: el `name` del `manifest.json` usa un carácter de ancho
  cero (`\u200B`) para que en `chrome://extensions` no muestre nada
  legible. Esto lo hace discreto, pero no invisible del todo: siempre
  va a poder verse la entrada en `chrome://extensions` y en el listado de
  extensiones del navegador — no hay forma de ocultarla completamente
  desde Chrome, eso ya excede lo que permite la plataforma de extensiones.
- Si en algún momento volvés a necesitar diferenciar varias PCs receptoras
  en la lista del Director, lo más simple es asignar un `name` fijo por
  PC directamente en el `background.js` de cada una (una línea).

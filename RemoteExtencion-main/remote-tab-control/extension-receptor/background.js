// ==========================================================
// Control Remoto - Receptor (modo silencioso)
// Se conecta al servidor local y abre pestañas cuando recibe
// una orden desde la extensión Directora. No tiene interfaz
// visible ni nombre distintivo.
// ==========================================================

// IMPORTANTE: debe ser la misma dirección que usa el Director.
// Probando con 2 perfiles en la misma PC: "ws://127.0.0.1:8080".
// Con otra PC de la red: la IP fija de la PC donde corre el servidor
// (la PC1 / Director), ej: "ws://192.168.1.50:8080".
const SERVER_URL = "ws://127.0.0.1:8080";

let socket = null;

function conectar() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(SERVER_URL);

  socket.onopen = () => {
    // Se registra sin nombre: en la lista del Director aparecerá sin texto.
    socket.send(JSON.stringify({ type: "register", role: "receptor", name: "" }));
  };

  socket.onmessage = (evento) => {
    let mensaje;
    try {
      mensaje = JSON.parse(evento.data);
    } catch (e) {
      return;
    }

    if (mensaje.type === "open_url" && mensaje.url) {
      let url = mensaje.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }
      chrome.tabs.create({ url });
    }
  };

  socket.onclose = () => {
    // Se reintentará solo en la próxima alarma.
  };

  socket.onerror = () => {
    if (socket) socket.close();
  };
}

chrome.runtime.onStartup.addListener(conectar);
chrome.runtime.onInstalled.addListener(conectar);

// El service worker de MV3 se "duerme" tras ~30s de inactividad.
// Esta alarma lo despierta y reintenta la conexión si hace falta.
chrome.alarms.create("mantenerVivo", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "mantenerVivo") {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      conectar();
    } else if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping" }));
    }
  }
});

conectar();

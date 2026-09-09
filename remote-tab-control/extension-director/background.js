// ==========================================================
// Control Remoto - Director
// Se conecta al servidor local, recibe la lista de receptores
// disponibles y envía las órdenes de "abrir URL" al elegido.
// ==========================================================

// Igual que en el receptor: cambiar por la IP local cuando se pruebe
// entre PCs distintas de la red, ej: "ws://192.168.1.35:8080"
const SERVER_URL = "ws://localhost:8080";

let socket = null;

function conectar() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(SERVER_URL);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "register", role: "director" }));
    chrome.storage.local.set({ estadoServidor: "conectado" });
    console.log("[Director] Conectado al servidor");
  };

  socket.onmessage = (evento) => {
    let mensaje;
    try {
      mensaje = JSON.parse(evento.data);
    } catch (e) {
      return;
    }

    if (mensaje.type === "list") {
      chrome.storage.local.set({ listaClientes: mensaje.clients });
    }
  };

  socket.onclose = () => {
    chrome.storage.local.set({ estadoServidor: "desconectado", listaClientes: [] });
    console.log("[Director] Desconectado del servidor. Se reintentará automáticamente.");
  };

  socket.onerror = () => {
    if (socket) socket.close();
  };
}

chrome.runtime.onStartup.addListener(conectar);
chrome.runtime.onInstalled.addListener(conectar);

// Mantiene vivo el service worker y refresca la lista periódicamente
chrome.alarms.create("mantenerVivoDirector", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "mantenerVivoDirector") {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      conectar();
    } else if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "list_request" }));
    }
  }
});

chrome.runtime.onMessage.addListener((mensaje, sender, sendResponse) => {
  if (mensaje.type === "enviar_url") {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "open_url",
        target_id: mensaje.target_id,
        url: mensaje.url,
      }));
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "Sin conexión al servidor" });
    }
    return true;
  }

  if (mensaje.type === "reconectar") {
    conectar();
    sendResponse({ ok: true });
    return true;
  }

  if (mensaje.type === "list_request") {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "list_request" }));
    }
    sendResponse({ ok: true });
    return true;
  }
});

conectar();

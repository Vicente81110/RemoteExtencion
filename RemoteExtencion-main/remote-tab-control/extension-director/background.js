// ==========================================================
// Control Remoto - Director
// Se conecta al servidor local, recibe la lista de receptores
// disponibles y envía las órdenes de "abrir URL" al elegido.
// Además esta PC también es receptora: puede recibir webs enviadas
// desde el móvil o desde ella misma.
// ==========================================================

// Probando todo en una sola PC (2 perfiles): "ws://127.0.0.1:8080".
// Con varias PCs: la IP fija de la PC donde corre el servidor,
// ej: "ws://192.168.1.50:8080" (la misma que usa el receptor).
const SERVER_URL = "ws://127.0.0.1:8080";

// Nombre con el que esta PC aparece en la lista de destinos.
const NOMBRE_ESTA_PC = "PC Director";

let socket = null;

function conectar() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  socket = new WebSocket(SERVER_URL);

  socket.onopen = () => {
    // Se registra con los dos roles: director (envía) y receptor (recibe).
    socket.send(JSON.stringify({
      type: "register",
      roles: ["director", "receptor"],
      name: NOMBRE_ESTA_PC,
    }));
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
    } else if (mensaje.type === "registered") {
      // Id de esta PC como receptora: el popup lo usa para marcar "(esta PC)"
      chrome.storage.local.set({ miId: mensaje.id });
    } else if (mensaje.type === "open_url" && mensaje.url) {
      let url = mensaje.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = "https://" + url;
      }
      chrome.tabs.create({ url });
    }
  };

  socket.onclose = () => {
    chrome.storage.local.set({ estadoServidor: "desconectado", listaClientes: [], miId: null });
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

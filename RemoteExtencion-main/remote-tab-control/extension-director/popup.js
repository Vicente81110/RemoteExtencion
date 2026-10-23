const puntoEstado = document.getElementById("puntoEstado");
const textoEstado = document.getElementById("textoEstado");
const listaPCs = document.getElementById("listaPCs");
const urlInput = document.getElementById("urlInput");
const btnEnviar = document.getElementById("btnEnviar");
const btnRefrescar = document.getElementById("btnRefrescar");
const mensajeEstado = document.getElementById("mensajeEstado");

let idSeleccionado = null;
let idEnEdicion = null;
let miId = null; // id de esta PC como receptora (lo guarda background.js)

// Alias locales: SOLO viven en el storage del Director, nunca se mandan
// al servidor ni se guardan por IP. Si el id de una PC cambia (por
// ejemplo, se reconectó y el servidor le asignó otro id), el alias
// viejo queda huérfano y simplemente le volvés a poner nombre.
let aliasPCs = {};

async function cargarAlias() {
  const datos = await chrome.storage.local.get("aliasPCs");
  aliasPCs = datos.aliasPCs || {};
}

function guardarAlias(id, nombre) {
  if (nombre) {
    aliasPCs[id] = nombre;
  } else {
    delete aliasPCs[id];
  }
  chrome.storage.local.set({ aliasPCs });
}

function nombreParaMostrar(cliente) {
  const base = aliasPCs[cliente.id] || cliente.name || "(sin nombre)";
  return cliente.id === miId ? base + " (esta PC)" : base;
}

function renderLista(clientes) {
  listaPCs.innerHTML = "";

  if (!clientes || clientes.length === 0) {
    listaPCs.innerHTML = '<p class="vacio">No hay PCs receptoras conectadas.</p>';
    idSeleccionado = null;
    return;
  }

  if (idSeleccionado && !clientes.some((c) => c.id === idSeleccionado)) {
    idSeleccionado = null;
  }

  clientes.forEach((cliente) => {
    const fila = document.createElement("div");
    fila.className = "pc-item" + (cliente.id === idSeleccionado ? " seleccionado" : "");

    if (idEnEdicion === cliente.id) {
      // Modo edición: input + confirmar, todo local
      fila.classList.add("editando");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "pc-nombre-input";
      input.placeholder = "Nombre para esta PC";
      input.value = aliasPCs[cliente.id] || "";

      const confirmar = () => {
        guardarAlias(cliente.id, input.value.trim());
        idEnEdicion = null;
        renderLista(clientes);
      };

      const btnOk = document.createElement("button");
      btnOk.className = "pc-btn-ok";
      btnOk.textContent = "✔";
      btnOk.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmar();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmar();
        } else if (e.key === "Escape") {
          idEnEdicion = null;
          renderLista(clientes);
        }
      });
      input.addEventListener("click", (e) => e.stopPropagation());

      fila.appendChild(input);
      fila.appendChild(btnOk);
      listaPCs.appendChild(fila);

      setTimeout(() => input.focus(), 0);
      return;
    }

    const textoSpan = document.createElement("span");
    textoSpan.className = "pc-texto";
    textoSpan.textContent = "🖥️ " + nombreParaMostrar(cliente);

    const btnEditar = document.createElement("button");
    btnEditar.className = "pc-btn-editar";
    btnEditar.textContent = "✏️";
    btnEditar.title = "Renombrar (solo en este Director)";
    btnEditar.addEventListener("click", (e) => {
      e.stopPropagation();
      idEnEdicion = cliente.id;
      renderLista(clientes);
    });

    fila.appendChild(textoSpan);
    fila.appendChild(btnEditar);

    fila.addEventListener("click", () => {
      idSeleccionado = cliente.id;
      renderLista(clientes);
    });

    listaPCs.appendChild(fila);
  });
}

async function refrescarUI() {
  const datos = await chrome.storage.local.get(["estadoServidor", "listaClientes", "miId"]);
  miId = datos.miId || null;

  if (datos.estadoServidor === "conectado") {
    puntoEstado.className = "punto conectado";
    textoEstado.textContent = "Servidor OK";
  } else {
    puntoEstado.className = "punto desconectado";
    textoEstado.textContent = "Sin conexión";
  }

  renderLista(datos.listaClientes || []);
}

btnRefrescar.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "list_request" });
  mensajeEstado.textContent = "Actualizando lista...";
  setTimeout(() => (mensajeEstado.textContent = ""), 1200);
});

btnEnviar.addEventListener("click", () => {
  const url = urlInput.value.trim();

  if (!idSeleccionado) {
    mensajeEstado.textContent = "⚠️ Elegí una PC de la lista primero.";
    return;
  }
  if (!url) {
    mensajeEstado.textContent = "⚠️ Escribí una URL.";
    return;
  }

  chrome.runtime.sendMessage(
    { type: "enviar_url", target_id: idSeleccionado, url },
    (respuesta) => {
      if (respuesta && respuesta.ok) {
        mensajeEstado.textContent = "✅ Orden enviada.";
      } else {
        mensajeEstado.textContent = "❌ " + (respuesta?.error || "No se pudo enviar.");
      }
      setTimeout(() => (mensajeEstado.textContent = ""), 2000);
    }
  );
});

chrome.storage.onChanged.addListener((cambios, area) => {
  if (area === "local" && (cambios.listaClientes || cambios.estadoServidor || cambios.miId)) {
    refrescarUI();
  }
});

cargarAlias().then(refrescarUI);

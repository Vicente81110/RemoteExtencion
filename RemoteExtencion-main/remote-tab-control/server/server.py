"""
Servidor central - Control Remoto de Pestañas
------------------------------------------------
Intermediario entre los Directores (extensión de la PC y panel web del
móvil) y los Receptores (extensiones que abren las pestañas), todo dentro
de tu red local. No usa cuentas ni servidores externos.

Puertos:
  8080  WebSocket -> extensiones y panel del móvil se conectan acá
  8081  HTTP      -> entrega el panel web del móvil (carpeta ../mobile-director)

Un mismo cliente puede registrarse con varios roles a la vez. Así la
extensión Directora de la PC1 es también receptora y puede recibir órdenes
del móvil o de ella misma.
"""

import asyncio
import json
import logging
import os
import secrets
import socket
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler

import websockets

try:
    from websockets.asyncio.server import serve  # websockets >= 13
except ImportError:
    from websockets.server import serve  # versiones anteriores

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MOBILE_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "mobile-director"))
LOG_FILE = os.path.join(BASE_DIR, "server.log")
ADDR_FILE = os.path.join(BASE_DIR, "direccion_movil.txt")

HOST = "0.0.0.0"  # escucha en todas las interfaces de red (Wi-Fi/Ethernet)
WS_PORT = 8080
HTTP_PORT = 8081

# Con pythonw (modo oculto) no hay consola: los logs van también a server.log
_handlers = [RotatingFileHandler(LOG_FILE, maxBytes=200_000, backupCount=1, encoding="utf-8")]
if sys.stderr is not None:
    _handlers.append(logging.StreamHandler())
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=_handlers,
)
logger = logging.getLogger("RemoteTabServer")

# Estructuras en memoria (se pierden al reiniciar el servidor, es esperado)
receptores = {}   # id -> {"ws": websocket, "name": str}
directores = {}   # websocket -> nombre


def generar_id() -> str:
    return secrets.token_hex(4)


async def enviar(websocket, payload: dict):
    try:
        await websocket.send(json.dumps(payload))
    except Exception as e:
        logger.warning(f"No se pudo enviar mensaje: {e}")


async def enviar_lista_a_directores():
    """Empuja la lista actualizada de receptores conectados a todos los directores."""
    lista = [{"id": rid, "name": info["name"]} for rid, info in receptores.items()]
    mensaje = json.dumps({"type": "list", "clients": lista})
    if directores:
        await asyncio.gather(
            *[ws.send(mensaje) for ws in list(directores)],
            return_exceptions=True,
        )


async def manejar_cliente(websocket):
    cliente_id = None  # id como receptor (None si no es receptor)
    nombre = ""
    try:
        async for mensaje_raw in websocket:
            try:
                mensaje = json.loads(mensaje_raw)
            except (json.JSONDecodeError, TypeError):
                logger.warning("Mensaje no-JSON recibido, se ignora")
                continue
            if not isinstance(mensaje, dict):
                continue

            tipo = mensaje.get("type")

            if tipo == "register":
                # Acepta {"role": "x"} (formato anterior) o {"roles": ["x", "y"]}
                roles = mensaje.get("roles") or [mensaje.get("role")]
                nombre = mensaje.get("name", "")

                if "receptor" in roles and cliente_id is None:
                    cliente_id = generar_id()
                    receptores[cliente_id] = {"ws": websocket, "name": nombre}
                    logger.info(f"Receptor conectado: {nombre or '(sin nombre)'} ({cliente_id})")
                    await enviar(websocket, {"type": "registered", "id": cliente_id})

                if "director" in roles and websocket not in directores:
                    directores[websocket] = nombre or "Director"
                    logger.info(f"Director conectado: {directores[websocket]}")

                await enviar_lista_a_directores()

            elif tipo == "list_request":
                await enviar_lista_a_directores()

            elif tipo == "open_url":
                target_id = mensaje.get("target_id")
                url = mensaje.get("url")
                if target_id in receptores and isinstance(url, str) and url.strip():
                    destino = receptores[target_id]
                    try:
                        await destino["ws"].send(json.dumps({"type": "open_url", "url": url}))
                        logger.info(f"Orden enviada a {destino['name'] or target_id}: {url}")
                        await enviar(websocket, {"type": "sent", "ok": True, "target_id": target_id})
                    except Exception as e:
                        logger.warning(f"No se pudo enviar la orden a {target_id}: {e}")
                        await enviar(websocket, {"type": "error", "message": "No se pudo entregar la orden."})
                else:
                    logger.warning(f"Destino inválido o url vacía: {mensaje}")
                    await enviar(websocket, {"type": "error", "message": "Esa PC ya no está conectada."})

            elif tipo == "ping":
                await enviar(websocket, {"type": "pong"})

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        cambio = False
        if cliente_id in receptores:
            logger.info(f"Receptor desconectado: {receptores[cliente_id]['name'] or '(sin nombre)'}")
            del receptores[cliente_id]
            cambio = True
        if websocket in directores:
            logger.info(f"Director desconectado: {directores[websocket]}")
            del directores[websocket]
        if cambio:
            await enviar_lista_a_directores()


# ----------------------------------------------------------
# Panel web del móvil (HTTP simple, solo archivos estáticos)
# ----------------------------------------------------------
class PanelHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass  # silencioso


def iniciar_panel_http():
    if not os.path.isdir(MOBILE_DIR):
        logger.warning(f"No existe la carpeta del panel móvil: {MOBILE_DIR}")
        return
    try:
        httpd = ThreadingHTTPServer((HOST, HTTP_PORT), partial(PanelHandler, directory=MOBILE_DIR))
    except OSError as e:
        logger.warning(f"No se pudo abrir el puerto HTTP {HTTP_PORT}: {e}")
        return
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    logger.info(f"Panel móvil disponible en el puerto {HTTP_PORT}")


def ip_local() -> str:
    """IP de esta PC en la red local (no envía tráfico real)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 80))
        return s.getsockname()[0]
    except OSError:
        try:
            return socket.gethostbyname(socket.gethostname())
        except OSError:
            return "127.0.0.1"
    finally:
        s.close()


async def main():
    ip = ip_local()
    logger.info(f"Servidor iniciando en ws://{HOST}:{WS_PORT}")
    iniciar_panel_http()

    direccion = f"http://{ip}:{HTTP_PORT}"
    logger.info(f"Abrí esto en el navegador del móvil: {direccion}")
    try:
        with open(ADDR_FILE, "w", encoding="utf-8") as f:
            f.write(f"Panel del móvil: {direccion}\nWebSocket (extensiones): ws://{ip}:{WS_PORT}\n")
    except OSError:
        pass

    async with serve(manejar_cliente, HOST, WS_PORT, ping_interval=20, ping_timeout=20):
        await asyncio.Future()  # corre para siempre


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Servidor detenido manualmente.")

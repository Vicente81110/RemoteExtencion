"""
Servidor central - Control Remoto de Pestañas
------------------------------------------------
Actúa como intermediario entre la extensión Directora y las extensiones
Receptoras dentro de la misma red local (Wi-Fi o Ethernet).

No requiere ninguna cuenta ni servidor externo: todo el tráfico queda
dentro de tu red.
"""

import asyncio
import json
import logging
import secrets

import websockets
from websockets.server import serve

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("RemoteTabServer")

HOST = "0.0.0.0"  # escucha en todas las interfaces de red (Wi-Fi/Ethernet)
PORT = 8080

# Estructuras en memoria (se pierden al reiniciar el servidor, es esperado)
receptores = {}   # id -> {"ws": websocket, "name": str}
directores = set()  # set de websockets con rol "director"


def generar_id() -> str:
    return secrets.token_hex(4)


async def enviar_lista_a_directores():
    """Empuja la lista actualizada de receptores conectados a todos los directores."""
    lista = [{"id": rid, "name": info["name"]} for rid, info in receptores.items()]
    mensaje = json.dumps({"type": "list", "clients": lista})
    if directores:
        await asyncio.gather(
            *[ws.send(mensaje) for ws in directores],
            return_exceptions=True,
        )


async def manejar_cliente(websocket):
    cliente_id = None
    rol = None
    try:
        async for mensaje_raw in websocket:
            try:
                mensaje = json.loads(mensaje_raw)
            except json.JSONDecodeError:
                logger.warning("Mensaje no-JSON recibido, se ignora")
                continue

            tipo = mensaje.get("type")

            if tipo == "register":
                rol = mensaje.get("role")
                nombre = mensaje.get("name", "PC-Desconocida")

                if rol == "receptor":
                    cliente_id = generar_id()
                    receptores[cliente_id] = {"ws": websocket, "name": nombre}
                    logger.info(f"Receptor conectado: {nombre} ({cliente_id})")
                    await websocket.send(json.dumps({"type": "registered", "id": cliente_id}))
                    await enviar_lista_a_directores()

                elif rol == "director":
                    directores.add(websocket)
                    logger.info("Director conectado")
                    await enviar_lista_a_directores()

            elif tipo == "list_request":
                await enviar_lista_a_directores()

            elif tipo == "open_url":
                target_id = mensaje.get("target_id")
                url = mensaje.get("url")
                if target_id in receptores and url:
                    destino = receptores[target_id]["ws"]
                    try:
                        await destino.send(json.dumps({"type": "open_url", "url": url}))
                        logger.info(f"Orden enviada a {receptores[target_id]['name']}: {url}")
                    except Exception as e:
                        logger.warning(f"No se pudo enviar la orden a {target_id}: {e}")
                else:
                    logger.warning(f"Destino inválido o url vacía: {mensaje}")

            elif tipo == "ping":
                await websocket.send(json.dumps({"type": "pong"}))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if rol == "receptor" and cliente_id in receptores:
            logger.info(f"Receptor desconectado: {receptores[cliente_id]['name']}")
            del receptores[cliente_id]
            await enviar_lista_a_directores()
        elif rol == "director" and websocket in directores:
            directores.discard(websocket)
            logger.info("Director desconectado")


async def main():
    logger.info(f"Servidor iniciando en ws://{HOST}:{PORT}")
    logger.info("Presioná Ctrl+C para detenerlo.")
    async with serve(manejar_cliente, HOST, PORT):
        await asyncio.Future()  # corre para siempre


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Servidor detenido manualmente.")

#!/usr/bin/env python3
"""
PoC-04 — Benchmark de los candidatos a lenguaje/framework del backend.

Levanta cada candidato, lo calienta y lo somete a la misma carga, midiendo
throughput, latencia (p50/p95/p99) y memoria residente del proceso.

Se miden DOS escenarios por candidato:
  1. sin-io : respuesta inmediata      -> overhead puro del framework.
  2. con-io : 2 ms de espera simulada  -> se parece a producción, donde el
              tiempo lo domina la consulta a la base de datos.

El segundo escenario existe por la lección del PoC-02: un benchmark sin
latencia de I/O exagera la diferencia entre tecnologías y lleva a conclusiones
que no se sostienen contra una base de datos real.

Uso:  python3 benchmark.py            (15 s por medición, 100 conexiones)
      DURACION=30 python3 benchmark.py
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

DIR = Path(__file__).parent
DURACION = int(os.environ.get("DURACION", "15"))
CONEXIONES = int(os.environ.get("CONEXIONES", "100"))

CANDIDATOS = [
    {
        "nombre": "NestJS",
        "puerto": 3001,
        # JS ya compilado, no ts-node: ts-node compila TypeScript en memoria y
        # dispara el RSS (~706 MB medidos frente a ~80 MB del compilado), lo que
        # penalizaría a NestJS por el modo de ejecución y no por el framework.
        # En producción siempre se despliega el JS compilado.
        "cmd": ["node", "dist/main.js"],
        "cwd": DIR / "nestjs",
    },
    {
        "nombre": "SpringBoot",
        "puerto": 3002,
        "cmd": ["java", "-jar", str(DIR / "springboot/target/poc-04-springboot-1.0.0.jar")],
        "cwd": DIR,
    },
]


def esperar_listo(puerto, timeout=90):
    """Devuelve los segundos que tardó en responder la primera petición."""
    url = f"http://localhost:{puerto}/entradas/evt-1/disponibilidad"
    inicio = time.time()
    while time.time() - inicio < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return round(time.time() - inicio, 2)
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"el puerto {puerto} no respondió en {timeout}s")


def autocannon(url, conexiones, duracion):
    salida = subprocess.run(
        ["npx", "-y", "autocannon", "-c", str(conexiones), "-d", str(duracion), "-j", url],
        capture_output=True, text=True, timeout=duracion + 120,
    )
    return json.loads(salida.stdout)


def rss_mb(pid):
    """Memoria residente del proceso, en MB."""
    try:
        out = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)],
                             capture_output=True, text=True).stdout.strip()
        return round(int(out) / 1024) if out else None
    except Exception:
        return None


def medir(candidato):
    proc = subprocess.Popen(
        candidato["cmd"], cwd=candidato["cwd"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        preexec_fn=os.setsid,
    )
    filas = []
    try:
        arranque = esperar_listo(candidato["puerto"])
        print(f"  arranque: {arranque}s")

        for etiqueta, ruta in [("sin-io", "disponibilidad"), ("con-io", "disponibilidad-io")]:
            url = f"http://localhost:{candidato['puerto']}/entradas/evt-1/{ruta}"
            # Calentamiento: la JVM compila a nativo (JIT) sólo tras ejecutar el
            # código; sin esto Spring Boot se mediría en su peor momento.
            autocannon(url, 20, 5)
            d = autocannon(url, CONEXIONES, DURACION)
            filas.append({
                "candidato": candidato["nombre"],
                "escenario": etiqueta,
                "req_s": round(d["requests"]["average"]),
                "p50_ms": d["latency"]["p50"],
                # autocannon no reporta p95; p97_5 es el percentil disponible
                # más cercano y es MÁS exigente que el p95 del RNF-07.
                "p97_5_ms": d["latency"]["p97_5"],
                "p99_ms": d["latency"]["p99"],
                "rss_mb": rss_mb(proc.pid),
                "errores": d["non2xx"] + d["errors"],
            })
            print(f"  {etiqueta}: {filas[-1]['req_s']} req/s, p97.5 {filas[-1]['p97_5_ms']} ms")
    finally:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=30)
        time.sleep(2)
    return arranque, filas


def main():
    resultados, arranques = [], {}
    for c in CANDIDATOS:
        print(f"== {c['nombre']} ==")
        arranque, filas = medir(c)
        arranques[c["nombre"]] = arranque
        resultados.extend(filas)

    cols = ["candidato", "escenario", "req_s", "p50_ms", "p97_5_ms", "p99_ms", "rss_mb", "errores"]
    ancho = {c: max(len(c), *(len(str(r[c])) for r in resultados)) for c in cols}
    lineas = ["  ".join(c.ljust(ancho[c]) for c in cols)]
    lineas += ["  ".join(str(r[c]).ljust(ancho[c]) for c in cols) for r in resultados]
    lineas += ["", "arranque hasta la primera respuesta (s)"]
    lineas += [f"  {k}: {v}" for k, v in arranques.items()]
    lineas += ["", f"carga: {CONEXIONES} conexiones concurrentes, {DURACION}s por medición",
               f"máquina: {subprocess.run(['uname','-sm'],capture_output=True,text=True).stdout.strip()}"]

    texto = "\n".join(lineas)
    (DIR / "resultados.txt").write_text(texto + "\n", encoding="utf-8")
    print("\n" + texto)


if __name__ == "__main__":
    sys.exit(main())

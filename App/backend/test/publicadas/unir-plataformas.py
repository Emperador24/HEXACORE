"""Une dos imágenes nativas verificadas; solo publica metadatos de imagen."""
import json
import re
import subprocess
import sys
from pathlib import Path

NOMBRES = ('nucleo', 'boleteria', 'trabajador', 'gateway', 'pasarela', 'correo',
           'portal-cliente', 'portal-admin')


def digest(valor):
    assert isinstance(valor, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', valor)
    return valor


def validar_plataforma(datos, arquitectura, revision):
    manifiesto = datos['manifest']
    plataformas = [m['platform']['architecture'] for m in manifiesto['manifests']
                   if m.get('platform', {}).get('os') == 'linux']
    assert plataformas == [arquitectura], plataformas
    imagen = datos['image']
    configuraciones = [imagen] if 'architecture' in imagen else list(imagen.values())
    propias = [c for c in configuraciones if isinstance(c, dict)
               and c.get('architecture') == arquitectura and c.get('os') == 'linux']
    assert len(propias) == 1
    assert propias[0]['config']['Labels']['org.opencontainers.image.revision'] == revision
    return digest(manifiesto['digest'])


def etiquetas(revision, rama):
    assert re.fullmatch(r'[0-9a-f]{40}', revision)
    assert rama
    principal = rama if rama in ('main', 'develop') else 'arquitectura-' + revision
    return [principal, 'sha-' + revision] + (['latest'] if rama == 'main' else [])


def docker(*argumentos):
    return subprocess.check_output(['docker', 'buildx', 'imagetools', *argumentos], text=True)


def main(nombre, revision, corrida, rama, salida):
    assert nombre in NOMBRES
    assert re.fullmatch(r'[0-9]+', corrida)
    tags = etiquetas(revision, rama)
    imagen = 'ghcr.io/emperador24/hexacore-' + nombre
    referencias = []
    for arquitectura in ('amd64', 'arm64'):
        temporal = f'{imagen}:construccion-{revision}-{corrida}-{arquitectura}'
        datos = json.loads(docker('inspect', temporal, '--format', '{{json .}}'))
        referencias.append(imagen + '@' + validar_plataforma(datos, arquitectura, revision))
    argumentos = ['create']
    for tag in tags:
        argumentos.extend(['--tag', imagen + ':' + tag])
    # Solo se unen digests de dos compilaciones nativas de esta misma corrida/SHA.
    docker(*argumentos, *referencias)
    manifiesto = json.loads(docker('inspect', imagen + ':sha-' + revision,
                                  '--format', '{{json .Manifest}}'))
    plataformas = sorted(m['platform']['architecture'] for m in manifiesto['manifests']
                         if m.get('platform', {}).get('os') == 'linux')
    assert plataformas == ['amd64', 'arm64'], plataformas
    resultado = dict(nombre=nombre, imagen=imagen, digest=digest(manifiesto['digest']), revision=revision)
    destino = Path(salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(resultado) + '\n')
    print(json.dumps(resultado))


if __name__ == '__main__':
    main(*sys.argv[1:])

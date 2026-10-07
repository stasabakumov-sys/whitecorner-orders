# GPL-2.0: browser adapter for the separately licensed ruida.py generator.
import base64
import io
import json
from ruida import Ruida


def generate_json(request_json):
    request = json.loads(request_json)
    if len(request['jobs']) not in (1, 2, 4):
        raise ValueError('Expected one Small box, two Card box or four Backdrop box jobs')
    outputs = []
    for job in request['jobs']:
        if len(job['layers']) != 2:
            raise ValueError('Expected fold and cut layers')
        rd = Ruida()
        for index, layer in enumerate(job['layers']):
            if not (0 < layer['speed'] <= 1000 and 0 <= layer['minPower'] <= layer['maxPower'] <= 100):
                raise ValueError('Invalid layer settings')
            # Upstream only emits the laser speed; travel uses controller defaults.
            # Negative forceabs prevents all relative coordinate commands.
            rd.set(layer=index, paths=layer['paths'], speed=layer['speed'],
                   power=[layer['minPower'], layer['maxPower'], 0, 0, 0, 0, 0, 0],
                   color=layer['color'], forceabs=-1)
        fd = io.BytesIO()
        rd.write(fd, scramble=False)
        raw = fd.getvalue()
        if not raw.startswith(bytes([0xd8, 0x12])):
            raise ValueError('Unexpected generator origin command')
        # Ruida REF_POINT_1 (D8 11), matching the saved Anchor point runbook.
        raw = bytes([0xd8, 0x11]) + raw[2:]
        binary = rd.scramble_bytes(raw)
        outputs.append({'filename': job['filename'], 'base64': base64.b64encode(binary).decode('ascii')})
    return json.dumps(outputs)

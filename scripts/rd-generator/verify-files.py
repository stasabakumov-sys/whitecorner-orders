"""Read-only independent verification of Constructor RD downloads; no laser I/O."""
import json
import math
import pathlib
import re
import sys


def number(data):
    value = 0
    for byte in data:
        assert byte < 128
        value = value * 128 + byte
    return value


def verify(path):
    match = re.fullmatch(r'box-(bottom|lid)-L([\d.]+)-W([\d.]+)-D([\d.]+)-half.rd', path.name)
    assert match, 'Unexpected file name'
    _, length, width, depth = match.groups()
    length, width, depth = map(float, (length, width, depth))
    encoded = path.read_bytes()
    raw = []
    for byte in encoded:
        value = ((byte - 1) & 255) ^ 0x88
        raw.append((value & 0x7e) | ((value & 1) << 7) | ((value & 0x80) >> 7))
    commands = []
    for byte in raw:
        if byte >= 128:
            commands.append([byte])
        else:
            assert commands
            commands[-1].append(byte)
    assert commands[0] == [0xd8, 0x11], 'Origin is not Anchor point'
    assert commands[-1] == [0xd7], 'Missing EOF'
    bounds = next(command for command in commands if command[:2] == [0xe7, 7])
    expected_width, expected_height = length / 2 + depth, width + 2 * depth
    assert abs(number(bounds[2:7]) / 1000 - expected_width) <= .0011
    assert abs(number(bounds[7:12]) / 1000 - expected_height) <= .0011
    layer = None
    paths = [[], []]
    minimums, maximums, speeds = [], [], []
    for command in commands:
        if command[:2] == [0xca, 2]:
            layer = command[2]
            assert layer in (0, 1)
        if command[:2] == [0xc9, 2]:
            speeds.append(number(command[2:]) / 1000)
        if command[:2] in ([0xc6, 1], [0xc6, 2]):
            value = number(command[2:]) / 16383 * 100
            (minimums if command[1] == 1 else maximums).append(value)
        if command[:2] in ([0xc6, 0x21], [0xc6, 0x22], [0xc6, 5], [0xc6, 6], [0xc6, 7], [0xc6, 8]):
            assert number(command[2:]) == 0, 'Another laser has nonzero power'
        if command[0] == 0x88:
            assert layer is not None and len(command) == 11
            paths[layer].append([(number(command[1:6]) / 1000, number(command[6:11]) / 1000)])
        if command[0] == 0xa8:
            assert layer is not None and len(command) == 11
            paths[layer][-1].append((number(command[1:6]) / 1000, number(command[6:11]) / 1000))
        assert command[0] not in (0x89, 0x8a, 0x8b, 0xa9, 0xaa, 0xab), 'Unexpected relative geometry'
    assert speeds == [120, 120]
    assert len(minimums) == len(maximums) == 2
    assert all(abs(value - 70) < .01 for value in minimums)
    assert all(abs(value - 80) < .01 for value in maximums)
    assert len(paths[1]) == 1 and len(paths[1][0]) == 13
    assert paths[1][0][0] == paths[1][0][-1], 'Outline is not closed'
    expected_dashes = math.ceil(expected_height / 2) + 2 * math.ceil(length / 4)
    assert len(paths[0]) == expected_dashes
    assert abs(paths[0][0][0][0] - depth) <= .0011
    assert paths[0][0][0][1] == 0 and paths[0][0][1][1] == 1
    assert paths[0][1][0][1] == 2 and paths[0][1][1][1] == 3
    for dash in paths[0]:
        assert len(dash) == 2
        assert 0 < math.dist(*dash) <= 1.0011
        x0, y0 = dash[0]
        x1, y1 = dash[1]
        assert abs(x0 - x1) <= .0011 or abs(y0 - y1) <= .0011
        # Every dash must lie on one of the three folds, not on the outline.
        assert (abs(x0 - depth) <= .0011 and abs(x1 - depth) <= .0011) or (
            abs(y0 - y1) <= .0011 and min(abs(y0 - depth), abs(y0 - depth - width)) <= .0011)
        for x, y in dash:
            assert 0 <= x <= expected_width + .0011 and 0 <= y <= expected_height + .0011
    return {'file': path.name, 'bytes': len(encoded), 'width': expected_width,
            'height': expected_height, 'fold_dashes': len(paths[0]), 'cut_segments': 12,
            'speed': speeds, 'power': [70, 80], 'origin': 'Anchor point'}


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: verify-files.py bottom-half.rd lid-half.rd (owner settings 120/70/80, dot 1 at 2 mm pitch)')
    print(json.dumps([verify(pathlib.Path(filename)) for filename in sys.argv[1:]]))

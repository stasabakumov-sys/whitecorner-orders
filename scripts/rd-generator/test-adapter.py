"""Offline contract checks for browser RD adapter; no network or laser I/O."""
import base64
import json
import pathlib
import sys
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'angular-app/public/rd-generator'))
from generate import generate_json


def job(index):
    layer = {'paths': [[[0, 0], [10, 20]]], 'speed': 120,
             'minPower': 70, 'maxPower': 80, 'color': [69, 214, 255]}
    return {'filename': f'part{index}.rd', 'layers': [layer, dict(layer, color=[255, 0, 0])]}


def unscramble(encoded):
    result = []
    for byte in encoded:
        value = ((byte - 1) & 255) ^ 0x88
        result.append((value & 0x7e) | ((value & 1) << 7) | ((value & 0x80) >> 7))
    return bytes(result)


class AdapterTests(unittest.TestCase):
    def test_small_card_and_backdrop_return_every_job_with_anchor_and_eof(self):
        for count in (1, 2, 4):
            with self.subTest(count=count):
                jobs = [job(index) for index in range(count)]
                files = json.loads(generate_json(json.dumps({'jobs': jobs})))
                self.assertEqual([file['filename'] for file in files], [item['filename'] for item in jobs])
                for file in files:
                    raw = unscramble(base64.b64decode(file['base64']))
                    self.assertGreater(len(raw), 100)
                    self.assertEqual(raw[:2], bytes([0xd8, 0x11]))
                    self.assertEqual(raw[-1], 0xd7)

    def test_incomplete_sets_and_bad_layers_are_rejected(self):
        for count in (0, 3, 5):
            with self.assertRaises(ValueError):
                generate_json(json.dumps({'jobs': [job(index) for index in range(count)]}))
        invalid = job(0)
        invalid['layers'][0]['maxPower'] = 101
        with self.assertRaises(ValueError):
            generate_json(json.dumps({'jobs': [invalid]}))


if __name__ == '__main__':
    unittest.main()

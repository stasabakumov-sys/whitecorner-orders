RD generator: jnweiger/ruida-laser/src/ruida.py
https://github.com/jnweiger/ruida-laser
Source revision: a1e7b9b93b10d5cac79c875bc3efec46f7397a11
Retrieved 2026-10-03. Upstream source SHA-256:
391b31bb99115d31f256e1b9afdca8232aaf339a0f7705b8fc52f10d80949d83
Copyright 2017 Patrick Himmelmann et al.; Juergen Weigert.
The separately distributed Python generator is under GNU GPL v2; see LICENSE.
Local change: correct upstream syntax typo `if r =! self.ACK:` to `if r != self.ACK:`
in the unused RuidaUdp helper. No networking helper is called by browser export.
The browser worker calls Ruida.set and Ruida.write using JSON input and returns
binary files. Python runs in Pyodide v314.0.7, fetched from jsDelivr on demand.
No geometry or settings are uploaded to that CDN.

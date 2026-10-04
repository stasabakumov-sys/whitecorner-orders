// Runs the separately licensed ruida.py generator locally in a browser worker.
let ready;
async function runtime() {
  if (!ready) ready = (async () => {
    self.postMessage({stage: 'Loading Python for RD export…'});
    const {loadPyodide} = await import('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs');
    const py = await loadPyodide({indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'});
    for (const filename of ['ruida.py', 'generate.py']) {
      const response = await fetch(new URL('./' + filename, import.meta.url));
      if (!response.ok) throw Error('Could not load the RD generator. Reload the page and retry.');
      py.FS.writeFile('/home/pyodide/' + filename, await response.text());
    }
    await py.runPythonAsync('from generate import generate_json');
    return py;
  })();
  return ready;
}
self.onmessage = async ({data}) => {
  try {
    const py = await runtime();
    self.postMessage({stage: data.jobs.length === 1 ? 'Creating Small box RD file…' : 'Creating bottom and lid RD files…'});
    py.globals.set('request_json', JSON.stringify(data));
    const encoded = await py.runPythonAsync('generate_json(request_json)');
    const files = JSON.parse(encoded).map(file => ({filename: file.filename,
      bytes: Uint8Array.from(atob(file.base64), char => char.charCodeAt(0))}));
    self.postMessage({files}, files.map(file => file.bytes.buffer));
  } catch (error) {
    ready = undefined;
    self.postMessage({error: 'RD export failed. Check your internet connection and retry. ' + error.message});
  }
};

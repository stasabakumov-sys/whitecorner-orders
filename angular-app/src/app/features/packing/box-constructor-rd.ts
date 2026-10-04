import {BoxNet, Point, boxNet, drawingNumber} from './box-constructor-geometry';

export interface RdLayerSettings {speed: number | null; minPower: number | null; maxPower: number | null}
export interface RdSettings {
  cut: RdLayerSettings;
  fold: RdLayerSettings;
  foldMode: '' | 'line' | 'perforation' | 'dot';
  dash: number | null;
  gap: number | null;
  dotTime: number | null;
  dotInterval: number | null;
  dotLength: number | null;
}
export interface RdLayer {paths: Point[][]; speed: number; minPower: number; maxPower: number; color: number[]}
export interface RdRequest {jobs: {filename: string; layers: RdLayer[]}[]}
export interface RdFile {filename: string; bytes: Uint8Array<ArrayBuffer>}

export function rdSettingsError(settings: RdSettings): string {
  for (const [name, layer] of [['Cut', settings.cut], ['Fold', settings.fold]] as const) {
    if (layer.speed === null || !Number.isFinite(layer.speed) || layer.speed <= 0 || layer.speed > 1000) return `${name}: enter speed between 0 and 1000 mm/s (greater than zero).`;
    if ([layer.minPower, layer.maxPower].some(value => value === null || !Number.isFinite(value) || value < 0 || value > 100)) return `${name}: enter minimum and maximum power between 0 and 100%.`;
    if (layer.minPower! > layer.maxPower!) return `${name}: minimum power cannot exceed maximum power.`;
  }
  if (!settings.foldMode) return 'Choose the folding mode.';
  if (settings.foldMode === 'perforation' && [settings.dash, settings.gap].some(value => value === null || !Number.isFinite(value) || value < 0.1)) return 'Enter perforation dash and gap lengths of at least 0.1 mm.';
  if (settings.foldMode === 'dot') {
    if (settings.dotTime === null || !Number.isFinite(settings.dotTime) || settings.dotTime <= 0) return 'Enter a positive dot time in seconds.';
    if ([settings.dotInterval, settings.dotLength].some(value => value === null || !Number.isFinite(value) || value < 0.1)) return 'Laser Dot currently requires a moving dot length and interval of at least 0.1 mm. Stationary pulses are not supported.';
    if (settings.dotLength! >= settings.dotInterval!) return 'Dot interval must exceed dot length to leave an uncut gap.';
  }
  return '';
}

export function prepareRdRequest(bottom: BoxNet, settings: RdSettings): RdRequest {
  return prepareNetJobs([bottom, boxNet(bottom.length + 10, bottom.width + 10, bottom.depth)], settings, ['box-bottom', 'box-lid'], '-half');
}

export function prepareSmallRdRequest(net: BoxNet, settings: RdSettings, tuck = 40): RdRequest {
  return prepareNetJobs([net], settings, ['small-box'], `-T${drawingNumber(tuck)}`);
}

function prepareNetJobs(nets: BoxNet[], settings: RdSettings, names: string[], suffix: string): RdRequest {
  const error = rdSettingsError(settings);
  if (error) throw Error(error);
  const jobs = nets.map((net, index) => {
    // Absolute coordinates are encoded to 1 µm by the upstream generator.
    if (net.sheetWidth > 10000 || net.sheetHeight > 10000) throw Error('RD export supports piece dimensions up to 10000 mm. Check the box dimensions.');
    let paths: Point[][] = net.folds.map(line => [line.from, line.to]);
    if (settings.foldMode === 'perforation' || settings.foldMode === 'dot') {
      const dash = settings.foldMode === 'dot' ? settings.dotLength! : settings.dash!;
      // RDWorks manual: interval is measured from one dot start to the next.
      const step = settings.foldMode === 'dot' ? settings.dotInterval! : dash + settings.gap!;
      paths = paths.flatMap(([from, to]) => {
        const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const output: Point[][] = [];
        for (let start = 0; start < distance; start += step) {
          if (output.length > 10000) throw Error('Too many perforation segments. Increase dash or gap length.');
          const at = (length: number): Point => [from[0] + (to[0] - from[0]) * length / distance, from[1] + (to[1] - from[1]) * length / distance];
          output.push([at(start), at(Math.min(start + dash, distance))]);
        }
        return output;
      });
    }
    const layer = (paths: Point[][], value: RdLayerSettings, color: number[]): RdLayer => ({paths, speed: value.speed!, minPower: value.minPower!, maxPower: value.maxPower!, color});
    const cuts: Point[][] = [];
    for (const line of net.cuts) {
      const previous=cuts.at(-1);
      const end=previous?.at(-1);
      if(end && end[0]===line.from[0] && end[1]===line.from[1]) previous!.push(line.to);
      else cuts.push([line.from,line.to]);
    }
    return {
      filename: `${names[index]}-L${drawingNumber(net.length)}-W${drawingNumber(net.width)}-D${drawingNumber(net.depth)}${suffix}.rd`,
      // Fold first, while the outline is still attached to the sheet.
      layers: [layer(paths, settings.fold, [69, 214, 255]), layer(cuts, settings.cut, [255, 0, 0])],
    };
  });
  return {jobs};
}

export function generateRdFiles(request: RdRequest, progress: (stage: string) => void): {result: Promise<RdFile[]>; cancel: () => void} {
  const worker = new Worker(new URL('rd-generator/worker.mjs', document.baseURI), {type: 'module'});
  let stop: () => void = () => worker.terminate();
  const result = new Promise<RdFile[]>((resolve, reject) => {
    const timer = setTimeout(() => fail('RD export timed out. Check your connection and retry.'), 120000);
    const cleanup = () => {clearTimeout(timer); worker.terminate();};
    const fail = (message: string) => {cleanup(); reject(Error(message));};
    stop = () => fail('RD export cancelled.');
    worker.onerror = () => fail('Could not start the RD generator. Check your connection and retry.');
    worker.onmessage = ({data}) => {
      if (data.stage) progress(data.stage);
      if (data.error) fail(data.error);
      if (data.files) {
        if (data.files.length !== request.jobs.length || data.files.some((file: RdFile, index: number) => file.filename !== request.jobs[index].filename || !(file.bytes instanceof Uint8Array) || file.bytes.length < 100)) {
          fail('RD generator returned incomplete files. Retry export.'); return;
        }
        cleanup(); resolve(data.files);
      }
    };
    worker.postMessage(request);
  });
  return {result, cancel: () => stop()};
}

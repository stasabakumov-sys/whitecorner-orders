// Available local semantic check for the adapter and handler (no Deno install).
const ts = require('../../../angular-app/node_modules/typescript'), path = require('node:path');
const files = ['wix.ts', 'handler.ts'].map(name => path.join(__dirname, name));
const program = ts.createProgram(files, {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, strict: true});
const diagnostics = ts.getPreEmitDiagnostics(program);
for (const d of diagnostics) console.error(ts.flattenDiagnosticMessageText(d.messageText, '\n'), d.file?.fileName);
console.log(`Billing TypeScript semantic diagnostics: ${diagnostics.length}`);
process.exitCode = diagnostics.length ? 1 : 0;

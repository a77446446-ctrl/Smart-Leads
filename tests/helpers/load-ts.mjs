import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Выполняем настоящий модуль, явно подменяя только его внешние зависимости.
export function loadTs(file, dependencies, expose = '') {
  const url = new URL(`../../${file}`, import.meta.url);
  const source = readFileSync(url, 'utf8') + '\n' + expose;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    fileName: file,
  });
  const nativeRequire = createRequire(url);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('@/') || name.startsWith('.')) throw new Error(`Нет зависимости теста: ${name}`);
    return nativeRequire(name);
  }, module, module.exports);
  return module.exports;
}

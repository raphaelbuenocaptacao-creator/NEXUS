import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
if (!scripts.length) throw Error('Nenhum bloco script encontrado');
let checked = 0;
for (const [, attrs, code] of scripts) {
  if (/\bsrc\s*=/.test(attrs) || !code.trim()) continue;
  if (/\btype\s*=\s*["'](?:application\/json|importmap)["']/.test(attrs)) {
    JSON.parse(code);
  } else {
    new Script(code, { filename: `index.html:inline-script-${++checked}` });
  }
}
if (!checked) throw Error('Nenhum JavaScript inline validado');
// Inspeciona somente HTML estático, evitando falsos positivos em templates JavaScript.
const staticMarkup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
const staticIds = [...staticMarkup.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
for (const id of ['map', 'mapInfo', 'nucleusSummary', 'search', 'searchResults', 'exportMenu', 'importMenu', 'importFile']) {
  if (!staticIds.includes(id)) throw Error(`Elemento essencial ausente no HTML: ${id}`);
}
const repeatedIds = [...new Set(staticIds.filter((id, index) => staticIds.indexOf(id) !== index))];
if (repeatedIds.length) throw Error(`IDs HTML estáticos duplicados: ${repeatedIds.join(', ')}`);
const historical = JSON.parse(readFileSync(new URL('../historico-operacao.json', import.meta.url), 'utf8'));
if (!Array.isArray(historical.rows)) throw Error('Histórico: rows ausente');
if (historical.rows.length > 10000) throw Error('Histórico: quantidade de linhas excedida');
// Rejeita meses impossíveis, profissionais sem nome e linhas duplicadas no histórico.
const historicalKeys = new Set();
for (const [i, row] of historical.rows.entries()) {
  if (!Array.isArray(row) || row.length !== 14 || !/^20\d{2}-\d{2}$/.test(row[0]) || !['captador','liner','closer'].includes(row[1]) || typeof row[2] !== 'string' || row[2].length > 200 || !row.slice(3).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
    throw Error(`Histórico: linha ${i + 1} inválida`);
  }
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(row[0]) || !row[2].trim()) {
    throw Error(`Histórico: mês ou profissional inválido na linha ${i + 1}`);
  }
  const key = JSON.stringify(row.slice(0, 3));
  if (historicalKeys.has(key)) throw Error(`Histórico: registro duplicado na linha ${i + 1}`);
  historicalKeys.add(key);
}

// Cobertura de regressão para recursos essenciais, sem ler nem modificar cadastros locais.
const essentialFeatures = [
  ['navegação por mapa SVG', /<svg\b[^>]*\bid=["']map["']/i],
  ['painel P.O', /\bclass=["'][^"']*\bpo-board\b/i],
  ['responsividade móvel', /@media\s*\(max-width:\s*760px\)/i],
  ['persistência local', /\blocalStorage\b/],
  ['resultados de busca', /\bid=["']searchResults["']/i],
  ['importação de backup', /\bid=["']importFile["']/i]
];
for (const [feature, pattern] of essentialFeatures) {
  if (!pattern.test(html)) throw Error(`Recurso essencial ausente: ${feature}`);
}


// Proteções contra regressões que possam apagar cadastros locais ou executar código arbitrário.
// São verificações estáticas; não substituem testes funcionais de backup/restauração.
const unsafePatterns = [
  ['limpeza de todo o armazenamento local', /\blocalStorage\s*\.\s*clear\s*\(/],
  ['remoção direta de chaves locais', /\blocalStorage\s*\.\s*removeItem\s*\(/],
  ['execução de código via eval', /\beval\s*\(/],
  ['execução de código via new Function', /\bnew\s+Function\s*\(/]
];
for (const [risk, pattern] of unsafePatterns) {
  if (pattern.test(html)) throw Error(`Regressão de segurança detectada: ${risk}`);
}
if (!/function\s+escapeHtml\s*\(/.test(html)) {
  throw Error('Proteção de texto HTML ausente: escapeHtml');
}


// Impede regressão de injeção HTML na lista de conexões do mapa.
const connectSource = html.match(/function\s+connectOpen\s*\(\)\s*\{([\s\S]*?)\}\s*function\s+escapeHtml\s*\(/)?.[1];
if (!connectSource || !/escapeHtml\s*\(\s*n\.id\s*\)/.test(connectSource) || !/escapeHtml\s*\(\s*n\.name\s*\)/.test(connectSource)) {
  throw Error('Conexões: identificador ou nome sem escape HTML');
}


// Regressões críticas: concorrência entre abas e busca tolerante a acentos.
// Não executa o aplicativo nem toca no armazenamento do usuário.
const concurrencyChecks = [
  ['observador de alterações em outra aba', /addEventListener\s*\(\s*['"]storage['"]/],
  ['verificação da versão antes de gravar', /function\s+verifyStoredVersion\s*\(/],
  ['bloqueio de gravação em caso de conflito', /\bstorageProtected\s*=\s*true/]
];
for (const [feature, pattern] of concurrencyChecks) {
  if (!pattern.test(html)) throw Error(`Proteção de persistência ausente: ${feature}`);
}
if (!/function\s+normalizeSearch\s*\(/.test(html) || !/\.normalize\s*\(\s*['"]NFD['"]\s*\)/.test(html)) {
  throw Error('Busca sem normalização de acentos');
}

// Regressão: histórico local, histórico remoto e importação devem compartilhar a mesma validação.
const analyticsValidator = html.match(/function\s+validAnalyticsRows\s*\(rows\)\s*\{return ([^\n]+)\}/)?.[1];
if (!analyticsValidator) throw Error('Validador analítico compartilhado ausente');
for (const [feature, pattern] of [
  ['armazenamento local', /if\s*\(validAnalyticsRows\(saved\)\)/],
  ['histórico remoto', /if\s*\(!validAnalyticsRows\(rows\)\)/],
  ['importação', /validAnalyticsRows\(rows\)/]
]) {
  if (!pattern.test(html)) throw Error(`Validação analítica ausente: ${feature}`);
}
if (!/r\[2\]\.trim\(\)/.test(analyticsValidator) || !/Number\.isFinite/.test(analyticsValidator)) {
  throw Error('Validador analítico não verifica nomes vazios ou números não finitos');
}

console.log(`Validação estática OK: ${checked} script(s), elementos essenciais e ${historical.rows.length} linhas de histórico.`);

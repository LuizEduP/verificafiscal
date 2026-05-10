/**
 * auditor.js — Camada de Auditoria de Dados do VERIFICAFISCAL
 *
 * Executa validações lógicas e de negócio sobre o XML já parseado,
 * após a validação estrutural (XSD) ter sido aprovada.
 *
 * Retorna um objeto no formato:
 *   { valido: boolean, erros?: Array<{linha, coluna, mensagem, codigo}>, avisos?: Array<{mensagem}> }
 *
 * @module auditor
 */

// ─── Mapa de tradução de erros técnicos SEFAZ ────────────────────────────────
const ERROR_TRANSLATIONS = [
  { pattern: /Missing child element/i,            friendly: (m) => `Falta informação obrigatória sobre "${extractElementName(m)}"` },
  { pattern: /Element .+ is not allowed/i,        friendly: (m) => `Elemento "${extractElementName(m)}" não é permitido neste contexto` },
  { pattern: /Element .+ is invalid/i,            friendly: (m) => `Elemento "${extractElementName(m)}" contém valor inválido` },
  { pattern: /Value .+ is not a valid/i,          friendly: (m) => `Valor informado não é válido para o campo "${extractElementName(m)}"` },
  { pattern: /The value .+ has invalid/i,         friendly: (m) => `O valor informado contém caracteres inválidos` },
  { pattern: /String value .+ doesn't match/i,    friendly: (m) => `Formato inválido — o campo não atende ao padrão exigido` },
  { pattern: /The length of the value/i,          friendly: (m) => `Tamanho do campo fora do limite permitido` },
  { pattern: /Duplicate unique/i,                 friendly: ()  => `Elemento duplicado encontrado (violação de unicidade)` },
  { pattern: /Expected different tag/i,           friendly: (m) => `Tag esperada diferente da encontrada — verifique a hierarquia do XML` },
  { pattern: /This element is not expected/i,     friendly: (m) => `Elemento inesperado encontrado na posição atual` },
  { pattern: /content of element .+ is not valid/i, friendly: (m) => `Conteúdo do elemento "${extractElementName(m)}" não é válido` },
  { pattern: /failed to parse/i,                  friendly: ()  => `Erro ao interpretar o XML — verifique a sintaxe` },
  { pattern: /./,                                 friendly: (m) => `Erro de validação: ${m.replace(/\s+/g, ' ').trim()}` },
];

/**
 * Traduz uma mensagem de erro técnico da SEFAZ/libxml2 para uma descrição amigável.
 * @param {string} mensagem - Mensagem de erro original.
 * @returns {string} Mensagem traduzida.
 */
function traduzirErro(mensagem) {
  for (const entry of ERROR_TRANSLATIONS) {
    if (entry.pattern.test(mensagem)) {
      return entry.friendly(mensagem);
    }
  }
  return mensagem;
}

/**
 * Extrai o nome do elemento XML de uma mensagem de erro.
 * Ex: "Element 'det': Missing child element" → "det"
 * @param {string} msg
 * @returns {string}
 */
function extractElementName(msg) {
  const match = msg.match(/'([^']+)'/);
  return match ? match[1] : 'desconhecido';
}

// ─── Helpers de navegação XML (namespace-aware) ───────────────────────────────

/**
 * Constrói um XPath com local-name() para ignorar namespace.
 * @param {string} name - Nome local do elemento.
 * @returns {string} XPath expression.
 */
function xlocal(name) {
  return `*[local-name()="${name}"]`;
}

/**
 * Obtém a linha de um nó XML de forma segura.
 * libxmljs2 Element tem line() como função; Document não tem.
 * @param {object} node
 * @returns {number}
 */
function nodeLine(node) {
  if (!node) return 0;
  if (typeof node.line === 'function') return node.line();
  return 0;
}

/**
 * Obtém a coluna de um nó XML de forma segura.
 * libxmljs2 Element não expõe column() — apenas validationErrors têm .column como número.
 * @param {object} node
 * @returns {number}
 */
function nodeColumn(node) {
  if (!node) return 0;
  if (typeof node.column === 'number') return node.column;
  return 0;
}

/**
 * Obtém o primeiro elemento filho pelo nome local, ignorando namespace.
 * @param {object} parent - Nó libxmljs2 (element).
 * @param {string} localName - Nome local da tag (ex: "vProd").
 * @returns {object|null}
 */
function childElem(parent, localName) {
  if (!parent) return null;
  return parent.get(xlocal(localName));
}

/**
 * Obtém o texto de um elemento filho pelo nome local, ignorando namespace.
 * @param {object} parent
 * @param {string} localName
 * @returns {string|null}
 */
function childText(parent, localName) {
  const child = childElem(parent, localName);
  return child ? child.text() : null;
}

/**
 * Obtém o texto de um elemento por caminho com nomes locais.
 * @param {object} parent
 * @param {string} path - Caminho separado por / (ex: "ide/dhEmi").
 * @returns {string|null}
 */
function childTextByPath(parent, path) {
  if (!parent) return null;
  const parts = path.split('/');
  let current = parent;
  for (const part of parts) {
    current = childElem(current, part);
    if (!current) return null;
  }
  return current.text();
}

/**
 * Busca recursivamente um elemento pelo nome local em toda a árvore DOM,
 * sem usar XPath. Usado como fallback quando XPath falha devido a
 * problemas de namespace em algumas versões do libxmljs2.
 * @param {object} node - Nó libxmljs2 para iniciar a busca.
 * @param {string} localName - Nome local da tag.
 * @returns {object|null}
 */
function findRecursive(node, localName) {
  if (!node) return null;
  // Verifica se o nó atual é o que procuramos
  if (typeof node.type === 'function' && node.type() === 'element') {
    const name = node.name();
    const idx = name.indexOf(':');
    const local = idx >= 0 ? name.substring(idx + 1) : name;
    if (local === localName) return node;
  }
  // Percorre os filhos
  if (typeof node.childNodes === 'function') {
    const children = node.childNodes();
    for (const child of children) {
      const found = findRecursive(child, localName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Busca o primeiro elemento em todo o documento pelo nome local.
 * Tenta XPath primeiro; se falhar, usa busca recursiva manual.
 * @param {object} xmlDoc - Documento libxmljs2.
 * @param {string} localName
 * @returns {object|null}
 */
function findGlobal(xmlDoc, localName) {
  // Tenta XPath first
  try {
    const results = xmlDoc.find(`//${xlocal(localName)}`);
    if (results && results.length > 0) return results[0];
  } catch (_) {
    // XPath falhou — fallback para busca manual
  }
  // Fallback: busca recursiva manual
  return findRecursive(xmlDoc.root(), localName);
}

/**
 * Busca todos os elementos em todo o documento pelo nome local.
 * @param {object} xmlDoc
 * @param {string} localName
 * @returns {object[]}
 */
function findAllGlobal(xmlDoc, localName) {
  try {
    return xmlDoc.find(`//${xlocal(localName)}`) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Converte string numérica (ex: "1234.56") para float.
 * @param {string|null} val
 * @returns {number}
 */
function toFloat(val) {
  if (val == null || val === '') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

// ─── Validações ───────────────────────────────────────────────────────────────

/**
 * 1. Validação de Conteúdo Crítico
 *    - Tags de assinatura digital não podem estar vazias
 *    - CNPJ/CPF devem ter dígitos corretos e não ser sequência de zeros
 */
function validarConteudoCritico(xmlDoc) {
  const erros = [];

  // Assinatura digital — busca em qualquer namespace
  const sigValue = findGlobal(xmlDoc, 'SignatureValue');
  const x509Cert  = findGlobal(xmlDoc, 'X509Certificate');
  const digValue  = findGlobal(xmlDoc, 'DigestValue');

  if (!sigValue || !sigValue.text() || sigValue.text().trim() === '') {
    erros.push({
      linha: nodeLine(sigValue),
      coluna: nodeColumn(sigValue),
      mensagem: 'Assinatura digital ausente ou incompleta',
      codigo: 'AUD-001'
    });
  }

  if (!x509Cert || !x509Cert.text() || x509Cert.text().trim() === '') {
    erros.push({
      linha: nodeLine(x509Cert),
      coluna: nodeColumn(x509Cert),
      mensagem: 'Assinatura digital ausente ou incompleta',
      codigo: 'AUD-002'
    });
  }

  if (!digValue || !digValue.text() || digValue.text().trim() === '') {
    erros.push({
      linha: nodeLine(digValue),
      coluna: nodeColumn(digValue),
      mensagem: 'Assinatura digital ausente ou incompleta',
      codigo: 'AUD-003'
    });
  }

  // CNPJ/CPF do emitente
  const emit = findGlobal(xmlDoc, 'emit');
  if (emit) {
    const cnpjEmit = childText(emit, 'CNPJ');
    const cpfEmit  = childText(emit, 'CPF');
    const docEmit = cnpjEmit || cpfEmit;
    const tipoDoc = cnpjEmit ? 'CNPJ' : 'CPF';

    if (docEmit) {
      const digitsOnly = docEmit.replace(/\D/g, '');
      const expectedLen = tipoDoc === 'CNPJ' ? 14 : 11;

      if (digitsOnly.length !== expectedLen) {
        erros.push({
          linha: nodeLine(emit),
          coluna: nodeColumn(emit),
          mensagem: `Documento Inválido — ${tipoDoc} do emitente possui ${digitsOnly.length} dígitos (esperado ${expectedLen})`,
          codigo: 'AUD-004'
        });
      }

      if (/^0+$/.test(digitsOnly)) {
        erros.push({
          linha: nodeLine(emit),
          coluna: nodeColumn(emit),
          mensagem: 'Documento Inválido — CNPJ/CPF do emitente é uma sequência de zeros',
          codigo: 'AUD-005'
        });
      }
    }
  }

  // CNPJ/CPF do destinatário
  const dest = findGlobal(xmlDoc, 'dest');
  if (dest) {
    const cnpjDest = childText(dest, 'CNPJ');
    const cpfDest  = childText(dest, 'CPF');
    const docDest = cnpjDest || cpfDest;
    const tipoDocDest = cnpjDest ? 'CNPJ' : 'CPF';

    if (docDest) {
      const digitsOnly = docDest.replace(/\D/g, '');
      const expectedLen = tipoDocDest === 'CNPJ' ? 14 : 11;

      if (digitsOnly.length !== expectedLen) {
        erros.push({
          linha: nodeLine(dest),
          coluna: nodeColumn(dest),
          mensagem: `Documento Inválido — ${tipoDocDest} do destinatário possui ${digitsOnly.length} dígitos (esperado ${expectedLen})`,
          codigo: 'AUD-006'
        });
      }

      if (/^0+$/.test(digitsOnly)) {
        erros.push({
          linha: nodeLine(dest),
          coluna: nodeColumn(dest),
          mensagem: 'Documento Inválido — CNPJ/CPF do destinatário é uma sequência de zeros',
          codigo: 'AUD-007'
        });
      }
    }
  }

  return erros;
}

/**
 * 2. Auditoria de Cálculos (Matemática Fiscal)
 *    - Total da Nota: vProd - vDesc + frete + seguro + outras + II + IPI = vNF
 *    - ICMS: vBC * pICMS ≈ vICMS (tolerância R$ 0,01)
 */
function validarCalculos(xmlDoc) {
  const erros = [];

  // --- Total da Nota ---
  const icmsTot = findGlobal(xmlDoc, 'ICMSTot');
  if (!icmsTot) return erros;

  const vProd  = toFloat(childText(icmsTot, 'vProd'));
  const vDesc  = toFloat(childText(icmsTot, 'vDesc'));
  const vFrete = toFloat(childText(icmsTot, 'vFrete'));
  const vSeg   = toFloat(childText(icmsTot, 'vSeg'));
  const vOutro = toFloat(childText(icmsTot, 'vOutro'));
  const vII    = toFloat(childText(icmsTot, 'vII'));
  const vIPI   = toFloat(childText(icmsTot, 'vIPI'));
  const vNF    = toFloat(childText(icmsTot, 'vNF'));

  // Fórmula: vProd - vDesc + vFrete + vSeg + vOutro + vII + vIPI = vNF
  const calculado = vProd - vDesc + vFrete + vSeg + vOutro + vII + vIPI;
  const diferenca = Math.abs(calculado - vNF);

  if (diferenca > 0.01) {
    erros.push({
      linha: nodeLine(icmsTot),
      coluna: nodeColumn(icmsTot),
      mensagem: `Divergência no Total da Nota — soma dos componentes (R$ ${calculado.toFixed(2)}) difere do vNF declarado (R$ ${vNF.toFixed(2)})`,
      codigo: 'AUD-101'
    });
  }

  // --- ICMS por item (produto) ---
  const dets = findAllGlobal(xmlDoc, 'det');
  for (const det of dets) {
    const nItem = det.attr('nItem') ? det.attr('nItem').value() : '?';

    // Busca o grupo ICMS dentro do det (caminho: det/imposto/ICMS)
    const imposto = childElem(det, 'imposto');
    if (!imposto) continue;
    const icmsGroup = childElem(imposto, 'ICMS');
    if (!icmsGroup) continue;

    // Itera sobre os filhos do ICMS (ICMS00, ICMS10, ICMS20, etc.)
    const icmsChildren = icmsGroup.childNodes().filter(n => n.type() === 'element');
    for (const icmsChild of icmsChildren) {
      const vBC   = toFloat(childText(icmsChild, 'vBC'));
      const pICMS = toFloat(childText(icmsChild, 'pICMS'));
      const vICMS = toFloat(childText(icmsChild, 'vICMS'));

      // Só valida se todos os três valores existirem e forem > 0
      if (vBC > 0 && pICMS > 0 && vICMS > 0) {
        const esperado = vBC * (pICMS / 100);
        const diff = Math.abs(esperado - vICMS);

        if (diff > 0.01) {
          erros.push({
            linha: nodeLine(icmsChild),
            coluna: nodeColumn(icmsChild),
            mensagem: `Divergência no ICMS do item ${nItem} — BC (R$ ${vBC.toFixed(2)}) × alíquota (${pICMS.toFixed(2)}%) = R$ ${esperado.toFixed(2)}, mas vICMS declarado é R$ ${vICMS.toFixed(2)}`,
            codigo: 'AUD-102'
          });
        }
      }
    }
  }

  return erros;
}

/**
 * 3. Verificação de Coerência
 *    - dhEmi não pode ser futura (além de 5 min do horário atual)
 *    - tpAmb = 2 → aviso (homologação)
 */
function validarCoerencia(xmlDoc) {
  const erros = [];
  const avisos = [];

  // --- Data de emissão ---
  const infNFe = findGlobal(xmlDoc, 'infNFe');
  if (infNFe) {
    const dhEmi = childTextByPath(infNFe, 'ide/dhEmi');
    if (dhEmi) {
      const emissao = new Date(dhEmi);
      if (!isNaN(emissao.getTime())) {
        const agora = new Date();
        const diffMs = emissao.getTime() - agora.getTime();
        const diffMin = diffMs / 60000;

        if (diffMin > 5) {
          erros.push({
            linha: nodeLine(infNFe),
            coluna: nodeColumn(infNFe),
            mensagem: `Data de emissão (${dhEmi}) está no futuro — diferença de ${Math.round(diffMin)} minutos`,
            codigo: 'AUD-201'
          });
        }
      }
    }
  }

  // --- Ambiente ---
  const tpAmbNode = findGlobal(xmlDoc, 'tpAmb');
  if (tpAmbNode) {
    const tpAmb = tpAmbNode.text();
    if (tpAmb === '2') {
      avisos.push({
        mensagem: 'Nota fiscal em Ambiente de Homologação (testes) — sem valor fiscal real'
      });
    }
  }

  return { erros, avisos };
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Executa a auditoria completa sobre um XML já parseado pelo libxmljs2.
 *
 * @param {object} xmlDoc - Documento XML parseado (libxmljs2 Document).
 * @param {Array} xsdErrors - Array de erros da validação XSD (para tradução).
 * @returns {object} Resultado da auditoria:
 *   { valido: boolean, erros?: Array, avisos?: Array }
 */
function auditar(xmlDoc, xsdErrors) {
  const resultado = {
    valido: true,
    erros: [],
    avisos: []
  };

  // 4. Tradução de erros técnicos SEFAZ → amigáveis
  if (xsdErrors && xsdErrors.length > 0) {
    for (const err of xsdErrors) {
      resultado.erros.push({
        linha: err.linha,
        coluna: err.coluna,
        mensagem: traduzirErro(err.mensagem),
        codigo: err.codigo || 'XSD-ERR'
      });
    }
  }

  // 1. Conteúdo crítico
  const errosConteudo = validarConteudoCritico(xmlDoc);
  resultado.erros.push(...errosConteudo);

  // 2. Cálculos fiscais
  const errosCalculos = validarCalculos(xmlDoc);
  resultado.erros.push(...errosCalculos);

  // 3. Coerência
  const { erros: errosCoerencia, avisos: avisosCoerencia } = validarCoerencia(xmlDoc);
  resultado.erros.push(...errosCoerencia);
  resultado.avisos.push(...avisosCoerencia);

  // Se houver erros, marca como inválido
  if (resultado.erros.length > 0) {
    resultado.valido = false;
  }

  // Limpa arrays vazios para não poluir o JSON
  if (resultado.erros.length === 0) delete resultado.erros;
  if (resultado.avisos.length === 0) delete resultado.avisos;

  return resultado;
}

module.exports = { auditar, traduzirErro, ERROR_TRANSLATIONS };

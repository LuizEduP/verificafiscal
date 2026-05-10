const libxmljs = require('libxmljs2');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  mdfe: {
    dir: './schemas/mdfe/PL_MDFe_300b_NT012025_1.05',
    schemas: {
      MDFe: 'mdfe_v3.00.xsd',
      enviMDFe: 'enviMDFe_v3.00.xsd',
      eventoMDFe: 'eventoMDFe_v3.00.xsd',
      mdfeProc: 'procMDFe_v3.00.xsd',
      consSitMDFe: 'consSitMDFe_v3.00.xsd',
      consReciMDFe: 'consReciMDFe_v3.00.xsd',
      consStatServMDFe: 'consStatServMDFe_v3.00.xsd',
      consMDFeNaoEnc: 'consMDFeNaoEnc_v3.00.xsd',
      distMDFe: 'distMDFe_v3.00.xsd',
      mdfeConsultaDFe: 'mdfeConsultaDFe_v3.00.xsd'
    }
  },
  nfe: {
    dir: './schemas/nfe_nfce/PL_010c_NT2022_002v1.30',
    schemas: {
      NFe: 'nfe_v4.00.xsd',
      nfeProc: 'nfe_v4.00.xsd'
    }
  }
};

/**
 * Identifica o tipo de documento fiscal pela tag raiz do XML.
 *
 * @param {string} xml - Conteúdo do XML a ser analisado.
 * @returns {object|null} { tipo, schemaFile } ou null se não reconhecido.
 */
function detectType(xml) {
  const match = xml.match(/<(\w+:)?(\w+)(?:[\s>/])/);
  if (!match) return null;
  const rootTag = match[2];
  for (const [tipo, config] of Object.entries(CONFIG)) {
    if (config.schemas[rootTag]) return { tipo, schemaFile: config.schemas[rootTag] };
  }
  return null;
}

/**
 * Valida um XML contra o schema XSD correspondente ao tipo do documento.
 *
 * No libxmljs2 >= 0.35, a API de validação mudou:
 *   - parseXmlSchema() foi removido
 *   - xmlDoc.validate(xsdDoc) recebe um Document (XSD parseado como XML)
 *   - validationErrors é lido de xmlDoc após validate()
 *
 * @param {string} xml - Conteúdo do XML a ser validado.
 * @param {object} docType - Objeto { tipo, schemaFile } retornado por detectType().
 * @returns {object} { valido: true } ou { valido: false, erros: [...] }.
 *
 * Cada erro no array `erros` segue o formato:
 *   { linha: number, coluna: number, mensagem: string, codigo: string|null }
 *
 * @throws {Error} Se o schema XSD não for encontrado ou o XML for malformado.
 */
function validateXML(xml, docType) {
  const config = CONFIG[docType.tipo];
  const xsdDir = path.resolve(__dirname, '..', config.dir);
  const xsdPath = path.join(xsdDir, docType.schemaFile);
  // Parse XSD with baseUrl (file:/// prefix + trailing slash) so libxml2
  // can resolve relative xs:include / xs:import paths on Windows
  const xsdBaseUrl = 'file:///' + xsdDir.replace(/\\/g, '/') + '/';
  const xsdDoc = libxmljs.parseXml(fs.readFileSync(xsdPath, 'utf-8'), {
    baseUrl: xsdBaseUrl
  });
  const xmlDoc = libxmljs.parseXml(xml);
  const isValid = xmlDoc.validate(xsdDoc);
  if (isValid) return { valido: true, xmlDoc: xmlDoc };
  return {
    valido: false,
    xmlDoc: xmlDoc,
    erros: (xmlDoc.validationErrors || []).map(e => ({
      linha: e.line,
      coluna: e.column,
      mensagem: e.message.trim(),
      codigo: e.code || null
    }))
  };
}

module.exports = { CONFIG, detectType, validateXML };

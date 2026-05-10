# Especificação Funcional — VERIFICAFISCAL

> **Propósito:** Fonte única da verdade para implementação por IA autônoma.
> **Princípios:** KISS | DRY (KISS vence em conflito) | AI-ready.

---

## 1. Arquivos

Criar exatamente 4 arquivos:

| Arquivo | Linhas | Conteúdo |
|---------|--------|----------|
| `package.json` | ~12 | Dependências + script |
| `server.js` | ~25 | Servidor Express, importa `src/validator.js` |
| `src/validator.js` | ~74 | Módulo de validação: CONFIG, detectType(), validateXML() |
| `public/index.html` | ~55 | Frontend single-file |

---

## 2. `package.json`

```json
{
  "name": "verificafiscal",
  "version": "1.0.0",
  "description": "Validador offline de documentos fiscais eletrônicos (NFe, NFCe, MDFe)",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "express": "^4.18",
    "libxmljs2": "^0.33",
    "cors": "^2.8"
  }
}
```

Regras: 3 dependências. Sem devDependencies. Sem body-parser.

---

## 3. `server.js`

Ordem: `require`s → Express setup → `POST /validar` → `app.listen()`

### 3.1. Código completo

```js
const express = require('express');
const cors = require('cors');
const { detectType, validateXML } = require('./src/validator');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

app.post('/validar', (req, res) => {
  const { xml } = req.body;
  if (!xml || typeof xml !== 'string') return res.status(400).json({ erro: 'XML não fornecido' });
  const docType = detectType(xml);
  if (!docType) return res.status(400).json({ erro: 'Tipo de documento não reconhecido' });
  try {
    const result = validateXML(xml, docType);
    res.json({ ...result, tipo: docType.tipo, schema: docType.schemaFile });
  } catch (e) {
    res.status(400).json({ erro: 'Erro ao processar XML', detalhes: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VERIFICAFISCAL rodando em http://localhost:${PORT}`));
```

---

## 4. `src/validator.js`

Ordem: `require`s → `CONFIG` → `detectType()` → `validateXML()` → `module.exports`

### 4.1. Código completo

```js
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
    schemas: { NFe: 'nfe_v4.00.xsd' }
  }
};

function detectType(xml) {
  const match = xml.match(/<(\w+:)?(\w+)[\s>]/);
  if (!match) return null;
  const rootTag = match[2];
  for (const [tipo, config] of Object.entries(CONFIG)) {
    if (config.schemas[rootTag]) return { tipo, schemaFile: config.schemas[rootTag] };
  }
  return null;
}

function validateXML(xml, docType) {
  const config = CONFIG[docType.tipo];
  const xsdPath = path.resolve(__dirname, '..', config.dir, docType.schemaFile);
  const schema = libxmljs.parseXmlSchema(fs.readFileSync(xsdPath, 'utf-8'));
  const xmlDoc = libxmljs.parseXml(xml);
  const isValid = schema.validate(xmlDoc);
  if (isValid) return { valido: true };
  return {
    valido: false,
    erros: schema.validationErrors.map(e => ({
      linha: e.line, coluna: e.column, mensagem: e.message.trim(), codigo: e.code || null
    }))
  };
}

module.exports = { CONFIG, detectType, validateXML };
```

---

## 5. `public/index.html`

Arquivo único. CSS e JS inline. Sem arquivos externos.

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VERIFICAFISCAL</title>
<style>
body{font-family:'Segoe UI',Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#f5f5f5}
h1{color:#1a237e}
textarea{width:100%;height:300px;font-family:monospace;font-size:13px;padding:10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box}
button{background:#1a237e;color:#fff;border:none;padding:10px 30px;font-size:16px;border-radius:4px;cursor:pointer;margin:10px 0}
button:hover{background:#283593}
pre{background:#fff;border:1px solid #ddd;border-radius:4px;padding:15px;font-family:monospace;font-size:13px;white-space:pre-wrap;word-wrap:break-word;min-height:50px}
</style>
</head>
<body>
<h1>VERIFICAFISCAL</h1>
<p>Validador de documentos fiscais eletrônicos</p>
<textarea id="xmlInput" placeholder="Cole o XML aqui..."></textarea>
<br>
<button id="btnValidar">Validar</button>
<pre id="resultado"></pre>
<script>
document.getElementById('btnValidar').addEventListener('click',function(){
  var xml=document.getElementById('xmlInput').value;
  var pre=document.getElementById('resultado');
  if(!xml.trim()){pre.textContent='Por favor, cole um XML para validar.';pre.style.color='#e65100';return}
  pre.textContent='Validando...';pre.style.color='#333';
  fetch('/validar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({xml})})
  .then(function(r){return r.json()})
  .then(function(data){pre.textContent=JSON.stringify(data,null,2);pre.style.color=data.valido?'#1b5e20':'#b71c1c'})
  .catch(function(err){pre.textContent='Erro de conexao: '+err.message;pre.style.color='#b71c1c'})
});
</script>
</body>
</html>
```

---

## 6. Contratos da API

### Request
```
POST /validar
Content-Type: application/json
{ "xml": "<?xml version=\"1.0\"?>..." }
```

### Responses

| Status | Cenário | Body |
|--------|---------|------|
| 200 | Válido | `{ "valido": true, "tipo": "nfe", "schema": "nfe_v4.00.xsd" }` |
| 200 | Inválido | `{ "valido": false, "tipo": "mdfe", "schema": "mdfe_v3.00.xsd", "erros": [{ "linha": 15, "coluna": 8, "mensagem": "Element 'cUF'...", "codigo": "1871" }] }` |
| 400 | XML não fornecido | `{ "erro": "XML não fornecido" }` |
| 400 | Tipo não reconhecido | `{ "erro": "Tipo de documento não reconhecido" }` |
| 400 | Erro de parsing | `{ "erro": "Erro ao processar XML", "detalhes": "..." }` |

---

## 7. Casos de Teste

| ID | Cenário | Entrada | Esperado |
|----|---------|---------|----------|
| CT01 | NFe válida | XML NFe completo | `valido: true` |
| CT02 | NFe inválida | XML NFe sem campo obrigatório | `valido: false` + erros |
| CT03 | MDFe válido | XML MDFe completo | `valido: true` |
| CT04 | enviMDFe válido | XML `<enviMDFe>` | `valido: true` |
| CT05 | XML vazio | `{ "xml": "" }` | HTTP 400 |
| CT06 | Tag não reconhecida | `{ "xml": "<foo/>" }` | HTTP 400 |
| CT07 | XML malformado | `{ "xml": "não é xml" }` | HTTP 400 |

---

## 8. Checklist de Implementação

- [x] `package.json` com 3 dependências exatas
- [x] `server.js` importa `src/validator.js`, síncrono
- [x] `src/validator.js` com CONFIG, detectType, validateXML
- [x] CONFIG com 10 tags MDFe + 1 tag NFe
- [x] Regex `/<(\w+:)?(\w+)[\s>]/` para detectType
- [x] `path.resolve(__dirname, ...)` para caminhos absolutos
- [x] Erros mapeados para `{ linha, coluna, mensagem, codigo }`
- [x] CORS habilitado
- [x] `express.json({ limit: '10mb' })`
- [x] Static: `public/`
- [x] Porta via `process.env.PORT || 3000`
- [x] Frontend: valida campo vazio, mostra "Validando...", colore resultado
- [x] `npm start` → `node server.js`

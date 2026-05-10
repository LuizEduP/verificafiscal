# VERIFICAFISCAL

Validador offline de documentos fiscais eletrônicos brasileiros (NFe, NFCe, MDFe) contra os schemas XSD oficiais da SEFAZ.

## Funcionalidades

- **Validação offline** — seu XML nunca sai da sua máquina
- **Detecção automática** — identifica o tipo de documento pela tag raiz do XML
- **API REST** — endpoint `POST /validar` para integração com outras ferramentas
- **Interface web** — cole o XML e veja o resultado instantaneamente
- **Erros detalhados** — linha, coluna e mensagem para cada erro de validação

## Documentos Suportados

| Tipo | Versão Schema | Tags Raiz Reconhecidas |
|------|--------------|------------------------|
| **NFe / NFCe** | 4.00 (PL_010c_NT2022_002v1.30) | `NFe` |
| **MDFe** | 3.00 (PL_MDFe_300b_NT012025_1.05) | `MDFe`, `enviMDFe`, `eventoMDFe`, `mdfeProc`, `consSitMDFe`, `consReciMDFe`, `consStatServMDFe`, `consMDFeNaoEnc`, `distMDFe`, `mdfeConsultaDFe` |

## Pré-requisitos

- **Node.js** 18+
- **Ferramentas de build C++** (para compilar libxmljs2)
  - **Windows**: Visual Studio Build Tools com workload "Desktop development with C++"
  - **Linux**: `sudo apt install build-essential libxml2-dev libxslt1-dev`
  - **macOS**: `xcode-select --install`

## Instalação

```bash
git clone https://github.com/seu-usuario/verificafiscal.git
cd verificafiscal
npm install
npm start
```

Acesse **http://localhost:3000**.

## Uso

### Interface Web

Abra `http://localhost:3000`, cole o XML e clique em **Validar**.

### API REST

```bash
curl -X POST http://localhost:3000/validar \
  -H "Content-Type: application/json" \
  -d '{"xml": "<?xml version=\"1.0\"?> <NFe>...</NFe>"}'
```

#### Resposta — Válido
```json
{ "valido": true, "tipo": "nfe", "schema": "nfe_v4.00.xsd" }
```

#### Resposta — Inválido
```json
{
  "valido": false,
  "tipo": "mdfe",
  "schema": "mdfe_v3.00.xsd",
  "erros": [
    { "linha": 15, "coluna": 8, "mensagem": "Element 'cUF' is not valid...", "codigo": "1871" }
  ]
}
```

## Estrutura do Projeto

```
verificafiscal/
├── package.json            # Dependências (runtime)
├── server.js               # Servidor Express (runtime)
├── src/
│   └── validator.js        # Módulo de validação (runtime)
├── public/
│   └── index.html          # Interface web (runtime)
├── schemas/                # Schemas XSD oficiais (runtime)
│   ├── mdfe/...
│   └── nfe_nfce/...
├── specs/                  # Documentação técnica
│   └── especificacao-funcional.md
├── docs/
│   └── visao/
│       └── visao-do-produto.md
└── plans/
    └── validacao-fiscal.md
```

## Configuração

O mapeamento de tags raiz para schemas XSD é feito no objeto `CONFIG` no topo do [`src/validator.js`](src/validator.js). Para detalhes completos, consulte a [`spec`](specs/especificacao-funcional.md).

## Tecnologias

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [libxmljs2](https://github.com/mmarcon/libxmljs2)
- [CORS](https://github.com/expressjs/cors)

## Licença

MIT

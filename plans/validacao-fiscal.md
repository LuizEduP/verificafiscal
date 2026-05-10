# Plano — VERIFICAFISCAL

## Princípios

1. **KISS** — Mínimo de código. Sem abstrações.
2. **DRY** — Sem repetir lógica. KISS vence em conflito.
3. **AI-ready** — Spec precisa o suficiente para IA gerar código sem ambiguidade.

## O que fazer

Criar **4 arquivos** que implementam um validador offline de documentos fiscais (NFe, NFCe, MDFe):

| Arquivo | O que faz |
|---------|-----------|
| `package.json` | 3 dependências: express, libxmljs2, cors |
| `server.js` | Servidor Express (~25 linhas) com POST /validar, importa `src/validator.js` |
| `src/validator.js` | Módulo de validação: CONFIG, detectType(), validateXML() |
| `public/index.html` | Frontend single-file com textarea + botão + pre |

## Fluxo

```mermaid
flowchart TD
    U[Usuário] -->|abre| W[index.html]
    W -->|cola XML + clica Validar| F[fetch POST /validar]
    F --> S[server.js]
    S --> V[src/validator.js]
    V --> D{detectType: tag raiz?}
    D -->|MDFe/enviMDFe/...| M[usa schema MDFe]
    D -->|NFe| N[usa schema NFe]
    D -->|outro| E1[400 erro]
    M --> X[validateXML com libxmljs2]
    N --> X
    X -->|OK| R1[200 {valido: true, tipo, schema}]
    X -->|erros| R2[200 {valido: false, tipo, schema, erros}]
    R1 --> W
    R2 --> W
```

## Decisões Técnicas

- **Síncrono** — sem async/await
- **Módulo dedicado** — lógica de validação em `src/validator.js`
- **Sem body-parser** — Express 4.16+ já tem `express.json()`
- **Porta 3000** — configurável via `PORT`
- **CORS aberto**
- **libxmljs2** resolve `xs:include`/`xs:import` automaticamente

## Spec de referência

[`specs/especificacao-funcional.md`](specs/especificacao-funcional.md) — código exato, contratos, testes, checklist.

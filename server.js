const express = require('express');
const cors = require('cors');
const { detectType, validateXML } = require('./src/validator');
const { auditar } = require('./src/auditor');

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
    // 1. Validação estrutural via XSD (retorna xmlDoc já parseado)
    const result = validateXML(xml, docType);

    if (!result.valido) {
      // XSD falhou — retorna apenas os erros de schema (sem auditoria)
      return res.json({
        valido: false,
        erros: result.erros,
        tipo: docType.tipo,
        schema: docType.schemaFile
      });
    }

    // 2. XSD válido — executa auditoria de dados usando o mesmo xmlDoc
    const auditoria = auditar(result.xmlDoc, []);
    res.json({
      ...auditoria,
      tipo: docType.tipo,
      schema: docType.schemaFile
    });
  } catch (e) {
    res.status(400).json({ erro: 'Erro ao processar XML', detalhes: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VERIFICAFISCAL rodando em http://localhost:${PORT}`));

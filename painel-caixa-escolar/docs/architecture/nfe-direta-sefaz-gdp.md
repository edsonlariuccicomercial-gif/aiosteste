# Arquitetura - NF-e Direta com SEFAZ no GDP

## Objetivo

Preparar o `GDP` para emissao direta de `NF-e` sem provedor intermediario, usando certificado `A1`, payload fiscal proprio e transmissao para a `SEFAZ`.

## Escopo desta base

- acoes fiscais incorporadas ao endpoint `api/gdp-integrations.js`
- cliente compartilhado `api/lib/nfe-sefaz-client.js`
- template de ambiente `.env.nfe-sefaz.example`
- contrato inicial do payload fiscal derivado do pedido do GDP

## Fluxo proposto

1. Pedido no GDP recebe dados fiscais obrigatorios.
2. O GDP monta o payload fiscal via `buildNfePayloadFromPedido`.
3. O endpoint `api/gdp-integrations.js` opera em dois modos fiscais:
- `preview`: monta e retorna o payload da NF-e
- `emitir`: reserva o ponto de emissao direta
4. A camada de emissao direta devera:
- gerar XML conforme schema vigente da NF-e
- assinar o XML com o certificado A1
- transmitir para o webservice de autorizacao
- salvar recibo, protocolo, chave e XML autorizado
5. Com NF autorizada:
- gerar cobranca no `Banco Inter`
- enviar e-mail pelo `Resend`
- usar `WhatsApp` apenas para contas vencidas

## Variaveis obrigatorias

- `NFE_SEFAZ_AMBIENTE`
- `NFE_SEFAZ_UF`
- `NFE_EMITENTE_CNPJ`
- `NFE_EMITENTE_RAZAO`
- `NFE_EMITENTE_IE`
- `NFE_CERT_BASE64`
- `NFE_CERT_PASSWORD`

## Variaveis opcionais para pre-assinatura

- `NFE_CERT_PEM`
- `NFE_KEY_PEM`

Essas variaveis permitem validar o caminho criptografico e gerar uma `pre-assinatura` local. Isso ainda nao substitui a assinatura `XMLDSig` exigida pela NF-e.

## Pontos criticos

- armazenamento seguro do certificado A1
- schema XML atualizado
- assinatura digital
- homologacao antes de producao
- tratamento de rejeicoes, cancelamento e inutilizacao

## Decisao tecnica

Nesta etapa, o endpoint ainda nao transmite para a SEFAZ. Ele existe para:

- validar configuracao
- padronizar o payload da NF-e
- gerar XML base
- validar certificado A1 e PEM
- gerar pre-assinatura local para diagnostico
- gerar `XMLDSig preview` com `RSA-SHA1`/`SHA-1` para aproximar o formato exigido pela NF-e
- gerar `lote enviNFe preview`
- separar a responsabilidade fiscal do restante do dashboard
- permitir evolucao incremental sem misturar regra fiscal com UI

## Proxima implementacao

1. canonicalizacao/ajuste final da XMLDSig conforme validacao SEFAZ
2. assinatura digital final com certificado A1
3. cliente de autorizacao SEFAZ
4. parser de retorno da SEFAZ
5. persistencia de XML e protocolo

# Bulk Analyzer

Web Performance Intelligence System — analisa Core Web Vitals, Lighthouse scores e TTFB em bulk para 1000+ páginas de um site.

## Stack

- **Frontend**: Next.js 15 + Orbitron/Share Tech Mono (tema Radar Terminal)
- **Backend**: Fastify 5 (Node.js)
- **Queue**: BullMQ + Redis
- **Worker**: Node.js + Lighthouse + Chromium (headless)
- **Crawler**: Crawlee (sitemap.xml auto-discovery)
- **Banco**: PostgreSQL 16 + Drizzle ORM
- **AI**: Google Gemini 2.5 Flash (relatórios de performance)
- **Infra**: Docker Compose (totalmente self-hosted)

## Testes

```bash
yarn test
```

Roda os testes de todas as workspaces. Para rodar individualmente:

```bash
yarn workspace @bulk/web test      # utils (scoreClass, fmt, fmtMs, fetchWithRetry...)
yarn workspace @bulk/api test      # ai helpers + rotas da API
```

| Suite | Testes | Cobertura |
|---|---|---|
| `apps/web/app/utils.test.ts` | 42 | `scoreClass`, `fmt`, `fmtMs`, `statusColor`, `fetchWithRetry` (retry, 401 skip, auth headers) |
| `apps/api/src/ai.test.ts` | 13 | `validateLinks` (200/403/404/405/network/duplicates/batching), `callGemini` (payload, modelo, erro 429) |
| `apps/api/src/routes/jobs.test.ts` | 13 | `POST /jobs` (validação), `GET /jobs/:id`, `POST /jobs/:id/cancel`, `POST /jobs/:id/ai-report` |

Framework: **Vitest** — roda localmente sem Docker, sem banco de dados.

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) + Docker Compose

Só isso. Node.js e Yarn só são necessários para desenvolvimento local.

## Rodando com Docker

```bash
docker compose up --build
```

O Docker sobe tudo na ordem certa automaticamente:

1. PostgreSQL e Redis iniciam com healthchecks
2. `migrate` roda as migrations do banco e encerra
3. API e Worker sobem (só depois das migrations)
4. Web faz o build e sobe (só depois da API)

Acesse: **http://localhost:3000**

> Na primeira vez (`--build`), o build pode demorar 3–5 minutos — o Worker instala o Chromium dentro do container.

## Desenvolvimento (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

O `docker-compose.dev.yml` monta os diretórios `src/` como volumes, então qualquer alteração em código reflete instantaneamente sem rebuild.

## Variáveis de ambiente

Os valores padrão já funcionam com o `docker-compose.yml`. Para customizar, crie um `.env` na raiz:

```env
DATABASE_URL=postgres://bulk:bulk@localhost:5432/bulk_analyzer
REDIS_URL=redis://localhost:6379
AUDIT_CONCURRENCY=5
NEXT_PUBLIC_API_URL=http://localhost:4000

# Opcional: relatórios de IA (Google AI Studio)
GEMINI_API_KEY=sua-chave-aqui

# Opcional: proteger endpoints de escrita
AUTH_TOKEN=seu-token-secreto

# Limite de audits simultâneos por domínio
DOMAIN_RATE_LIMIT=2
```

> `NEXT_PUBLIC_API_URL` é embutida no build do Next.js — se mudar esta variável, rebuilde a imagem (`docker compose up --build web`).

## Funcionalidades

### Análise em Bulk
- Descobre páginas automaticamente via `sitemap.xml`
- Roda Lighthouse em cada URL com concorrência configurável
- Progresso em tempo real via SSE

### Form Factor
- Escolha entre **Desktop** e **Mobile** na criação do job
- Worker adapta emulação de tela (viewport, DPR, device scale)

### Resultados
- Tabela paginada (50 por página) com ordenação por qualquer métrica
- Filtro por URL e por status
- Retry manual de URLs com erro
- Export CSV completo

### Drill-down por Página
- Clique em qualquer URL para abrir um painel lateral com:
  - Barras visuais para todas as 7 métricas
  - Top 5 oportunidades de melhoria do Lighthouse (com economia estimada em ms)
  - Botão direto para PageSpeed Insights
  - Tips de IA geradas pelo Gemini para aquela página específica

### ⚡ Relatórios de IA (Gemini)
- Botão **AI REPORT** aparece quando o job finaliza
- Gera um relatório completo com: Executive Summary, Critical Issues, Recommendations com links validados, Quick Wins
- Links verificados antes de retornar (404s são removidos automaticamente)
- **Histórico**: cada geração é salva no banco — navegue entre reports anteriores por data
- **AI Tips por página**: no drawer de cada URL, botão para gerar dicas específicas

### Cancelamento
- Cancela jobs em andamento — para todos os audits pendentes imediatamente

### Comparação entre Runs
- Rode o mesmo site duas vezes e compare as métricas lado a lado
- Delta indicators: ↑ verde, ↓ vermelho, → amber (threshold: >2%)

### Notificações
- Browser Notification quando o job termina (pede permissão na primeira vez)
- Título da aba mostra progresso: `SCANNING 43% | BULK ANALYZER`

### Top Worst Pages
- Painel colapsável com as 5 páginas de pior performance
- Clicável — abre o drill-down diretamente

### Rate Limiting por Domínio
- Evita sobrecarregar um único servidor
- Configurável via `DOMAIN_RATE_LIMIT` (padrão: 2 audits simultâneos por domínio)

### Autenticação (opcional)
- Se `AUTH_TOKEN` estiver definido, endpoints de escrita exigem `Authorization: Bearer <token>`
- Endpoints de leitura permanecem públicos
- Frontend exibe modal de login se receber 401

## Métricas coletadas por URL

| Métrica | Descrição | Threshold ✅ / ⚠️ / ❌ |
|---|---|---|
| **LCP** | Largest Contentful Paint | ≤2.5s / ≤4s / >4s |
| **CLS** | Cumulative Layout Shift | ≤0.1 / ≤0.25 / >0.25 |
| **INP** | Interaction to Next Paint | ≤200ms / ≤500ms / >500ms |
| **TTFB** | Time to First Byte | ≤800ms / ≤1.8s / >1.8s |
| **Perf Score** | Lighthouse Performance (0–100) | ≥90 / ≥50 / <50 |
| **SEO Score** | Lighthouse SEO (0–100) | ≥90 / ≥50 / <50 |
| **A11y Score** | Lighthouse Accessibility (0–100) | ≥90 / ≥50 / <50 |

## Capacidade e performance

| Workers | 1.000 páginas | 5.000 páginas |
|---|---|---|
| 5 (padrão) | ~30 min | ~2.5h |
| 10 | ~15 min | ~1.25h |

Ajuste via `AUDIT_CONCURRENCY`. Limite máximo por scan: **5.000 URLs**.

## Estrutura do projeto

```
apps/
  api/          # Fastify backend (porta 4000)
  web/          # Next.js frontend (porta 3000)
packages/
  db/           # Schema Drizzle + migrations
  types/        # Tipos TypeScript compartilhados (@bulk/types)
  worker/       # Crawl worker + Audit worker (Lighthouse)
docker-compose.yml
docker-compose.dev.yml   # Override para hot reload em dev
```

## API

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/jobs` | Cria novo job `{ siteUrl, formFactor? }` |
| `GET` | `/jobs` | Lista jobs recentes (`?site=url` para filtrar) |
| `GET` | `/jobs/:id` | Status de um job |
| `GET` | `/jobs/:id/results` | Resultados paginados (`?page=1`) |
| `GET` | `/jobs/:id/results/:resultId` | Detalhes de uma URL |
| `GET` | `/jobs/:id/stream` | Progresso em tempo real (SSE) |
| `GET` | `/jobs/:id/export` | Download CSV |
| `POST` | `/jobs/:id/cancel` | Cancela job em andamento |
| `POST` | `/jobs/:id/results/:resultId/retry` | Reanalisa URL com erro |
| `GET` | `/jobs/compare?a=:id&b=:id` | Compara métricas de dois jobs |
| `POST` | `/jobs/:id/ai-report` | Gera relatório de IA (salva no histórico) |
| `GET` | `/jobs/:id/ai-reports` | Lista relatórios de IA salvos |
| `GET` | `/jobs/:id/ai-reports/:reportId` | Busca um relatório específico |
| `POST` | `/jobs/:id/results/:resultId/ai-tips` | Tips de IA para uma página |

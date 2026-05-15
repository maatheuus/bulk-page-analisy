# Bulk Analyzer

Web Performance Intelligence System — analisa Core Web Vitals, Lighthouse scores e TTFB em bulk para 1000+ páginas de um site.

## Stack

- **Frontend**: Next.js 15 + Orbitron/Share Tech Mono (tema Radar Terminal)
- **Backend**: Fastify (Node.js)
- **Queue**: BullMQ + Redis
- **Worker**: Node.js + Lighthouse + Chromium (headless)
- **Crawler**: Crawlee (sitemap.xml auto-discovery)
- **Banco**: PostgreSQL 16 + Drizzle ORM
- **Infra**: Docker Compose (totalmente self-hosted, sem chaves de API externas)

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

## Desenvolvimento local

Para rodar os serviços fora do Docker (hot reload, debug, etc.):

```bash
# 1. Instalar dependências
yarn install

# 2. Subir apenas a infraestrutura
docker compose up postgres redis -d

# 3. Rodar as migrations
yarn db:migrate

# 4. Em terminais separados:
yarn dev:api      # Fastify na porta 4000
yarn dev:worker   # Worker com Lighthouse
yarn dev:web      # Next.js na porta 3000
```

> O worker precisa do Chrome instalado localmente:
> ```bash
> npx puppeteer browsers install chrome
> ```

## Variáveis de ambiente

Os valores padrão já funcionam com o `docker-compose.yml`. Para customizar, crie um `.env` na raiz:

```env
DATABASE_URL=postgres://bulk:bulk@localhost:5432/bulk_analyzer
REDIS_URL=redis://localhost:6379
AUDIT_CONCURRENCY=5
NEXT_PUBLIC_API_URL=http://localhost:4000
```

> `NEXT_PUBLIC_API_URL` é embutida no build do Next.js — se mudar esta variável, rebuilde a imagem (`docker compose up --build web`).

## Como usar

1. Abra **http://localhost:3000**
2. Cole a URL do site que deseja analisar (ex: `https://example.com`)
3. Clique em **INITIATE SCAN**
4. O sistema irá:
   - Descobrir as páginas via `sitemap.xml` automaticamente
   - Enfileirar e analisar cada URL com Lighthouse
   - Exibir o progresso em tempo real
5. Ao finalizar, clique em **EXPORT CSV** para baixar os resultados

## Métricas coletadas por URL

| Métrica | Descrição | Threshold ✅ / ⚠️ / ❌ |
|---|---|---|
| **LCP** | Largest Contentful Paint | ≤1.5s / ≤3.5s / >3.5s |
| **CLS** | Cumulative Layout Shift | ≤0.1 / ≤0.25 / >0.25 |
| **INP** | Interaction to Next Paint | ≤200ms / ≤500ms / >500ms |
| **TTFB** | Time to First Byte | ≤1.5s / ≤3.5s / >3.5s |
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
  worker/       # Crawl worker + Audit worker (Lighthouse)
docker-compose.yml
```

## API

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/jobs` | Cria novo job `{ siteUrl }` |
| `GET` | `/jobs` | Lista jobs recentes |
| `GET` | `/jobs/:id` | Status de um job |
| `GET` | `/jobs/:id/results` | Resultados paginados (`?page=1`) |
| `GET` | `/jobs/:id/stream` | Progresso em tempo real (SSE) |
| `GET` | `/jobs/:id/export` | Download CSV |

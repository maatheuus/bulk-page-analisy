# AI Context Document - Bulk Analyzer

Este arquivo serve como o guia definitivo de contexto e arquitetura para qualquer assistente de IA trabalhando neste repositório. Ele descreve as regras do projeto, a stack de tecnologia, os padrões de design, o estilo de codificação e a lógica de negócios central.

---

## 🚀 1. Tech Stack (Tecnologias Utilizadas)

O projeto é um monorepo TypeScript gerenciado com **Yarn v4 (Workspaces)**. A infraestrutura é totalmente baseada em **Docker & Docker Compose** (self-hosted).

*   **Frontend**: Next.js 15 + React, utilizando um tema estético chamado **Radar Terminal** com as fontes *Orbitron* e *Share Tech Mono*. Customizações visuais via Vanilla CSS (`globals.css`).
*   **Backend API**: Fastify 5 (Node.js) exposto na porta `4000`.
*   **Banco de Dados**: PostgreSQL 16 + Drizzle ORM (`packages/db`).
*   **Fila & Tarefas Assíncronas**: BullMQ + Redis para gerenciar jobs e concorrência.
*   **Worker de Auditoria**: Puppeteer (Chromium Headless) + Lighthouse para rodar os testes de performance, SEO e acessibilidade.
*   **Crawler**: Crawlee com auto-descoberta através de `sitemap.xml` na raiz do domínio.
*   **Inteligência Artificial**: API do Google Gemini (`gemini-2.5-flash`) no backend para gerar relatórios de performance gerais e dicas específicas por página.
*   **Testes**: Vitest (sem dependência de banco ou Docker para execução rápida de testes unitários).

---

## 📁 2. Estrutura do Projeto

A organização de pastas segue uma divisão clara entre aplicações executáveis (`apps/`) e pacotes de suporte compartilhados (`packages/`):

```
apps/
  api/          # Fastify backend (porta 4000)
  web/          # Next.js frontend (porta 3000)
packages/
  db/           # Schema do Drizzle ORM + migrações do PostgreSQL
  types/        # Tipos TypeScript compartilhados (@bulk/types)
  worker/       # Worker de crawl e auditoria Lighthouse
```

---

## 🧠 3. Lógica de Negócios Central

O **Bulk Analyzer** é um sistema de inteligência de performance web projetado para auditar em lote (*bulk*) o Core Web Vitals, acessibilidade e SEO de mais de 1000 páginas de um mesmo site.

1.  **Criação do Job**: O usuário envia uma URL e escolhe o formato (`desktop` ou `mobile`).
2.  **Fase de Crawling**: O crawler busca por `sitemap.xml` para mapear todas as páginas públicas do domínio (limite padrão de 5.000 URLs).
3.  **Fase de Auditoria (Auditing)**: 
    *   As URLs são enfileiradas no BullMQ.
    *   Os workers executam o Puppeteer com Lighthouse rodando auditorias paralelas.
    *   **Rate Limiting por Domínio**: Evita sobrecarregar o site auditado limitando acessos concorrentes (padrão de 2 simultâneos por domínio).
    *   Progresso em tempo real é transmitido à aplicação web através de *Server Sent Events (SSE)*.
4.  **Drill-down & Comparação**:
    *   Visualização de métricas detalhadas (LCP, CLS, INP, TTFB, Perf, SEO, A11y).
    *   Delta indicators para comparação de métricas entre diferentes execuções (runs) do mesmo domínio.
5.  **Relatórios de IA (Gemini)**:
    *   Geração de relatórios executivos de IA salvos com histórico de versões.
    *   **Validação de Links**: Links de referência sugeridos pela IA são testados (via requisições HEAD paralelas em lote) para garantir que não haja erros 404 antes de apresentar ao usuário.

---

## 🎨 4. Padrões de Design & Arquitetura

*   **Monorepo Workspaces**: Isolamento de responsabilidades. A lógica de banco de dados (`@bulk/db`) e tipos (`@bulk/types`) são independentes e importados pelas aplicações de forma limpa.
*   **Arquitetura Baseada em Filas (Queue-based Architecture)**: Desacoplamento completo entre a requisição HTTP da API e o processamento pesado de auditorias e crawlers gerenciados por workers em segundo plano.
*   **TDD / Testes Isolados (Vitest)**: Garantia de que helpers, validações da API e comportamento das rotas tenham alta cobertura de testes rodando offline.
*   **Pool de Navegadores (Browser Pool)**: Reaproveitamento eficiente de instâncias do Puppeteer para otimizar memória e evitar overhead de inicialização em cada auditoria.

---

## ✒️ 5. Regras e Estilo de Codificação

Ao propor alterações de código, siga rigorosamente as seguintes diretrizes:

*   **TypeScript Estrito**: Tipagem explícita e uso de tipos compartilhados. Evite o uso de `any` a todo custo.
*   **Retornos Antecipados (Early Returns)**: Prefira estruturar funções retornando cedo para evitar aninhamentos de condições complexas.
    ```typescript
    if (v === null) return "";
    // continuar fluxo principal sem else
    ```
*   **Arrow Functions**: Para funções anônimas, callbacks e expressões de funções curtas, use preferencialmente sintaxe de arrow functions.
*   **Yarn como Package Manager**: Sempre use comandos Yarn (por exemplo, `yarn add`, `yarn workspace @bulk/db ...`) em vez de npm ou pnpm.
*   **Resiliência em Redes**: Sempre utilize e respeite os mecanismos de retentativas (`fetchWithRetry`) e timeouts controlados (`AbortSignal.timeout`) ao realizar integrações HTTP externas.

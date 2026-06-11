# PATA & CÃO

Uma plataforma unificada de serviços para animais de estimação que conecta donos de animais com fornecedores confiáveis (hospedagem, passeadores de cães, adestradores) em um só lugar.

## Problema

Os donos de animais de estimação enfrentam uma situação fragmentada: precisam alternar entre vários aplicativos para encontrar hospedagem segura, passeadores qualificados e adestradores certificados. Não existe uma fonte única e confiável para a verificação dos prestadores de serviços, o que dificulta confiar em quem você está deixando seu animal de estimação.

## Solução

PATA & CÃO é um marketplace completo com:
- **Fornecedores verificados:** verificação de antecedentes, certificações, referências
- **Busca por filtros:** busca por tipo de pet, localização e serviço
- **Contato direto com o prestador:** contato por e-mail ou WhatsApp

---

## Tecnologias

| Camada | Tecnologia | Por que |
|-------|-----------|-----|
| **Frontend** | React + Astro | React para interfaces de usuário interativas, Astro para geração estática |
| **Backend** | Golang + Echo | Segurança de tipos, alto desempenho, excelente concorrência |
| **BD Relacional** | PostgreSQL | Segurança transacional para reservas e verificação |
| **Busca** | Typesense | Busca de provedores em texto completo, facetada e tolerante a erros de digitação; binário único, sem JVM |
| **Armazenamento de imagens** | SeaweedFS | Armazenamento de objetos distribuído com cache multicamadas e API compatível com S3 |

---

## Estrutura do Projeto

```
pata-e-cao/
├── frontend/                           # React + Astro
│   ├── public/                         # Arquivos estáticos (logos, imagens)
│   │   └── pec-logo.jpeg
│   ├── src/
│   │   ├── components/                 # Componentes reutilizáveis da interface
│   │   │   ├── Footer.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── ProviderCard.tsx
│   │   │   └── ...
│   │   ├── layouts/                    # Layouts compartilhados da interface
│   │   │   ├── AdminLayout.astro
│   │   │   ├── AppLayout.astro
│   │   │   └── Layout.astro
│   │   ├── locales/                    # Arquivos de tradução (i18n)
│   │   │   └── pt-BR/
│   │   │       └── translation.json
│   │   ├── pages/                      # Rotas e páginas da aplicação
│   │   │   ├── index.astro
│   │   │   ├── providers.astro
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   └── providers/
│   │   ├── services/                   # Comunicação com APIs e serviços externos
│   │   │   └── api.ts
│   │   ├── styles/                     # Estilos globais
│   │   │   └── global.css
│   │   ├── utils/                      # Funções utilitárias
│   │   │   ├── config.ts
│   │   │   ├── serviceCatalog.ts
│   │   │   ├── validation.ts
│   │   │   └── ...
│   │   ├── env.d.ts                    # Declarações de tipos para variáveis de ambiente
│   │   └── i18n.config.ts              # Configuração da internacionalização
│   ├── .env.example                    # Modelo para .env
│   ├── astro.config.mjs                # Configuração do framework Astro
│   ├── Dockerfile                      # Build e execução do container do frontend
│   ├── nginx.conf                      # Configuração do servidor Nginx
│   ├── package-lock.json               # Controle de versões das dependências npm
│   ├── package.json                    # Dependências e scripts do projeto
│   ├── tailwind.config.mjs             # Configuração do Tailwind CSS
│   └── tsconfig.json                   # Configuração do TypeScript
│
├── backend/                             # API backend (Golang + Echo)
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                  # Ponto de entrada da aplicação
│   ├── internal/
│   │   ├── config/                      # Configurações da aplicação
│   │   │   └── config.go
│   │   ├── handler/                     # Controladores e endpoints HTTP
│   │   │   ├── auth.go
│   │   │   ├── provider.go
│   │   │   ├── search.go
│   │   │   └── ...
│   │   ├── middleware/                  # Middlewares de autenticação e segurança
│   │   │   ├── auth.go
│   │   │   └── ratelimit.go
│   │   ├── models/                      # Modelos de domínio e entidades
│   │   │   ├── image.go
│   │   │   ├── provider.go
│   │   │   ├── review.go
│   │   │   └── user.g
│   │   │
│   │   ├── repository/                  # Camada de acesso aos dados
│   │   │   └── postgres/
│   │   │       ├── db.go
│   │   │       ├── provider_repo.go
│   │   │       ├── user_repo.go
│   │   │       └── ...
│   │   └── service/                     # Regras de negócio da aplicação
│   │       ├── admin_service.go
│   │       ├── provider_service.go
│   │       ├── search_service.go
│   │       └── ...
│   ├── migrations/                      # Migrações do banco PostgreSQL
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_provider_application_fields.sql
│   │   ├── 003_provider_pj_fields.sql
│   │   └── ...
│   ├── .dockerignore                    # Arquivos ignorados pelo Docker
│   ├── .env.example                     # Exemplo de variáveis de ambiente
│   ├── Dockerfile                       # Build e execução do container do backend
│   ├── go.mod                           # Dependências do projeto Go
│   └── go.sum                           # Controle de versões das dependências Go
│
├── .github/
│   └── workflows/                       # Pipelines de integração e entrega contínua
│       └── ci.yml                       # Workflow de build, testes e validações
│
├── .gitignore                           # Arquivos ignorados pelo Git
├── ADMIN_INSTRUCTIONS.md                # Guia de administração e procedimentos internos
├── docker-compose.yml                   # Orquestração dos serviços para desenvolvimento local
├── package-lock.json                    # Controle de versões das dependências npm
├── package.json                         # Scripts e dependências do projeto
└── README.md                            # Documentação principal do projeto
```

---

## Como começar

> **O Docker Compose é a maneira recomendada de executar o PATA & CÃO localmente.** Ele inicializa o PostgreSQL (com o esquema carregado automaticamente), o Typesense, o backend em Go e o frontend Astro/React em um único comando — correspondendo à forma como os serviços se comunicam em produção. Use o caminho local-toolchain somente quando estiver iterando ativamente em um único serviço.

### Pré-requisitos

- **Docker Desktop / Docker Engine** com Compose v2 (`docker compose ...`)
- (Opcional, apenas para o caminho do conjunto de ferramentas local) Node.js 18+, Go 1.22+

### 1. Clone e iniciar

```bash
git clone https://github.com/your-org/pata-e-cao-apresentacao.git
cd pata-e-cao-apresentacao

# Inicialização Postgres, Typesense, backend, frontend
docker compose up -d

# Ver logs (opcional)
docker compose logs -f backend
```

Visite:

- Frontend  → http://localhost:3000
- Backend   → http://localhost:8080/api
- Typesense → http://localhost:8108/health

A primeira inicialização baixa as imagens. Na inicialização, o backend aplica as migrações de
`backend/migrations/` no Postgres (rastreadas na tabela `schema_migrations`
portanto, as execuções subsequentes são idempotentes). As inicializações subsequentes levam segundos.

### 2. Configurar substituições (opcional)

Todas as variáveis ​​de ambiente necessárias estão incorporadas em `docker-compose.yml` com valores padrão seguros para desenvolvimento.
A única variável que você deve sobrescrever para qualquer uso não descartável é `JWT_SECRET` — coloque um arquivo `backend/.env` ao lado de `backend/.env.example`:

```env
JWT_SECRET=<32+ char secret — generate with: openssl rand -hex 32>
```

O arquivo `backend/.env` é montado no contêiner de backend durante a construção; qualquer coisa que você colocar lá substituirá os valores padrão em `docker-compose.yml`.

### 3. Comandos comuns

```bash
docker compose up -d                # iniciar em segundo plano
docker compose ps                   # ver o status e a integridade do serviço
docker compose logs -f <service>    # acompanhar os logs (backend|frontend|postgres|typesense)
docker compose restart backend      # reiniciar um único serviço
docker compose down                 # parar tudo (preserva os volumes)
docker compose down -v              # parar e apagar os dados (Postgres, Typesense, imagens)
```

Para reconstruir a imagem do backend ou do frontend após uma alteração no código:

```bash
docker compose up -d --build backend
```

### 4. Armazenamento de imagens (opcional)

Por padrão, o backend armazena as imagens enviadas em um volume local
(`IMAGE_STORAGE_TYPE=local`). Para usar o caminho do SeaweedFS localmente, inicie
o perfil `seaweedfs`:

```bash
docker compose --profile seaweedfs up -d
# em seguida, defina IMAGE_STORAGE_TYPE=seaweedfs em backend/.env e reinicie o backend
```

### Executando sem Docker (avançado)

Se você precisar conectar um depurador ao backend ou executar o servidor de desenvolvimento Astro
com recarregamento a quente, você pode executar serviços individuais no host enquanto mantém
o Postgres e o Typesense no Compose:

```bash
docker compose up -d postgres typesense # somente infraestrutura

cd backend && go run cmd/server/main.go # terminal 1
cd frontend && npm install && npm run dev # terminal 2
```

Certifique-se de que `backend/.env` aponte para as portas expostas no host
(`DATABASE_URL=postgres://postgres:dev@localhost:5432/pata_cao?sslmode=disable`,
`TYPESENSE_URL=http://localhost:8108`).

---

## Principais Recursos

- [x] Autenticação de usuário (cadastro, login, redefinição de senha)
- [x] Fluxo de trabalho de cadastro e verificação de profissionais
- [x] Painel administrativo para aprovação de profissionais (estatísticas, gráficos, histórico de auditoria)
- [x] Assistente de integração de profissionais (configuração de perfil em 5 etapas após a aprovação)
- [x] Perfis públicos de profissionais com botões de compartilhamento
- [x] Busca de texto completo com Typesense (facetas, tolerância a erros de digitação, fallback para Postgres)

---

## Visão Geral da API

URL base: `http://localhost:8080/api`

### Autenticação
- `POST /auth/signup` - Cadastrar usuário
- `POST /auth/login` - Fazer login
- `POST /auth/refresh` - Atualizar token JWT

### Gerenciamento de Provedores
- `GET /providers?q=&service=&sort=&page=&per_page=` - Buscar provedores (com tecnologia Typesense)
- `GET /providers/:id` - Obter detalhes do provedor (público)
- `GET /providers/me` - Obter o perfil do provedor autenticado
- `POST /providers/register` - Cadastrar-se como provedor (público, cadastro e inscrição combinados)
- `POST /providers/apply` - Candidatar-se como provedor (usuário existente)
- `POST /providers/onboarding/validate` - Validar token de integração
- `POST `/providers/onboarding/complete` - Configuração completa do perfil de integração

### Administração
- `GET /admin/stats` - Contagens agregadas do painel
- `GET /admin/stats/providers?range=` - Série temporal de crescimento do provedor
- `GET /admin/stats/pets/species` - Distribuição de espécies de animais de estimação
- `GET /admin/stats/pets/ages` - Distribuição etária dos animais de estimação
- `GET /admin/providers?status=&search=` - Listar todos os provedores (paginado)
- `GET /admin/providers/pending` - Fila de revisão pendente
- `POST /admin/providers/:id/approve` - Aprovar provedor (retorna token de integração)
- `POST /admin/providers/:id/reject` - Rejeitar provedor
- `POST /admin/providers/:id/suspend` - Suspender provedor
- `POST `/admin/providers/:id/unsuspend` - Reativar provedor
- `POST /admin/providers/:id/regenerate-token` - Regenerar token de integração
- `DELETE /admin/providers/:id` - Excluir provedor rejeitado
- `POST /admin/search/reindex` - Recriar índice Typesense

### Imagens
- `GET /images/*` - Exibir imagens (públicas, com cache LRU)
- `POST /images/upload?type=pet|document|provider` - Enviar imagem

### Avaliações
- `GET /providers/:id/reviews` - ​​Obter avaliações do provedor

---

## Testando

```bash
# Testes unitários do backend
cd backend
go test ./...

# Testes de integração do backend (requer bancos de dados em execução)
go test -tags=integration ./...

# Testes unitários do frontend
cd frontend
npm run test

# Testes E2E do frontend
npm run test:e2e

# Executar todos os testes
npm run test:all
```

---

## Equipe

Grupo Meninas

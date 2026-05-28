# Product Requirement Document (PRD): PATA & CÃO Profile & Relationship Engine
## Updated: Provider Onboarding & Profile Initialization Specs

This updated specification merges the core profile engine mechanics with the newly defined Provider Setup/Onboarding Form. It is optimized for direct ingestion by Claude to generate database schemas, UI layouts (e.g., Tailwind/React), and validation logic.

---

## 1. System Architecture & Data Model Overviews


```
[Guest] -------------> View-Only (Public Data & Social Links)
[Admin Link Gen] ----> Tokenized Dynamic Route (`/providers/setup/:token`)
│
▼
[Onboarding Form] ──► Persists [Service Provider Profile]

```

### Core Entities & Relations
* **Pet Owner:** 1 ── * **Pet**
* **Service Provider:** 1 ── * **Availability Slots / Service Rules**
* **Provider Gallery:** 1 ── * **Media Assets** (Max 6 slots)

---

## 2. Updated RBAC & Data Visibility Matrix

| Data Field / Feature | Guest Access | Pet Owner Access | Service Provider Access |
| :--- | :--- | :--- | :--- |
| **Business Name / Bio** | Read-Only | Read-Only | Read/Write (via Form/Dashboard) |
| **Gallery Matrix (6 Slots)** | Read-Only | Read-Only | Read/Write (via Form/Dashboard) |
| **Service Preferences (Checkboxes)**| Read-Only | Read-Only | Read/Write (via Form/Dashboard) |
| **Contact (WhatsApp/Email)** | Visible | Visible | Visible |
| **Review Persona (Pet Name/Pic)**| Hidden | Public (On Provider Page)| Public (On Provider Page) |

---

## 3. Provider Onboarding & Form UI Specification

### 3.1 Lifecycle Trigger
1. Admin approves the application in the Admin Console.
2. System generates a secure, tokenized, one-time link: `/providers/setup/{onboarding_token}`.
3. Accessing the link requires user authentication setup (Creates the Auth Account + Profile state concurrently).

### 3.2 Form Layout & Component Mapping (UI Blueprint)

#### Page Header (Outside Core Container)
* **Main Title (H1):** `CONFIGURAR PERFIL PROFISSIONAL`
* **Subtitle 1 (H2):** `PARABÉNS, VOCÊ FOI APROVADO!`
* **Subtitle 2 (H3):** `AGORA VAMOS CAPRICHAR NA SUA VITRINE PET.`


```mark
┌────────────────────────────────────────────────────────────────────────┐
│ 1. DADOS DE ACESSO                                                     │
│ [ NOME DE USUÁRIO (LOGIN) * ]                                          │
│ [ SENHA * ]  [ REPETIR SENHA * ]                                       │
├────────────────────────────────────────────────────────────────────────┤
│ 2. CRIAR O SEU PERFIL VISUAL                                           │
│ ┌──────────────────┐  ┌──────────────────────────────────────────────┐ │
│ │  [Avatar Box]    │  │ NOME DO SEU NEGÓCIO *                        │ │
│ │                  │  ├──────────────────────────────────────────────┤ │
│ │ [ADICIONAR FOTO] │  │ GALERIA DO SEU SERVIÇO                       │ │
│ └──────────────────┘  │ [Slot 1] [Slot 2] [Slot 3]                   │ │
│                       │ [Slot 4] [Slot 5] [ + Slot 6]                │ │
│                       └──────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ 3. PREFERÊNCIAS DE ATENDIMENTO                                         │
│ [ ] Atende Cães       [ ] Atende Gatos                                 │
│ [ ] Atende Animais Castrados  [ ] Atende Animais Não Castrados         │
├────────────────────────────────────────────────────────────────────────┤
│ 4. SOBRE O SEU NEGÓCIO                                                 │
│ Descrição:                                                             │
│ [ Ex: Adestrador certificado com 5 anos de experiência...            ] │
│ Localidade:                                                            │
│ [ Ex: Cidade: São Paulo Bairro: Tatuapé...                           ] │
├────────────────────────────────────────────────────────────────────────┤
│ 5. DADOS DE CONTATO                                                    │
│ [ Número de WhatsApp * ]      [ Endereço de e-mail * ]                 │
├────────────────────────────────────────────────────────────────────────┤
│                           [CONCLUIR PERFIL]                            │
└────────────────────────────────────────────────────────────────────────┘

```

### 3.3 Form Schema & Technical Validation Rules

```typescript
interface ProviderOnboardingSchema {
  // Section 1: Dados de Acesso
  username: string;          // Required, unique, alphanumeric, min 4 chars
  password_hash: string;     // Required, min 8 chars, strength verification
  password_confirm: string;  // Required, must match password_hash

  // Section 2: Perfil Visual
  avatar_url: string;        // Required, image URL from cloud storage upload
  business_name: string;     // Required, string, max 100 chars
  gallery_urls: string[];    // Array of strings, Min 0, Max 6 items

  // Section 3: Preferências de Atendimento
  accepts_dogs: boolean;      // Default: false
  accepts_cats: boolean;      // Default: false
  accepts_neutered: boolean;  // Default: false
  accepts_intact: boolean;    // Default: false (Atende Não Castrados)

  // Section 4: Sobre o Seu Negócio
  description: string;       // Textarea, max 1000 chars
  location_text: string;     // Textarea (Temporary location string tracking)

  // Section 5: Dados de Contato
  whatsapp: string;          // Required, format: (xx) xxxxx-xxxx regex validation
  email: string;             // Required, valid email regex format
}
```

---

## 4. Key Workflows & Backend Triggers

### 4.1 Transition from Onboarding to Active State

Upon submission of the `CONCLUIR PERFIL` action:

1. Validate tokenized URL active status $\rightarrow$ Close token to prevent reuse.
2. Initialize User Credentials inside Auth Schema.
3. Write payload into `providers` table and set `profile_active = true`.
4. Fire asynchronous hook to clear platform cache for discovery indexation.

### 4.2 Review & Dispute Pipeline (Roleplay Engine)

* **Review Generation:** Once a booking completes, owners can evaluate the provider using a 5-star metric + comment field.
* **The Catch:** The review maps the specific `Pet.name` and `Pet.photo_url` as the author entity in public feeds.
* **Dispute Loop:** Providers can hit `Contest Review` $\rightarrow$ System flags review status as `under_dispute` and locks public rendering $\rightarrow$ Grace period of **5 business days** for settlement $\rightarrow$ Auto-publishes original payload if no structural resolution event is received within the window.

### 4.3 Logged Modifications (Audit Ledger)

Any updates mutating fields initialized during onboarding (specifically `location_text`, `whatsapp`, `email`, or operating schedules) write directly to `provider_audit_events`.

* **Subscriber Pipeline:** Triggers broadcast notification tasks to all linked owners tracking (`favorited`) or actively scheduling services with that specific provider uuid.



# Architectural Specification: Event-Driven Audit & Notification Engine

To implement the logged modifications and asynchronous notification system robustly without degrading the performance of core transactional operations, we will employ the **Transactional Outbox Pattern** combined with a decoupled **Fan-Out Worker Pool**. 

This ensures that profile updates and event logging happen within the same database transaction, guaranteeing data consistency even if the notification infrastructure experiences transient failures.

---

## 1. Architectural Blueprint


```

[ Provider Client ]
│ (HTTP POST/PATCH)
▼
[ Application API Layer ]
│
├──► Start DB Transaction
│      ├───► Update `providers` table
│      └───► Insert into `provider_outbox_events` (Audit Log)
└──► Commit Transaction
│
▼ (Async Trigger: DB Hook / Change Data Capture)
[ Message Broker / Relay ] (Redis Streams / RabbitMQ / Postgres LISTEN)
│
▼
[ Fan-Out Notification Worker ] ──► Queries Subscribers (Followers / Active Bookings)
│
├──► Push Notification Service (FCM / Expo)
├──► SMS Gateway (Twilio / Infobip)
└──► Email Service (SendGrid / Resend)

```

---

## 2. Database Schema (PostgreSQL Reference DDL)

We use two primary tables to support this engine: the **Outbox/Audit Table** and the **Target Delivery Queue** to handle failures gracefully.

```sql
-- 1. The Audit Log & Outbox Table
CREATE TYPE event_type_enum AS ENUM ('ADDRESS_CHANGED', 'CONTACT_CHANGED', 'SCHEDULE_CHANGED', 'VAC_EXPIRING');

CREATE TABLE provider_outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    event_type event_type_enum NOT NULL,
    old_payload JSONB NOT NULL, -- For historical audit tracking
    new_payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_outbox_unprocessed ON provider_outbox_events(processed) WHERE processed = FALSE;

-- 2. Materialized Relationship Views for Rapid Fan-Out Queries
-- Indexing followers for O(1) identification during fan-out
CREATE TABLE provider_followers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES pet_owners(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    tags VARCHAR(50)[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, provider_id)
);

CREATE INDEX idx_follower_lookup ON provider_followers(provider_id);

```

---

## 3. The Fan-Out Logic & Delivery Rules

The Notification Worker processes the outbox event and determines the audience matrix based on business logic.

### Audience Routing Resolution Matrix

* **`ADDRESS_CHANGED` / `CONTACT_CHANGED`:** Broadcasts to **all Followers** AND **all Owners with active/upcoming bookings**.
* **`SCHEDULE_CHANGED`:** Broadcasts **strictly** to **Owners with active/upcoming bookings** within the affected date range (Followers do not need spam for daily schedule updates).

### TypeScript Implementable Worker Pseudocode

```typescript
interface OutboxEvent {
  id: string;
  provider_id: string;
  event_type: 'ADDRESS_CHANGED' | 'CONTACT_CHANGED' | 'SCHEDULE_CHANGED';
  new_payload: any;
}

async function processOutboxEvent(event: OutboxEvent) {
  const targetUserIds = new Set<string>();

  // Rule 1: Get Active Bookings (Applicable to ALL profile events)
  const activeBookingOwners = await db.bookings.findMany({
    where: {
      provider_id: event.provider_id,
      status: { in: ['CONFIRMED', 'IN_PROGRESS', 'PENDING'] },
      end_date: { gte: new Date() }
    },
    select: { owner_id: true }
  });
  activeBookingOwners.forEach(b => targetUserIds.add(b.owner_id));

  // Rule 2: Get Followers (Only for structural changes, not schedule shifts)
  if (event.event_type === 'ADDRESS_CHANGED' || event.event_type === 'CONTACT_CHANGED') {
    const followers = await db.providerFollowers.findMany({
      where: { provider_id: event.provider_id },
      select: { owner_id: true }
    });
    followers.forEach(f => targetUserIds.add(f.owner_id));
  }

  // Push payloads into the transactional Message Broker Queue for micro-delivery
  await queue.enqueueBulk(
    Array.from(targetUserIds).map(ownerId => ({
      recipient_id: ownerId,
      template_id: event.event_type,
      data: event.new_payload
    }))
  );

  // Mark event as processed cleanly to prevent double delivery
  await db.providerOutboxEvents.update({
    where: { id: event.id },
    data: { processed: true }
  });
}

```

---

## 4. Retention & Health Analytics Pipeline (The 20-Day Cron)

To avoid heavy sequential scans across the entire production database every day, we execute a targeted window query that looks for a discrete date match rather than calculation operations per row.

### Query Strategy

Instead of checking `vaccine_expiration_date - 20 days == today`, calculate the exact target date boundary once at runtime:


$$\text{Target Expiration Date} = \text{Current Date} + 20 \text{ Days}$$

### Cron Job Query (Executed daily at 00:01 AM)

```sql
-- Executed inside an automated task runner (e.g., PgCron, Redis Cron, Node-Cron)
INSERT INTO owner_notifications_queue (owner_id, message, notification_type)
SELECT 
    p.owner_id,
    LOWER(CONCAT('A vacina do seu pet ', p.name, ' expira em menos de 20 dias!')),
    'VAC_EXPIRING'
FROM pets p
WHERE 
    p.vaccine_expiration_date = CURRENT_DATE + INTERVAL '20 days'
    AND p.is_active = TRUE;

```

---

## 5. System Safety Constraints

* **Idempotency Locks:** The application layer must compute a cryptographic hash of the notification payload payload (e.g., `MD5(provider_id + event_type + timestamp_minute)`) to ensure that double-clicking or rapid API retries do not result in duplicate push notifications flooding the pet owner's device.
* **Soft Deletions Data Cleanups:** When a pet profile transitions to `deleted` (`pet_removals`), a cascade handler sets all related historical metrics to an anonymous state (`pet_id = null` or replaced by a static archived marker) to keep financial ledgers and performance analytics correct for the Service Provider without breaking relational constraints.

---

### Expert Guide Question

Which message broker stack are you considering for handling the asynchronous queue ingestion (e.g., Redis BullMQ for Node environments, native PostgreSQL LISTEN/NOTIFY for lightweight scaling, or an external cloud engine like AWS SQS)?


Since you are working with **Go** on the backend and implementing a **Transactional Outbox Pattern** for *Pata & Cão*, you are in luck. The Go ecosystem has moved far beyond raw AMQP or heavy Kafka setups for this type of workload.

The choice of your broker depends heavily on how much infrastructure you want to manage.

---

## 1. The "Zero Extra Infra" Option: River (Postgres-Backed)

If your primary database is PostgreSQL, **River** (`riverqueue.com`) is a high-performance background job queue designed explicitly for modern Go applications.

* **Why it fits your plan:** Because it runs directly on Postgres, it makes the **Transactional Outbox Pattern** completely atomic out of the box. You can insert your user profile updates and enqueue the notification outbox event using the same exact `pgx` database transaction.
* **Pros:** Zero extra infrastructure to host or monitor; supports high concurrency using Postgres `SKIP LOCKED`; strongly typed job payloads.
* **Cons:** Puts more IOPS load on your primary database as you scale to millions of notifications.

```go
// Example of River transactional enqueueing
tx, err := dbPool.Begin(ctx)

// 1. Update the provider's address
_, err = tx.Exec(ctx, "UPDATE providers SET address = $1 WHERE id = $2", newAddress, providerID)

// 2. Enqueue the fan-out event in the SAME transaction
_, err = riverClient.InsertTx(ctx, tx, AddressChangedArgs{
    ProviderID: providerID,
    NewAddress: newAddress,
}, nil)

err = tx.Commit(ctx)

```

---

## 2. The "BullMQ for Go" Option: Asynq (Redis-Backed)

If you already use Redis for caching or sessions, **Asynq** is the premier distributed task queue for Go. It behaves similarly to Node’s BullMQ or Ruby’s Sidekiq.

* **Why it fits your plan:** It is incredibly fast, memory-efficient, and comes with native support for task retries, scheduled alerts (perfect for your **20-day vaccine expiration cron**), and dead-letter queues.
* **Pros:** Massively scalable throughput; excellent dashboard support; handles heavy bursts easily.
* **Cons:** Requires a running Redis instance; you cannot bundle the enqueueing step natively inside an atomic Postgres transaction without writing manual outbox relay code.

---

## 3. The "Go-Native Broker" Option: NATS JetStream

**NATS** is a cloud-native messaging system written entirely in Go. **JetStream** is its built-in persistence engine that transforms NATS into a lightweight, high-performance event-streaming platform.

* **Why it fits your plan:** It's the ultimate tool for a true event-driven microservices design. It handles Pub/Sub, fan-out matching, and message deduplication effortlessly.
* **Pros:** Written in Go (making cross-compilation and containerization seamless); incredibly fast; uses very little CPU/Memory compared to Kafka or RabbitMQ.
* **Cons:** Another stateful infrastructure component to manage in production.

---

## 4. The Structural Blueprint Layer: Watermill

**Watermill** isn't a broker itself; it is an architectural Go library for building event-driven systems. It provides standard Pub/Sub interfaces and middleware.

* **Why it fits your plan:** If you aren't sure whether you want to stick with Postgres, migrate to Redis, or move to AWS SQS later, Watermill abstracts the underlying broker. You write your notification routing logic once, and you can switch the backend infrastructure via configuration changes.

---

## Summary Recommendation Matrix

| Need | Recommended Tech | Setup Complexity | Outbox Friendly? |
| --- | --- | --- | --- |
| **Simplicity & Atomicity** | **River** (Postgres) | Very Low | ⭐⭐⭐⭐⭐ (Native) |
| **High Throughput & Cron Tasks** | **Asynq** (Redis) | Low / Medium | ⭐⭐⭐ (Needs relay) |
| **Distributed / Cloud-Native Streaming** | **NATS JetStream** | Medium | ⭐⭐⭐ (Needs relay) |

---

### Expert Guide Question

Given that the Transactional Outbox pattern benefits heavily from sharing a data store with your main application records, is your team leaning toward keeping it simple with your primary relational database, or do you already have Redis provisioned in your stack?
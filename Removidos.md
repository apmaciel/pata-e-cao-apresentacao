Tudo está implementado e funcionando. Aqui está um resumo da limpeza:

---

## ✅ Limpeza do Projeto — Concluída (`c81e4af`)

### 1. i18n — Somente Português do Brasil
- `LanguageDetector` removido de i18n.config.ts — agora definido como `pt-BR`
- CLAUDE.md atualizado para refletir a configuração de idioma único

### 2. Perfis de animais de estimação — Removidos
| Removido | Detalhes |

|---------|---------|
| DeletePetModal.tsx | Componente excluído |

| Tipos/interfaces de animais de estimação | `Pet`, `CreatePetData`, `PetHealthRecord`, `PetImage`, `Booking`, `CreateBookingData` |

| Cliente da API `pets.*` | Todos os métodos CRUD removidos |

| Cliente da API `petImages.*` | Todos os métodos removidos |
| Cliente da API `bookings.*` | Todos os métodos removidos |
| Tabela `pets` | Removida de 001_initial_schema.sql |
| `pet_health_records`, `pet_health_access_log` | Removidos do esquema |
| Tabela `bookings` | Removida do esquema |
| Chave estrangeira `reviews.booking_id` | Removida (avaliações não estão mais vinculadas a reservas) |
| `ImageTypePet` | Removido do serviço de imagens |
| Estatísticas de animais de estimação (espécie/idade) | Removidas do serviço de administração, repositório de estatísticas e API de front-end |

### 3. Contas de usuário — Removidas
| Removido | Detalhes |

|---------|---------|
| UserProfile.tsx | Componente excluído |

| `account.astro` | Página excluída |
| `auth.getProfile/updateProfile/getUserProfile/deleteProfile` | Removido da API de front-end |
| `GET/PUT/DELETE /api/auth/profile` | Removido das rotas |

| `GET /api/users/:id` | Removido das rotas |

| Manipuladores de perfil | `GetProfile`, `GetUserProfile`, `UpdateProfile`, `DeleteProfile` removidos |

| `UpdateProfile`, `Delete` | Removido do repositório de usuários |
| Modelo `User` simplificado | `Bio`, `AvatarImageID`, `SocialLinks`, `CPF` removidos |

| Migrações 012, 013, 014 | Excluídas |

| `ImageTypeAvatar` | Removido do serviço de imagens |

| Sincronização de avatar no cabeçalho | Sincronização logo→avatar removida de provider_service.go |

### 4. Documentação simplificada — 28 arquivos alterados, -3.992 linhas
- Removidos: `ADMIN_INSTRUCTIONS.md`, `INSTRUCTIONS.md`, `LOCATION_SERVICES.md`, `PROFILES_SPECS.md`, `PROFILES_SPEC_IMPROVED.md`, `SKILL.md`
- CLAUDE.md atualizado — seções de animais de estimação, perfil de usuário e reservas removidas; documentação de preenchimento automático adicionada

Lista de tarefas atualizada
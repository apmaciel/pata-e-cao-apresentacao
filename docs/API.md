# API Reference

Base URL: `http://localhost:8080/api`

---

## User Profile

All profile endpoints require JWT authentication (Bearer token).

### Get own profile

```
GET /api/auth/profile
Authorization: Bearer <access_token>

Response 200:
{
  "id": "uuid",
  "email": "user@example.com",
  "fullName": "Jane Doe",
  "role": "owner",
  "phone": "+5511999999999",
  "cpf": "00000000000",
  "bio": "Dog lover from São Paulo",
  "avatarImageId": "uuid",
  "socialLinks": {
    "instagram": "https://instagram.com/janedoe",
    "linkedin": "https://linkedin.com/in/janedoe"
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-06-01T12:00:00Z"
}
```

### Update own profile

```
PUT /api/auth/profile
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "phone": "+5511999999999",
  "bio": "Updated bio text",
  "avatarImageId": "uuid-from-image-upload",
  "socialLinks": {
    "instagram": "https://instagram.com/janedoe",
    "website": "https://janedoe.dev"
  }
}

Response 200: <User object>
```

All fields are optional — only provided fields are updated. The `socialLinks` object replaces the entire JSONB value when provided.

Allowed fields: `phone`, `cpf`, `bio`, `avatarImageId`, `socialLinks`.

### Delete own profile

```
DELETE /api/auth/profile
Authorization: Bearer <access_token>

Response 200:
{ "message": "account deleted successfully" }
```

Permanently deletes the user and all cascaded data (pets, bookings, reviews, refresh tokens). See migration `013_user_delete_cascade.sql` for FK constraint details.

### View another user's profile

```
GET /api/users/:id
Authorization: Bearer <access_token>

Response 200: <User object>
Response 403: { "error": "FORBIDDEN", "message": "access denied" }
```

**Access rules:**
- **Self**: The authenticated user can always view their own profile.
- **Admin**: Users with `role=admin` can view any profile.
- **Provider**: Users with `role=provider` can view the profile **only if** they have a confirmed booking with that owner (checked via `HasConfirmedBooking`).

---

## Image Upload — Avatar

```
POST /api/images/upload?type=avatar
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

Field: image (file)

Response 200:
{ "imageId": "uuid", "url": "/api/images/uuid" }
```

**Constraints:**
- Formats: JPEG, PNG
- Dimensions: 100×100 to 1000×1000 pixels
- Max size: 1 MB

Use the returned `imageId` in `PUT /api/auth/profile` as `avatarImageId`.

---

## Provider Profile

### Get own provider profile

```
GET /api/providers/me
Authorization: Bearer <access_token>

Response 200: ProviderDetail (includes galleryImages, socialLinks, etc.)
```

### Update own provider profile

```
PUT /api/providers/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "businessName": "Pet Shop Algodão Doce",
  "bio": "We love pets!",
  "location": "Vila Mariana, São Paulo - SP",
  "logoImageId": "uuid-or-null",
  "whatsapp": "5511999999999",
  "acceptsDogs": true,
  "acceptsCats": true,
  "acceptsNeutered": true,
  "acceptsIntact": false,
  "socialLinks": {
    "instagram": "https://instagram.com/petshop",
    "website": "https://petshop.com.br"
  }
}

Response 200: ProviderDetail

Errors:
- 400 RATE_LIMITED: business name can only be changed once per calendar month
- 400 RATE_LIMITED: profile picture can only be changed once per calendar month
- 400 RATE_LIMITED: service offerings can only be changed once per calendar month
```

### Gallery management

```
POST /api/providers/me/gallery
Authorization: Bearer <access_token>
Content-Type: application/json

{ "imageId": "uuid" }

Response 200:
{ "galleryImages": [...] }
```

```
DELETE /api/providers/me/gallery/:imageId
Authorization: Bearer <access_token>

Response 200:
{ "message": "gallery image removed" }
```

**Constraints:**
- Max 15 gallery images per provider
- Upload images first via `POST /api/images/upload?type=provider`

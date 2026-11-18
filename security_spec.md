# Security Specification & Threat Model — ABSTRACT. Storefront

## 1. Data Invariants
1. **Owner-Only Mutations**: Only an authenticated, email-verified Store Admin (`abstract.official.bd@gmail.com` or verified entry in `/admins/{uid}`) may create, update, or delete `/storeConfig`, `/products`, or `/sizeCharts`.
2. **Public Non-PII Storefront Read**: `/storeConfig`, `/products`, and `/sizeCharts` contain strictly public catalog and branding data (no customer PII) and are readable by storefront visitors.
3. **Private Admin Registry**: `/admins/{userId}` contains owner email metadata and is readable only by the matching user (`uid == userId`) or a verified admin; self-registration as admin by arbitrary users is forbidden.
4. **Immutable Ownership & Creation Timestamps**: `ownerId` and `createdAt` on `/products` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
5. **Bounded Payloads & Strict Schemas**: Every string has explicit `.size()` bounds (`image <= 450000` bytes), product `stockCount` is validated as an integer in `[0, 100000]`, arrays (`specs <= 10`, `sizes <= 15`, `columns <= 12`, `rows <= 20`) are strictly bounded, and shadow/ghost fields are blocked via `keys().hasAll(...)` + `keys().hasOnly(...)` + `affectedKeys().hasOnly(...)`.
6. **Product Reviews Relational & Rating Integrity**: `/products/{productId}/reviews/{reviewId}` must reference an existing parent `/products/{productId}`, require an authenticated verified author (`authorId == request.auth.uid`), enforce integer ratings in `[1, 5]`, bound comments (`1..500` chars), store zero PII, and allow deletion/editing only by the review author or a verified store admin.
7. **Customer Profile & Saved Address Isolation**: `/customers/{userId}` contains PII (`phoneNumber`, `email`, `addresses`) and is strictly readable and writable only by `request.auth.uid == userId` (verified Google Auth user) or verified admins. Saved `addresses` array is capped at `<= 3` items and validated element-by-element.
8. **Customer Order History Ownership & Status Integrity**: `/customers/{userId}/orders/{orderId}` is strictly private to the owning customer (`uid == userId`) or admins, requires an existing parent `/customers/{userId}`, forces initial status to `'Sent via WhatsApp'` on creation, and prevents customers from altering order status or historical totals.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Product Create**: Unauthenticated user calls `setDoc(doc(db, 'products', 'p1'), validProduct)`.
2. **Non-Admin Authenticated Product Create**: Signed-in customer (`other@gmail.com`) attempts to create a product.
3. **Unverified Admin Email Spoof**: Signed-in user with `email: 'abstract.official.bd@gmail.com'` and `email_verified: false` attempts to update `/storeConfig/main`.
4. **Self-Assigned Admin Escalation**: Non-admin user attempts `setDoc(doc(db, 'admins', request.auth.uid), { email: 'attacker@evil.com', role: 'admin', createdAt: serverTimestamp() })`.
5. **Shadow / Ghost Field Injection on Create**: Admin creates a product with an extra undeclared field `isFeaturedHack: true`.
6. **Shadow / Ghost Field Injection on Update**: Admin updates `/storeConfig/main` adding an extra field `secretKey: 'abc'`.
7. **ID Poisoning**: Admin attempts to create `/products/invalid id with spaces!` or a 200-char document ID.
8. **Negative / Zero Price Poisoning**: Admin attempts to create or update a product with `price: -100` or `price: 0`.
9. **Client Timestamp Forgery**: Admin creates a product passing a backdated `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()`.
10. **Immutable Field Tampering**: Admin attempts to update `createdAt` or `ownerId` on an existing `/products/{id}` document.
11. **Oversized Image / Resource Exhaustion**: Admin attempts to write a 900KB `image` string exceeding the `450000` character limit.
12. **PII / Admin Enumeration by Customer**: Non-admin authenticated user attempts `getDocs(collection(db, 'admins'))`.
13. **Out-of-Bounds / Orphaned / Spoofed Review**: Customer attempts to create a review with `rating: 10`, `rating: 4.5`, missing parent product, or `authorId` set to another user's UID, or deletes another customer's review.
14. **Cross-Customer PII / Order Snooping & >3 Address Overflow**: Customer A tries to read/list `/customers/{customerB}/orders` or `/customers/{customerB}`, or attempts to save 4 addresses in `addresses` or forge order `status: 'Delivered'` on creation.

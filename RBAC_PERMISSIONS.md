# RBAC Permission Matrix

> Defined in `database.py` → `PERMISSIONS` dict. Enforced via the `@check_perm()` decorator in `app.py`.

## Role Overview

| Role | Username | Password | Primary Responsibility |
|------|----------|----------|------------------------|
| **System Admin** | `admin` | `admin123` | Full system control |
| **Field Officer** | `officer` | `officer123` | Field collection & intake |
| **Evidence Custodian** | `custodian` | `custody123` | Storage, sealing & oversight |
| **Forensic Analyst** | `analyst` | `analyst123` | Lab analysis & verification |
| **Court Auditor** | `auditor` | `audit123` | Compliance & log review |

---

## Permission Matrix

| Permission | System Admin | Field Officer | Evidence Custodian | Forensic Analyst | Court Auditor |
|------------|:------------:|:-------------:|:------------------:|:----------------:|:-------------:|
| **view** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **create** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **transfer** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **verify** | ✅ | ❌ | ❌ | ✅ | ✅ |
| **seal** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **delete** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **view_all_logs** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Dashboard shows** | All evidence | Own custody only | Own custody only | Own custody only | All evidence |

> `delete` is enforced at the backend but not exposed in the current UI (reserved for future use).
> Dashboard filtering: **System Admin** and **Court Auditor** see all evidence; all other roles see only evidence where they are the `current_custodian`.

---

## Role Descriptions

### 1. System Admin
**Username**: `admin` | **Password**: `admin123`

Full administrative access. Intended for IT/security officers managing the system.

**Permissions**: view · create · transfer · verify · seal · delete · view_all_logs

---

### 2. Field Officer
**Username**: `officer` | **Password**: `officer123`

Collects, registers, and hands off evidence in the field. No forensics or sealing duties.

**Permissions**: view · create · transfer

**Cannot**: verify integrity, seal evidence, view all audit logs

---

### 3. Evidence Custodian
**Username**: `custodian` | **Password**: `custody123`

Manages the evidence storage room. Receives transfers, seals items for court, and has full log visibility.

**Permissions**: view · transfer · seal · view_all_logs

**Cannot**: create new evidence, verify integrity

---

### 4. Forensic Analyst
**Username**: `analyst` | **Password**: `analyst123`

Lab-only role. Read + verify access to confirm integrity before and after analysis.

**Permissions**: view · verify

**Cannot**: create, transfer, seal, or view full audit logs

---

### 5. Court Auditor
**Username**: `auditor` | **Password**: `audit123`

Compliance/legal oversight. Completely read-only except for on-demand integrity checks.

**Permissions**: view · verify · view_all_logs

**Cannot**: create, transfer, seal, or delete anything

---

## Real-World Chain of Custody Flow

```
Field Officer  →  creates & collects evidence
      ↓  (transfers to)
Evidence Custodian  →  stores, manages, seals for court
      ↓  (transfers to)
Forensic Analyst  →  verifies integrity, runs analysis
      ↓  (transfers back)
Evidence Custodian  →  receives and re-seals

Court Auditor  →  reviews the entire log chain at any point
System Admin   →  oversees and manages at all levels
```

---

## Permission Enforcement

### Backend API Layer (Primary Security)

Enforced via the `@check_perm(permission)` decorator in `app.py`.
Returns `403 Forbidden` if the user's session does not have the required permission.

```python
@app.route('/api/evidence/create', methods=['POST'])
@login_required
@check_perm('create')   # ← 403 if role lacks 'create'
def create_evidence():
    ...
```

### Frontend UI Layer (UX)

Buttons are conditionally rendered in Jinja2 templates based on session permissions:

```html
{% if user.permissions.create %}
<button onclick="showCreateModal()">+ NEW EVIDENCE</button>
{% endif %}
```

---

## Test Scenarios

| Login as | Can create? | Can transfer? | Can verify? | Can seal? | Can see all logs? |
|----------|:-----------:|:-------------:|:-----------:|:---------:|:-----------------:|
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `officer` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `custodian` | ❌ | ✅ | ❌ | ✅ | ✅ |
| `analyst` | ❌ | ❌ | ✅ | ❌ | ❌ |
| `auditor` | ❌ | ❌ | ✅ | ❌ | ✅ |

---

## Key Design Points for M.Tech Presentation

- **Principle of Least Privilege** — each role gets only what it needs
- **5-tier RBAC** with **7 distinct permissions**
- **Decorator Pattern** — `@check_perm()` cleanly separates auth logic from route logic
- **Session-based permission caching** — permissions stored as dict in Flask session for O(1) lookup
- **Three-layer security**: Backend decorator → Frontend template → Database (planned row-level)
- **Chain-of-custody lifecycle** modelled into roles: Officer → Custodian → Analyst → Auditor

---

## Future Enhancements

1. User management UI (add/remove users, change roles)
2. Row-level security — users see only evidence they hold or created
3. Two-factor authentication for System Admin
4. Audit logging of all permission denials
5. IP-based access restrictions for privileged roles

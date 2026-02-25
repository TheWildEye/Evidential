# RBAC Permission Matrix

## 5 Roles Overview

| Role | Primary Responsibility | Permissions Count |
|------|----------------------|-------------------|
| **System Admin** | Full system control | 7 permissions |
| **Evidence Manager** | Evidence lifecycle | 6 permissions |
| **Investigator** | Field operations | 4 permissions |
| **Forensic Analyst** | Lab analysis | 2 permissions |
| **Auditor** | Compliance & review | 3 permissions |

## Detailed Permission Matrix

| Permission | System Admin | Evidence Manager | Investigator | Forensic Analyst | Auditor |
|------------|:------------:|:----------------:|:------------:|:----------------:|:-------:|
| **view** (View evidence) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **create** (Create evidence) | ✅ | ✅ | ✅ | ❌ | ❌ |
| **transfer** (Transfer custody) | ✅ | ✅ | ✅ | ❌ | ❌ |
| **verify** (Verify integrity)* | ✅ | ✅ | ❌ | ✅ | ✅ |
| **seal** (Seal for court) | ✅ | ✅ | ❌ | ❌ | ❌ |
| **delete** (Delete evidence)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **view_all_logs** (View all audit logs) | ✅ | ✅ | ❌ | ❌ | ✅ |

*Integrity verification requires forensics training - restricted to trained professionals  
**Delete permission implemented but not exposed in UI (future enhancement)

## Role Descriptions

### 1. System Admin
**Username**: `sysadmin` | **Password**: `admin123`

**Purpose**: Complete system administration and oversight

**Typical Users**: 
- IT Administrator
- System Owner
- Security Officer

**Permissions**:
- ✅ View all evidence
- ✅ Create new evidence
- ✅ Transfer custody
- ✅ Verify integrity
- ✅ Seal evidence for court
- ✅ Delete evidence (soft delete)
- ✅ View all audit logs

**Use Cases**:
- System maintenance
- Handle exceptional cases
- Compliance investigations
- Security audits

---

### 2. Evidence Manager
**Username**: `manager` | **Password**: `manager123`

**Purpose**: Evidence room management and lifecycle oversight

**Typical Users**:
- Evidence Room Supervisor
- Department Head
- Property Clerk Supervisor

**Permissions**:
- ✅ View all evidence
- ✅ Create new evidence
- ✅ Transfer custody
- ✅ Verify integrity
- ✅ Seal evidence for court
- ✅ View all audit logs
- ❌ Cannot delete evidence

**Use Cases**:
- Manage evidence room operations
- Seal evidence before court proceedings
- Oversee chain of custody compliance
- Review all evidence activities

---

### 3. Investigator
**Username**: `investigator` | **Password**: `inv123`

**Purpose**: Field investigation and evidence collection

**Typical Users**:
- Detective
- Police Officer
- Field Agent
- Crime Scene Investigator

**Permissions**:
- ✅ View evidence they created or have access to
- ✅ Create new evidence from crime scenes
- ✅ Transfer custody to lab/storage
- ✅ Verify integrity
- ❌ Cannot seal evidence
- ❌ Cannot view all audit logs
- ❌ Cannot delete evidence

**Use Cases**:
- Collect evidence at crime scenes
- Register evidence into system
- Transfer evidence to forensics lab
- Verify evidence before/after field work

---

### 4. Forensic Analyst
**Username**: `analyst` | **Password**: `analyst123`

**Purpose**: Laboratory analysis and examination

**Typical Users**:
- Lab Technician
- Forensic Scientist
- DNA Analyst
- Digital Forensics Examiner

**Permissions**:
- ✅ View evidence assigned to them
- ✅ Verify integrity before and after analysis
- ❌ Cannot create evidence
- ❌ Cannot transfer custody
- ❌ Cannot seal evidence
- ❌ Cannot view all logs
- ❌ Cannot delete evidence

**Use Cases**:
- View evidence details for analysis
- Verify integrity before starting analysis
- Verify integrity after completing analysis
- Add analysis notes to custody log

**Restrictions**:
- Read-only except for verification
- Focuses on technical analysis, not custody management

---

### 5. Auditor
**Username**: `auditor` | **Password**: `audit123`

**Purpose**: Compliance monitoring and review (completely read-only)

**Typical Users**:
- Internal Auditor
- Compliance Officer
- Legal Team
- Quality Assurance

**Permissions**:
- ✅ View all evidence
- ✅ View all audit logs and custody trails
- ✅ Verify integrity (for compliance checks)
- ❌ Cannot create evidence
- ❌ Cannot transfer custody
- ❌ Cannot seal evidence
- ❌ Cannot delete evidence
- ❌ Cannot modify anything

**Use Cases**:
- Compliance audits
- Chain of custody reviews
- Integrity spot-checks
- Preparing reports for court
- Quality assurance reviews

**Restrictions**:
- Completely read-only except integrity verification
- Cannot perform any actions that modify evidence or custody chain

---

## Permission Enforcement

### Three-Layer Security Model

#### 1. **Backend API Layer** (Primary Security)
- Enforced via `@permission_required(permission)` decorator
- Returns `403 Forbidden` if user lacks permission
- Prevents unauthorized API calls

```python
@app.route('/api/evidence/create', methods=['POST'])
@login_required
@permission_required('create')  # ← Blocks if no 'create' permission
def create_evidence():
    # ...
```

#### 2. **Frontend UI Layer** (User Experience)
- Buttons hidden if user lacks permission
- Prevents confusion and improves UX
- Client-side validation

```html
{% if user.permissions.create %}
<button class="btn-primary" onclick="showCreateModal()">+ NEW EVIDENCE</button>
{% endif %}
```

#### 3. **Database Layer** (Future Enhancement)
- Row-level security policies
- Database-level access control
- Defense in depth

---

## Testing Different Roles

### Test Scenario 1: System Admin (Full Access)
1. Login as `sysadmin` / `admin123`
2. ✅ Should see "NEW EVIDENCE" button
3. ✅ Create evidence → Works
4. ✅ Transfer custody → Works
5. ✅ Seal evidence → Works
6. ✅ All buttons visible

### Test Scenario 2: Evidence Manager (Almost Full)
1. Login as `manager` / `manager123`
2. ✅ Should see "NEW EVIDENCE" button
3. ✅ Create evidence → Works
4. ✅ Transfer custody → Works
5. ✅ Seal evidence → Works
6. ❌ No delete option (future feature)

### Test Scenario 3: Investigator (Field Ops)
1. Login as `investigator` / `inv123`
2. ✅ Should see "NEW EVIDENCE" button
3. ✅ Create evidence → Works
4. ✅ Transfer custody → Works
5. ❌ Seal button HIDDEN (no seal permission)

### Test Scenario 4: Forensic Analyst (Read + Verify Only)
1. Login as `analyst` / `analyst123`
2. ❌ "NEW EVIDENCE" button HIDDEN
3. ✅ Can view evidence
4. ✅ Can verify integrity only
5. ❌ Transfer button HIDDEN
6. ❌ Seal button HIDDEN
7. ❌ Create evidence → Returns 403 Forbidden

### Test Scenario 5: Auditor (Completely Read-Only)
1. Login as `auditor` / `audit123`
2. ❌ "NEW EVIDENCE" button HIDDEN
3. ✅ Can view all evidence
4. ✅ Can verify integrity only
5. ❌ Transfer button HIDDEN
6. ❌ Seal button HIDDEN
7. ❌ Any modification attempt → Returns 403 Forbidden

---

## Demo Credentials Summary

| Username | Password | Role | Quick Test |
|----------|----------|------|------------|
| `sysadmin` | `admin123` | System Admin | Try everything ✅ |
| `manager` | `manager123` | Evidence Manager | Create & seal ✅ |
| `investigator` | `inv123` | Investigator | Create & transfer ✅ |
| `analyst` | `analyst123` | Forensic Analyst | View & verify only ⚠️ |
| `auditor` | `audit123` | Auditor | View only (read-only) 👁️ |

---

## Benefits for M.Tech Presentation

### Academic Value

1. **Security Principle**: Demonstrates "Principle of Least Privilege"
2. **Enterprise Pattern**: Industry-standard RBAC implementation
3. **Real-World Relevance**: Mirrors actual evidence management systems
4. **Scalability**: Easy to add new roles or modify permissions
5. **Compliance**: Meets audit requirements for access control

### Talking Points

- "Implemented **5-tier RBAC** with **7 distinct permissions**"
- "**Three-layer security**: Backend decorator, Frontend UI, Database (planned)"
- "Follows **principle of least privilege** - users only get required permissions"
- "**Forensic Analyst** restricted to read-only for evidence integrity"
- "**Auditor** provides compliance oversight without modification ability"

### Advanced Concepts Demonstrated

✅ **Decorator Pattern** - Python decorators for permission enforcement  
✅ **Separation of Concerns** - Backend security + Frontend UX  
✅ **Session Management** - Permissions stored in user session  
✅ **Template Logic** - Jinja2 conditional rendering  
✅ **Error Handling** - Proper HTTP status codes (401, 403)  

---

## Future Enhancements

1. **User Management**: Add users, change roles, reset passwords
2. **Row-Level Security**: Users only see evidence they have access to
3. **Permission Groups**: Create custom permission sets
4. **Audit Logging**: Log all permission checks and denials
5. **Two-Factor Authentication**: Add 2FA for admins
6. **IP Restrictions**: Limit admin access to specific IPs
7. **Delete Functionality**: Expose soft-delete for System Admin

import sqlite3
from datetime import datetime
import hashlib
import os


PERMISSIONS = {
    'System Admin':        ['view', 'create', 'transfer', 'verify', 'seal', 'delete', 'view_all_logs'],
    'Field Officer':       ['view', 'create', 'transfer'],
    'Evidence Custodian':  ['view', 'transfer', 'seal', 'view_all_logs'],
    'Forensic Analyst':    ['view', 'verify'],
    'Court Auditor':       ['view', 'verify', 'view_all_logs'],
}


def check_permission(role, permission):
    """Check if a role has a specific permission"""
    return permission in PERMISSIONS.get(role, [])


class Database:
    def __init__(self, db_path='evidence.db'):
        self.db_path = db_path
        self.init_db()
    
    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def init_db(self):
        """Initialize database with tables"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_number TEXT NOT NULL,
                description TEXT NOT NULL,
                evidence_type TEXT NOT NULL,
                original_hash TEXT NOT NULL,
                current_hash TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL,
                current_custodian TEXT NOT NULL,
                file_path TEXT
            )
        ''')

        try:
            cursor.execute('ALTER TABLE evidence ADD COLUMN file_path TEXT')
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute('ALTER TABLE evidence ADD COLUMN device_metadata TEXT')
        except sqlite3.OperationalError:
            pass

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS custody_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                evidence_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                performed_by TEXT NOT NULL,
                transferred_to TEXT,
                timestamp TEXT NOT NULL,
                hash_verified TEXT,
                notes TEXT,
                previous_hash TEXT,
                chain_hash TEXT,
                FOREIGN KEY (evidence_id) REFERENCES evidence (id)
            )
        ''')
        
        for col in [
            'ALTER TABLE custody_log ADD COLUMN previous_hash TEXT',
            'ALTER TABLE custody_log ADD COLUMN chain_hash TEXT',
        ]:
            try:
                cursor.execute(col)
            except sqlite3.OperationalError:
                pass

        cursor.execute('SELECT COUNT(*) FROM users')
        if cursor.fetchone()[0] == 0:
            demo_users = [
                ('admin',     self.hash_password('admin123'),    'System Admin'),
                ('officer',   self.hash_password('officer123'),  'Field Officer'),
                ('custodian', self.hash_password('custody123'),  'Evidence Custodian'),
                ('analyst',   self.hash_password('analyst123'),  'Forensic Analyst'),
                ('auditor',   self.hash_password('audit123'),    'Court Auditor'),
            ]
            cursor.executemany(
                'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
                demo_users
            )
        
        conn.commit()
        conn.close()
    
    @staticmethod
    def hash_password(password):
        """Hash password using SHA-256"""
        return hashlib.sha256(password.encode()).hexdigest()
    
    @staticmethod
    def generate_evidence_hash(case_number, description, evidence_type):
        """Generate SHA-256 hash for evidence"""
        data = f"{case_number}|{description}|{evidence_type}|{datetime.now().isoformat()}"
        return hashlib.sha256(data.encode()).hexdigest()

    @staticmethod
    def compute_chain_hash(evidence_id, action, performed_by, timestamp, previous_hash, notes):
        """Compute SHA-256 chain hash for a custody log entry.
        Hash input: evidence_id|action|performed_by|timestamp|previous_hash|notes
        """
        data = f"{evidence_id}|{action}|{performed_by}|{timestamp}|{previous_hash}|{notes or ''}"
        return hashlib.sha256(data.encode()).hexdigest()
    
    def verify_user(self, username, password):
        """Verify user credentials"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM users WHERE username = ? AND password_hash = ?',
            (username, self.hash_password(password))
        )
        user = cursor.fetchone()
        conn.close()
        return dict(user) if user else None
    
    def get_user_permissions(self, role):
        """Get list of permissions for a role"""
        return PERMISSIONS.get(role, [])
    
    def get_coc_users(self):
        """Get users who can hold evidence custody (operational roles only)"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT username, role FROM users
            WHERE role NOT IN ('System Admin', 'Court Auditor')
            ORDER BY role
        """)
        users = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return users
    
    def create_evidence(self, case_number, description, evidence_type, created_by, file_path=None, device_metadata=None):
        """Create new evidence record.
        device_metadata: optional JSON string containing client + EXIF capture metadata.
        Hash is computed solely from file bytes for integrity-check compatibility.
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        
        if file_path and os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                evidence_hash = hashlib.sha256(f.read()).hexdigest()
        else:
            evidence_hash = self.generate_evidence_hash(case_number, description, evidence_type)
        
        timestamp = datetime.now().isoformat()
        
        cursor.execute('''
            INSERT INTO evidence (case_number, description, evidence_type,
                                original_hash, current_hash, status, created_at, created_by, current_custodian, file_path, device_metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (case_number, description, evidence_type, evidence_hash,
              evidence_hash, 'Active', timestamp, created_by, created_by, file_path, device_metadata))
        
        evidence_id = cursor.lastrowid

        genesis_chain_hash = self.compute_chain_hash(
            evidence_id, 'Created', created_by, timestamp, 'GENESIS', None
        )
        cursor.execute('''
            INSERT INTO custody_log
                (evidence_id, action, performed_by, timestamp, hash_verified, previous_hash, chain_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (evidence_id, 'Created', created_by, timestamp, 'PASS', 'GENESIS', genesis_chain_hash))
        
        conn.commit()
        conn.close()
        
        return evidence_id
    
    def get_all_evidence(self):
        """Get all evidence records"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM evidence ORDER BY created_at DESC')
        evidence_list = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return evidence_list

    def get_my_evidence(self, username):
        """Get evidence where the given user is the current custodian."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM evidence WHERE current_custodian = ? ORDER BY created_at DESC',
            (username,)
        )
        evidence_list = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return evidence_list
    
    def get_evidence(self, evidence_id):
        """Get single evidence record"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM evidence WHERE id = ?', (evidence_id,))
        evidence = cursor.fetchone()
        conn.close()
        return dict(evidence) if evidence else None
    
    def get_custody_log(self, evidence_id):
        """Get custody log for evidence"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM custody_log WHERE evidence_id = ? ORDER BY timestamp DESC',
            (evidence_id,)
        )
        logs = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return logs
    
    def transfer_evidence(self, evidence_id, performed_by, transferred_to, notes=None):
        """Transfer custody of evidence to another user."""
        self.add_custody_log(evidence_id, 'Transferred', performed_by, transferred_to, notes)

    def add_custody_log(self, evidence_id, action, performed_by, transferred_to=None, notes=None):
        """Add a tamper-evident custody log entry using hash chaining.
        Each entry stores:
          previous_hash = chain_hash of the last log for this evidence (or 'GENESIS')
          chain_hash    = SHA-256(evidence_id|action|performed_by|timestamp|previous_hash|notes)
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        evidence = self.get_evidence(evidence_id)
        hash_status = 'PASS' if evidence['original_hash'] == evidence['current_hash'] else 'FAIL'

        cursor.execute(
            'SELECT chain_hash FROM custody_log WHERE evidence_id = ? ORDER BY id DESC LIMIT 1',
            (evidence_id,)
        )
        row = cursor.fetchone()
        previous_hash = row['chain_hash'] if row and row['chain_hash'] else 'GENESIS'

        timestamp = datetime.now().isoformat()
        chain_hash = self.compute_chain_hash(
            evidence_id, action, performed_by, timestamp, previous_hash, notes
        )

        cursor.execute('''
            INSERT INTO custody_log
                (evidence_id, action, performed_by, transferred_to, timestamp,
                 hash_verified, notes, previous_hash, chain_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (evidence_id, action, performed_by, transferred_to, timestamp,
              hash_status, notes, previous_hash, chain_hash))

        
        if action == 'Transferred' and transferred_to:
            cursor.execute(
                'UPDATE evidence SET current_custodian = ? WHERE id = ?',
                (transferred_to, evidence_id)
            )

        conn.commit()
        conn.close()
    
    def verify_log_chain(self, evidence_id):
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM custody_log WHERE evidence_id = ? ORDER BY id ASC',
            (evidence_id,)
        )
        logs = [dict(row) for row in cursor.fetchall()]
        conn.close()

        total = len(logs)
        if total == 0:
            return {'is_valid': True, 'status': 'PASS', 'total': 0, 'message': 'No log entries found.'}

        for i, log in enumerate(logs):
            expected_hash = self.compute_chain_hash(
                log['evidence_id'],
                log['action'],
                log['performed_by'],
                log['timestamp'],
                log['previous_hash'],
                log['notes']
            )
            if expected_hash != log['chain_hash']:
                return {
                    'is_valid': False,
                    'status': 'FAIL',
                    'total': total,
                    'broken_at': i + 1,
                    'broken_action': log['action'],
                    'broken_by': log['performed_by'],
                    'message': f'Log entry {i + 1} of {total} has been tampered with.'
                }

        return {
            'is_valid': True,
            'status': 'PASS',
            'total': total,
            'message': f'All {total} log entries verified. Chain is intact.'
        }

    def verify_integrity(self, evidence_id):
        """Verify evidence integrity by re-hashing the file from disk.
        If no file is attached, falls back to comparing DB columns.
        """
        evidence = self.get_evidence(evidence_id)
        if not evidence:
            return None

        file_path = evidence.get('file_path')
        if file_path:
            if os.path.exists(file_path):
                with open(file_path, 'rb') as f:
                    live_hash = hashlib.sha256(f.read()).hexdigest()

                if live_hash != evidence['current_hash']:
                    conn = self.get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        'UPDATE evidence SET current_hash = ? WHERE id = ?',
                        (live_hash, evidence_id)
                    )
                    conn.commit()
                    conn.close()
                    evidence['current_hash'] = live_hash
            else:
                evidence['current_hash'] = 'FILE_MISSING'
                conn = self.get_connection()
                cursor = conn.cursor()
                cursor.execute(
                    'UPDATE evidence SET current_hash = ? WHERE id = ?',
                    ('FILE_MISSING', evidence_id)
                )
                conn.commit()
                conn.close()


        is_valid = evidence['original_hash'] == evidence['current_hash']
        status = 'PASS' if is_valid else 'FAIL'

        if not is_valid and evidence['status'] != 'Compromised':
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE evidence SET status = ? WHERE id = ?',
                ('Compromised', evidence_id)
            )
            conn.commit()
            conn.close()

        return {
            'is_valid': is_valid,
            'status': status,
            'original_hash': evidence['original_hash'],
            'current_hash': evidence['current_hash']
        }

    
    def seal_evidence(self, evidence_id, performed_by):
        """Seal evidence (mark as read-only)"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE evidence SET status = ? WHERE id = ?',
            ('Sealed', evidence_id)
        )
        conn.commit()
        conn.close()

        self.add_custody_log(evidence_id, 'Sealed', performed_by, notes='Evidence sealed for court')

    def update_evidence_hash(self, evidence_id, new_hash):
        """Update the current hash of an evidence record (used for tampering demo)"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE evidence SET current_hash = ? WHERE id = ?',
            (new_hash, evidence_id)
        )
        conn.commit()
        conn.close()

    def verify_log_chain(self, evidence_id):
        """Verify the integrity of the custody log chain for an evidence item.

        Walks entries in insertion order, recomputes each chain_hash, and checks:
          1. chain_hash stored == chain_hash recomputed
          2. previous_hash stored == chain_hash of the prior entry (or 'GENESIS' for first)

        Returns a dict with:
          is_valid  : bool — True if entire chain is intact
          status    : 'PASS' or 'FAIL'
          total     : total number of log entries checked
          broken_at : index (1-based) of the first broken entry, or None
          entries   : list of per-entry results for display
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM custody_log WHERE evidence_id = ? ORDER BY id ASC',
            (evidence_id,)
        )
        logs = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not logs:
            return {
                'is_valid': True, 'status': 'PASS',
                'total': 0, 'broken_at': None, 'entries': []
            }

        entries = []
        is_valid = True
        broken_at = None
        expected_previous = 'GENESIS'

        for i, log in enumerate(logs, start=1):
            recomputed = self.compute_chain_hash(
                log['evidence_id'], log['action'], log['performed_by'],
                log['timestamp'], log['previous_hash'] or 'GENESIS', log['notes']
            )
            prev_ok = (log['previous_hash'] or 'GENESIS') == expected_previous
            hash_ok = log['chain_hash'] == recomputed
            entry_ok = prev_ok and hash_ok

            entries.append({
                'index': i,
                'action': log['action'],
                'performed_by': log['performed_by'],
                'timestamp': log['timestamp'],
                'valid': entry_ok,
            })

            if not entry_ok and is_valid:
                is_valid = False
                broken_at = i

            # Next entry should link to this one's chain_hash
            expected_previous = log['chain_hash'] or recomputed

        return {
            'is_valid': is_valid,
            'status': 'PASS' if is_valid else 'FAIL',
            'total': len(logs),
            'broken_at': broken_at,
            'entries': entries,
        }

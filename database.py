import sqlite3
from datetime import datetime
import hashlib
import os


# Role-Based Access Control# RBAC Permission Definitions
PERMISSIONS = {
    'System Admin': ['view', 'create', 'transfer', 'verify', 'seal', 'delete', 'view_all_logs'],
    'Evidence Manager': ['view', 'create', 'transfer', 'verify', 'seal', 'view_all_logs'],
    'Investigator': ['view', 'create', 'transfer'],  # NO verify - field operations only
    'Forensic Analyst': ['view', 'verify'],  # Trained to verify integrity
    'Auditor': ['view', 'verify', 'view_all_logs']  # Oversight role - can verify
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
        
        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL
            )
        ''')
        
        # Evidence table
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
                current_custodian TEXT NOT NULL
            )
        ''')
        
        # Custody log table
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
                FOREIGN KEY (evidence_id) REFERENCES evidence (id)
            )
        ''')
        
        # Insert demo users if not exists
        cursor.execute('SELECT COUNT(*) FROM users')
        if cursor.fetchone()[0] == 0:
            demo_users = [
                ('sysadmin', self.hash_password('admin123'), 'System Admin'),
                ('manager', self.hash_password('manager123'), 'Evidence Manager'),
                ('investigator', self.hash_password('inv123'), 'Investigator'),
                ('analyst', self.hash_password('analyst123'), 'Forensic Analyst'),
                ('auditor', self.hash_password('audit123'), 'Auditor')
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
        """Get users who can be in chain of custody (exclude System Admin and Auditor)"""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT username, role FROM users 
            WHERE role NOT IN ('System Admin', 'Auditor')
            ORDER BY role
        """)
        users = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return users
    
    def create_evidence(self, case_number, description, evidence_type, created_by, file_path=None):
        """Create new evidence record"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Generate hash from file content if file exists, otherwise from metadata
        if file_path and os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                evidence_hash = hashlib.sha256(f.read()).hexdigest()
        else:
            evidence_hash = self.generate_evidence_hash(case_number, description, evidence_type)
        
        timestamp = datetime.now().isoformat()
        
        cursor.execute('''
            INSERT INTO evidence (case_number, description, evidence_type, 
                                original_hash, current_hash, status, created_at, created_by, current_custodian, file_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (case_number, description, evidence_type, evidence_hash, 
              evidence_hash, 'Active', timestamp, created_by, created_by, file_path))
        
        evidence_id = cursor.lastrowid
        
        # Log creation in custody log
        cursor.execute('''
            INSERT INTO custody_log (evidence_id, action, performed_by, timestamp, hash_verified)
            VALUES (?, ?, ?, ?, ?)
        ''', (evidence_id, 'Created', created_by, timestamp, 'PASS'))
        
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
    
    def add_custody_log(self, evidence_id, action, performed_by, transferred_to=None, notes=None):
        """Add custody log entry"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Get current evidence
        evidence = self.get_evidence(evidence_id)
        
        # Verify hash
        hash_status = 'PASS' if evidence['original_hash'] == evidence['current_hash'] else 'FAIL'
        
        cursor.execute('''
            INSERT INTO custody_log (evidence_id, action, performed_by, transferred_to, timestamp, hash_verified, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (evidence_id, action, performed_by, transferred_to, datetime.now().isoformat(), hash_status, notes))
        
        # If this is a transfer, update current_custodian in evidence table
        if action == 'Transferred' and transferred_to:
            cursor.execute('''
                UPDATE evidence SET current_custodian = ? WHERE id = ?
            ''', (transferred_to, evidence_id))
        
        conn.commit()
        conn.close()
    
    def verify_integrity(self, evidence_id):
        """Verify evidence integrity"""
        evidence = self.get_evidence(evidence_id)
        if not evidence:
            return None
        
        is_valid = evidence['original_hash'] == evidence['current_hash']
        status = 'PASS' if is_valid else 'FAIL'
        
        # Update evidence status if compromised
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
        
        self.add_custody_log(evidence_id, 'Sealed', performed_by, 'Evidence sealed for court')

from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from database import Database
from functools import wraps
from werkzeug.utils import secure_filename
import hashlib
import os
import traceback

app = Flask(__name__)
app.secret_key = 'chain-of-custody-2026'
db = Database()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user' not in session:
            # API routes return JSON, page routes redirect
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Login required'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def check_perm(perm):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'user' not in session:
                return jsonify({'error': 'Login required'}), 401
            
            permissions = session['user'].get('permissions', {})
            # Support both dict and list formats for backward compatibility
            has_permission = (
                permissions.get(perm, False) if isinstance(permissions, dict)
                else perm in permissions
            )
            
            if not has_permission:
                return jsonify({'error': f'Permission denied: {perm}'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator


@app.route('/')
def index():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = db.verify_user(request.form['username'], request.form['password'])
        if user:
            # Convert permissions list to dictionary for template access
            permissions_list = db.get_user_permissions(user['role'])
            session['user'] = {
                'username': user['username'],
                'role': user['role'],
                'permissions': {perm: True for perm in permissions_list}
            }
            return redirect(url_for('dashboard'))
        return render_template('login.html', error='Invalid credentials')
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/dashboard')
@login_required
def dashboard():
    evidence_list = db.get_all_evidence()
    return render_template('dashboard.html', 
                         evidence_list=evidence_list,
                         user=session['user'])


@app.route('/evidence/<int:evidence_id>')
@login_required
def evidence_detail(evidence_id):
    evidence = db.get_evidence(evidence_id)
    if not evidence:
        return redirect(url_for('dashboard'))
    
    custody_log = db.get_custody_log(evidence_id)
    coc_users = db.get_coc_users()
    
    # Read file content if file exists
    file_content = None
    if evidence.get('file_path') and os.path.exists(evidence['file_path']):
        try:
            with open(evidence['file_path'], 'r') as f:
                file_content = f.read()
        except Exception as e:
            print(f"[ERROR] Could not read file: {e}")
    
    return render_template('evidence.html', 
                         evidence=evidence,
                         custody_log=custody_log,
                         coc_users=coc_users,
                         file_content=file_content,
                         user=session['user'])


@app.route('/api/evidence/create', methods=['POST'])
@login_required
@check_perm('create')
def create_evidence():
    try:
        # Handle both JSON and FormData
        if request.is_json:
            data = request.json
            file_path = None
        else:
            # FormData with potential file upload
            data = request.form.to_dict()
            file_path = None
            
            # Handle file upload
            if 'evidence_file' in request.files:
                file = request.files['evidence_file']
                if file.filename:
                    
                    filename = secure_filename(file.filename)
                    
                    # Ensure the upload directory exists
                    upload_folder = 'evidence_files'
                    if not os.path.exists(upload_folder):
                        os.makedirs(upload_folder)

                    file_path = os.path.join(upload_folder, f"{data.get('case_number', 'unknown_case')}_{filename}")
                    file.save(file_path)
                    print(f"[CREATE] File saved: {file_path}")
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate required fields
        required_fields = ['case_number', 'description', 'evidence_type']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            return jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 400
        
        print(f"[CREATE] User: {session['user']['username']}, Case: {data['case_number']}")
        
        evidence_id = db.create_evidence(
            case_number=data['case_number'],
            description=data['description'],
            evidence_type=data['evidence_type'],
            created_by=session['user']['username'],
            file_path=file_path
        )
        
        print(f"[CREATE] Success - Evidence ID: {evidence_id}")
        return jsonify({'success': True, 'evidence_id': evidence_id})
        
    except KeyError as e:
        print(f"[CREATE] KeyError: {e}")
        traceback.print_exc() # Added for debugging
        return jsonify({'error': f'Missing field: {str(e)}'}), 400
    except Exception as e:
        print(f"[CREATE] Error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Failed to create evidence: {str(e)}'}), 500


@app.route('/api/evidence/<int:evidence_id>/transfer', methods=['POST'])
@login_required
@check_perm('transfer')
def transfer_evidence(evidence_id):
    data = request.json
    transferred_to = data.get('transferred_to')
    notes = data.get('notes', '')
    
    if not transferred_to:
        return jsonify({'error': 'Select a user to transfer to'}), 400
    
    db.add_custody_log(
        evidence_id=evidence_id,
        action='Transferred',
        performed_by=session['user']['username'],
        transferred_to=transferred_to,
        notes=notes
    )
    return jsonify({'success': True})


@app.route('/api/evidence/<int:evidence_id>/verify', methods=['POST'])
@login_required
def verify_evidence(evidence_id):
    try:
        print(f"[VERIFY] User: {session['user']['username']}, Evidence ID: {evidence_id}")
        
        result = db.verify_integrity(evidence_id)
        
        if not result:
            return jsonify({'error': 'Evidence not found'}), 404
        
        db.add_custody_log(
            evidence_id=evidence_id,
            action='Integrity Verified',
            performed_by=session['user']['username'],
            notes=f"Hash check: {result['status']}"
        )
        
        print(f"[VERIFY] Result: {result['status']}")
        return jsonify(result)
        
    except Exception as e:
        print(f"[VERIFY] Error: {type(e).__name__}: {e}")
        return jsonify({'error': f'Failed to verify evidence: {str(e)}', 'is_valid': False}), 500


@app.route('/api/evidence/<int:evidence_id>/seal', methods=['POST'])
@login_required
@check_perm('seal')
def seal_evidence(evidence_id):
    try:
        print(f"[SEAL] User: {session['user']['username']}, Evidence ID: {evidence_id}")
        
        db.seal_evidence(evidence_id, session['user']['username'])
        
        print(f"[SEAL] Success - Evidence {evidence_id} sealed")
        return jsonify({'success': True})
        
    except Exception as e:
        print(f"[SEAL] Error: {type(e).__name__}: {e}")
        return jsonify({'error': f'Failed to seal evidence: {str(e)}'}), 500


@app.route('/api/evidence/<int:evidence_id>/update_file', methods=['POST'])
@login_required
def update_evidence_file(evidence_id):
    """Update evidence file content (for tampering demo)"""
    try:
        data = request.json
        new_content = data.get('content', '')
        
        evidence = db.get_evidence(evidence_id)
        if not evidence:
            return jsonify({'error': 'Evidence not found'}), 404
        
        file_path = evidence.get('file_path')
        if not file_path or not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        # Save new content
        with open(file_path, 'w') as f:
            f.write(new_content)
        
        # Recalculate hash
        with open(file_path, 'rb') as f:
            new_hash = hashlib.sha256(f.read()).hexdigest()
        
        # Update database
        import sqlite3
        conn = sqlite3.connect('evidence.db')
        cursor = conn.cursor()
        cursor.execute("UPDATE evidence SET current_hash = ? WHERE id = ?", (new_hash, evidence_id))
        conn.commit()
        conn.close()
        
        print(f"[TAMPER] File updated by {session['user']['username']}, Evidence ID: {evidence_id}")
        
        return jsonify({
            'success': True,
            'message': 'File tampered successfully!'
        })
        
    except Exception as e:
        print(f"[ERROR] File update failed: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print(" Chain of Custody Evidence Management System")
    print(" Role-Based Access Control (RBAC) - 5 Roles")
    print("="*60)
    print("\n[*] Demo Credentials:")
    print("  sysadmin     / admin123   (System Admin)")
    print("  manager      / manager123 (Evidence Manager)")
    print("  investigator / inv123     (Investigator)")
    print("  analyst      / analyst123 (Forensic Analyst)")
    print("  auditor      / audit123   (Auditor - Read Only)")
    print("\n[*] Server: http://127.0.0.1:5000")
    print("="*60 + "\n")
    
    app.run(debug=True, port=5000)

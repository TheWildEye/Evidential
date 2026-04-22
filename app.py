from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_file
from database import Database
from functools import wraps
from werkzeug.utils import secure_filename
import hashlib
import json
import os
import traceback

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100 MB limit
app.secret_key = os.environ.get('FLASK_SECRET_KEY', os.urandom(24))
db = Database()


def extract_exif(file_path):
    """Extract forensic EXIF metadata from an image file.
    Returns a dict of EXIF fields on success, {} on any failure (non-image, no EXIF, etc.).
    Graceful  -  never raises; never breaks a non-image upload.
    """
    try:
        from PIL import Image, ExifTags
        img = Image.open(file_path)

        # Support both modern (Pillow ≥9) and legacy API
        try:
            raw = dict(img.getexif())
        except Exception:
            raw = img._getexif() or {}

        if not raw:
            return {}

        def to_float(val):
            """Convert IFDRational / tuple(num, den) / numeric to float."""
            try:
                if hasattr(val, '__float__'):
                    return float(val)
                if isinstance(val, tuple) and len(val) == 2:
                    return val[0] / val[1] if val[1] else 0
            except Exception:
                return None
            return None

        def gps_decimal(coords, ref):
            """Convert GPS degrees/minutes/seconds rational tuple to decimal degrees."""
            try:
                d, m, s = to_float(coords[0]), to_float(coords[1]), to_float(coords[2])
                if None in (d, m, s):
                    return None
                dec = d + m / 60 + s / 3600
                if str(ref).upper() in ('S', 'W'):
                    dec = -dec
                return round(dec, 7)
            except Exception:
                return None

        # Build tag name → value map
        named = {ExifTags.TAGS.get(tag_id, str(tag_id)): val for tag_id, val in raw.items()}
        result = {}

        # Scalar string fields
        for field in ['Make', 'Model', 'Software', 'DateTime', 'DateTimeOriginal',
                      'Flash', 'ISOSpeedRatings']:
            if field in named and named[field]:
                result[field] = str(named[field]).strip()

        # Rational fields → float
        for field in ['FocalLength', 'ExposureTime', 'FNumber']:
            if field in named:
                v = to_float(named[field])
                if v is not None:
                    result[field] = round(v, 4)

        # GPS sub-IFD
        gps_tag_id = next((k for k, v in ExifTags.TAGS.items() if v == 'GPSInfo'), None)
        gps_raw = raw.get(gps_tag_id, {})
        if gps_raw:
            gps = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps_raw.items()}
            if 'GPSLatitude' in gps and 'GPSLongitude' in gps:
                lat = gps_decimal(gps['GPSLatitude'], gps.get('GPSLatitudeRef', 'N'))
                lng = gps_decimal(gps['GPSLongitude'], gps.get('GPSLongitudeRef', 'E'))
                if lat is not None:
                    result['exif_gps_lat'] = lat
                if lng is not None:
                    result['exif_gps_lng'] = lng
            if 'GPSAltitude' in gps:
                alt = to_float(gps['GPSAltitude'])
                if alt is not None:
                    result['exif_gps_altitude_m'] = round(alt, 1)
            if 'GPSTimeStamp' in gps:
                try:
                    ts = gps['GPSTimeStamp']
                    h = int(to_float(ts[0]) or 0)
                    m = int(to_float(ts[1]) or 0)
                    s = int(to_float(ts[2]) or 0)
                    gps_date = gps.get('GPSDateStamp', '')
                    result['exif_gps_timestamp_utc'] = f"{gps_date} {h:02d}:{m:02d}:{s:02d} UTC".strip()
                except Exception:
                    pass

        return result
    except Exception:
        return {}


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user' not in session:
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
    role = session['user']['role']
    username = session['user']['username']
    see_all_roles = {'System Admin', 'Court Auditor'}
    if role in see_all_roles:
        evidence_list = db.get_all_evidence()
    else:
        evidence_list = db.get_my_evidence(username)
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

    file_path = evidence.get('file_path')
    file_content = None
    file_ext = None

    if file_path and os.path.exists(file_path):
        file_ext = os.path.splitext(file_path)[1].lower()
        if file_ext == '.txt':
            try:
                with open(file_path, 'r') as f:
                    file_content = f.read()
            except Exception as e:
                print(f"[ERROR] Could not read file: {e}")

    # Parse device metadata JSON for structured template display
    device_metadata = None
    raw_meta = evidence.get('device_metadata')
    if raw_meta:
        try:
            device_metadata = json.loads(raw_meta)
        except (json.JSONDecodeError, TypeError):
            pass

    return render_template('evidence.html',
                         evidence=evidence,
                         custody_log=custody_log,
                         coc_users=coc_users,
                         file_content=file_content,
                         file_ext=file_ext,
                         device_metadata=device_metadata,
                         user=session['user'])


@app.route('/evidence_file/<int:evidence_id>')
@login_required
def serve_evidence_file(evidence_id):
    """Serve the uploaded evidence file with correct MIME type."""
    evidence = db.get_evidence(evidence_id)
    if not evidence or not evidence.get('file_path'):
        return '', 404
    file_path = evidence['file_path']
    if not os.path.exists(file_path):
        return '', 404
    return send_file(file_path)


@app.route('/api/evidence/create', methods=['POST'])
@login_required
@check_perm('create')
def create_evidence():
    try:
        if request.is_json:
            data = request.json
            file_path = None
        else:
            data = request.form.to_dict()
            file_path = None
            if 'evidence_file' in request.files:
                file = request.files['evidence_file']
                if file.filename:
                    from datetime import datetime as dt
                    filename = secure_filename(file.filename)
                    case_slug = secure_filename(data.get('case_number', 'UNKNOWN'))
                    name_slug = secure_filename(data.get('description', 'evidence'))[:30]
                    timestamp_str = dt.now().strftime('%Y%m%d_%H%M%S')
                    folder_name = f"{case_slug}_{name_slug}_{timestamp_str}"
                    upload_folder = os.path.join('evidence_files', folder_name)

                    os.makedirs(upload_folder, exist_ok=True)
                    file_path = os.path.join(upload_folder, filename)
                    file.save(file_path)
                    print(f"[CREATE] File saved: {file_path}")

        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        required_fields = ['case_number', 'description', 'evidence_type']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            return jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 400
        
        print(f"[CREATE] User: {session['user']['username']}, Case: {data['case_number']}")

        # --- Assemble device & capture metadata (COC forensic context) ---
        device_metadata_json = None
        client_meta_str = data.get('client_metadata', '') if isinstance(data, dict) else ''
        client_meta = {}
        if client_meta_str:
            try:
                client_meta = json.loads(client_meta_str)
            except (json.JSONDecodeError, TypeError):
                client_meta = {}

        exif_meta = extract_exif(file_path) if file_path else {}

        combined = {}
        if client_meta:
            combined['client'] = client_meta
        if exif_meta:
            combined['exif'] = exif_meta
        if combined:
            device_metadata_json = json.dumps(combined, default=str)
            print(f"[CREATE] Device metadata captured: client={bool(client_meta)}, exif={bool(exif_meta)}")
        # ----------------------------------------------------------------

        evidence_id = db.create_evidence(
            case_number=data['case_number'],
            description=data['description'],
            evidence_type=data['evidence_type'],
            created_by=session['user']['username'],
            file_path=file_path,
            device_metadata=device_metadata_json
        )
        
        print(f"[CREATE] Success - Evidence ID: {evidence_id}")
        return jsonify({'success': True, 'evidence_id': evidence_id})
        
    except KeyError as e:
        print(f"[CREATE] KeyError: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Missing field: {str(e)}'}), 400
    except Exception as e:
        print(f"[CREATE] Error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Failed to create evidence: {str(e)}'}), 500


@app.route('/api/evidence/<int:evidence_id>/transfer', methods=['POST'])
@login_required
@check_perm('transfer')
def transfer_evidence(evidence_id):
    evidence = db.get_evidence(evidence_id)
    if not evidence:
        return jsonify({'error': 'Evidence not found'}), 404

    if evidence['current_custodian'] != session['user']['username']:
        return jsonify({'error': 'Only the current custodian can transfer this evidence'}), 403

    data = request.json
    transferred_to = data.get('transferred_to')
    notes = data.get('notes', '')

    if not transferred_to:
        return jsonify({'error': 'Select a user to transfer to'}), 400

    db.transfer_evidence(evidence_id, session['user']['username'], transferred_to, notes)
    return jsonify({'success': True})



@app.route('/api/evidence/<int:evidence_id>/verify', methods=['POST'])
@login_required
@check_perm('verify')
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


@app.route('/api/evidence/<int:evidence_id>/verify_chain', methods=['POST'])
@login_required
@check_perm('verify')
def verify_chain(evidence_id):
    try:
        print(f"[CHAIN] User: {session['user']['username']}, Evidence ID: {evidence_id}")
        result = db.verify_log_chain(evidence_id)
        print(f"[CHAIN] Result: {result['status']}  -  {result['total']} entries checked")
        return jsonify(result)
    except Exception as e:
        print(f"[CHAIN] Error: {type(e).__name__}: {e}")
        return jsonify({'error': str(e), 'is_valid': False}), 500




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





@app.route('/evidence/<int:evidence_id>/certificate')
@login_required
def evidence_certificate(evidence_id):
    """Render a printable BSA 2023 Section 63 / IEA Section 65B certificate."""
    evidence = db.get_evidence(evidence_id)
    if not evidence:
        return redirect(url_for('dashboard'))

    custody_log = db.get_custody_log(evidence_id)

    device_metadata = None
    raw_meta = evidence.get('device_metadata')
    if raw_meta:
        try:
            device_metadata = json.loads(raw_meta)
        except (json.JSONDecodeError, TypeError):
            pass

    from datetime import datetime as dt
    cert_issued_at = dt.now().strftime('%d %B %Y, %H:%M:%S IST')
    cert_ref = f"COC-CERT-{evidence_id:06d}-{dt.now().strftime('%Y%m%d%H%M%S')}"

    return render_template('certificate.html',
                           evidence=evidence,
                           custody_log=custody_log,
                           device_metadata=device_metadata,
                           cert_issued_at=cert_issued_at,
                           cert_ref=cert_ref,
                           certifier=session['user'])


if __name__ == '__main__':
    print("\n" + "="*55)
    print(" Chain of Custody  -  Evidence Management System")
    print("="*55)
    print("\n Demo Credentials:")
    print("  admin     / admin123    (System Admin)")
    print("  officer   / officer123  (Field Officer)")
    print("  custodian / custody123  (Evidence Custodian)")
    print("  analyst   / analyst123  (Forensic Analyst)")
    print("  auditor   / audit123    (Court Auditor)")
    print("\n Server: http://127.0.0.1:5000")
    print("="*55 + "\n")

    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ['true', '1', 't']
    app.run(host='0.0.0.0', debug=debug_mode, port=5000)

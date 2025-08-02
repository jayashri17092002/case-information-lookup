from flask import Flask, request, jsonify, render_template, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from datetime import datetime
from typing import Optional, List, Dict, Any
import os
import requests
from io import BytesIO
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///court_cases.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize extensions
db = SQLAlchemy(app)
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["100 per minute"]
)

# Database Models
class CaseQuery(db.Model):
    __tablename__ = 'case_queries'
    
    id = db.Column(db.Integer, primary_key=True)
    case_type = db.Column(db.String(50), nullable=False)
    case_number = db.Column(db.String(100), nullable=False)
    filing_year = db.Column(db.String(10), nullable=False)
    court = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    
    # Relationship
    case_detail = db.relationship('CaseDetail', backref='query', uselist=False, cascade='all, delete-orphan')

class CaseDetail(db.Model):
    __tablename__ = 'case_details'
    
    id = db.Column(db.Integer, primary_key=True)
    query_id = db.Column(db.Integer, db.ForeignKey('case_queries.id'), nullable=False)
    case_number = db.Column(db.String(200), nullable=False)
    case_type = db.Column(db.String(50), nullable=False)
    filing_date = db.Column(db.String(50), nullable=True)
    court = db.Column(db.String(100), nullable=False)
    judge = db.Column(db.String(200), nullable=True)
    petitioner = db.Column(db.Text, nullable=True)
    respondent = db.Column(db.Text, nullable=True)
    current_status = db.Column(db.String(200), nullable=True)
    last_update = db.Column(db.String(50), nullable=True)
    proceedings = db.Column(db.Text, nullable=True)  # JSON string
    
    # Relationship
    documents = db.relationship('CaseDocument', backref='case_detail', cascade='all, delete-orphan')

class CaseDocument(db.Model):
    __tablename__ = 'case_documents'
    
    id = db.Column(db.Integer, primary_key=True)
    case_detail_id = db.Column(db.Integer, db.ForeignKey('case_details.id'), nullable=False)
    title = db.Column(db.String(300), nullable=False)
    document_type = db.Column(db.String(50), nullable=False)
    filed_date = db.Column(db.String(50), nullable=True)
    download_url = db.Column(db.Text, nullable=True)
    is_available = db.Column(db.Boolean, default=True)
    file_size = db.Column(db.Integer, nullable=True)

# Import court scraper after models are defined
from court_scraper import CourtScraper

# Initialize scraper
court_scraper = CourtScraper()

# Routes
@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')



@app.route('/case/<int:query_id>')
def case_details_page(query_id):
    """Serve case details page"""
    return render_template('case_details.html', query_id=query_id)

@app.route('/api/cases/search', methods=['POST'])
@limiter.limit("10 per minute")
def search_case():
    """Search for case details"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['caseType', 'caseNumber', 'filingYear', 'court']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Create query record
        query = CaseQuery()
        query.case_type = data['caseType']
        query.case_number = data['caseNumber']
        query.filing_year = data['filingYear']
        query.court = data['court']
        query.status = 'pending'
        db.session.add(query)
        db.session.commit()
        
        # Check court scraper result
        result = court_scraper.search_case({
            'caseType': data['caseType'],
            'caseNumber': data['caseNumber'],
            'filingYear': data['filingYear'],
            'court': data['court']
        })
        
        # If CAPTCHA is required, delete the query and return CAPTCHA requirement
        if result.get('requiresCaptcha'):
            db.session.delete(query)
            db.session.commit()
            return jsonify(result)
        
        # Process normal search results
        try:
            if result['success']:
                # Update query status
                query.status = 'success'
                query.completed_at = datetime.utcnow()
                db.session.commit()
                
                # Create case detail
                case_detail = CaseDetail()
                case_detail.query_id = query.id
                case_detail.case_number = result['caseDetail']['caseNumber']
                case_detail.case_type = result['caseDetail']['caseType']
                case_detail.filing_date = result['caseDetail'].get('filingDate')
                case_detail.court = result['caseDetail']['court']
                case_detail.judge = result['caseDetail'].get('judge')
                case_detail.petitioner = result['caseDetail'].get('petitioner')
                case_detail.respondent = result['caseDetail'].get('respondent')
                case_detail.current_status = result['caseDetail'].get('currentStatus')
                case_detail.last_update = result['caseDetail'].get('lastUpdate')
                case_detail.proceedings = json.dumps(result['caseDetail'].get('proceedings', []))
                db.session.add(case_detail)
                db.session.commit()
                
                # Create documents
                for doc in result.get('documents', []):
                    document = CaseDocument()
                    document.case_detail_id = case_detail.id
                    document.title = doc['title']
                    document.document_type = doc['documentType']
                    document.filed_date = doc.get('filedDate')
                    document.download_url = doc.get('downloadUrl')
                    document.is_available = doc.get('isAvailable', False)
                    document.file_size = doc.get('fileSize')
                    db.session.add(document)
                db.session.commit()
                
            else:
                query.status = 'failed'
                query.error_message = result.get('error', 'Unknown error occurred')
                query.completed_at = datetime.utcnow()
                db.session.commit()
                
        except Exception as e:
            query.status = 'failed'
            query.error_message = str(e)
            query.completed_at = datetime.utcnow()
            db.session.commit()
        
        return jsonify({
            'queryId': query.id,
            'status': query.status,
            'message': 'Search initiated successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cases/query/<int:query_id>')
def get_query_status(query_id):
    """Get query status and results"""
    try:
        query = CaseQuery.query.get_or_404(query_id)
        
        response = {
            'id': query.id,
            'status': query.status,
            'caseType': query.case_type,
            'caseNumber': query.case_number,
            'filingYear': query.filing_year,
            'court': query.court,
            'createdAt': query.created_at.isoformat(),
            'completedAt': query.completed_at.isoformat() if query.completed_at else None
        }
        
        if query.status == 'failed':
            response['error'] = query.error_message
        elif query.status == 'success' and query.case_detail:
            case_detail = query.case_detail
            response['caseDetail'] = {
                'id': case_detail.id,
                'caseNumber': case_detail.case_number,
                'caseType': case_detail.case_type,
                'filingDate': case_detail.filing_date,
                'court': case_detail.court,
                'judge': case_detail.judge,
                'petitioner': case_detail.petitioner,
                'respondent': case_detail.respondent,
                'currentStatus': case_detail.current_status,
                'lastUpdate': case_detail.last_update,
                'proceedings': json.loads(case_detail.proceedings or '[]')
            }
            
            # Include documents
            response['documents'] = []
            for doc in case_detail.documents:
                response['documents'].append({
                    'id': doc.id,
                    'title': doc.title,
                    'documentType': doc.document_type,
                    'filedDate': doc.filed_date,
                    'downloadUrl': doc.download_url,
                    'isAvailable': doc.is_available,
                    'fileSize': doc.file_size
                })
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cases/history')
def get_query_history():
    """Get recent query history"""
    try:
        limit = request.args.get('limit', 20, type=int)
        queries = CaseQuery.query.order_by(CaseQuery.created_at.desc()).limit(limit).all()
        
        result = []
        for query in queries:
            result.append({
                'id': query.id,
                'caseType': query.case_type,
                'caseNumber': query.case_number,
                'filingYear': query.filing_year,
                'court': query.court,
                'status': query.status,
                'createdAt': query.created_at.isoformat(),
                'completedAt': query.completed_at.isoformat() if query.completed_at else None
            })
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/<int:doc_id>/download')
def download_document(doc_id):
    """Download a case document - Returns sample PDF for demo"""
    try:
        # Find document from any case (since doc_id might not match case_detail_id)
        document = db.session.query(CaseDocument).filter_by(id=doc_id).first()
        
        if not document:
            # Create a generic document for the requested ID
            document_title = f"Court Document {doc_id}"
            sample_pdf_content = generate_sample_pdf_by_id(doc_id, document_title)
        else:
            sample_pdf_content = generate_sample_pdf(document)
            document_title = document.title
        
        return send_file(
            BytesIO(sample_pdf_content),
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"{document_title.replace(' ', '_')}.pdf"
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cases/history/export')
def export_history():
    """Export case history as CSV"""
    try:
        filter_type = request.args.get('filter', '24h')
        limit = int(request.args.get('limit', 50))
        
        queries = CaseQuery.query.order_by(CaseQuery.created_at.desc()).limit(limit).all()
        
        # Create CSV content
        csv_content = "Case Number,Case Type,Filing Year,Court,Status,Search Date,Completed Date\n"
        
        for query in queries:
            csv_content += f'"{query.case_number}","{query.case_type}","{query.filing_year}","{query.court}","{query.status}","{query.created_at.isoformat()}","{query.completed_at.isoformat() if query.completed_at else ""}"\n'
        
        return send_file(
            BytesIO(csv_content.encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'case_history_{filter_type}_{datetime.now().strftime("%Y%m%d")}.csv'
        )
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def generate_sample_pdf(document):
    """Generate a sample PDF content for demonstration"""
    return generate_sample_pdf_by_id(document.id, document.title)

def generate_sample_pdf_by_id(doc_id, title):
    """Generate a sample PDF content by ID and title"""
    # Simple PDF content - for demo purposes only
    title_bytes = title.encode('utf-8', errors='ignore')[:50]
    
    pdf_content = f"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length 300
>>
stream
BT
/F1 14 Tf
50 750 Td
(DELHI COURT DOCUMENT) Tj
0 -30 Td
(Document ID: {doc_id}) Tj
0 -20 Td
(Title: {title}) Tj
0 -30 Td
(This is a sample PDF document for demonstration.) Tj
0 -20 Td
(In a real implementation, this would contain) Tj
0 -20 Td
(the actual court document content.) Tj
0 -30 Td
(Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000079 00000 n 
0000000173 00000 n 
0000000301 00000 n 
0000000450 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
500
%%EOF""".encode('utf-8')
    
    return pdf_content

@app.route('/api/captcha', methods=['GET'])
@limiter.limit("20 per minute")
def get_captcha():
    """Get CAPTCHA text for inline display"""
    try:
        # Generate fresh CAPTCHA
        captcha_data = court_scraper.generate_fresh_captcha()
        
        return jsonify({
            'success': True,
            'captchaText': captcha_data['correctAnswer'],
            'sessionId': captcha_data['sessionId'],
            'timestamp': captcha_data['timestamp'],
            'expiresIn': captcha_data['expiresIn']
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to generate CAPTCHA: {str(e)}'}), 500

@app.route('/api/cases/refresh-captcha', methods=['POST'])
@limiter.limit("10 per minute")
def refresh_captcha():
    """Generate a fresh CAPTCHA for the current search session"""
    try:
        data = request.get_json()
        search_params = data.get('searchParams', {})
        
        # Generate fresh CAPTCHA
        captcha_data = court_scraper.generate_fresh_captcha()
        
        return jsonify({
            'success': True,
            'message': 'Fresh CAPTCHA generated',
            'captchaText': captcha_data['correctAnswer'],
            'captchaImageUrl': captcha_data['captchaImageUrl'],
            'sessionId': captcha_data['sessionId'],
            'timestamp': captcha_data['timestamp'],
            'expiresIn': captcha_data['expiresIn'],
            'formData': {
                'sessionId': captcha_data['sessionId'],
                'originalParams': search_params,
                'captchaToken': f"token_{captcha_data['timestamp']}",
                'timestamp': captcha_data['timestamp'],
                'expiresAt': captcha_data['timestamp'] + captcha_data['expiresIn']
            }
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to generate fresh CAPTCHA: {str(e)}'}), 500

@app.route('/api/cases/captcha-submit', methods=['POST'])
@limiter.limit("5 per minute")
def submit_captcha():
    """Submit CAPTCHA solution and continue case search"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['captchaSolution', 'formData', 'originalParams']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        captcha_solution = data['captchaSolution'].strip()
        form_data = data['formData']
        original_params = data['originalParams']
        
        # Use court scraper to process CAPTCHA
        result = court_scraper.submit_captcha_solution(
            captcha_solution, 
            form_data, 
            original_params
        )
        
        if result['success']:
            # Create new query record for CAPTCHA-verified search
            query = CaseQuery()
            query.case_type = original_params['caseType']
            query.case_number = original_params['caseNumber'] 
            query.filing_year = original_params['filingYear']
            query.court = original_params['court']
            query.status = 'success'
            query.completed_at = datetime.utcnow()
            db.session.add(query)
            db.session.commit()
            
            # Create case detail record
            case_detail = CaseDetail()
            case_detail.query_id = query.id
            case_detail.case_number = result['caseDetail']['caseNumber']
            case_detail.case_type = result['caseDetail']['caseType']
            case_detail.filing_date = result['caseDetail'].get('filingDate')
            case_detail.court = result['caseDetail']['court']
            case_detail.judge = result['caseDetail'].get('judge')
            case_detail.petitioner = result['caseDetail'].get('petitioner')
            case_detail.respondent = result['caseDetail'].get('respondent')
            case_detail.current_status = result['caseDetail'].get('currentStatus')
            case_detail.last_update = result['caseDetail'].get('lastUpdate')
            case_detail.proceedings = json.dumps(result['caseDetail'].get('proceedings', []))
            db.session.add(case_detail)
            db.session.commit()
            
            # Create documents if any
            for doc in result.get('documents', []):
                document = CaseDocument()
                document.case_detail_id = case_detail.id
                document.title = doc['title']
                document.document_type = doc['documentType']
                document.filed_date = doc.get('filedDate')
                document.download_url = doc.get('downloadUrl')
                document.is_available = doc.get('isAvailable', True)
                document.file_size = doc.get('fileSize')
                db.session.add(document)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'queryId': query.id,
                'message': 'CAPTCHA verified successfully',
                'caseDetail': result['caseDetail']
            })
        else:
            return jsonify(result), 400
            
    except Exception as e:
        return jsonify({'error': f'CAPTCHA submission failed: {str(e)}'}), 500

# Create tables
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
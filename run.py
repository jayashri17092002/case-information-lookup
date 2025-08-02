import os
import sys
from app import app

if __name__ == '__main__':
    # Set environment variables for development
    os.environ['FLASK_ENV'] = 'development'
    os.environ['FLASK_DEBUG'] = 'True'
    
    # Run the Flask application
    print("Starting Court Lookup Application...")
    port = int(os.environ.get('PORT', 5000))
    print(f"Server will be available at: http://localhost:{port}")
    print("Ready for legal case searches...")
    
    try:
        app.run(host='0.0.0.0', port=port, debug=True)
    except KeyboardInterrupt:
        print("\nApplication stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"Failed to start application: {e}")
        sys.exit(1)
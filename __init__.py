from flask import Flask
from app.utils.cache import configure_cache, get_tracker
from app.utils.threading import start_background_thread
from app.routes import register_routes
from app.utils.data_bank import init_db, start_background_thread as start_data_bank_thread

def create_app():
    app = Flask(__name__)

    # Configure the cache and tracker
    configure_cache()

    # Start background thread for periodic updates
    start_background_thread()

    # Initialize the database and start the data bank background thread
    init_db()
    start_data_bank_thread()

    # Register blueprints
    register_routes(app)

    return app
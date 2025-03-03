import os
from flask import Flask
from app.routes import register_routes
from app.utils.data_bank import start_background_thread as start_data_bank_thread

def create_app():
    app = Flask(__name__)
    register_routes(app)

    # Start the data bank background thread
    start_data_bank_thread()

    return app
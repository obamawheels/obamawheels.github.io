from flask import Blueprint
from .main import main_bp
from .autocomplete import autocomplete_bp
from .search import search_bp
from .graph_data import graph_data_bp
from .profitability import profitability_bp
from .top_margins import top_margins_bp
from .notifications import notifications_bp
from .stats import stats_bp

def register_routes(app):
    app.register_blueprint(main_bp)
    app.register_blueprint(autocomplete_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(graph_data_bp)
    app.register_blueprint(profitability_bp)
    app.register_blueprint(top_margins_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(stats_bp)

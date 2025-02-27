from flask import Blueprint, jsonify
from app.utils.cache import get_tracker

stats_bp = Blueprint('stats', __name__)

@stats_bp.route('/stats', methods=['GET'])
def get_stats():
    tracker = get_tracker()
    try:
        stats = tracker.get_dashboard_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve stats: {e}"}), 500
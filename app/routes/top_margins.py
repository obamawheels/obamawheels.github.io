from flask import Blueprint, request, jsonify
from app.utils.cache import get_tracker

top_margins_bp = Blueprint('top_margins', __name__)

@top_margins_bp.route('/top-margins', methods=['GET'])
def top_margins():
    sort_by = request.args.get('sort_by', 'margin')
    order = request.args.get('order', 'desc').lower()

    tracker = get_tracker()
    try:
        items = tracker.get_top_margins(sort_by=sort_by, order=order)
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve top margins: {e}"}), 500

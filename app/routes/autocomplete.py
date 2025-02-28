from flask import Blueprint, request, jsonify
from app.utils.cache import get_tracker

autocomplete_bp = Blueprint('autocomplete', __name__)

@autocomplete_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    """
    Provide autocomplete suggestions for item names based on query input.
    """
    query = request.args.get('query', '').lower()
    tracker = get_tracker()
    with tracker.lock:
        suggestions = [
            item_id for item_id in tracker.data.keys() if query in item_id.lower()
        ][:10]
    return jsonify(suggestions)

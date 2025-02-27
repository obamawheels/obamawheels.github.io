from flask import Blueprint, request, jsonify
from app.utils.tracker_helpers import fetch_item_data

search_bp = Blueprint('search', __name__)

@search_bp.route('/search', methods=['GET'])
def search():
    """
    Search for an item by name and retrieve its data.
    """
    item_name = request.args.get('item', '').strip()
    if not item_name:
        return jsonify({"error": "Item name is required"}), 400

    try:
        item_data = fetch_item_data(item_name)
        if item_data:
            return jsonify(item_data)
        return jsonify({"error": "Item not found"}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve item data: {e}"}), 500

from flask import Blueprint, request, jsonify
import time
from app.utils.tracker_helpers import fetch_item_history

graph_data_bp = Blueprint('graph_data', __name__)

@graph_data_bp.route('/graph-data', methods=['GET'])
def graph_data():
    """
    Return historical price data for a specific item within a specified time range.
    """
    item_name = request.args.get('item', '').lower()
    time_range = request.args.get('range', 'all')

    try:
        history = fetch_item_history(item_name)
        if not history:
            return jsonify({"error": "Item not found"}), 404

        current_time = time.time()
        if time_range == "1h":
            cutoff_time = current_time - 3600
        elif time_range == "24h":
            cutoff_time = current_time - 86400
        else:
            cutoff_time = 0  # No cutoff for 'all' range

        filtered_history = [entry for entry in history if entry["timestamp"] >= cutoff_time]

        return jsonify(filtered_history)
    except Exception as e:
        # Log the error for debugging
        print(f"Error fetching graph data for item {item_name}: {e}")
        return jsonify({"error": "Failed to retrieve graph data. Please try again later."}), 500
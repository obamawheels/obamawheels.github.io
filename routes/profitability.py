from flask import Blueprint, request, jsonify
from app.utils.cache import get_tracker
from app.utils.threading import update_data_with_threading

# Define the Blueprint
profitability_bp = Blueprint('profitability', __name__)

@profitability_bp.route('/profitability', methods=['GET'])
def profitability():
    """
    Calculate and return profitability adjusted for difficulty.

    Query Parameters:
        coins (float): The amount of coins available for calculation.

    Returns:
        JSON response with calculated profitability data or an error message.
    """
    try:
        # Get the 'coins' parameter from the request
        coins = float(request.args.get('coins', 0))
        
        # Ensure the latest data is fetched
        update_data_with_threading()
        
        # Get the tracker instance
        tracker = get_tracker()
        
        # Calculate difficulty and profitability
        difficulty = tracker.calculate_difficulty()
        results = tracker.calculate_profitability(coins)
        
        # Adjust profits based on difficulty
        for item in results:
            item['profit_per_minute'] = (item['profit_per_minute'] * coins) / (difficulty + 1)
            item['profit_per_hour'] = item['profit_per_minute'] * 60

        # Return the results as JSON
        return jsonify(results)
    except ValueError:
        return jsonify({"error": "Invalid coins value. Must be a number."}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to calculate profitability: {e}"}), 500

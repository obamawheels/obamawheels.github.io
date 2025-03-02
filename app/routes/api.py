from flask import jsonify, request
from bazaar_tracker import tracker  # Import your tracker instance
from run import app

@app.route('/top-variations')
def top_variations():
    time_range = request.args.get('range', '1h')
    if time_range == '10m':
        variations = tracker.top_variations['10m']
    elif time_range == '1h':
        variations = tracker.top_variations['1h']
    elif time_range == '24h':
        variations = tracker.top_variations['24h']
    else:
        return jsonify({"error": "Invalid time range"}), 400
    
    return jsonify(variations)
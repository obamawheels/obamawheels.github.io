from flask import jsonify, request
from your_tracker_module import tracker  # Import your tracker instance

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
from flask import Blueprint, render_template, jsonify
from app.utils.data_bank import fetch_data

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/data/<item_id>', methods=['GET'])
def get_item_data(item_id):
    data = fetch_data(item_id)
    if data:
        return jsonify({
            "item_id": data[0],
            "buy_price": data[1],
            "sell_price": data[2],
            "timestamp": data[3]
        })
    else:
        return jsonify({"error": "Item not found"}), 404
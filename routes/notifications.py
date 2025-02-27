from flask import Blueprint, jsonify

notifications_bp = Blueprint('notifications', __name__)

@notifications_bp.route('/notifications', methods=['GET'])
def get_notifications():
    # Example response, replace with actual logic
    notifications = [
        {"id": 1, "message": "Notification 1"},
        {"id": 2, "message": "Notification 2"}
    ]
    return jsonify(notifications)
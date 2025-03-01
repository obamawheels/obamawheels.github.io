from flask import Blueprint, request, jsonify
from app.utils.cache import get_tracker
import logging
import threading
import time

logger = logging.getLogger(__name__)

autocomplete_bp = Blueprint('autocomplete', __name__)

@autocomplete_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    """
    Provide autocomplete suggestions for item names based on query input.
    """
    logger.info("Autocomplete route started")
    query = request.args.get('query', '').lower()
    logger.info(f"Autocomplete query: {query}")
    tracker = get_tracker()

    lock_acquired = False
    try:
        lock_acquired = tracker.lock.acquire(timeout=5)  # Attempt to acquire lock with timeout
        if lock_acquired:
            suggestions = [
                item_id for item_id in tracker.data.keys() if query in item_id.lower()
            ][:10]
            logger.info("Autocomplete route finished successfully")
            return jsonify(suggestions)
        else:
            logger.error("Failed to acquire lock within timeout")
            return jsonify([]), 500  # Return an error if lock not acquired
    except Exception as e:
        logger.exception("Exception in autocomplete route")
        return jsonify([]), 500
    finally:
        if lock_acquired:
            tracker.lock.release()
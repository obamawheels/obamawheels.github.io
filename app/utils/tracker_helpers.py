from typing import Optional, List, Dict
from app.utils.cache import get_tracker
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fetch_item_data(item_name: str) -> Optional[Dict]:
    """
    Fetch data for a specific item from the tracker.

    Args:
        item_name (str): Name of the item to fetch data for.

    Returns:
        Optional[Dict]: Item data or None if the item is not found.
    """
    try:
        tracker = get_tracker()
        logger.info(f"Fetching data for item: {item_name}")
        return tracker.get_item_data(item_name)
    except AttributeError as e:
        logger.error(f"Failed to fetch item data for {item_name}: {e}")
        return None


def fetch_item_history(item_name: str) -> List[Dict]:
    """
    Fetch historical data for a specific item from the tracker.

    Args:
        item_name (str): Name of the item to fetch historical data for.

    Returns:
        List[Dict]: Historical data for the item or an empty list if no history exists.
    """
    try:
        tracker = get_tracker()
        logger.info(f"Fetching history for item: {item_name}")
        return tracker.get_item_history(item_name)
    except AttributeError as e:
        logger.error(f"Failed to fetch item history for {item_name}: {e}")
        return []


def fetch_top_items(sort_by: str = 'margin', order: str = 'desc') -> List[Dict]:
    """
    Fetch the top items sorted by a specific criterion.

    Args:
        sort_by (str): The field to sort by (default is 'margin').
        order (str): The sort order, 'asc' or 'desc' (default is 'desc').

    Returns:
        List[Dict]: Sorted list of items based on the specified criteria.
    """
    try:
        tracker = get_tracker()
        logger.info(f"Fetching top items sorted by {sort_by} in {order} order")
        return tracker.get_top_margins(sort_by=sort_by, order=order)
    except AttributeError as e:
        logger.error(f"Failed to fetch top items: {e}")
        return []


def calculate_profitability(coins: float) -> List[Dict]:
    """
    Calculate the profitability of items based on a given amount of coins.

    Args:
        coins (float): The amount of coins available.

    Returns:
        List[Dict]: List of items with calculated profitability.
    """
    try:
        tracker = get_tracker()
        logger.info(f"Calculating profitability for {coins} coins")
        difficulty = tracker.calculate_difficulty()
        results = tracker.calculate_profitability(coins)
        
        for item in results:
            # Adjust profits based on difficulty
            item['profit_per_minute'] = (item['profit_per_minute'] * coins) / (difficulty + 1)
            item['profit_per_hour'] = item['profit_per_minute'] * 60

        return results
    except AttributeError as e:
        logger.error(f"Failed to calculate profitability: {e}")
        return []


def fetch_notifications() -> List[Dict]:
    """
    Fetch the latest notifications from the tracker.

    Returns:
        List[Dict]: Notifications for the dashboard.
    """
    try:
        tracker = get_tracker()
        logger.info("Fetching notifications")
        return tracker.get_notifications()
    except AttributeError as e:
        logger.error(f"Failed to fetch notifications: {e}")
        return []


def fetch_dashboard_stats() -> Dict:
    """
    Fetch dashboard statistics from the tracker.

    Returns:
        Dict: Statistics for the dashboard.
    """
    try:
        tracker = get_tracker()
        logger.info("Fetching dashboard statistics")
        return tracker.get_dashboard_stats()
    except AttributeError as e:
        logger.error(f"Failed to fetch dashboard statistics: {e}")
        return {}
    
def fetch_demand_supply_data() -> List[Dict]:
    """
    Fetch demand and supply data for all items from the tracker.

    Returns:
        List[Dict]: List of items with their demand and supply data.
    """
    try:
        tracker = get_tracker()
        demand_supply_data = []
        for item_id, details in tracker.data.items():
            buy_quantity = tracker._get_total_quantity(details, "buy_summary")
            sell_quantity = tracker._get_total_quantity(details, "sell_summary")
            demand_supply_data.append({
                "item_id": item_id,
                "buy_quantity": buy_quantity,
                "sell_quantity": sell_quantity
            })
        return demand_supply_data
    except AttributeError as e:
        logger.error(f"Failed to fetch demand and supply data: {e}")
        return []
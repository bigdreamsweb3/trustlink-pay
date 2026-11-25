"""A cache never substitutes for an unexpired Receiver claim with the expected owner and version."""
from datetime import datetime, timezone
from .dependencies import RelayDependencies


def assert_relay_lease(node: RelayDependencies, job: dict, response: dict) -> None:
    lease = response.get("lease") if isinstance(response, dict) else None
    if (response.get("id") != job["id"] or type(response.get("version")) is not int or response["version"] != job["version"]
            or not isinstance(lease, dict) or lease.get("owner") != node.TSN_NODE_ID or lease.get("version") != job["version"]):
        raise ValueError("NODE_RELAY_LEASE_INVALID")
    try:
        expires = datetime.fromisoformat(lease["expiresAt"].replace("Z", "+00:00"))
        deadline = datetime.fromisoformat(job["expiresAt"].replace("Z", "+00:00"))
        if expires.tzinfo is None or deadline.tzinfo is None or not datetime.now(timezone.utc) < expires <= deadline:
            raise ValueError("NODE_RELAY_LEASE_INVALID")
    except (KeyError, TypeError, AttributeError, ValueError) as exc:
        raise ValueError("NODE_RELAY_LEASE_INVALID") from exc

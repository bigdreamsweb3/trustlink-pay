# Supporting network schemas

`types.py` preserves the existing Pydantic heartbeat, epoch, mempool, metrics, liquidity and overview schemas with their exact field defaults. `app.schemas.network` remains the public interface. These are supporting response/request models; their source presence does not register HTTP routes or replace active application schemas.

Offline import and model-construction checks require Pydantic. Wire-schema changes must be coordinated with the actual HTTP consumers; this extraction changes only ownership paths and introduces no fields.

# Durable Node authorization

This component sends existing settlement/signature requests through the durable relay. It preserves domain replies below 500, maps unavailable results to bounded service-availability handling and excludes transport details from diagnostics. Missing existing service credentials or public verification pin disables issuance. No Node URL/fallback transport remains. Original Cranker scope and existing Mother/transaction checks still apply.

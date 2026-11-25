# Cranker coordination marker

After a durable work commit, this component stores a payload-free nonce/kind/time marker through the supplied database port. Failure remains a sanitized warning and does not undo committed work. Active Cranker loops use their existing wallet/session-authenticated polling; Firebase Realtime Database and wake-token authentication are retired. Marker data grants no lease or execution authority.

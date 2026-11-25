-- Fresh empty namespace only. Plain INSERT refuses an existing state; it never overwrites or clears work.
INSERT INTO records(key,value) VALUES ('{tsn-receiver}:metadata','{"format":"TSN_RECEIVER_RECORD_STORE","version":1,"revision":0,"collections":{}}');

-- Yjs state was never used to restore a document: the REST document snapshot is
-- canonical, while the WebSocket service only relays live CRDT updates. Clear the
-- redundant full-state payloads once so existing rows stop consuming duplicate space.
UPDATE files
SET ydoc_snapshot = NULL
WHERE ydoc_snapshot IS NOT NULL;

UPDATE file_version
SET ydoc_snapshot = NULL
WHERE ydoc_snapshot IS NOT NULL;

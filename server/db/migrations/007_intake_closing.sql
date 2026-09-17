-- Intake module: Claude can now read closing documents as well as IC memos.
ALTER TABLE extractions DROP CONSTRAINT extractions_kind_check;
ALTER TABLE extractions ADD CONSTRAINT extractions_kind_check CHECK (kind IN ('IC_MEMO', 'CLOSING'));

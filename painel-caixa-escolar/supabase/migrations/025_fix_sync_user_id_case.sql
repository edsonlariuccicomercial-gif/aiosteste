-- Migration 025: Fix sync_data case sensitivity
-- Problem: Some machines use "Lariucci" and others "LARIUCCI" as user_id
-- causing data to be invisible across machines.
-- Solution: Normalize all to "LARIUCCI" (uppercase) and merge duplicates.

-- Step 1: Find duplicate keys with case-different user_ids
-- For each key that exists under both "Lariucci" and "LARIUCCI",
-- keep the one with the most recent updated_at

-- Step 2: Update all non-LARIUCCI variants to LARIUCCI
UPDATE sync_data SET user_id = 'LARIUCCI'
WHERE UPPER(user_id) = 'LARIUCCI' AND user_id != 'LARIUCCI'
  AND NOT EXISTS (
    SELECT 1 FROM sync_data s2
    WHERE s2.user_id = 'LARIUCCI' AND s2.key = sync_data.key
  );

-- Step 3: For keys that exist in BOTH, delete the older duplicate
DELETE FROM sync_data
WHERE UPPER(user_id) = 'LARIUCCI' AND user_id != 'LARIUCCI'
  AND EXISTS (
    SELECT 1 FROM sync_data s2
    WHERE s2.user_id = 'LARIUCCI' AND s2.key = sync_data.key
  );

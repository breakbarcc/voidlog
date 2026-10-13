-- Soo-Won's "Claw Slap" (skill 63588) is now a curated cast marker with its
-- own timeline icon (worker boss-configs/cast-markers.ts). Existing logs
-- stored it as a bulk-captured "SooWon.Cast.63588" row, which the UI hides
-- as noise — the raw EI JSON is gone, so rename those rows in place.
UPDATE mechanic_events
SET "mechanicName" = 'ClawSlap.Cast',
    "displayName" = 'Claw Slap (Cast)'
WHERE "mechanicName" = 'SooWon.Cast.63588';

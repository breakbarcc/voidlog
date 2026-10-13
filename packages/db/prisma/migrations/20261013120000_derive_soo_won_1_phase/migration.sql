-- Harvest Temple CM: an attempt that wipes before Soo-Won's 50% split only
-- has EI's wrapper phase "Soo-Won" (EI creates "Soo-Won 1"/"Soo-Won 2" only
-- once the fight passes the split). That plain phase *is* "Soo-Won 1", so add
-- it — the worker does the same for new logs (boss-configs/derived-phases.ts).
-- The raw EI JSON is not stored, so existing rows are fixed up here.

CREATE TEMP TABLE _soo_wrapper AS
SELECT p.id AS wrapper_id, p."encounterResultId" AS encounter_id, p."order" AS wrapper_order
FROM phase_results p
WHERE p.name = 'Soo-Won'
  AND NOT EXISTS (
    SELECT 1 FROM phase_results c
    WHERE c."encounterResultId" = p."encounterResultId"
      AND c.name IN ('Soo-Won 1', 'Soo-Won 2')
  );

-- Make room right behind the wrapper so "order" keeps following start time.
UPDATE phase_results p
SET "order" = p."order" + 1
FROM _soo_wrapper w
WHERE p."encounterResultId" = w.encounter_id
  AND p."order" > w.wrapper_order;

CREATE TEMP TABLE _soo_derived AS
SELECT wrapper_id, 'c' || substr(md5(random()::text || wrapper_id), 1, 24) AS derived_id
FROM _soo_wrapper;

INSERT INTO phase_results (
  id, "encounterResultId", name, "order", "startMs", "endMs", reached, success, "playersAliveAtStart"
)
SELECT d.derived_id, w."encounterResultId", 'Soo-Won 1', w."order" + 1,
       w."startMs", w."endMs", w.reached, w.success, w."playersAliveAtStart"
FROM _soo_derived d
JOIN phase_results w ON w.id = d.wrapper_id;

-- The wrapper was the narrowest phase these events fell into; they now
-- belong to the derived progression phase.
UPDATE mechanic_events m
SET "phaseResultId" = d.derived_id
FROM _soo_derived d
WHERE m."phaseResultId" = d.wrapper_id;

INSERT INTO player_phase_damage (id, "playerResultId", "phaseResultId", "bossDamage", "totalDamage")
SELECT 'c' || substr(md5(random()::text || dmg.id), 1, 24),
       dmg."playerResultId", d.derived_id, dmg."bossDamage", dmg."totalDamage"
FROM player_phase_damage dmg
JOIN _soo_derived d ON d.wrapper_id = dmg."phaseResultId";

DROP TABLE _soo_derived;
DROP TABLE _soo_wrapper;
